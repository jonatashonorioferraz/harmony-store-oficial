-- Harmony Store Oficial — Inventário de Produção (produtos acabados).
-- Estrutura aditiva, auditável e independente de pagamentos e matérias-primas.

begin;

create or replace function private.can_manage_production_inventory()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id=(select auth.uid())
      and p.status='active'
      and p.role in ('admin','receiver')
  )
$$;

revoke all on function private.can_manage_production_inventory() from public,anon;
grant execute on function private.can_manage_production_inventory() to authenticated,service_role;

create table if not exists public.production_inventory_entries (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  model_id uuid not null references public.finished_product_models(id) on delete restrict,
  color_id uuid not null references public.finished_production_colors(id) on delete restrict,
  worker_id uuid not null references public.profiles(id) on delete restrict,
  entry_on date not null default current_date check (entry_on <= current_date),
  box_reference text check (box_reference is null or length(trim(box_reference)) between 1 and 100),
  notes text check (notes is null or length(notes) <= 1200),
  original_quantity bigint not null check (original_quantity > 0),
  current_quantity bigint not null check (current_quantity >= 0),
  source_type text not null default 'manual' check (source_type in ('manual','production_receipt')),
  source_receipt_id uuid references public.finished_production_receipts(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  entry_id uuid not null references public.production_inventory_entries(id) on delete restrict,
  movement_type text not null check (movement_type in ('entry','exit','adjustment_in','adjustment_out')),
  quantity bigint not null check (quantity > 0),
  balance_before bigint not null check (balance_before >= 0),
  balance_after bigint not null check (balance_after >= 0),
  occurred_on date not null default current_date check (occurred_on <= current_date),
  reason text check (reason is null or length(reason) <= 240),
  notes text check (notes is null or length(notes) <= 1200),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists production_inventory_entries_balance_idx
  on public.production_inventory_entries(model_id,color_id,current_quantity,entry_on);
create index if not exists production_inventory_entries_worker_idx
  on public.production_inventory_entries(worker_id,entry_on desc);
create index if not exists production_inventory_movements_entry_idx
  on public.production_inventory_movements(entry_id,occurred_on desc,created_at desc);
create index if not exists production_inventory_movements_period_idx
  on public.production_inventory_movements(occurred_on desc,movement_type);

drop trigger if exists production_inventory_entries_touch_updated_at on public.production_inventory_entries;
create trigger production_inventory_entries_touch_updated_at
before update on public.production_inventory_entries
for each row execute function public.touch_updated_at();

alter table public.production_inventory_entries enable row level security;
alter table public.production_inventory_movements enable row level security;
revoke all privileges on table public.production_inventory_entries from public,anon,authenticated;
revoke all privileges on table public.production_inventory_movements from public,anon,authenticated;
grant all privileges on table public.production_inventory_entries to service_role;
grant all privileges on table public.production_inventory_movements to service_role;

create or replace function public.list_production_inventory_workers()
returns table(id uuid, full_name text, department text, avatar_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select p.id,p.full_name,p.department,p.avatar_path
  from public.profiles p
  where p.status='active' and p.role='collaborator'
  order by p.full_name;
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
  where (p_color_id is null or e.color_id=p_color_id)
    and (nullif(trim(p_query),'') is null or lower(m.name) like '%'||lower(trim(p_query))||'%')
  group by e.model_id,m.name,m.image_path,e.color_id,c.name,c.hex_code,c.sort_order
  having not coalesce(p_only_available,false) or sum(e.current_quantity)>0
  order by lower(m.name),c.sort_order,lower(c.name);
end;
$$;

create or replace function public.list_production_inventory_entries(
  p_model_id uuid,
  p_color_id uuid,
  p_include_depleted boolean default true
) returns table(
  id uuid, protocol bigint, model_id uuid, model_name text, image_path text,
  color_id uuid, color_name text, color_hex text, worker_id uuid, worker_name text,
  entry_on date, box_reference text, notes text, original_quantity bigint,
  current_quantity bigint, source_type text, source_receipt_id uuid,
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
  select e.id,e.protocol,e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    e.worker_id,w.full_name,e.entry_on,e.box_reference,e.notes,e.original_quantity,
    e.current_quantity,e.source_type,e.source_receipt_id,e.created_by,creator.full_name,
    e.created_at,e.updated_at
  from public.production_inventory_entries e
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  join public.profiles w on w.id=e.worker_id
  join public.profiles creator on creator.id=e.created_by
  where e.model_id=p_model_id and e.color_id=p_color_id
    and (coalesce(p_include_depleted,true) or e.current_quantity>0)
  order by (e.current_quantity>0) desc,e.entry_on,e.protocol;
end;
$$;

create or replace function public.list_production_inventory_movements(
  p_from date default null,
  p_to date default null,
  p_worker_id uuid default null,
  p_model_id uuid default null,
  p_color_id uuid default null
) returns table(
  id uuid, protocol bigint, entry_id uuid, entry_protocol bigint,
  movement_type text, quantity bigint, balance_before bigint, balance_after bigint,
  occurred_on date, reason text, notes text, model_id uuid, model_name text,
  image_path text, color_id uuid, color_name text, color_hex text,
  worker_id uuid, worker_name text, box_reference text, created_by_name text,
  created_at timestamptz
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
  select mv.id,mv.protocol,mv.entry_id,e.protocol,mv.movement_type,mv.quantity,
    mv.balance_before,mv.balance_after,mv.occurred_on,mv.reason,mv.notes,
    e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    e.worker_id,w.full_name,e.box_reference,actor.full_name,mv.created_at
  from public.production_inventory_movements mv
  join public.production_inventory_entries e on e.id=mv.entry_id
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  join public.profiles w on w.id=e.worker_id
  join public.profiles actor on actor.id=mv.created_by
  where (p_from is null or mv.occurred_on>=p_from)
    and (p_to is null or mv.occurred_on<=p_to)
    and (p_worker_id is null or e.worker_id=p_worker_id)
    and (p_model_id is null or e.model_id=p_model_id)
    and (p_color_id is null or e.color_id=p_color_id)
  order by mv.occurred_on desc,mv.created_at desc,mv.protocol desc;
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
  where (p_from is null or e.entry_on>=p_from)
    and (p_to is null or e.entry_on<=p_to)
    and (p_worker_id is null or e.worker_id=p_worker_id)
  group by e.worker_id,w.full_name,e.model_id,m.name,m.image_path,e.color_id,c.name,c.hex_code,c.sort_order
  order by lower(w.full_name),lower(m.name),c.sort_order,lower(c.name);
end;
$$;

create or replace function public.create_production_inventory_entry(
  p_model_id uuid,
  p_color_id uuid,
  p_worker_id uuid,
  p_quantity bigint,
  p_entry_on date,
  p_box_reference text default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_protocol bigint;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Informe uma quantidade inteira maior que zero.'; end if;
  if p_entry_on is null or p_entry_on>current_date then raise exception 'Informe uma data de entrada válida.'; end if;
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
    original_quantity,current_quantity,created_by
  ) values(
    p_model_id,p_color_id,p_worker_id,p_entry_on,
    nullif(trim(p_box_reference),''),nullif(trim(p_notes),''),
    p_quantity,p_quantity,v_actor
  ) returning id,protocol into v_id,v_protocol;
  insert into public.production_inventory_movements(
    entry_id,movement_type,quantity,balance_before,balance_after,occurred_on,reason,notes,created_by
  ) values(v_id,'entry',p_quantity,0,p_quantity,p_entry_on,'Entrada de produção',nullif(trim(p_notes),''),v_actor);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'production_inventory.entry_created','production_inventory_entry',v_id::text,
    jsonb_build_object('protocol',v_protocol,'model_id',p_model_id,'color_id',p_color_id,'worker_id',p_worker_id,'quantity',p_quantity,'entry_on',p_entry_on,'box_reference',nullif(trim(p_box_reference),'')));
  return v_id;
end;
$$;

create or replace function public.withdraw_production_inventory_entry(
  p_entry_id uuid,
  p_quantity bigint,
  p_occurred_on date,
  p_reason text default null,
  p_notes text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_entry public.production_inventory_entries%rowtype; v_after bigint;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Informe uma quantidade inteira maior que zero.'; end if;
  if p_occurred_on is null or p_occurred_on>current_date then raise exception 'Informe uma data de saída válida.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Informe o motivo da saída.'; end if;
  select * into v_entry from public.production_inventory_entries where id=p_entry_id for update;
  if not found then raise exception 'Lote não localizado.' using errcode='P0002'; end if;
  if p_quantity>v_entry.current_quantity then
    raise exception 'Saldo insuficiente neste lote. Disponível: % unidade(s).',v_entry.current_quantity;
  end if;
  v_after:=v_entry.current_quantity-p_quantity;
  update public.production_inventory_entries set current_quantity=v_after where id=p_entry_id;
  insert into public.production_inventory_movements(
    entry_id,movement_type,quantity,balance_before,balance_after,occurred_on,reason,notes,created_by
  ) values(p_entry_id,'exit',p_quantity,v_entry.current_quantity,v_after,p_occurred_on,trim(p_reason),nullif(trim(p_notes),''),v_actor);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'production_inventory.stock_withdrawn','production_inventory_entry',p_entry_id::text,
    jsonb_build_object('entry_protocol',v_entry.protocol,'quantity',p_quantity,'balance_before',v_entry.current_quantity,'balance_after',v_after,'occurred_on',p_occurred_on,'reason',trim(p_reason)));
  return v_after;
end;
$$;

create or replace function public.adjust_production_inventory_entry(
  p_entry_id uuid,
  p_counted_quantity bigint,
  p_occurred_on date,
  p_reason text,
  p_notes text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_entry public.production_inventory_entries%rowtype; v_type text; v_delta bigint;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if coalesce(p_counted_quantity,-1)<0 then raise exception 'Informe a quantidade física conferida.'; end if;
  if p_occurred_on is null or p_occurred_on>current_date then raise exception 'Informe uma data de ajuste válida.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'O motivo do ajuste é obrigatório.'; end if;
  select * into v_entry from public.production_inventory_entries where id=p_entry_id for update;
  if not found then raise exception 'Lote não localizado.' using errcode='P0002'; end if;
  if p_counted_quantity=v_entry.current_quantity then raise exception 'A contagem informada é igual ao saldo atual.'; end if;
  v_type:=case when p_counted_quantity>v_entry.current_quantity then 'adjustment_in' else 'adjustment_out' end;
  v_delta:=abs(p_counted_quantity-v_entry.current_quantity);
  update public.production_inventory_entries set current_quantity=p_counted_quantity where id=p_entry_id;
  insert into public.production_inventory_movements(
    entry_id,movement_type,quantity,balance_before,balance_after,occurred_on,reason,notes,created_by
  ) values(p_entry_id,v_type,v_delta,v_entry.current_quantity,p_counted_quantity,p_occurred_on,trim(p_reason),nullif(trim(p_notes),''),v_actor);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'production_inventory.stock_adjusted','production_inventory_entry',p_entry_id::text,
    jsonb_build_object('entry_protocol',v_entry.protocol,'difference',p_counted_quantity-v_entry.current_quantity,'balance_before',v_entry.current_quantity,'balance_after',p_counted_quantity,'occurred_on',p_occurred_on,'reason',trim(p_reason)));
  return p_counted_quantity;
end;
$$;

create or replace function public.update_production_inventory_entry_metadata(
  p_entry_id uuid,
  p_worker_id uuid,
  p_entry_on date,
  p_box_reference text default null,
  p_notes text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_before jsonb; v_after jsonb;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_entry_on is null or p_entry_on>current_date then raise exception 'Informe uma data de entrada válida.'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_worker_id and p.status='active' and p.role='collaborator') then
    raise exception 'Selecione uma colaboradora de produção ativa.';
  end if;
  select to_jsonb(e) into v_before from public.production_inventory_entries e where e.id=p_entry_id for update;
  if v_before is null then raise exception 'Lote não localizado.' using errcode='P0002'; end if;
  update public.production_inventory_entries
  set worker_id=p_worker_id,entry_on=p_entry_on,box_reference=nullif(trim(p_box_reference),''),notes=nullif(trim(p_notes),'')
  where id=p_entry_id;
  select to_jsonb(e) into v_after from public.production_inventory_entries e where e.id=p_entry_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'production_inventory.entry_metadata_updated','production_inventory_entry',p_entry_id::text,
    jsonb_build_object('before',v_before,'after',v_after));
end;
$$;

revoke all on function public.list_production_inventory_workers() from public,anon,authenticated;
revoke all on function public.list_production_inventory_balance(text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.list_production_inventory_entries(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.list_production_inventory_movements(date,date,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.list_production_inventory_by_worker(date,date,uuid) from public,anon,authenticated;
revoke all on function public.create_production_inventory_entry(uuid,uuid,uuid,bigint,date,text,text) from public,anon,authenticated;
revoke all on function public.withdraw_production_inventory_entry(uuid,bigint,date,text,text) from public,anon,authenticated;
revoke all on function public.adjust_production_inventory_entry(uuid,bigint,date,text,text) from public,anon,authenticated;
revoke all on function public.update_production_inventory_entry_metadata(uuid,uuid,date,text,text) from public,anon,authenticated;

grant execute on function public.list_production_inventory_workers() to authenticated,service_role;
grant execute on function public.list_production_inventory_balance(text,uuid,boolean) to authenticated,service_role;
grant execute on function public.list_production_inventory_entries(uuid,uuid,boolean) to authenticated,service_role;
grant execute on function public.list_production_inventory_movements(date,date,uuid,uuid,uuid) to authenticated,service_role;
grant execute on function public.list_production_inventory_by_worker(date,date,uuid) to authenticated,service_role;
grant execute on function public.create_production_inventory_entry(uuid,uuid,uuid,bigint,date,text,text) to authenticated,service_role;
grant execute on function public.withdraw_production_inventory_entry(uuid,bigint,date,text,text) to authenticated,service_role;
grant execute on function public.adjust_production_inventory_entry(uuid,bigint,date,text,text) to authenticated,service_role;
grant execute on function public.update_production_inventory_entry_metadata(uuid,uuid,date,text,text) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
