-- Harmony Store Oficial — etiquetas térmicas 100 x 150 mm para caixas do Inventário de Produção.
-- O pré-cadastro não altera o saldo até a confirmação física da etiqueta na caixa.

begin;

alter table public.production_inventory_entries
  add column if not exists label_status text not null default 'applied',
  add column if not exists label_token uuid not null default gen_random_uuid(),
  add column if not exists label_applied_at timestamptz,
  add column if not exists label_applied_by uuid references public.profiles(id) on delete restrict,
  add column if not exists label_cancelled_at timestamptz,
  add column if not exists label_cancelled_by uuid references public.profiles(id) on delete restrict,
  add column if not exists label_cancellation_reason text;

-- Mantém compatibilidade com versões anteriores do PWA ainda abertas em cache:
-- entradas criadas pelos RPCs v1/v2 continuam aplicadas e auditáveis.
alter table public.production_inventory_entries
  alter column label_applied_at set default now(),
  alter column label_applied_by set default auth.uid();

update public.production_inventory_entries
set label_status='applied',
    label_applied_at=coalesce(label_applied_at,created_at),
    label_applied_by=coalesce(label_applied_by,created_by)
where label_applied_at is null or label_applied_by is null;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.production_inventory_entries'::regclass
      and conname='production_inventory_label_status_check'
  ) then
    alter table public.production_inventory_entries
      add constraint production_inventory_label_status_check
      check (label_status in ('pending','applied','cancelled'));
  end if;
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.production_inventory_entries'::regclass
      and conname='production_inventory_label_state_check'
  ) then
    alter table public.production_inventory_entries
      add constraint production_inventory_label_state_check check (
        (
          label_status='pending' and current_quantity=0
          and label_applied_at is null and label_applied_by is null
          and label_cancelled_at is null and label_cancelled_by is null
          and label_cancellation_reason is null
        ) or (
          label_status='applied'
          and label_applied_at is not null and label_applied_by is not null
          and label_cancelled_at is null and label_cancelled_by is null
          and label_cancellation_reason is null
        ) or (
          label_status='cancelled' and current_quantity=0
          and label_applied_at is null and label_applied_by is null
          and label_cancelled_at is not null and label_cancelled_by is not null
          and nullif(trim(label_cancellation_reason),'') is not null
        )
      );
  end if;
end
$$;

create unique index if not exists production_inventory_entries_label_token_unique
  on public.production_inventory_entries(label_token);
create index if not exists production_inventory_entries_pending_label_idx
  on public.production_inventory_entries(box_number desc)
  where label_status='pending';

drop index if exists public.production_inventory_entries_available_boxes_idx;
create index production_inventory_entries_available_boxes_idx
  on public.production_inventory_entries(box_number desc)
  where label_status='applied' and current_quantity>0 and transferred_at is null;

create table if not exists public.production_inventory_label_prints (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  entry_id uuid not null references public.production_inventory_entries(id) on delete restrict,
  output_format text not null check (output_format in ('png','pdf','print')),
  template_version text not null default '100x150-v1' check (length(template_version) between 1 and 40),
  is_reprint boolean not null default false,
  reason text check (reason is null or length(reason) <= 240),
  printed_by uuid not null references public.profiles(id) on delete restrict,
  printed_at timestamptz not null default now()
);

create index if not exists production_inventory_label_prints_entry_idx
  on public.production_inventory_label_prints(entry_id,printed_at desc);

alter table public.production_inventory_label_prints enable row level security;
revoke all privileges on table public.production_inventory_label_prints from public,anon,authenticated;
grant all privileges on table public.production_inventory_label_prints to service_role;

comment on column public.production_inventory_entries.label_status is
  'pending: etiqueta ainda não aplicada; applied: caixa liberada no estoque; cancelled: pré-cadastro cancelado sem reutilizar o código.';
comment on column public.production_inventory_entries.label_token is
  'Identificador opaco e permanente usado no QR Code da etiqueta física.';
comment on table public.production_inventory_label_prints is
  'Auditoria de geração, impressão e reimpressão das etiquetas térmicas do Inventário de Produção.';

create or replace function private.enforce_production_inventory_label_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.label_status<>'applied' and (
    new.current_quantity<>0 or new.transferred_at is not null
    or new.transferred_on is not null or new.transferred_by is not null
    or new.transfer_destination is not null
  ) then
    raise exception 'A caixa só pode movimentar estoque depois que a etiqueta for confirmada.' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists production_inventory_label_state_guard on public.production_inventory_entries;
