-- Harmony Store Oficial — Suprimentos internos, compras e cupons fiscais.
-- Atualização aditiva: preserva solicitações de matéria-prima, produção e pagamentos.

begin;

alter table public.products
  add column if not exists usage_scope text not null default 'production';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_usage_scope_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products add constraint products_usage_scope_check
      check (usage_scope in ('production','ecommerce','internal'));
  end if;
end $$;

comment on column public.products.usage_scope is
  'Finalidade operacional do produto: produção, e-commerce ou suprimento interno.';

create or replace function private.can_access_internal_supplies()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and status = 'active'
      and role in ('admin','receiver')
  )
$$;

revoke all on function private.can_access_internal_supplies() from public, anon;
grant execute on function private.can_access_internal_supplies() to authenticated;

create table if not exists public.internal_supply_requests (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_by_name text not null,
  status text not null default 'pending'
    check (status in ('pending','separating','scheduled','delivered','cancelled')),
  priority text not null default 'normal'
    check (priority in ('normal','important','urgent')),
  needed_by date,
  notes text,
  admin_notes text,
  scheduled_for timestamptz,
  separated_by uuid references public.profiles(id) on delete set null,
  delivered_by_name text,
  received_by_name text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.internal_supply_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.internal_supply_requests(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  requested_quantity numeric(14,3) not null default 1 check (requested_quantity > 0),
  approved_quantity numeric(14,3) check (approved_quantity >= 0),
  removed_by_admin boolean not null default false,
  admin_note text,
  created_at timestamptz not null default now(),
  unique (request_id, product_id)
);

create table if not exists public.internal_purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  request_id uuid references public.internal_supply_requests(id) on delete restrict,
  purchase_origin text not null default 'direct' check (purchase_origin in ('requested','direct')),
  supplier_id uuid references public.suppliers(id) on delete set null,
  merchant_name text not null,
  merchant_document text,
  fiscal_access_key text,
  receipt_number text,
  purchased_at timestamptz not null,
  total_value numeric(14,2) not null check (total_value >= 0),
  payment_method text,
  image_path text,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  ai_used boolean not null default false,
  ai_model text,
  ai_confidence numeric(5,4) check (ai_confidence between 0 and 1),
  extraction jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  confirmed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='internal_purchase_receipts_origin_check'
      and conrelid='public.internal_purchase_receipts'::regclass
  ) then
    alter table public.internal_purchase_receipts
      add constraint internal_purchase_receipts_origin_check
      check ((purchase_origin='direct' and request_id is null) or (purchase_origin='requested' and request_id is not null));
  end if;
end $$;

create unique index if not exists internal_purchase_receipts_fiscal_key_unique
  on public.internal_purchase_receipts(fiscal_access_key)
  where fiscal_access_key is not null and status = 'confirmed';

