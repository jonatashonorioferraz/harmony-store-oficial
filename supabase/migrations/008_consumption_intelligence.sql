-- Harmony Store Oficial — Inteligência de consumo, fornecedores e compras
-- Atualização aditiva. Execute depois da migration 007.

alter table public.products
  add column if not exists safety_stock numeric(14,3) not null default 0,
  add column if not exists lead_time_days integer not null default 30,
  add column if not exists unit_cost numeric(14,4) not null default 0;

do $$ begin
  alter table public.products add constraint products_safety_stock_nonnegative check (safety_stock >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_lead_time_positive check (lead_time_days between 1 and 365);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_unit_cost_nonnegative check (unit_cost >= 0);
exception when duplicate_object then null; end $$;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  contact_name text,
  phone text,
  email text,
  website text,
  lead_time_days integer not null default 30 check (lead_time_days between 1 and 365),
  minimum_order_value numeric(14,2) not null default 0 check (minimum_order_value >= 0),
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_name_lower_unique on public.suppliers(lower(name));

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_sku text,
  last_unit_cost numeric(14,4) not null default 0 check (last_unit_cost >= 0),
  minimum_order_quantity numeric(14,3) not null default 0 check (minimum_order_quantity >= 0),
  lead_time_days integer check (lead_time_days between 1 and 365),
  is_preferred boolean not null default false,
  last_purchased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, product_id)
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','ordered','received','cancelled')),
  ordered_at timestamptz,
  expected_at timestamptz,
  received_at timestamptz,
  total_value numeric(14,2) not null default 0 check (total_value >= 0),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (protocol)
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  unique (purchase_order_id, product_id)
);

create index if not exists supplier_products_supplier_idx on public.supplier_products(supplier_id);
create index if not exists supplier_products_product_idx on public.supplier_products(product_id);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create index if not exists purchase_orders_status_idx on public.purchase_orders(status);
create index if not exists purchase_order_items_order_idx on public.purchase_order_items(purchase_order_id);

drop trigger if exists touch_updated_at on public.suppliers;
create trigger touch_updated_at before update on public.suppliers
for each row execute function public.touch_updated_at();
drop trigger if exists touch_updated_at on public.supplier_products;
create trigger touch_updated_at before update on public.supplier_products
for each row execute function public.touch_updated_at();
drop trigger if exists touch_updated_at on public.purchase_orders;
create trigger touch_updated_at before update on public.purchase_orders
for each row execute function public.touch_updated_at();

alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists "supplier: admin all" on public.suppliers;
drop policy if exists "supplier product: admin all" on public.supplier_products;
drop policy if exists "purchase order: admin all" on public.purchase_orders;
drop policy if exists "purchase item: admin all" on public.purchase_order_items;

create policy "supplier: admin all" on public.suppliers for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "supplier product: admin all" on public.supplier_products for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "purchase order: admin all" on public.purchase_orders for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "purchase item: admin all" on public.purchase_order_items for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update, delete on public.supplier_products to authenticated;
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_items to authenticated;

create or replace function public.admin_create_purchase_order(
  p_supplier_id uuid,
  p_expected_at timestamptz,
  p_notes text,
  p_items jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order_id uuid; v_item record; v_total numeric(14,2):=0;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id and active) then
    raise exception 'Fornecedor inválido ou inativo.';
  end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'Adicione ao menos um item ao pedido.';
  end if;
  insert into public.purchase_orders(supplier_id,expected_at,notes,created_by)
  values(p_supplier_id,p_expected_at,nullif(trim(p_notes),''),(select auth.uid())) returning id into v_order_id;
  for v_item in select * from jsonb_to_recordset(p_items) as x(product_id uuid,quantity numeric,unit_cost numeric) loop
    if coalesce(v_item.quantity,0)<=0 or coalesce(v_item.unit_cost,0)<0 then raise exception 'Quantidade ou custo inválido.'; end if;
    if not exists(select 1 from public.products where id=v_item.product_id and active) then raise exception 'Matéria-prima inválida ou inativa.'; end if;
    insert into public.purchase_order_items(purchase_order_id,product_id,quantity,unit_cost)
    values(v_order_id,v_item.product_id,v_item.quantity,v_item.unit_cost);
    v_total:=v_total+(v_item.quantity*v_item.unit_cost);
  end loop;
  update public.purchase_orders set total_value=v_total where id=v_order_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'purchase_order.created','purchase_order',v_order_id::text,jsonb_build_object('total',v_total));
  return v_order_id;
end;
$$;

create or replace function public.admin_mark_purchase_order_ordered(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  if not exists(select 1 from public.purchase_order_items where purchase_order_id=p_order_id) then
    raise exception 'Adicione ao menos um item ao pedido.';
  end if;
  update public.purchase_orders
     set status='ordered', ordered_at=coalesce(ordered_at,now())
   where id=p_order_id and status='draft';
  if not found then raise exception 'Somente pedidos em rascunho podem ser enviados.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values((select auth.uid()),'purchase_order.ordered','purchase_order',p_order_id::text);
end;
$$;

create or replace function public.admin_receive_purchase_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item record; v_supplier uuid; v_total numeric(14,2):=0;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  select supplier_id into v_supplier from public.purchase_orders
   where id=p_order_id and status='ordered' for update;
  if v_supplier is null then raise exception 'Somente pedidos enviados podem ser recebidos.'; end if;

  for v_item in select * from public.purchase_order_items where purchase_order_id=p_order_id loop
    update public.products
       set physical_stock=physical_stock+v_item.quantity,
           unit_cost=case when v_item.unit_cost>0 then v_item.unit_cost else unit_cost end
     where id=v_item.product_id;
    insert into public.stock_movements(product_id,movement_type,quantity,reason,created_by)
    values(v_item.product_id,'entry',v_item.quantity,'Recebimento de pedido de compra',(select auth.uid()));
    insert into public.supplier_products(supplier_id,product_id,last_unit_cost,last_purchased_at)
    values(v_supplier,v_item.product_id,v_item.unit_cost,now())
    on conflict(supplier_id,product_id) do update
      set last_unit_cost=excluded.last_unit_cost,last_purchased_at=excluded.last_purchased_at;
    v_total:=v_total+(v_item.quantity*v_item.unit_cost);
  end loop;

  update public.purchase_orders set status='received',received_at=now(),total_value=v_total where id=p_order_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'purchase_order.received','purchase_order',p_order_id::text,jsonb_build_object('total',v_total));
end;
$$;

create or replace function public.admin_cancel_purchase_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  update public.purchase_orders set status='cancelled' where id=p_order_id and status in ('draft','ordered');
  if not found then raise exception 'Este pedido não pode mais ser cancelado.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values((select auth.uid()),'purchase_order.cancelled','purchase_order',p_order_id::text);
end;
$$;

grant execute on function public.admin_create_purchase_order(uuid,timestamptz,text,jsonb) to authenticated;
grant execute on function public.admin_mark_purchase_order_ordered(uuid) to authenticated;
grant execute on function public.admin_receive_purchase_order(uuid) to authenticated;
grant execute on function public.admin_cancel_purchase_order(uuid) to authenticated;

notify pgrst, 'reload schema';