create trigger production_inventory_label_state_guard
before insert or update on public.production_inventory_entries
for each row execute function private.enforce_production_inventory_label_state();

create or replace function private.enforce_production_inventory_movement_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(
    select 1 from public.production_inventory_entries e
    where e.id=new.entry_id and e.label_status='applied'
  ) then
    raise exception 'Movimentação bloqueada: confirme primeiro a etiqueta física da caixa.' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists production_inventory_movement_label_guard on public.production_inventory_movements;
create trigger production_inventory_movement_label_guard
before insert on public.production_inventory_movements
for each row execute function private.enforce_production_inventory_movement_label();

revoke all on function private.enforce_production_inventory_label_state() from public,anon,authenticated;
revoke all on function private.enforce_production_inventory_movement_label() from public,anon,authenticated;
grant execute on function private.enforce_production_inventory_label_state() to service_role;
grant execute on function private.enforce_production_inventory_movement_label() to service_role;

create or replace function public.create_production_inventory_entry_v3(
  p_model_id uuid,
  p_color_id uuid,
  p_worker_id uuid,
  p_quantity bigint,
  p_entry_on date,
  p_box_number bigint,
  p_box_reference text default null,
  p_notes text default null
) returns table(
  id uuid, protocol bigint, box_number bigint, box_code text,
  label_token uuid, label_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_protocol bigint;
  v_token uuid;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Informe uma quantidade inteira maior que zero.'; end if;
  if p_entry_on is null or p_entry_on>current_date then raise exception 'Informe uma data de entrada válida.'; end if;
  if coalesce(p_box_number,0)<=0 then raise exception 'Gere um código de caixa válido antes de continuar.'; end if;
  if not exists(select 1 from public.finished_product_models m where m.id=p_model_id and m.active) then
    raise exception 'Modelo inválido ou inativo.';
  end if;
  if not exists(select 1 from public.finished_production_colors c where c.id=p_color_id and c.active) then
    raise exception 'Cor inválida ou inativa.';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_worker_id and p.status='active' and p.role='collaborator') then
    raise exception 'Selecione uma colaboradora de produção ativa.';
  end if;

  insert into public.production_inventory_entries(
    model_id,color_id,worker_id,entry_on,box_reference,notes,
    original_quantity,current_quantity,created_by,box_number,
    label_status,label_applied_at,label_applied_by
  ) values(
    p_model_id,p_color_id,p_worker_id,p_entry_on,
    nullif(trim(p_box_reference),''),nullif(trim(p_notes),''),
    p_quantity,0,v_actor,p_box_number,'pending',null,null
  ) returning production_inventory_entries.id,production_inventory_entries.protocol,
      production_inventory_entries.label_token
    into v_id,v_protocol,v_token;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'production_inventory.box_label_pending','production_inventory_entry',v_id::text,
    jsonb_build_object(
      'protocol',v_protocol,'box_number',p_box_number,
      'box_code','CX-'||lpad(p_box_number::text,6,'0'),
      'model_id',p_model_id,'color_id',p_color_id,'worker_id',p_worker_id,
      'quantity',p_quantity,'entry_on',p_entry_on,
      'storage_location',nullif(trim(p_box_reference),''),
      'label_template','100x150-v1'
    ));

  return query select v_id,v_protocol,p_box_number,
    'CX-'||lpad(p_box_number::text,6,'0'),v_token,'pending'::text;
exception
  when unique_violation then
    raise exception 'A caixa CX-% já está cadastrada. Abra o registro existente.',lpad(p_box_number::text,6,'0') using errcode='23505';
end;
$$;