create table if not exists public.internal_purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.internal_purchase_receipts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  raw_description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text,
  unit_price numeric(14,4) not null default 0 check (unit_price >= 0),
  total_price numeric(14,2) not null default 0 check (total_price >= 0),
  confidence numeric(5,4) check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table if not exists public.internal_receipt_ai_runs (
  id bigint generated always as identity primary key,
  created_by uuid not null references public.profiles(id) on delete restrict,
  image_path text not null,
  model text not null,
  status text not null check (status in ('success','failed')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  error_code text,
  created_at timestamptz not null default now()
);

alter table public.stock_movements
  add column if not exists internal_request_id uuid references public.internal_supply_requests(id) on delete set null,
  add column if not exists internal_receipt_id uuid references public.internal_purchase_receipts(id) on delete set null;

create index if not exists products_usage_scope_active_idx
  on public.products(usage_scope, active);
create index if not exists internal_supply_requests_requester_created_idx
  on public.internal_supply_requests(requested_by, created_at desc);
create index if not exists internal_supply_requests_status_created_idx
  on public.internal_supply_requests(status, created_at desc);
create index if not exists internal_supply_request_items_request_idx
  on public.internal_supply_request_items(request_id);
create index if not exists internal_supply_request_items_product_idx
  on public.internal_supply_request_items(product_id);
create index if not exists internal_purchase_receipts_date_idx
  on public.internal_purchase_receipts(purchased_at desc);
create index if not exists internal_purchase_receipts_request_idx
  on public.internal_purchase_receipts(request_id);
create index if not exists internal_purchase_receipts_supplier_date_idx
  on public.internal_purchase_receipts(supplier_id, purchased_at desc);
create index if not exists internal_purchase_receipts_created_by_idx
  on public.internal_purchase_receipts(created_by);
create index if not exists internal_purchase_receipt_items_receipt_idx
  on public.internal_purchase_receipt_items(receipt_id);
create index if not exists internal_purchase_receipt_items_product_idx
  on public.internal_purchase_receipt_items(product_id);
create index if not exists internal_receipt_ai_runs_user_created_idx
  on public.internal_receipt_ai_runs(created_by,created_at desc);
create index if not exists stock_movements_internal_request_idx
  on public.stock_movements(internal_request_id);
create index if not exists stock_movements_internal_receipt_idx
  on public.stock_movements(internal_receipt_id);

drop trigger if exists touch_updated_at on public.internal_supply_requests;
create trigger touch_updated_at before update on public.internal_supply_requests
for each row execute function public.touch_updated_at();
drop trigger if exists touch_updated_at on public.internal_purchase_receipts;
create trigger touch_updated_at before update on public.internal_purchase_receipts
for each row execute function public.touch_updated_at();

alter table public.internal_supply_requests enable row level security;
alter table public.internal_supply_request_items enable row level security;
alter table public.internal_purchase_receipts enable row level security;
alter table public.internal_purchase_receipt_items enable row level security;
alter table public.internal_receipt_ai_runs enable row level security;

drop policy if exists "internal request: operations read" on public.internal_supply_requests;
drop policy if exists "internal request item: operations read" on public.internal_supply_request_items;
drop policy if exists "internal receipt: operations read" on public.internal_purchase_receipts;
drop policy if exists "internal receipt item: operations read" on public.internal_purchase_receipt_items;
drop policy if exists "internal receipt ai: admin read" on public.internal_receipt_ai_runs;

create policy "internal request: operations read" on public.internal_supply_requests
  for select to authenticated using ((select private.can_access_internal_supplies()));
create policy "internal request item: operations read" on public.internal_supply_request_items
  for select to authenticated using ((select private.can_access_internal_supplies()));
create policy "internal receipt: operations read" on public.internal_purchase_receipts
  for select to authenticated using ((select private.is_admin()));
create policy "internal receipt item: operations read" on public.internal_purchase_receipt_items
  for select to authenticated using ((select private.is_admin()));
create policy "internal receipt ai: admin read" on public.internal_receipt_ai_runs
  for select to authenticated using ((select private.is_admin()));

grant select on public.internal_supply_requests to authenticated;
grant select on public.internal_supply_request_items to authenticated;
grant select on public.internal_purchase_receipts to authenticated;
grant select on public.internal_purchase_receipt_items to authenticated;
grant select on public.internal_receipt_ai_runs to authenticated;
grant select,insert on public.internal_receipt_ai_runs to service_role;
grant usage,select on sequence public.internal_receipt_ai_runs_id_seq to service_role;

create or replace function public.admin_save_internal_supply_product(
  p_product_id uuid,
  p_name text,
  p_unit text,
  p_description text,
  p_minimum_stock numeric,
  p_physical_stock numeric,
  p_supplier_id uuid default null,
  p_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_actor uuid := (select auth.uid());
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Informe o nome do suprimento.'; end if;
  if p_unit not in ('unidade','quilo','cm','metro','rolo','garrafa','caixa') then raise exception 'Unidade inválida.'; end if;
  if coalesce(p_minimum_stock,0) < 0 or coalesce(p_physical_stock,0) < 0 then raise exception 'O estoque não pode ser negativo.'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_supplier_id and active) then raise exception 'Fornecedor inválido.'; end if;

  if p_product_id is null then
    insert into public.products(name,unit,description,minimum_stock,physical_stock,active,created_by,usage_scope,hidden_from_collaborators)
    values(trim(p_name),p_unit,nullif(trim(p_description),''),coalesce(p_minimum_stock,0),coalesce(p_physical_stock,0),coalesce(p_active,true),v_actor,'internal',true)
    returning id into v_id;
  else
    update public.products set
      name=trim(p_name), unit=p_unit, description=nullif(trim(p_description),''),
      minimum_stock=coalesce(p_minimum_stock,0), physical_stock=coalesce(p_physical_stock,0),
      reserved_stock=least(reserved_stock,coalesce(p_physical_stock,0)), active=coalesce(p_active,true),
      usage_scope='internal', hidden_from_collaborators=true
    where id=p_product_id and usage_scope='internal'
    returning id into v_id;
    if v_id is null then raise exception 'Suprimento interno não localizado.'; end if;
  end if;

  update public.supplier_products set is_preferred=false where product_id=v_id and is_preferred;
  if p_supplier_id is not null then
    insert into public.supplier_products(supplier_id,product_id,is_preferred)
    values(p_supplier_id,v_id,true)
    on conflict(supplier_id,product_id) do update set is_preferred=true,updated_at=now();
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,case when p_product_id is null then 'internal_supply.product_created' else 'internal_supply.product_updated' end,'product',v_id::text,jsonb_build_object('name',trim(p_name)));
  return v_id;
