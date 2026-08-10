-- Harmony Store Oficial — estoque personalizado por colaboradora.
-- Mantém o estoque compartilhado existente e adiciona saldos isolados apenas
-- para produtos explicitamente configurados como personalizados.

begin;

alter table public.products
  add column if not exists stock_control_mode text not null default 'shared';

alter table public.products
  drop constraint if exists products_stock_control_mode_check;
alter table public.products
  add constraint products_stock_control_mode_check
  check (stock_control_mode in ('shared','collaborator'));

comment on column public.products.stock_control_mode is
  'shared usa o saldo do produto; collaborator usa um saldo isolado para cada colaboradora.';

create table if not exists public.product_collaborator_stocks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  collaborator_id uuid not null references public.profiles(id) on delete restrict,
  physical_stock numeric(14,3) not null default 0 check (physical_stock >= 0),
  reserved_stock numeric(14,3) not null default 0 check (reserved_stock >= 0 and reserved_stock <= physical_stock),
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, collaborator_id)
);

create index if not exists product_collaborator_stocks_collaborator_idx
  on public.product_collaborator_stocks(collaborator_id, product_id);
create index if not exists product_collaborator_stocks_product_idx
  on public.product_collaborator_stocks(product_id, collaborator_id);

alter table public.request_items
  add column if not exists stock_owner_id uuid references public.profiles(id) on delete restrict;
alter table public.stock_movements
  add column if not exists stock_owner_id uuid references public.profiles(id) on delete restrict;
alter table public.stock_discrepancies
  add column if not exists stock_owner_id uuid references public.profiles(id) on delete restrict;
alter table public.stock_replenishment_requests
  add column if not exists stock_owner_id uuid references public.profiles(id) on delete restrict;

create index if not exists request_items_stock_owner_idx
  on public.request_items(stock_owner_id, product_id);
create index if not exists stock_movements_stock_owner_idx
  on public.stock_movements(stock_owner_id, product_id, created_at desc);
create index if not exists stock_discrepancies_stock_owner_idx
  on public.stock_discrepancies(stock_owner_id, product_id, recorded_at desc);

drop index if exists public.stock_replenishment_one_open_per_product_idx;
create unique index if not exists stock_replenishment_one_open_shared_product_idx
  on public.stock_replenishment_requests(product_id)
  where stock_owner_id is null and status in ('open','in_progress');
create unique index if not exists stock_replenishment_one_open_owner_product_idx
  on public.stock_replenishment_requests(product_id,stock_owner_id)
  where stock_owner_id is not null and status in ('open','in_progress');

alter table public.product_collaborator_stocks enable row level security;

drop policy if exists "personalized stock: own or admin read" on public.product_collaborator_stocks;
create policy "personalized stock: own or admin read"
  on public.product_collaborator_stocks for select to authenticated
  using (collaborator_id=(select auth.uid()) or (select private.is_admin()));

revoke all on table public.product_collaborator_stocks from public,anon,authenticated;
grant select on table public.product_collaborator_stocks to authenticated;
grant all privileges on table public.product_collaborator_stocks to service_role;

create or replace function private.validate_product_stock_control()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stock_control_mode='collaborator'
     and (new.physical_stock<>0 or new.reserved_stock<>0) then
    raise exception 'Produtos com estoque individual devem manter o saldo compartilhado zerado.';
  end if;
  if tg_op='UPDATE'
     and old.stock_control_mode='collaborator'
     and new.stock_control_mode='shared'
     and exists(
       select 1 from public.product_collaborator_stocks s
       where s.product_id=new.id and (s.physical_stock<>0 or s.reserved_stock<>0)
     ) then
    raise exception 'Zere todos os saldos individuais antes de voltar ao estoque compartilhado.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_product_stock_control on public.products;
create trigger validate_product_stock_control
before insert or update of stock_control_mode,physical_stock,reserved_stock on public.products
for each row execute function private.validate_product_stock_control();

