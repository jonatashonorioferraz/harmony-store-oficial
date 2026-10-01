-- Allow administrative corrections only before the first lot, without
-- rewriting issued labels or assigning any real lot number.
alter table public.collaborator_label_codes
  drop constraint if exists collaborator_label_codes_code_check;
alter table public.collaborator_label_codes
  add constraint collaborator_label_codes_code_check
  check (code ~ '^[A-Z][1-9][0-9]*$');

create table if not exists public.collaborator_label_code_events (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.profiles(id) on delete restrict,
  previous_code text not null,
  new_code text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now(),
  constraint collaborator_label_code_events_change_check check (previous_code <> new_code)
);
create index if not exists collaborator_label_code_events_history_idx
  on public.collaborator_label_code_events (collaborator_id, created_at desc);
alter table public.collaborator_label_code_events enable row level security;
revoke all on table public.collaborator_label_code_events from public, anon, authenticated;
grant select on table public.collaborator_label_code_events to authenticated;
grant all on table public.collaborator_label_code_events to service_role;
drop policy if exists "label code corrections: admin read" on public.collaborator_label_code_events;
create policy "label code corrections: admin read"
  on public.collaborator_label_code_events for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active' and p.role = 'admin'
  ));

create or replace function private.guard_collaborator_label_code()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Códigos de rastreabilidade não podem ser excluídos.';
  end if;
  if new.collaborator_id is distinct from old.collaborator_id then
    raise exception 'O código não pode ser transferido para outra colaboradora.';
  end if;
  if new.code is distinct from old.code and exists (
    select 1 from public.label_lots l
    where l.collaborator_id = old.collaborator_id or l.collaborator_code = old.code
  ) then
    raise exception 'Este código já foi usado em um lote e não pode ser alterado, mesmo que o lote esteja cancelado.';
  end if;
  -- Preserve the original assignment; corrections have their own audit trail.
  new.assigned_by := old.assigned_by;
  new.assigned_at := old.assigned_at;
  return new;
end;
$$;

create or replace function private.audit_collaborator_label_code()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_name text;
begin
  select p.full_name into v_name from public.profiles p where p.id = v_actor;
  insert into public.collaborator_label_code_events (
    collaborator_id, previous_code, new_code, actor_id, actor_name
  ) values (new.collaborator_id, old.code, new.code, v_actor, v_name);
  return new;
end;
$$;

drop trigger if exists protect_collaborator_label_code on public.collaborator_label_codes;
create trigger protect_collaborator_label_code
  before update or delete on public.collaborator_label_codes
  for each row execute function private.guard_collaborator_label_code();
drop trigger if exists audit_collaborator_label_code on public.collaborator_label_codes;
create trigger audit_collaborator_label_code
  after update of code on public.collaborator_label_codes
  for each row when (old.code is distinct from new.code)
  execute function private.audit_collaborator_label_code();

-- The expected previous code prevents a stale browser from overwriting
-- another administrator's correction.
create or replace function public.assign_collaborator_label_code(
  p_collaborator_id uuid,
  p_code text,
  p_expected_code text
)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_code text := upper(trim(p_code));
  v_previous text;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.status = 'active' and p.role = 'admin'
  ) then
    raise exception 'Apenas a administração pode cadastrar ou corrigir códigos de colaboradoras.';
  end if;
  if p_collaborator_id is null or v_code is null or v_code !~ '^[A-Z][1-9][0-9]*$' then
    raise exception 'Informe um código válido, como D1 ou P1.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_collaborator_id and p.status = 'active' and p.role = 'collaborator'
  ) then
    raise exception 'Selecione uma colaboradora ativa.';
  end if;

  select c.code into v_previous from public.collaborator_label_codes c
  where c.collaborator_id = p_collaborator_id for update;
  if not found then
    if p_expected_code is not null then
      raise exception 'O cadastro mudou. Atualize a tela antes de corrigir o código.';
    end if;
    insert into public.collaborator_label_codes (collaborator_id, code, assigned_by)
    values (p_collaborator_id, v_code, v_actor)
    on conflict (collaborator_id) do nothing;
    select c.code into v_previous from public.collaborator_label_codes c
    where c.collaborator_id = p_collaborator_id for update;
  end if;
  if v_previous = v_code then
    return v_code;
  end if;
  if p_expected_code is null or v_previous is distinct from upper(trim(p_expected_code)) then
    raise exception 'O código atual mudou. Atualize a tela e confira antes de corrigir.';
  end if;

  -- The trigger checks ALL lots, not just the latest 60 shown by the UI.
  -- This row lock conflicts with the FOR SHARE lock taken on lot creation.
  update public.collaborator_label_codes set code = v_code
  where collaborator_id = p_collaborator_id;
  return v_code;