end;
$$;

create or replace function public.create_internal_supply_request(
  p_priority text,
  p_needed_by date,
  p_notes text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_actor uuid := (select auth.uid());
  v_item record;
  v_count integer;
begin
  if not (select private.can_access_internal_supplies()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_priority not in ('normal','important','urgent') then raise exception 'Prioridade inválida.'; end if;
  if p_needed_by is not null and p_needed_by < current_date then raise exception 'A data necessária não pode estar no passado.'; end if;
  v_count:=jsonb_array_length(coalesce(p_items,'[]'::jsonb));
  if v_count<1 or v_count>100 then raise exception 'Adicione de 1 a 100 produtos.'; end if;
  insert into public.internal_supply_requests(requested_by,requested_by_name,priority,needed_by,notes)
  select v_actor,full_name,p_priority,p_needed_by,nullif(trim(p_notes),'') from public.profiles where id=v_actor
  returning id into v_id;
  for v_item in
    select distinct product_id
    from jsonb_to_recordset(p_items) as x(product_id uuid)
  loop
    if not exists(select 1 from public.products where id=v_item.product_id and usage_scope='internal' and active) then raise exception 'Suprimento inválido ou inativo.'; end if;
    insert into public.internal_supply_request_items(request_id,product_id,requested_quantity)
    values(v_id,v_item.product_id,1);
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'internal_supply.request_created','internal_supply_request',v_id::text,jsonb_build_object('items',v_count,'priority',p_priority));
  return v_id;
end;
$$;

create or replace function public.update_own_internal_supply_request(
  p_request_id uuid,
  p_priority text,
  p_needed_by date,
  p_notes text,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_item record; v_count integer;
begin
  if not (select private.can_access_internal_supplies()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_priority not in ('normal','important','urgent') then raise exception 'Prioridade inválida.'; end if;
  if p_needed_by is not null and p_needed_by < current_date then raise exception 'A data necessária não pode estar no passado.'; end if;
  v_count:=jsonb_array_length(coalesce(p_items,'[]'::jsonb));
  if v_count<1 or v_count>100 then raise exception 'Adicione de 1 a 100 produtos.'; end if;
  update public.internal_supply_requests set priority=p_priority,needed_by=p_needed_by,notes=nullif(trim(p_notes),'')
  where id=p_request_id and requested_by=v_actor and status='pending';
  if not found then raise exception 'Somente uma solicitação própria e pendente pode ser editada.'; end if;
  delete from public.internal_supply_request_items where request_id=p_request_id;
  for v_item in
    select distinct product_id from jsonb_to_recordset(p_items) as x(product_id uuid)
  loop
    if not exists(select 1 from public.products where id=v_item.product_id and usage_scope='internal' and active) then raise exception 'Suprimento inválido ou inativo.'; end if;
    insert into public.internal_supply_request_items(request_id,product_id,requested_quantity) values(p_request_id,v_item.product_id,1);
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(v_actor,'internal_supply.request_updated','internal_supply_request',p_request_id::text);
end;
$$;

create or replace function public.cancel_own_internal_supply_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if not (select private.can_access_internal_supplies()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  update public.internal_supply_requests set status='cancelled',closed_at=now()
  where id=p_request_id and requested_by=v_actor and status='pending';
  if not found then raise exception 'Somente uma solicitação própria e pendente pode ser cancelada.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(v_actor,'internal_supply.request_cancelled_by_requester','internal_supply_request',p_request_id::text);
end;
$$;

create or replace function public.admin_prepare_internal_supply_request(
  p_request_id uuid,
  p_items jsonb,
  p_admin_notes text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_status text; v_item record; v_product record; v_kept integer:=0;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select status into v_status from public.internal_supply_requests where id=p_request_id for update;
  if v_status not in ('pending','separating') then raise exception 'Esta solicitação não pode ser separada.'; end if;
  if v_status='separating' then
    for v_item in select product_id,approved_quantity from public.internal_supply_request_items where request_id=p_request_id and not removed_by_admin and approved_quantity>0 loop
      update public.products set reserved_stock=greatest(0,reserved_stock-v_item.approved_quantity) where id=v_item.product_id;
    end loop;
  end if;
  update public.internal_supply_request_items set approved_quantity=0,removed_by_admin=true,admin_note=null where request_id=p_request_id;
  for v_item in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(product_id uuid,approved_quantity numeric,admin_note text) loop
    select p.id,p.physical_stock,p.reserved_stock,i.requested_quantity into v_product
    from public.products p join public.internal_supply_request_items i on i.product_id=p.id and i.request_id=p_request_id
    where p.id=v_item.product_id and p.usage_scope='internal' for update of p;
    if v_product.id is null then raise exception 'Produto inválido na separação.'; end if;
    if coalesce(v_item.approved_quantity,0)<0 or v_item.approved_quantity>v_product.requested_quantity then raise exception 'A quantidade aprovada deve estar entre zero e a solicitada.'; end if;
    if v_item.approved_quantity>v_product.physical_stock-v_product.reserved_stock then raise exception 'Estoque disponível insuficiente para um dos suprimentos.'; end if;
    update public.internal_supply_request_items set approved_quantity=v_item.approved_quantity,removed_by_admin=(v_item.approved_quantity=0),admin_note=nullif(trim(v_item.admin_note),'')
    where request_id=p_request_id and product_id=v_item.product_id;
    if v_item.approved_quantity>0 then
      update public.products set reserved_stock=reserved_stock+v_item.approved_quantity where id=v_item.product_id;
      v_kept:=v_kept+1;
    end if;
  end loop;
  if v_kept=0 then raise exception 'Mantenha ao menos um produto com quantidade aprovada.'; end if;
  update public.internal_supply_requests set status='separating',admin_notes=nullif(trim(p_admin_notes),''),separated_by=v_actor where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(v_actor,'internal_supply.request_prepared','internal_supply_request',p_request_id::text);
end;
$$;

create or replace function public.admin_schedule_internal_supply_request(p_request_id uuid,p_scheduled_for timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_scheduled_for is null or p_scheduled_for<now() then raise exception 'Informe uma data futura para a entrega.'; end if;
  update public.internal_supply_requests set status='scheduled',scheduled_for=p_scheduled_for where id=p_request_id and status='separating';
  if not found then raise exception 'Somente solicitações separadas podem ser agendadas.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(v_actor,'internal_supply.request_scheduled','internal_supply_request',p_request_id::text,jsonb_build_object('scheduled_for',p_scheduled_for));
end;
$$;

create or replace function public.admin_complete_internal_supply_request(p_request_id uuid,p_delivered_by text,p_received_by text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_item record; v_status text;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if nullif(trim(p_delivered_by),'') is null or nullif(trim(p_received_by),'') is null then raise exception 'Informe quem entregou e quem recebeu.'; end if;
  select status into v_status from public.internal_supply_requests where id=p_request_id for update;
  if v_status is distinct from 'scheduled' then raise exception 'Somente solicitações agendadas podem ser concluídas.'; end if;
  for v_item in select product_id,approved_quantity from public.internal_supply_request_items where request_id=p_request_id and not removed_by_admin and approved_quantity>0 loop
    update public.products set physical_stock=physical_stock-v_item.approved_quantity,reserved_stock=reserved_stock-v_item.approved_quantity
    where id=v_item.product_id and physical_stock>=v_item.approved_quantity and reserved_stock>=v_item.approved_quantity;
    if not found then raise exception 'O estoque mudou e não permite concluir esta entrega.'; end if;
    insert into public.stock_movements(product_id,internal_request_id,movement_type,quantity,reason,created_by)
    values(v_item.product_id,p_request_id,'delivery',v_item.approved_quantity,'Consumo de suprimento interno',v_actor);
  end loop;
  update public.internal_supply_requests set status='delivered',delivered_by_name=trim(p_delivered_by),received_by_name=trim(p_received_by),closed_at=now() where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(v_actor,'internal_supply.request_delivered','internal_supply_request',p_request_id::text);
end;
$$;

create or replace function public.admin_cancel_internal_supply_request(p_request_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_status text; v_item record;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select status into v_status from public.internal_supply_requests where id=p_request_id for update;
  if v_status is null or v_status in ('delivered','cancelled') then raise exception 'Esta solicitação não pode ser cancelada.'; end if;
  if v_status in ('separating','scheduled') then
    for v_item in select product_id,approved_quantity from public.internal_supply_request_items where request_id=p_request_id and not removed_by_admin and approved_quantity>0 loop
      update public.products set reserved_stock=greatest(0,reserved_stock-v_item.approved_quantity) where id=v_item.product_id;
    end loop;
  end if;
  update public.internal_supply_requests set status='cancelled',admin_notes=concat_ws(E'\n',admin_notes,nullif(trim(p_reason),'')),closed_at=now() where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(v_actor,'internal_supply.request_cancelled','internal_supply_request',p_request_id::text,jsonb_build_object('reason',nullif(trim(p_reason),'')));
end;
$$;

create or replace function public.confirm_internal_purchase_receipt(p_receipt jsonb,p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid()); v_id uuid; v_item record; v_product_id uuid; v_supplier uuid; v_request uuid;
  v_count integer; v_total numeric(14,2); v_image text; v_key text; v_unit text; v_request_status text;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  v_count:=jsonb_array_length(coalesce(p_items,'[]'::jsonb));
  if v_count<1 or v_count>200 then raise exception 'Adicione de 1 a 200 itens ao cupom.'; end if;
  v_total:=coalesce((p_receipt->>'total_value')::numeric,0);
  if v_total<0 then raise exception 'Valor total inválido.'; end if;
  if nullif(trim(p_receipt->>'merchant_name'),'') is null then raise exception 'Informe o estabelecimento.'; end if;
  v_supplier:=nullif(p_receipt->>'supplier_id','')::uuid;
  if v_supplier is not null and not exists(select 1 from public.suppliers where id=v_supplier and active) then raise exception 'Fornecedor inválido.'; end if;
  v_image:=nullif(trim(p_receipt->>'image_path'),'');
  if v_image is not null and split_part(v_image,'/',1)<>v_actor::text then raise exception 'Imagem do cupom inválida.'; end if;
  v_key:=nullif(regexp_replace(coalesce(p_receipt->>'fiscal_access_key',''),'\D','','g'),'');
  if v_key is not null and exists(select 1 from public.internal_purchase_receipts where fiscal_access_key=v_key and status='confirmed') then raise exception 'Este cupom fiscal já foi registrado.'; end if;
  v_request:=nullif(p_receipt->>'request_id','')::uuid;
  if v_request is not null then
    select status into v_request_status from public.internal_supply_requests where id=v_request for update;
    if v_request_status is null or v_request_status not in ('pending','separating') then raise exception 'Solicitação interna inválida ou já concluída.'; end if;
  end if;

  insert into public.internal_purchase_receipts(
    request_id,purchase_origin,supplier_id,merchant_name,merchant_document,fiscal_access_key,receipt_number,purchased_at,total_value,payment_method,image_path,
    ai_used,ai_model,ai_confidence,extraction,created_by,confirmed_by
  ) values (
    v_request,case when v_request is null then 'direct' else 'requested' end,v_supplier,trim(p_receipt->>'merchant_name'),nullif(trim(p_receipt->>'merchant_document'),''),v_key,nullif(trim(p_receipt->>'receipt_number'),''),
    coalesce(nullif(p_receipt->>'purchased_at','')::timestamptz,now()),v_total,nullif(trim(p_receipt->>'payment_method'),''),v_image,
    coalesce((p_receipt->>'ai_used')::boolean,false),nullif(trim(p_receipt->>'ai_model'),''),nullif(p_receipt->>'ai_confidence','')::numeric,
    coalesce(p_receipt->'extraction','{}'::jsonb),v_actor,v_actor
  ) returning id into v_id;

  for v_item in select * from jsonb_to_recordset(p_items) as x(product_id uuid,raw_description text,quantity numeric,unit text,unit_price numeric,total_price numeric,confidence numeric) loop
    v_product_id:=v_item.product_id;
    if v_product_id is null then
      if nullif(trim(v_item.raw_description),'') is null then raise exception 'Informe a descrição do novo produto.'; end if;
      v_unit:=case lower(coalesce(v_item.unit,'')) when 'kg' then 'quilo' when 'quilo' then 'quilo' when 'm' then 'metro' when 'metro' then 'metro' when 'rolo' then 'rolo' when 'garrafa' then 'garrafa' when 'caixa' then 'caixa' else 'unidade' end;
      insert into public.products(name,unit,description,physical_stock,minimum_stock,active,created_by,usage_scope,hidden_from_collaborators)
      values(trim(v_item.raw_description),v_unit,'Criado automaticamente a partir de cupom fiscal',0,0,true,v_actor,'internal',true)
      returning id into v_product_id;
    else
      perform 1 from public.products where id=v_product_id and usage_scope='internal' and active for update;
      if not found then raise exception 'Produto do cupom inválido ou inativo.'; end if;
    end if;
    if coalesce(v_item.quantity,0)<=0 or coalesce(v_item.unit_price,0)<0 or coalesce(v_item.total_price,0)<0 then raise exception 'Quantidade ou valor inválido no cupom.'; end if;
    insert into public.internal_purchase_receipt_items(receipt_id,product_id,raw_description,quantity,unit,unit_price,total_price,confidence)
    values(v_id,v_product_id,coalesce(nullif(trim(v_item.raw_description),''),'Item do cupom'),v_item.quantity,nullif(trim(v_item.unit),''),coalesce(v_item.unit_price,0),coalesce(v_item.total_price,0),v_item.confidence);
    update public.products set physical_stock=physical_stock+v_item.quantity,unit_cost=case when v_item.unit_price>0 then v_item.unit_price else unit_cost end where id=v_product_id;
    insert into public.stock_movements(product_id,internal_receipt_id,movement_type,quantity,reason,created_by)
    values(v_product_id,v_id,'entry',v_item.quantity,'Entrada por cupom fiscal de suprimentos',v_actor);
    if v_supplier is not null then
      insert into public.supplier_products(supplier_id,product_id,last_unit_cost,last_purchased_at)
      values(v_supplier,v_product_id,coalesce(v_item.unit_price,0),now())
      on conflict(supplier_id,product_id) do update set last_unit_cost=excluded.last_unit_cost,last_purchased_at=excluded.last_purchased_at,updated_at=now();
    end if;
  end loop;
  if v_request is not null then
    update public.internal_supply_requests r
    set status=case when not exists(
      select 1 from public.internal_supply_request_items wanted
      where wanted.request_id=v_request and not exists(
        select 1 from public.internal_purchase_receipts pr
        join public.internal_purchase_receipt_items bought on bought.receipt_id=pr.id
        where pr.request_id=v_request and pr.status='confirmed' and bought.product_id=wanted.product_id
      )
    ) then 'delivered' else 'separating' end,
    closed_at=case when not exists(
      select 1 from public.internal_supply_request_items wanted
      where wanted.request_id=v_request and not exists(
        select 1 from public.internal_purchase_receipts pr
        join public.internal_purchase_receipt_items bought on bought.receipt_id=pr.id
        where pr.request_id=v_request and pr.status='confirmed' and bought.product_id=wanted.product_id
      )
    ) then now() else null end
    where r.id=v_request;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'internal_supply.purchase_confirmed','internal_purchase_receipt',v_id::text,jsonb_build_object('items',v_count,'total',v_total,'ai_used',coalesce((p_receipt->>'ai_used')::boolean,false)));
  return v_id;
end;
$$;

create or replace function public.admin_reverse_internal_purchase_receipt(p_receipt_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_item record; v_request uuid;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Informe o motivo do cancelamento.'; end if;
  select request_id into v_request from public.internal_purchase_receipts where id=p_receipt_id and status='confirmed' for update;
  if not found then raise exception 'Compra não localizada ou já cancelada.'; end if;
  for v_item in select product_id,quantity from public.internal_purchase_receipt_items where receipt_id=p_receipt_id loop
    update public.products set physical_stock=physical_stock-v_item.quantity
    where id=v_item.product_id and physical_stock-v_item.quantity>=reserved_stock;
    if not found then raise exception 'Não é possível cancelar: parte deste estoque já foi consumida ou reservada.'; end if;
    insert into public.stock_movements(product_id,internal_receipt_id,movement_type,quantity,reason,created_by)
    values(v_item.product_id,p_receipt_id,'adjustment',v_item.quantity,'Estorno de cupom: '||trim(p_reason),v_actor);
  end loop;
  update public.internal_purchase_receipts set status='cancelled' where id=p_receipt_id;
  if v_request is not null then
    update public.internal_supply_requests r set
      status=case when exists(select 1 from public.internal_purchase_receipts where request_id=v_request and status='confirmed') then 'separating' else 'pending' end,
      closed_at=null
    where r.id=v_request and r.status<>'cancelled';
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(v_actor,'internal_supply.purchase_reversed','internal_purchase_receipt',p_receipt_id::text,jsonb_build_object('reason',trim(p_reason)));
end;
$$;

revoke all on function public.admin_save_internal_supply_product(uuid,text,text,text,numeric,numeric,uuid,boolean) from public,anon;
revoke all on function public.create_internal_supply_request(text,date,text,jsonb) from public,anon;
revoke all on function public.update_own_internal_supply_request(uuid,text,date,text,jsonb) from public,anon;
revoke all on function public.cancel_own_internal_supply_request(uuid) from public,anon;
revoke all on function public.admin_prepare_internal_supply_request(uuid,jsonb,text) from public,anon;
revoke all on function public.admin_schedule_internal_supply_request(uuid,timestamptz) from public,anon;
revoke all on function public.admin_complete_internal_supply_request(uuid,text,text) from public,anon;
revoke all on function public.admin_cancel_internal_supply_request(uuid,text) from public,anon;
revoke all on function public.confirm_internal_purchase_receipt(jsonb,jsonb) from public,anon;
revoke all on function public.admin_reverse_internal_purchase_receipt(uuid,text) from public,anon;

grant execute on function public.admin_save_internal_supply_product(uuid,text,text,text,numeric,numeric,uuid,boolean) to authenticated;
grant execute on function public.create_internal_supply_request(text,date,text,jsonb) to authenticated;
grant execute on function public.update_own_internal_supply_request(uuid,text,date,text,jsonb) to authenticated;
grant execute on function public.cancel_own_internal_supply_request(uuid) to authenticated;
grant execute on function public.admin_prepare_internal_supply_request(uuid,jsonb,text) to authenticated;
grant execute on function public.admin_schedule_internal_supply_request(uuid,timestamptz) to authenticated;
grant execute on function public.admin_complete_internal_supply_request(uuid,text,text) to authenticated;
grant execute on function public.admin_cancel_internal_supply_request(uuid,text) to authenticated;
grant execute on function public.confirm_internal_purchase_receipt(jsonb,jsonb) to authenticated;
grant execute on function public.admin_reverse_internal_purchase_receipt(uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('internal-receipts','internal-receipts',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "internal receipts: operations read" on storage.objects;
drop policy if exists "internal receipts: own upload" on storage.objects;
drop policy if exists "internal receipts: own or admin update" on storage.objects;
drop policy if exists "internal receipts: own or admin delete" on storage.objects;

create policy "internal receipts: operations read" on storage.objects for select to authenticated
using(bucket_id='internal-receipts' and (select private.can_access_internal_supplies()));
create policy "internal receipts: own upload" on storage.objects for insert to authenticated
with check(bucket_id='internal-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text and (select private.can_access_internal_supplies()));
create policy "internal receipts: own or admin update" on storage.objects for update to authenticated
using(bucket_id='internal-receipts' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select private.is_admin())))
with check(bucket_id='internal-receipts' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select private.is_admin())));
create policy "internal receipts: own or admin delete" on storage.objects for delete to authenticated
using(bucket_id='internal-receipts' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select private.is_admin())));

notify pgrst, 'reload schema';
commit;
