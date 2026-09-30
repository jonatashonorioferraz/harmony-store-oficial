-- Foundation for the independent 60 x 40 mm lot-label module.
-- This migration prepares data and permissions only; it does not issue a lot.
-- Legacy lot numbers 1 through 88 remain reserved outside this table.

create table if not exists public.collaborator_label_codes (
  collaborator_id uuid primary key references public.profiles(id) on delete restrict,
  code text not null unique check (code ~ '^P[1-9][0-9]*$'),
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now()
);

create table if not exists public.label_lots (
  id uuid primary key default gen_random_uuid(),
  lot_number bigint generated always as identity (start with 89) unique,
  request_key uuid not null unique,
  collaborator_id uuid not null references public.profiles(id) on delete restrict,
  collaborator_name text not null,
  collaborator_code text not null,
  manufactured_on date not null,
  expires_on date not null,
  requested_label_count integer not null check (requested_label_count between 1 and 100000),
  label_title text not null,
  label_subtitle text not null,
  composition_text text not null,
  usage_text text not null,
  template_version text not null default '60x40-v1',
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  constraint label_lots_expiry_check
    check (expires_on = (manufactured_on + interval '12 months')::date),
  constraint label_lots_cancellation_check
    check ((status = 'active' and cancelled_at is null and cancel_reason is null)
      or (status = 'cancelled' and cancelled_at is not null and length(trim(cancel_reason)) between 3 and 500))
);

create table if not exists public.label_lot_events (
  id uuid primary key default gen_random_uuid(),
  event_key uuid not null unique,
  lot_id uuid not null references public.label_lots(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'generated', 'reprinted', 'cancelled')),
  output_format text check (output_format in ('pdf', 'zpl')),
  label_count integer check (label_count between 1 and 100000),
  reason text,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_name text not null,
  created_at timestamptz not null default now(),
  constraint label_lot_events_shape_check check (
    (event_type in ('generated', 'reprinted') and output_format is not null and label_count is not null)
    or (event_type in ('created', 'cancelled') and output_format is null and label_count is null)
  ),
  constraint label_lot_events_reason_check check (
    event_type not in ('reprinted', 'cancelled')
    or length(trim(reason)) between 3 and 500
  )
);

create index if not exists label_lots_collaborator_created_idx
  on public.label_lots (collaborator_id, created_at desc);
create index if not exists label_lots_manufactured_idx
  on public.label_lots (manufactured_on desc);
create index if not exists label_lot_events_lot_created_idx
  on public.label_lot_events (lot_id, created_at desc);
create index if not exists label_lot_events_actor_created_idx
  on public.label_lot_events (actor_id, created_at desc);

create or replace function private.can_manage_label_lots()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.role in ('admin', 'receiver')
  );
$$;

alter table public.collaborator_label_codes enable row level security;
alter table public.label_lots enable row level security;
alter table public.label_lot_events enable row level security;

revoke all on table public.collaborator_label_codes, public.label_lots,
  public.label_lot_events from public, anon, authenticated;
grant select on table public.collaborator_label_codes, public.label_lots,
  public.label_lot_events to authenticated;
grant all on table public.collaborator_label_codes, public.label_lots,
  public.label_lot_events to service_role;

create policy "label codes: authorized read"
  on public.collaborator_label_codes for select to authenticated
  using ((select private.can_manage_label_lots()));
create policy "label lots: authorized read"
  on public.label_lots for select to authenticated
  using ((select private.can_manage_label_lots()));
create policy "label events: authorized read"
  on public.label_lot_events for select to authenticated
  using ((select private.can_manage_label_lots()));

create or replace function public.assign_collaborator_label_code(
  p_collaborator_id uuid,
  p_code text
)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_code text := upper(trim(p_code));
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.status = 'active' and p.role = 'admin'
  ) then
    raise exception 'Apenas a administração pode cadastrar códigos de colaboradoras.';
  end if;
  if p_collaborator_id is null or v_code is null or v_code !~ '^P[1-9][0-9]*$' then
    raise exception 'Informe um código válido, como P1.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_collaborator_id and p.status = 'active' and p.role = 'collaborator'
  ) then
    raise exception 'Selecione uma colaboradora ativa.';
  end if;

  -- Insert-only: an issued code cannot later move silently to another person.
  insert into public.collaborator_label_codes (collaborator_id, code, assigned_by)
  values (p_collaborator_id, v_code, v_actor);
  return v_code;
end;
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
  where p.id = p_collaborator_id and p.status = 'active' and p.role = 'collaborator';
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