create or replace function public.confirm_production_inventory_label_applied(p_entry_id uuid)
returns table(
  id uuid, box_number bigint, box_code text, current_quantity bigint,
  label_status text, label_applied_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_entry public.production_inventory_entries%rowtype;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  select * into v_entry
  from public.production_inventory_entries e
  where e.id=p_entry_id
  for update;
  if not found then raise exception 'Caixa não localizada.' using errcode='P0002'; end if;
  if v_entry.label_status='cancelled' then
    raise exception 'Este pré-cadastro foi cancelado e o código não pode ser reutilizado.' using errcode='23514';
  end if;
  if v_entry.label_status='pending' then
    update public.production_inventory_entries e
    set current_quantity=v_entry.original_quantity,
        label_status='applied',label_applied_at=now(),label_applied_by=v_actor
    where e.id=p_entry_id;

    insert into public.production_inventory_movements(
      entry_id,movement_type,quantity,balance_before,balance_after,
      occurred_on,reason,notes,created_by
    ) values(
      p_entry_id,'entry',v_entry.original_quantity,0,v_entry.original_quantity,
      v_entry.entry_on,'Entrada liberada após aplicação da etiqueta física',v_entry.notes,v_actor
    );

    insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
    values(v_actor,'production_inventory.box_label_applied','production_inventory_entry',p_entry_id::text,
      jsonb_build_object(
        'protocol',v_entry.protocol,'box_number',v_entry.box_number,
        'box_code','CX-'||lpad(v_entry.box_number::text,6,'0'),
        'quantity',v_entry.original_quantity,'label_template','100x150-v1'
      ));
  end if;

  return query
  select e.id,e.box_number,'CX-'||lpad(e.box_number::text,6,'0'),e.current_quantity,
    e.label_status,e.label_applied_at
  from public.production_inventory_entries e where e.id=p_entry_id;
end;
$$;

create or replace function public.record_production_inventory_label_print(
  p_entry_id uuid,
  p_output_format text,
  p_reason text default null
) returns table(
  id uuid, protocol bigint, is_reprint boolean, printed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_entry public.production_inventory_entries%rowtype;
  v_id uuid;
  v_protocol bigint;
  v_reprint boolean;
  v_printed_at timestamptz;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_output_format not in ('png','pdf','print') then raise exception 'Formato de etiqueta inválido.'; end if;
  select * into v_entry from public.production_inventory_entries e where e.id=p_entry_id for update;
  if not found then raise exception 'Caixa não localizada.' using errcode='P0002'; end if;
  if v_entry.label_status='cancelled' then raise exception 'Não é possível imprimir uma etiqueta cancelada.' using errcode='23514'; end if;
  select exists(
    select 1 from public.production_inventory_label_prints lp
    where lp.entry_id=p_entry_id and lp.output_format=p_output_format
  )
    into v_reprint;
  if v_reprint and nullif(trim(p_reason),'') is null then
    raise exception 'Informe o motivo da reimpressão.';
  end if;

  insert into public.production_inventory_label_prints(
    entry_id,output_format,template_version,is_reprint,reason,printed_by
  ) values(
    p_entry_id,p_output_format,'100x150-v1',v_reprint,nullif(trim(p_reason),''),v_actor
  ) returning production_inventory_label_prints.id,production_inventory_label_prints.protocol,
      production_inventory_label_prints.printed_at
    into v_id,v_protocol,v_printed_at;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,case when v_reprint then 'production_inventory.label_reprinted' else 'production_inventory.label_generated' end,
    'production_inventory_entry',p_entry_id::text,
    jsonb_build_object(
      'label_print_protocol',v_protocol,'box_number',v_entry.box_number,
      'box_code','CX-'||lpad(v_entry.box_number::text,6,'0'),
      'format',p_output_format,'template','100x150-v1','reason',nullif(trim(p_reason),'')
    ));

  return query select v_id,v_protocol,v_reprint,v_printed_at;
end;
$$;

create or replace function public.cancel_pending_production_inventory_label(
  p_entry_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_entry public.production_inventory_entries%rowtype;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Informe o motivo do cancelamento.'; end if;
  select * into v_entry from public.production_inventory_entries e where e.id=p_entry_id for update;
  if not found then raise exception 'Caixa não localizada.' using errcode='P0002'; end if;
  if v_entry.label_status<>'pending' then
    raise exception 'Somente um pré-cadastro pendente pode ser cancelado.' using errcode='23514';
  end if;

  update public.production_inventory_entries e
  set label_status='cancelled',label_cancelled_at=now(),label_cancelled_by=v_actor,
      label_cancellation_reason=trim(p_reason)
  where e.id=p_entry_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'production_inventory.box_label_cancelled','production_inventory_entry',p_entry_id::text,
    jsonb_build_object(
      'protocol',v_entry.protocol,'box_number',v_entry.box_number,
      'box_code','CX-'||lpad(v_entry.box_number::text,6,'0'),'reason',trim(p_reason)
    ));
end;
$$;

create or replace function public.list_pending_production_inventory_labels()
returns table(
  id uuid, protocol bigint, box_number bigint, box_code text, label_token uuid,
  model_id uuid, model_name text, image_path text,
  color_id uuid, color_name text, color_hex text,
  worker_id uuid, worker_name text, entry_on date, box_reference text, notes text,
  original_quantity bigint, created_by uuid, created_by_name text, created_at timestamptz,
  print_count bigint, latest_print_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select e.id,e.protocol,e.box_number,'CX-'||lpad(e.box_number::text,6,'0'),e.label_token,
    e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    e.worker_id,w.full_name,e.entry_on,e.box_reference,e.notes,e.original_quantity,
    e.created_by,creator.full_name,e.created_at,
    count(lp.id)::bigint,max(lp.printed_at)
  from public.production_inventory_entries e
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  join public.profiles w on w.id=e.worker_id
  join public.profiles creator on creator.id=e.created_by
  left join public.production_inventory_label_prints lp on lp.entry_id=e.id
  where e.label_status='pending'
  group by e.id,m.name,m.image_path,c.name,c.hex_code,w.full_name,creator.full_name
  order by e.box_number desc;
end;
$$;

create or replace function public.get_production_inventory_box_by_label_token(p_label_token uuid)
returns table(
  id uuid, protocol bigint, box_number bigint, box_code text, label_token uuid, label_status text,
  model_id uuid, model_name text, image_path text,
  color_id uuid, color_name text, color_hex text,
  worker_id uuid, worker_name text, entry_on date, box_reference text, notes text,
  original_quantity bigint, current_quantity bigint,
  created_by_name text, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select e.id,e.protocol,e.box_number,'CX-'||lpad(e.box_number::text,6,'0'),e.label_token,e.label_status,
    e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    e.worker_id,w.full_name,e.entry_on,e.box_reference,e.notes,
    e.original_quantity,e.current_quantity,creator.full_name,e.created_at
  from public.production_inventory_entries e
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  join public.profiles w on w.id=e.worker_id
  join public.profiles creator on creator.id=e.created_by
  where e.label_token=p_label_token and e.label_status<>'cancelled';
end;
$$;

create or replace function public.list_production_inventory_entries_v4(
  p_model_id uuid,
  p_color_id uuid,
  p_include_depleted boolean default true
) returns table(
  id uuid, protocol bigint, box_number bigint, box_code text,
  label_token uuid, label_status text, label_applied_at timestamptz,
  model_id uuid, model_name text, image_path text,
  color_id uuid, color_name text, color_hex text, worker_id uuid, worker_name text,
  entry_on date, box_reference text, notes text, original_quantity bigint,
  current_quantity bigint, source_type text, source_receipt_id uuid,
  transfer_destination text, transferred_on date, transferred_at timestamptz,
  transferred_by uuid, transferred_by_name text,
  created_by uuid, created_by_name text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select e.id,e.protocol,e.box_number,'CX-'||lpad(e.box_number::text,6,'0'),
    e.label_token,e.label_status,e.label_applied_at,
    e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    e.worker_id,w.full_name,e.entry_on,e.box_reference,e.notes,e.original_quantity,
    e.current_quantity,e.source_type,e.source_receipt_id,
    e.transfer_destination,e.transferred_on,e.transferred_at,e.transferred_by,
    transferred.full_name,e.created_by,creator.full_name,e.created_at,e.updated_at
  from public.production_inventory_entries e
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  join public.profiles w on w.id=e.worker_id
  join public.profiles creator on creator.id=e.created_by
  left join public.profiles transferred on transferred.id=e.transferred_by
  where e.model_id=p_model_id and e.color_id=p_color_id
    and e.label_status<>'cancelled'
    and (coalesce(p_include_depleted,true) or e.current_quantity>0)
  order by (e.label_status='pending') desc,(e.current_quantity>0) desc,e.entry_on,e.box_number;
end;
$$;

create or replace function public.list_production_inventory_balance(
  p_query text default null,
  p_color_id uuid default null,
  p_only_available boolean default false
) returns table(
  model_id uuid, model_name text, image_path text, color_id uuid, color_name text,
  color_hex text, quantity bigint, entry_count bigint, producer_count bigint,
  oldest_entry_on date, latest_entry_on date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    coalesce(sum(e.current_quantity),0)::bigint,
    count(*) filter (where e.current_quantity>0)::bigint,
    count(distinct e.worker_id) filter (where e.current_quantity>0)::bigint,
    min(e.entry_on) filter (where e.current_quantity>0),max(e.entry_on)
  from public.production_inventory_entries e
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  where e.label_status='applied'
    and (p_color_id is null or e.color_id=p_color_id)
    and (nullif(trim(p_query),'') is null or lower(m.name) like '%'||lower(trim(p_query))||'%')
  group by e.model_id,m.name,m.image_path,e.color_id,c.name,c.hex_code,c.sort_order
  having not coalesce(p_only_available,false) or sum(e.current_quantity)>0
  order by lower(m.name),c.sort_order,lower(c.name);
end;
$$;

create or replace function public.list_production_inventory_by_worker(
  p_from date default null,
  p_to date default null,
  p_worker_id uuid default null
) returns table(
  worker_id uuid, worker_name text, model_id uuid, model_name text, image_path text,
  color_id uuid, color_name text, color_hex text, received_quantity bigint,
  current_quantity bigint, entry_count bigint, first_entry_on date, latest_entry_on date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select e.worker_id,w.full_name,e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    sum(e.original_quantity)::bigint,sum(e.current_quantity)::bigint,count(*)::bigint,
    min(e.entry_on),max(e.entry_on)
  from public.production_inventory_entries e
  join public.profiles w on w.id=e.worker_id
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  where e.label_status='applied'
    and (p_from is null or e.entry_on>=p_from)
    and (p_to is null or e.entry_on<=p_to)
    and (p_worker_id is null or e.worker_id=p_worker_id)
  group by e.worker_id,w.full_name,e.model_id,m.name,m.image_path,e.color_id,c.name,c.hex_code,c.sort_order
  order by lower(w.full_name),lower(m.name),c.sort_order,lower(c.name);
end;
$$;

create or replace function public.get_production_inventory_available_box_count()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_count bigint;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  select count(*)::bigint into v_count
  from public.production_inventory_entries e
  where e.label_status='applied' and e.current_quantity>0 and e.transferred_at is null;
  return coalesce(v_count,0);
end;
$$;

create or replace function public.list_available_production_inventory_boxes()
returns table(
  id uuid, protocol bigint, box_number bigint, box_code text,
  model_id uuid, model_name text, image_path text,
  color_id uuid, color_name text, color_hex text,
  worker_id uuid, worker_name text, entry_on date, box_reference text, notes text,
  original_quantity bigint, current_quantity bigint,
  created_by uuid, created_by_name text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select e.id,e.protocol,e.box_number,'CX-'||lpad(e.box_number::text,6,'0'),
    e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    e.worker_id,w.full_name,e.entry_on,e.box_reference,e.notes,
    e.original_quantity,e.current_quantity,e.created_by,creator.full_name,
    e.created_at,e.updated_at
  from public.production_inventory_entries e
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  join public.profiles w on w.id=e.worker_id
  join public.profiles creator on creator.id=e.created_by
  where e.label_status='applied' and e.current_quantity>0 and e.transferred_at is null
  order by e.box_number desc;
end;
$$;

revoke all on function public.create_production_inventory_entry_v3(uuid,uuid,uuid,bigint,date,bigint,text,text) from public,anon,authenticated;
revoke all on function public.confirm_production_inventory_label_applied(uuid) from public,anon,authenticated;
revoke all on function public.record_production_inventory_label_print(uuid,text,text) from public,anon,authenticated;
revoke all on function public.cancel_pending_production_inventory_label(uuid,text) from public,anon,authenticated;
revoke all on function public.list_pending_production_inventory_labels() from public,anon,authenticated;
revoke all on function public.get_production_inventory_box_by_label_token(uuid) from public,anon,authenticated;
revoke all on function public.list_production_inventory_entries_v4(uuid,uuid,boolean) from public,anon,authenticated;

grant execute on function public.create_production_inventory_entry_v3(uuid,uuid,uuid,bigint,date,bigint,text,text) to authenticated,service_role;
grant execute on function public.confirm_production_inventory_label_applied(uuid) to authenticated,service_role;
grant execute on function public.record_production_inventory_label_print(uuid,text,text) to authenticated,service_role;
grant execute on function public.cancel_pending_production_inventory_label(uuid,text) to authenticated,service_role;
grant execute on function public.list_pending_production_inventory_labels() to authenticated,service_role;
grant execute on function public.get_production_inventory_box_by_label_token(uuid) to authenticated,service_role;
grant execute on function public.list_production_inventory_entries_v4(uuid,uuid,boolean) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