exception when unique_violation then
  raise exception 'Este código já pertence a outra colaboradora. Escolha um código diferente.';
end;
$$;

-- Keep older clients compatible for registration, but require the three
-- parameter operation with the expected code for any actual correction.
create or replace function public.assign_collaborator_label_code(
  p_collaborator_id uuid,
  p_code text
)
returns text
language sql security definer
set search_path = ''
as $$
  select public.assign_collaborator_label_code(p_collaborator_id, p_code, null::text);
$$;

create or replace function public.create_label_lot(
  p_collaborator_id uuid,
  p_manufactured_on date,
  p_label_count integer,
  p_request_key uuid
)
returns public.label_lots
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_name text;
  v_collaborator_name text;
  v_code text;
  v_lot public.label_lots%rowtype;
begin
  if not private.can_manage_label_lots() then
    raise exception 'Sem permissão para emitir lotes.';
  end if;
  if p_request_key is null or p_collaborator_id is null then
    raise exception 'Informe a colaboradora e a identificação da operação.';
  end if;
  if p_manufactured_on is null or p_manufactured_on > current_date then
    raise exception 'Informe a data real de fabricação, que não pode ser futura.';
  end if;
  if p_label_count is null or p_label_count not between 1 and 100000 then
    raise exception 'A quantidade de etiquetas deve estar entre 1 e 100000.';
  end if;

  select * into v_lot from public.label_lots where request_key = p_request_key;
  if found then
    if v_lot.created_by <> v_actor or v_lot.collaborator_id <> p_collaborator_id
      or v_lot.manufactured_on <> p_manufactured_on
      or v_lot.requested_label_count <> p_label_count then
      raise exception 'Esta operação já foi usada com dados diferentes.';
    end if;
    return v_lot;
  end if;

  select p.full_name into v_actor_name
  from public.profiles p where p.id = v_actor and p.status = 'active';
  select p.full_name, c.code into v_collaborator_name, v_code
  from public.collaborator_label_codes c
  join public.profiles p on p.id = c.collaborator_id
  where p.id = p_collaborator_id and p.status = 'active' and p.role = 'collaborator'
  for share of c;
  if v_actor_name is null or v_code is null then
    raise exception 'A colaboradora precisa estar ativa e ter um código interno cadastrado.';
  end if;

  insert into public.label_lots (
    request_key, collaborator_id, collaborator_name, collaborator_code,
    manufactured_on, expires_on, requested_label_count,
    label_title, label_subtitle, composition_text, usage_text,
    created_by, created_by_name
  ) values (
    p_request_key, p_collaborator_id, v_collaborator_name, v_code,
    p_manufactured_on, (p_manufactured_on + interval '12 months')::date, p_label_count,
    'MINI SABONETES', 'ARTESANAIS - DECORAÇÃO',
    'Base glicerinada branca, corante, essência e veículo.',
    'Para lembrancinhas e decoração. Não indicado para uso corporal.',
    v_actor, v_actor_name
  ) on conflict (request_key) do nothing
  returning * into v_lot;

  if v_lot.id is null then
    select * into v_lot from public.label_lots where request_key = p_request_key;
    if v_lot.created_by <> v_actor or v_lot.collaborator_id <> p_collaborator_id
      or v_lot.manufactured_on <> p_manufactured_on
      or v_lot.requested_label_count <> p_label_count then
      raise exception 'Esta operação já foi usada com dados diferentes.';
    end if;
    return v_lot;
  end if;

  insert into public.label_lot_events (
    event_key, lot_id, event_type, actor_id, actor_name
  ) values (p_request_key, v_lot.id, 'created', v_actor, v_actor_name);
  return v_lot;
end;
$$;


revoke all on function private.guard_collaborator_label_code() from public, anon, authenticated;
revoke all on function private.audit_collaborator_label_code() from public, anon, authenticated;
revoke all on function public.assign_collaborator_label_code(uuid, text, text) from public, anon, authenticated;
revoke all on function public.assign_collaborator_label_code(uuid, text) from public, anon, authenticated;
revoke all on function public.create_label_lot(uuid, date, integer, uuid) from public, anon, authenticated;
grant execute on function public.assign_collaborator_label_code(uuid, text, text) to authenticated, service_role;
grant execute on function public.assign_collaborator_label_code(uuid, text) to authenticated, service_role;
grant execute on function public.create_label_lot(uuid, date, integer, uuid) to authenticated, service_role;