create or replace function public.record_label_output(
  p_lot_id uuid,
  p_output_format text,
  p_label_count integer,
  p_event_key uuid,
  p_reason text default null
)
returns public.label_lot_events
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_name text;
  v_lot public.label_lots%rowtype;
  v_event public.label_lot_events%rowtype;
  v_type text;
begin
  if not private.can_manage_label_lots() then
    raise exception 'Sem permissão para gerar etiquetas.';
  end if;
  if p_lot_id is null or p_event_key is null
    or p_output_format not in ('pdf', 'zpl')
    or p_label_count is null or p_label_count not between 1 and 100000 then
    raise exception 'Dados de geração de etiquetas inválidos.';
  end if;
  select * into v_event from public.label_lot_events where event_key = p_event_key;
  if found then
    if v_event.actor_id <> v_actor or v_event.lot_id <> p_lot_id
      or v_event.output_format <> p_output_format
      or v_event.label_count <> p_label_count then
      raise exception 'Esta operação já foi usada com dados diferentes.';
    end if;
    return v_event;
  end if;

  select * into v_lot from public.label_lots where id = p_lot_id for update;
  if not found or v_lot.status <> 'active' then
    raise exception 'O lote não existe ou não está ativo.';
  end if;
  select * into v_event from public.label_lot_events where event_key = p_event_key;
  if found then
    if v_event.actor_id <> v_actor or v_event.lot_id <> p_lot_id
      or v_event.output_format <> p_output_format
      or v_event.label_count <> p_label_count then
      raise exception 'Esta operação já foi usada com dados diferentes.';
    end if;
    return v_event;
  end if;

  select p.full_name into v_actor_name from public.profiles p where p.id = v_actor;
  if not exists (
    select 1 from public.label_lot_events e
    where e.lot_id = p_lot_id and e.event_type in ('generated', 'reprinted')
  ) then
    v_type := 'generated';
    if p_label_count <> v_lot.requested_label_count then
      raise exception 'A primeira geração deve usar a quantidade informada no lote.';
    end if;
  else
    v_type := 'reprinted';
    if p_reason is null or length(trim(p_reason)) not between 3 and 500 then
      raise exception 'Informe o motivo da reimpressão.';
    end if;
  end if;

  insert into public.label_lot_events (
    event_key, lot_id, event_type, output_format, label_count,
    reason, actor_id, actor_name
  ) values (
    p_event_key, p_lot_id, v_type, p_output_format, p_label_count,
    case when v_type = 'reprinted' then trim(p_reason) else null end,
    v_actor, v_actor_name
  ) returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.cancel_label_lot(
  p_lot_id uuid,
  p_reason text,
  p_event_key uuid
)
returns public.label_lots
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_name text;
  v_lot public.label_lots%rowtype;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.status = 'active' and p.role = 'admin'
  ) then
    raise exception 'Apenas a administração pode cancelar lotes.';
  end if;
  if p_lot_id is null or p_event_key is null
    or p_reason is null or length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Informe o lote e um motivo para o cancelamento.';
  end if;

  select * into v_lot from public.label_lots where id = p_lot_id for update;
  if not found then
    raise exception 'Lote não encontrado.';
  end if;
  if v_lot.status = 'cancelled' then
    return v_lot;
  end if;
  select p.full_name into v_actor_name from public.profiles p where p.id = v_actor;
  update public.label_lots
  set status = 'cancelled', cancelled_by = v_actor,
      cancelled_at = now(), cancel_reason = trim(p_reason)
  where id = p_lot_id returning * into v_lot;
  insert into public.label_lot_events (
    event_key, lot_id, event_type, reason, actor_id, actor_name
  ) values (p_event_key, p_lot_id, 'cancelled', trim(p_reason), v_actor, v_actor_name);
  return v_lot;
end;
$$;

revoke all on function private.can_manage_label_lots() from public, anon, authenticated;
revoke all on function public.assign_collaborator_label_code(uuid, text) from public, anon, authenticated;
revoke all on function public.create_label_lot(uuid, date, integer, uuid) from public, anon, authenticated;
revoke all on function public.record_label_output(uuid, text, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_label_lot(uuid, text, uuid) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.can_manage_label_lots() to authenticated, service_role;
grant execute on function public.assign_collaborator_label_code(uuid, text) to authenticated, service_role;
grant execute on function public.create_label_lot(uuid, date, integer, uuid) to authenticated, service_role;
grant execute on function public.record_label_output(uuid, text, integer, uuid, text) to authenticated, service_role;
grant execute on function public.cancel_label_lot(uuid, text, uuid) to authenticated, service_role;