create or replace function private.sync_individual_stock_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role='collaborator' then
    insert into public.product_collaborator_stocks(product_id,collaborator_id,minimum_stock)
    select p.id,new.id,p.minimum_stock
    from public.products p
    where p.stock_control_mode='collaborator'
    on conflict(product_id,collaborator_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_individual_stock_for_profile on public.profiles;
create trigger sync_individual_stock_for_profile
after insert or update of role,status on public.profiles
for each row execute function private.sync_individual_stock_for_profile();

create or replace function private.assign_request_item_stock_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_owner uuid;
  v_minimum numeric(14,3);
begin
  select p.stock_control_mode,p.minimum_stock,r.requested_by
  into v_mode,v_minimum,v_owner
  from public.products p
  join public.requests r on r.id=new.request_id
  where p.id=new.product_id;

  if v_mode is null then
    raise exception 'Produto ou solicitação não localizado.';
  end if;

  if v_mode='collaborator' then
    new.stock_owner_id:=v_owner;
    insert into public.product_collaborator_stocks(product_id,collaborator_id,minimum_stock)
    values(new.product_id,v_owner,v_minimum)
    on conflict(product_id,collaborator_id) do nothing;
  else
    new.stock_owner_id:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_request_item_stock_owner on public.request_items;
create trigger assign_request_item_stock_owner
before insert or update of request_id,product_id,stock_owner_id on public.request_items
for each row execute function private.assign_request_item_stock_owner();

create or replace function private.adjust_material_reservation(
  p_product_id uuid,
  p_stock_owner_id uuid,
  p_delta numeric,
  p_request_id uuid,
  p_reason text,
  p_actor uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_stock public.product_collaborator_stocks%rowtype;
  v_next numeric(14,3);
begin
  if coalesce(p_delta,0)=0 then return; end if;
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'Produto não localizado.'; end if;

  if v_product.stock_control_mode='collaborator' then
    if p_stock_owner_id is null then raise exception 'A colaboradora responsável pelo estoque não foi identificada.'; end if;
    insert into public.product_collaborator_stocks(product_id,collaborator_id,minimum_stock)
    values(v_product.id,p_stock_owner_id,v_product.minimum_stock)
    on conflict(product_id,collaborator_id) do nothing;
    select * into v_stock from public.product_collaborator_stocks
    where product_id=v_product.id and collaborator_id=p_stock_owner_id for update;
    v_next:=v_stock.reserved_stock+p_delta;
    if v_next<0 or v_next>v_stock.physical_stock then
      raise exception 'Estoque individual insuficiente para %.',v_product.name;
    end if;
    update public.product_collaborator_stocks
    set reserved_stock=v_next,updated_at=now()
    where id=v_stock.id;
  else
    v_next:=v_product.reserved_stock+p_delta;
    if v_next<0 or v_next>v_product.physical_stock then
      raise exception 'Estoque disponível insuficiente para %.',v_product.name;
    end if;
    update public.products set reserved_stock=v_next where id=v_product.id;
    p_stock_owner_id:=null;
  end if;

  insert into public.stock_movements(product_id,stock_owner_id,request_id,movement_type,quantity,reason,created_by)
  values(v_product.id,p_stock_owner_id,p_request_id,case when p_delta>0 then 'reserve' else 'release' end,
    abs(p_delta),p_reason,p_actor);
end;
$$;

create or replace function private.adjust_delivered_material_stock(
  p_product_id uuid,
  p_stock_owner_id uuid,
  p_delta numeric,
  p_request_id uuid,
  p_reason text,
  p_actor uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_stock public.product_collaborator_stocks%rowtype;
begin
  if coalesce(p_delta,0)=0 then return; end if;
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'Produto não localizado.'; end if;

  if v_product.stock_control_mode='collaborator' then
    if p_stock_owner_id is null then raise exception 'A colaboradora responsável pelo estoque não foi identificada.'; end if;
    select * into v_stock from public.product_collaborator_stocks
    where product_id=v_product.id and collaborator_id=p_stock_owner_id for update;
    if not found then raise exception 'Estoque individual não localizado para %.',v_product.name; end if;
    if p_delta>0 and v_stock.physical_stock<p_delta then
      raise exception 'Estoque individual insuficiente para acrescentar %.',v_product.name;
    end if;
    update public.product_collaborator_stocks
    set physical_stock=physical_stock-p_delta,updated_at=now()
    where id=v_stock.id;
  else
    if p_delta>0 and v_product.physical_stock<p_delta then
      raise exception 'Estoque físico insuficiente para acrescentar %.',v_product.name;
    end if;
    update public.products set physical_stock=physical_stock-p_delta where id=v_product.id;
    p_stock_owner_id:=null;
  end if;

  insert into public.stock_movements(product_id,stock_owner_id,request_id,movement_type,quantity,reason,created_by)
  values(v_product.id,p_stock_owner_id,p_request_id,'adjustment',abs(p_delta),p_reason,p_actor);
end;
$$;

create or replace function private.complete_material_delivery_stock(
  p_product_id uuid,
  p_stock_owner_id uuid,
  p_quantity numeric,
  p_request_id uuid,
  p_actor uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_stock public.product_collaborator_stocks%rowtype;
  v_other_reserved numeric(14,3);
  v_available numeric(14,3);
begin
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'Produto não localizado.'; end if;

  select coalesce(sum(i.approved_quantity),0)::numeric(14,3)
  into v_other_reserved
  from public.request_items i
  join public.requests r on r.id=i.request_id
  where i.product_id=p_product_id
    and i.request_id<>p_request_id
    and r.status in ('separating','scheduled')
    and not i.removed_by_admin
    and coalesce(i.approved_quantity,0)>0
    and i.stock_owner_id is not distinct from case when v_product.stock_control_mode='collaborator' then p_stock_owner_id else null end;

  if v_product.stock_control_mode='collaborator' then
    if p_stock_owner_id is null then raise exception 'A colaboradora responsável pelo estoque não foi identificada.'; end if;
    select * into v_stock from public.product_collaborator_stocks
    where product_id=v_product.id and collaborator_id=p_stock_owner_id for update;
    if not found then raise exception 'Estoque individual não localizado para %.',v_product.name; end if;
    v_available:=greatest(0,v_stock.physical_stock-v_other_reserved);
    if v_stock.physical_stock-p_quantity<v_other_reserved then
      raise exception 'Estoque individual insuficiente para %. Disponível para esta entrega: %, necessário: %.',
        v_product.name,v_available,p_quantity;
    end if;
    update public.product_collaborator_stocks
    set physical_stock=physical_stock-p_quantity,reserved_stock=v_other_reserved,updated_at=now()
    where id=v_stock.id;
  else
    v_available:=greatest(0,v_product.physical_stock-v_other_reserved);
    if v_product.physical_stock-p_quantity<v_other_reserved then
      raise exception 'Estoque físico insuficiente para %. Disponível para esta entrega: %, necessário: %.',
        v_product.name,v_available,p_quantity;
    end if;
    update public.products
    set physical_stock=physical_stock-p_quantity,reserved_stock=v_other_reserved
    where id=v_product.id;
    p_stock_owner_id:=null;
  end if;

  insert into public.stock_movements(product_id,stock_owner_id,request_id,movement_type,quantity,reason,created_by)
  values(p_product_id,p_stock_owner_id,p_request_id,'delivery',p_quantity,
    'Entrega concluída com reconciliação de reservas',p_actor);
end;
$$;

revoke all on function private.adjust_material_reservation(uuid,uuid,numeric,uuid,text,uuid) from public,anon,authenticated;
revoke all on function private.adjust_delivered_material_stock(uuid,uuid,numeric,uuid,text,uuid) from public,anon,authenticated;
revoke all on function private.complete_material_delivery_stock(uuid,uuid,numeric,uuid,uuid) from public,anon,authenticated;

create or replace function public.list_my_product_stock()
returns table(
  product_id uuid,
  physical_stock numeric,
  reserved_stock numeric,
  minimum_stock numeric,
  available_stock numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
    coalesce(s.physical_stock,0),
    coalesce(s.reserved_stock,0),
    coalesce(s.minimum_stock,p.minimum_stock),
    coalesce(s.physical_stock-s.reserved_stock,0)
  from public.products p
  left join public.product_collaborator_stocks s
    on s.product_id=p.id and s.collaborator_id=(select auth.uid())
  where p.stock_control_mode='collaborator'
    and (select auth.uid()) is not null;
$$;

create or replace function public.admin_list_product_collaborator_stock(p_product_id uuid)
returns table(
  collaborator_id uuid,
  full_name text,
  profile_role text,
  profile_status text,
  physical_stock numeric,
  reserved_stock numeric,
  minimum_stock numeric,
  available_stock numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,p.full_name,p.role,p.status,
    coalesce(s.physical_stock,0),coalesce(s.reserved_stock,0),
    coalesce(s.minimum_stock,product.minimum_stock),
    coalesce(s.physical_stock-s.reserved_stock,0)
  from public.profiles p
  join public.products product on product.id=p_product_id and product.stock_control_mode='collaborator'
  left join public.product_collaborator_stocks s
    on s.product_id=product.id and s.collaborator_id=p.id
  where (select private.is_admin())
    and (p.role='collaborator' or s.id is not null)
  order by case when p.status='active' then 0 else 1 end,p.full_name,p.id;
$$;

create or replace function public.admin_list_product_collaborator_stock_summary()
returns table(
  product_id uuid,
  physical_stock numeric,
  reserved_stock numeric,
  available_stock numeric,
  collaborator_count bigint,
  without_stock_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with owners as (
    select product.id as product_id,profile.id as collaborator_id,
      coalesce(stock.physical_stock,0) as physical_stock,
      coalesce(stock.reserved_stock,0) as reserved_stock,
      coalesce(stock.minimum_stock,product.minimum_stock) as minimum_stock
    from public.products product
    cross join public.profiles profile
    left join public.product_collaborator_stocks stock
      on stock.product_id=product.id and stock.collaborator_id=profile.id
    where product.stock_control_mode='collaborator'
      and profile.role='collaborator' and profile.status='active'
      and (select private.is_admin())
  )
  select product_id,sum(physical_stock),sum(reserved_stock),sum(physical_stock-reserved_stock),count(*),
    count(*) filter(where physical_stock-reserved_stock<=minimum_stock)
  from owners group by product_id;
$$;

create or replace function public.admin_list_all_product_collaborator_stock()
returns table(
  product_id uuid,
  collaborator_id uuid,
  full_name text,
  profile_role text,
  profile_status text,
  physical_stock numeric,
  reserved_stock numeric,
  minimum_stock numeric,
  available_stock numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select product.id,profile.id,profile.full_name,profile.role,profile.status,
    coalesce(stock.physical_stock,0),coalesce(stock.reserved_stock,0),
    coalesce(stock.minimum_stock,product.minimum_stock),
    coalesce(stock.physical_stock-stock.reserved_stock,0)
  from public.products product
  cross join public.profiles profile
  left join public.product_collaborator_stocks stock
    on stock.product_id=product.id and stock.collaborator_id=profile.id
  where (select private.is_admin())
    and product.stock_control_mode='collaborator'
    and (profile.role='collaborator' or stock.id is not null)
  order by product.name,case when profile.status='active' then 0 else 1 end,profile.full_name,profile.id;
$$;

create or replace function public.admin_set_product_stock_control_mode(p_product_id uuid,p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_product public.products%rowtype;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_mode not in ('shared','collaborator') then raise exception 'Tipo de controle de estoque inválido.'; end if;
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'Produto não localizado.'; end if;
  if v_product.stock_control_mode=p_mode then return; end if;

  if p_mode='collaborator' then
    if v_product.physical_stock<>0 or v_product.reserved_stock<>0 then
      raise exception 'Zere o estoque físico e reservado compartilhado antes de ativar o estoque individual.';
    end if;
    update public.products set stock_control_mode='collaborator' where id=p_product_id;
    insert into public.product_collaborator_stocks(product_id,collaborator_id,minimum_stock)
    select p_product_id,p.id,v_product.minimum_stock
    from public.profiles p where p.role='collaborator'
    on conflict(product_id,collaborator_id) do nothing;
    update public.request_items item
    set stock_owner_id=request.requested_by
    from public.requests request
    where item.request_id=request.id and item.product_id=p_product_id;
  else
    if exists(select 1 from public.product_collaborator_stocks where product_id=p_product_id and (physical_stock<>0 or reserved_stock<>0)) then
      raise exception 'Zere todos os saldos individuais antes de voltar ao estoque compartilhado.';
    end if;
    if exists(select 1 from public.request_items where product_id=p_product_id and stock_owner_id is not null) then
      raise exception 'Este produto já possui histórico individual e não pode voltar ao modo compartilhado.';
    end if;
    delete from public.product_collaborator_stocks where product_id=p_product_id;
    update public.products set stock_control_mode='shared' where id=p_product_id;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'product.stock_control_mode_changed','product',p_product_id::text,'database',
    jsonb_build_object('before',v_product.stock_control_mode,'after',p_mode));
end;
$$;

create or replace function public.admin_save_product_collaborator_stocks(
  p_product_id uuid,
  p_balances jsonb,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_product public.products%rowtype;
  v_item record;
  v_stock public.product_collaborator_stocks%rowtype;
  v_before jsonb:='[]'::jsonb;
  v_after jsonb:='[]'::jsonb;
  v_delta numeric(14,3);
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Informe o motivo da entrada ou do ajuste.'; end if;
  if jsonb_typeof(coalesce(p_balances,'[]'::jsonb))<>'array' then raise exception 'Lista de saldos inválida.'; end if;
  if exists(
    select 1 from jsonb_to_recordset(coalesce(p_balances,'[]'::jsonb)) as x(collaborator_id uuid,physical_stock numeric,minimum_stock numeric)
    group by collaborator_id having count(*)>1
  ) then raise exception 'A mesma colaboradora apareceu mais de uma vez.'; end if;

  select * into v_product from public.products where id=p_product_id for update;
  if not found or v_product.stock_control_mode<>'collaborator' then
    raise exception 'Este produto não utiliza estoque individual por colaboradora.';
  end if;

  for v_item in
    select * from jsonb_to_recordset(coalesce(p_balances,'[]'::jsonb))
      as x(collaborator_id uuid,physical_stock numeric,minimum_stock numeric)
    order by collaborator_id
  loop
    if coalesce(v_item.physical_stock,-1)<0 or coalesce(v_item.minimum_stock,-1)<0 then
      raise exception 'Os saldos não podem ser negativos.';
    end if;
    if not exists(select 1 from public.profiles where id=v_item.collaborator_id and role='collaborator') then
      raise exception 'Colaboradora inválida para o estoque individual.';
    end if;
    insert into public.product_collaborator_stocks(product_id,collaborator_id,minimum_stock)
    values(v_product.id,v_item.collaborator_id,v_product.minimum_stock)
    on conflict(product_id,collaborator_id) do nothing;
    select * into v_stock from public.product_collaborator_stocks
    where product_id=v_product.id and collaborator_id=v_item.collaborator_id for update;
    if v_item.physical_stock<v_stock.reserved_stock then
      raise exception 'O estoque físico de uma colaboradora não pode ficar abaixo do reservado.';
    end if;
    v_before:=v_before||jsonb_build_array(jsonb_build_object(
      'collaborator_id',v_item.collaborator_id,'physical_stock',v_stock.physical_stock,
      'reserved_stock',v_stock.reserved_stock,'minimum_stock',v_stock.minimum_stock));
    v_delta:=v_item.physical_stock-v_stock.physical_stock;
    update public.product_collaborator_stocks
    set physical_stock=v_item.physical_stock,minimum_stock=v_item.minimum_stock,updated_at=now()
    where id=v_stock.id;
    if v_delta<>0 then
      insert into public.stock_movements(product_id,stock_owner_id,movement_type,quantity,reason,created_by)
      values(v_product.id,v_item.collaborator_id,'adjustment',abs(v_delta),
        case when v_delta>0 then 'Entrada no estoque individual: ' else 'Ajuste de saída no estoque individual: ' end||trim(p_reason),v_actor);
    end if;
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'collaborator_id',v_item.collaborator_id,'physical_stock',v_item.physical_stock,
      'reserved_stock',v_stock.reserved_stock,'minimum_stock',v_item.minimum_stock));
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'product.collaborator_stock_updated','product',p_product_id::text,'database',
    jsonb_build_object('reason',trim(p_reason),'before',v_before,'after',v_after));
end;
$$;

create or replace function public.admin_prepare_request(
  p_request_id uuid,
  p_items jsonb,
  p_admin_notes text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_status text;
  v_item record;
  v_old numeric(14,3);
  v_old_reserved numeric(14,3);
  v_new numeric(14,3);
  v_delta numeric(14,3);
  v_owner uuid;
  v_product_id uuid;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  select status into v_status from public.requests where id=p_request_id for update;
  if v_status is null then raise exception 'Solicitação não localizada.'; end if;
  if v_status in ('delivered','cancelled') then raise exception 'Solicitação já encerrada.'; end if;

  for v_item in
    select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb))
      as x(item_id uuid,approved_quantity numeric,removed boolean,admin_note text)
  loop
    select i.product_id,i.stock_owner_id,coalesce(i.approved_quantity,0),
      case when v_status in ('separating','scheduled') and not i.removed_by_admin then coalesce(i.approved_quantity,0) else 0 end
    into v_product_id,v_owner,v_old,v_old_reserved
    from public.request_items i where i.id=v_item.item_id and i.request_id=p_request_id for update;
    if not found then raise exception 'Item inválido.'; end if;
    v_new:=case when coalesce(v_item.removed,false) then 0 else greatest(coalesce(v_item.approved_quantity,0),0) end;
    if v_new>(select requested_quantity from public.request_items where id=v_item.item_id) then
      raise exception 'A quantidade aprovada não pode superar a solicitada.';
    end if;
    v_delta:=v_new-v_old_reserved;
    perform private.adjust_material_reservation(v_product_id,v_owner,v_delta,p_request_id,'Separação da solicitação',v_actor);
    update public.request_items
    set approved_quantity=v_new,removed_by_admin=coalesce(v_item.removed,false),admin_note=nullif(trim(v_item.admin_note),'')
    where id=v_item.item_id;
  end loop;

  update public.requests
  set status='separating',separated_by=v_actor,admin_notes=nullif(trim(p_admin_notes),'')
  where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'request.prepared','request',p_request_id::text,jsonb_build_object('items',p_items));
end;
$$;

create or replace function public.admin_complete_request(
  p_request_id uuid,
  p_delivered_by_name text,
  p_received_by_name text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_item record;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if nullif(trim(p_delivered_by_name),'') is null or nullif(trim(p_received_by_name),'') is null then
    raise exception 'Informe quem entregou e quem recebeu.';
  end if;
  perform 1 from public.requests where id=p_request_id and status='scheduled' for update;
  if not found then raise exception 'A solicitação precisa estar agendada.'; end if;

  for v_item in
    select i.product_id,i.stock_owner_id,sum(i.approved_quantity)::numeric(14,3) as approved_quantity
    from public.request_items i
    where i.request_id=p_request_id and not i.removed_by_admin and coalesce(i.approved_quantity,0)>0
    group by i.product_id,i.stock_owner_id
    order by i.product_id,i.stock_owner_id nulls first
  loop
    perform private.complete_material_delivery_stock(
      v_item.product_id,v_item.stock_owner_id,v_item.approved_quantity,p_request_id,v_actor);
  end loop;

  update public.requests
  set status='delivered',delivered_by_name=trim(p_delivered_by_name),received_by_name=trim(p_received_by_name),closed_at=now()
  where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'request.completed','request',p_request_id::text,jsonb_build_object(
    'delivered_by',trim(p_delivered_by_name),'received_by',trim(p_received_by_name),
    'stock_reservations_reconciled',true,'personalized_stock_supported',true));
end;
$$;

create or replace function public.admin_cancel_request(p_request_id uuid,p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=(select auth.uid());v_status text;v_item record;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  select status into v_status from public.requests where id=p_request_id for update;
  if v_status is null then raise exception 'Solicitação não localizada.'; end if;
  if v_status in ('delivered','cancelled') then raise exception 'Solicitação já encerrada.'; end if;
  if v_status in ('separating','scheduled') then
    for v_item in
      select product_id,stock_owner_id,approved_quantity from public.request_items
      where request_id=p_request_id and coalesce(approved_quantity,0)>0 and not removed_by_admin
      order by product_id,stock_owner_id nulls first
    loop
      perform private.adjust_material_reservation(v_item.product_id,v_item.stock_owner_id,-v_item.approved_quantity,
        p_request_id,'Solicitação cancelada',v_actor);
    end loop;
  end if;
  update public.requests
  set status='cancelled',admin_notes=coalesce(nullif(trim(p_reason),''),admin_notes),closed_at=now()
  where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'request.cancelled','request',p_request_id::text,jsonb_build_object('reason',p_reason));
end;
$$;

create or replace function public.admin_delete_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=(select auth.uid());v_status text;v_item record;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  perform private.require_recent_password_auth(600);
  select status into v_status from public.requests where id=p_request_id for update;
  if v_status is null then raise exception 'Solicitação não localizada.'; end if;
  if v_status in ('separating','scheduled') then
    for v_item in
      select product_id,stock_owner_id,approved_quantity from public.request_items
      where request_id=p_request_id and coalesce(approved_quantity,0)>0 and not removed_by_admin
      order by product_id,stock_owner_id nulls first
    loop
      perform private.adjust_material_reservation(v_item.product_id,v_item.stock_owner_id,-v_item.approved_quantity,
        p_request_id,'Solicitação excluída pelo ADM',v_actor);
    end loop;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'request.deleted','request',p_request_id::text,
    jsonb_build_object('previous_status',v_status,'recent_password_confirmed',true));
  delete from public.requests where id=p_request_id;
end;
$$;

create or replace function public.primary_admin_update_request(
  p_request_id uuid,
  p_items jsonb,
  p_admin_notes text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_status text;
  v_requester uuid;
  v_before jsonb;
  v_after jsonb;
  v_item record;
  v_product public.products%rowtype;
  v_requested numeric(14,3);
  v_approved numeric(14,3);
  v_old_effective numeric(14,3);
  v_new_effective numeric(14,3);
  v_delta numeric(14,3);
  v_owner uuid;
begin
  if not (select private.is_primary_admin()) then
    raise exception 'Apenas o ADM principal pode editar completamente uma solicitação.' using errcode='42501';
  end if;
  if nullif(trim(p_reason),'') is null or length(trim(p_reason))<5 then
    raise exception 'Informe o motivo da alteração com pelo menos 5 caracteres.';
  end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'A solicitação precisa ter pelo menos um produto.';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(product_id uuid) group by product_id having count(*)>1) then
    raise exception 'O mesmo produto não pode aparecer duas vezes.';
  end if;

  select r.status,r.requested_by into v_status,v_requester from public.requests r where r.id=p_request_id for update;
  if v_status is null then raise exception 'Solicitação não localizada.' using errcode='P0002'; end if;
  if v_status='cancelled' then raise exception 'Solicitações canceladas permanecem protegidas.'; end if;
  if v_status not in ('pending','separating','scheduled','delivered') then raise exception 'Situação da solicitação inválida.'; end if;

  select jsonb_build_object('request',to_jsonb(r),'items',coalesce((
    select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from public.request_items i where i.request_id=r.id
  ),'[]'::jsonb)) into v_before from public.requests r where r.id=p_request_id;

  if exists(
    select 1
    from jsonb_to_recordset(p_items) as x(product_id uuid,requested_quantity numeric,approved_quantity numeric,removed boolean,admin_note text)
    left join public.products p on p.id=x.product_id
    left join public.request_items old on old.request_id=p_request_id and old.product_id=x.product_id
    where p.id is null or p.usage_scope='internal' or (old.id is null and not p.active)
      or coalesce(x.requested_quantity,0)<=0
      or (not coalesce(x.removed,false) and v_status<>'pending'
        and (x.approved_quantity is null or x.approved_quantity<0 or x.approved_quantity>x.requested_quantity))
  ) then raise exception 'Revise produtos e quantidades da solicitação.'; end if;
  if not exists(select 1 from jsonb_to_recordset(p_items) as x(removed boolean) where not coalesce(removed,false)) then
    raise exception 'Mantenha pelo menos um produto na solicitação.';
  end if;

  for v_item in
    with old_items as (select i.* from public.request_items i where i.request_id=p_request_id),
    incoming as (select * from jsonb_to_recordset(p_items)
      as x(product_id uuid,requested_quantity numeric,approved_quantity numeric,removed boolean,admin_note text))
    select coalesce(n.product_id,o.product_id) as product_id,o.id as item_id,
      o.requested_quantity as old_requested,o.approved_quantity as old_approved,
      coalesce(o.removed_by_admin,false) as old_removed,o.stock_owner_id as old_stock_owner,
      n.requested_quantity as new_requested,n.approved_quantity as new_approved,
      case when n.product_id is null then true else coalesce(n.removed,false) end as new_removed,
      n.admin_note as new_note
    from old_items o full join incoming n using(product_id)
    order by coalesce(n.product_id,o.product_id)
  loop
    select * into v_product from public.products where id=v_item.product_id;
    v_owner:=case when v_product.stock_control_mode='collaborator' then coalesce(v_item.old_stock_owner,v_requester) else null end;
    v_requested:=coalesce(v_item.new_requested,v_item.old_requested);
    v_approved:=case when v_status='pending' then null when v_item.new_removed then 0 else coalesce(v_item.new_approved,0) end;
    v_old_effective:=case when v_item.item_id is not null and not v_item.old_removed then coalesce(v_item.old_approved,0) else 0 end;
    v_new_effective:=case when v_item.new_removed then 0 else coalesce(v_approved,0) end;
    v_delta:=v_new_effective-v_old_effective;

    if v_status in ('separating','scheduled') then
      perform private.adjust_material_reservation(v_product.id,v_owner,v_delta,p_request_id,
        'Correção integral pelo ADM principal: '||trim(p_reason),v_actor);
    elsif v_status='delivered' then
      perform private.adjust_delivered_material_stock(v_product.id,v_owner,v_delta,p_request_id,
        case when v_delta>0 then 'Correção de entrega: saída adicional — ' else 'Correção de entrega: devolução ao estoque — ' end||trim(p_reason),v_actor);
    end if;

    if v_item.item_id is null then
      if not v_item.new_removed then
        insert into public.request_items(request_id,product_id,requested_quantity,approved_quantity,removed_by_admin,admin_note)
        values(p_request_id,v_item.product_id,v_requested,v_approved,false,nullif(trim(v_item.new_note),''));
      end if;
    else
      update public.request_items
      set requested_quantity=v_requested,approved_quantity=v_approved,removed_by_admin=v_item.new_removed,
        admin_note=nullif(trim(v_item.new_note),'')
      where id=v_item.item_id;
    end if;
  end loop;

  update public.requests set admin_notes=nullif(trim(p_admin_notes),'') where id=p_request_id;
  select jsonb_build_object('request',to_jsonb(r),'items',coalesce((
    select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from public.request_items i where i.request_id=r.id
  ),'[]'::jsonb)) into v_after from public.requests r where r.id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'request.primary_admin_full_update','request',p_request_id::text,
    jsonb_build_object('status',v_status,'reason',trim(p_reason),'before',v_before,'after',v_after));
end;
$$;

create or replace function public.admin_set_material_separation_item(
  p_request_id uuid,
  p_request_item_id uuid,
  p_status text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_request_status text;
  v_item public.request_items%rowtype;
  v_product public.products%rowtype;
  v_stock public.product_collaborator_stocks%rowtype;
  v_existing text;
  v_own_reserved numeric(14,3):=0;
  v_required numeric(14,3);
  v_physical numeric(14,3);
  v_reserved numeric(14,3);
  v_minimum numeric(14,3);
  v_replenishment_id uuid;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_status not in ('pending','separated','out_of_stock') then raise exception 'Situação de conferência inválida.'; end if;
  select status into v_request_status from public.requests where id=p_request_id for update;
  if v_request_status not in ('pending','separating') then raise exception 'O checklist só pode ser alterado antes do agendamento.'; end if;
  select * into v_item from public.request_items where id=p_request_item_id and request_id=p_request_id for update;
  if not found then raise exception 'Item da solicitação não localizado.'; end if;
  select * into v_product from public.products where id=v_item.product_id for update;

  if v_product.stock_control_mode='collaborator' then
    select * into v_stock from public.product_collaborator_stocks
    where product_id=v_product.id and collaborator_id=v_item.stock_owner_id for update;
    if not found then raise exception 'Estoque individual da colaboradora não localizado.'; end if;
    v_physical:=v_stock.physical_stock;v_reserved:=v_stock.reserved_stock;v_minimum:=v_stock.minimum_stock;
  else
    v_physical:=v_product.physical_stock;v_reserved:=v_product.reserved_stock;v_minimum:=v_product.minimum_stock;
  end if;

  select status into v_existing from public.separation_checkup_items
  where request_id=p_request_id and request_item_id=p_request_item_id for update;
  if v_existing='out_of_stock' and p_status<>'out_of_stock' then
    raise exception 'O item já zerou o estoque. Corrija o estoque no cadastro antes de alterar esta marcação.';
  end if;

  if p_status='separated' then
    if v_request_status='separating' then v_own_reserved:=coalesce(v_item.approved_quantity,0); end if;
    v_required:=coalesce(v_item.approved_quantity,v_item.requested_quantity);
    if v_physical-v_reserved+v_own_reserved<v_required then
      raise exception 'Estoque insuficiente para %. Use Sem estoque ou registre uma divergência.',v_product.name;
    end if;
  elsif p_status='out_of_stock' then
    if nullif(trim(p_note),'') is null then raise exception 'Informe o motivo da falta de estoque.'; end if;
    if v_physical>0 then
      insert into public.stock_movements(product_id,stock_owner_id,request_id,movement_type,quantity,reason,created_by)
      values(v_product.id,v_item.stock_owner_id,p_request_id,'adjustment',v_physical,
        'Zerado durante o check-up de separação: '||trim(p_note),v_actor);
    end if;
    insert into public.stock_discrepancies(product_id,stock_owner_id,request_id,request_item_id,
      discrepancy_type,system_stock,counted_stock,difference,reason,recorded_by)
    values(v_product.id,v_item.stock_owner_id,p_request_id,v_item.id,'out_of_stock',v_physical,0,-v_physical,trim(p_note),v_actor);
    if v_product.stock_control_mode='collaborator' then
      update public.product_collaborator_stocks set physical_stock=0,reserved_stock=0,updated_at=now()
      where id=v_stock.id;
    else
      update public.products set physical_stock=0,reserved_stock=0,updated_at=now() where id=v_product.id;
    end if;
    update public.request_items set approved_quantity=0,removed_by_admin=true,
      admin_note=concat_ws(E'\n',admin_note,'Sem estoque: '||trim(p_note)) where id=v_item.id;
    v_required:=greatest(v_item.requested_quantity,v_minimum,1);
    select id into v_replenishment_id from public.stock_replenishment_requests
    where product_id=v_product.id and stock_owner_id is not distinct from v_item.stock_owner_id
      and status in ('open','in_progress') for update;
    if v_replenishment_id is null then
      insert into public.stock_replenishment_requests(product_id,stock_owner_id,source_request_id,source_request_item_id,
        replenishment_type,requested_quantity,reason,created_by)
      values(v_product.id,v_item.stock_owner_id,p_request_id,v_item.id,v_product.replenishment_mode,v_required,
        'Estoque zerado durante a separação: '||trim(p_note),v_actor)
      returning id into v_replenishment_id;
    else
      update public.stock_replenishment_requests
      set requested_quantity=greatest(requested_quantity,v_required),source_request_id=p_request_id,
        source_request_item_id=v_item.id,reason=concat_ws(E'\n',reason,'Nova falta registrada: '||trim(p_note)),updated_at=now()
      where id=v_replenishment_id;
    end if;
  end if;

  insert into public.separation_checkup_items(request_id,request_item_id,product_id,status,note,checked_by,checked_at)
  values(p_request_id,v_item.id,v_product.id,p_status,nullif(trim(p_note),''),v_actor,case when p_status='pending' then null else now() end)
  on conflict(request_id,request_item_id) do update set status=excluded.status,note=excluded.note,
    checked_by=excluded.checked_by,checked_at=excluded.checked_at,updated_at=now();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'request.separation_item_checked','request_item',v_item.id::text,'database',
    jsonb_build_object('request_id',p_request_id,'status',p_status,'stock_owner_id',v_item.stock_owner_id,
      'replenishment_id',v_replenishment_id));
  return jsonb_build_object('status',p_status,'replenishment_id',v_replenishment_id);
end;
$$;

create or replace function public.admin_record_stock_discrepancy(
  p_request_id uuid,p_request_item_id uuid,p_counted_stock numeric,p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=(select auth.uid());v_item public.request_items%rowtype;v_product public.products%rowtype;
  v_stock public.product_collaborator_stocks%rowtype;v_system numeric(14,3);v_id uuid;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_counted_stock<0 then raise exception 'A contagem encontrada não pode ser negativa.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Explique a divergência encontrada.'; end if;
  perform 1 from public.requests where id=p_request_id and status in ('pending','separating');
  if not found then raise exception 'Esta solicitação não aceita novas divergências.'; end if;
  select * into v_item from public.request_items where id=p_request_item_id and request_id=p_request_id;
  select * into v_product from public.products where id=v_item.product_id for update;
  if not found then raise exception 'Produto não localizado.'; end if;
  if v_product.stock_control_mode='collaborator' then
    select * into v_stock from public.product_collaborator_stocks
    where product_id=v_product.id and collaborator_id=v_item.stock_owner_id for update;
    if not found then raise exception 'Estoque individual não localizado.'; end if;
    v_system:=v_stock.physical_stock;
  else v_system:=v_product.physical_stock;
  end if;
  if p_counted_stock=v_system then raise exception 'A contagem informada é igual ao estoque do sistema.'; end if;
  insert into public.stock_discrepancies(product_id,stock_owner_id,request_id,request_item_id,
    discrepancy_type,system_stock,counted_stock,difference,reason,recorded_by)
  values(v_product.id,v_item.stock_owner_id,p_request_id,v_item.id,'count_difference',v_system,p_counted_stock,
    p_counted_stock-v_system,trim(p_reason),v_actor) returning id into v_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'stock.discrepancy_recorded','stock_discrepancy',v_id::text,'database',
    jsonb_build_object('product_id',v_product.id,'stock_owner_id',v_item.stock_owner_id,'difference',p_counted_stock-v_system));
  return v_id;
end;
$$;

-- A entrada genérica de pedido de compra não sabe dividir produtos personalizados.
-- Bloquear esse caso é mais seguro do que lançar o total no saldo compartilhado errado.
create or replace function public.admin_receive_purchase_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_item record;v_supplier uuid;v_total numeric(14,2):=0;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  select supplier_id into v_supplier from public.purchase_orders where id=p_order_id and status='ordered' for update;
  if v_supplier is null then raise exception 'Somente pedidos enviados podem ser recebidos.'; end if;
  if exists(
    select 1 from public.purchase_order_items item join public.products product on product.id=item.product_id
    where item.purchase_order_id=p_order_id and product.stock_control_mode='collaborator'
  ) then
    raise exception 'Este pedido possui produto com estoque individual. Registre a entrada em Gerenciar estoques por colaboradora.';
  end if;
  for v_item in select * from public.purchase_order_items where purchase_order_id=p_order_id loop
    update public.products set physical_stock=physical_stock+v_item.quantity,
      unit_cost=case when v_item.unit_cost>0 then v_item.unit_cost else unit_cost end where id=v_item.product_id;
    insert into public.stock_movements(product_id,movement_type,quantity,reason,created_by)
    values(v_item.product_id,'entry',v_item.quantity,'Recebimento de pedido de compra',(select auth.uid()));
    insert into public.supplier_products(supplier_id,product_id,last_unit_cost,last_purchased_at)
    values(v_supplier,v_item.product_id,v_item.unit_cost,now())
    on conflict(supplier_id,product_id) do update set last_unit_cost=excluded.last_unit_cost,last_purchased_at=excluded.last_purchased_at;
    v_total:=v_total+(v_item.quantity*v_item.unit_cost);
  end loop;
  update public.purchase_orders set status='received',received_at=now(),total_value=v_total where id=p_order_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'purchase_order.received','purchase_order',p_order_id::text,jsonb_build_object('total',v_total));
end;
$$;

revoke all on function public.list_my_product_stock() from public,anon;
revoke all on function public.admin_list_product_collaborator_stock(uuid) from public,anon;
revoke all on function public.admin_list_product_collaborator_stock_summary() from public,anon;
revoke all on function public.admin_list_all_product_collaborator_stock() from public,anon;
revoke all on function public.admin_set_product_stock_control_mode(uuid,text) from public,anon;
revoke all on function public.admin_save_product_collaborator_stocks(uuid,jsonb,text) from public,anon;
revoke all on function public.admin_prepare_request(uuid,jsonb,text) from public,anon;
revoke all on function public.admin_complete_request(uuid,text,text) from public,anon;
revoke all on function public.admin_cancel_request(uuid,text) from public,anon;
revoke all on function public.admin_delete_request(uuid) from public,anon;
revoke all on function public.primary_admin_update_request(uuid,jsonb,text,text) from public,anon;
revoke all on function public.admin_set_material_separation_item(uuid,uuid,text,text) from public,anon;
revoke all on function public.admin_record_stock_discrepancy(uuid,uuid,numeric,text) from public,anon;
revoke all on function public.admin_receive_purchase_order(uuid) from public,anon;

grant execute on function public.list_my_product_stock() to authenticated,service_role;
grant execute on function public.admin_list_product_collaborator_stock(uuid) to authenticated,service_role;
grant execute on function public.admin_list_product_collaborator_stock_summary() to authenticated,service_role;
grant execute on function public.admin_list_all_product_collaborator_stock() to authenticated,service_role;
grant execute on function public.admin_set_product_stock_control_mode(uuid,text) to authenticated,service_role;
grant execute on function public.admin_save_product_collaborator_stocks(uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.admin_prepare_request(uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.admin_complete_request(uuid,text,text) to authenticated,service_role;
grant execute on function public.admin_cancel_request(uuid,text) to authenticated,service_role;
grant execute on function public.admin_delete_request(uuid) to authenticated,service_role;
grant execute on function public.primary_admin_update_request(uuid,jsonb,text,text) to authenticated,service_role;
grant execute on function public.admin_set_material_separation_item(uuid,uuid,text,text) to authenticated,service_role;
grant execute on function public.admin_record_stock_discrepancy(uuid,uuid,numeric,text) to authenticated,service_role;
grant execute on function public.admin_receive_purchase_order(uuid) to authenticated,service_role;

revoke all on function private.validate_product_stock_control() from public,anon,authenticated;
revoke all on function private.sync_individual_stock_for_profile() from public,anon,authenticated;
revoke all on function private.assign_request_item_stock_owner() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
