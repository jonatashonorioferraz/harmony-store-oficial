-- Harmony Store Oficial - ordens semanais de producao.
-- Planejamento operacional separado da conferencia e dos pagamentos.

begin;

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  worker_id uuid not null references public.profiles(id) on delete restrict,
  worker_name text not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  due_date date not null,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','acknowledged','cancelled')),
  notes text check (notes is null or length(notes) <= 1200),
  created_by uuid not null references public.profiles(id) on delete restrict,
  sent_at timestamptz,
  viewed_at timestamptz,
  acknowledged_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_orders_due_date_check check (due_date >= week_start)
);

create table if not exists public.production_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.production_orders(id) on delete cascade,
  model_id uuid references public.finished_product_models(id) on delete restrict,
  model_name text not null,
  image_path text,
  color_id uuid references public.finished_production_colors(id) on delete set null,
  color_name text not null,
  color_hex text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  quantity bigint not null check (quantity > 0),
  notes text check (notes is null or length(notes) <= 300),
  position integer not null default 0 check (position between 0 and 9999),
  created_at timestamptz not null default now(),
  unique(order_id, model_id, color_name)
);

create index if not exists production_orders_worker_created_idx
  on public.production_orders(worker_id, created_at desc);
create index if not exists production_orders_status_week_idx
  on public.production_orders(status, week_start desc);
create index if not exists production_orders_created_by_idx
  on public.production_orders(created_by, created_at desc);
create index if not exists production_order_items_order_position_idx
  on public.production_order_items(order_id, position);
create index if not exists production_order_items_model_idx
  on public.production_order_items(model_id);

drop trigger if exists production_orders_touch_updated_at on public.production_orders;
create trigger production_orders_touch_updated_at
before update on public.production_orders
for each row execute function public.touch_updated_at();

alter table public.production_orders enable row level security;
alter table public.production_order_items enable row level security;

drop policy if exists "production orders: admin or own read" on public.production_orders;
create policy "production orders: admin or own read"
on public.production_orders for select to authenticated
using (
  (select private.is_admin())
  or (
    worker_id = (select auth.uid())
    and status <> 'draft'
  )
);

drop policy if exists "production order items: admin or own read" on public.production_order_items;
create policy "production order items: admin or own read"
on public.production_order_items for select to authenticated
using (
  exists (
    select 1 from public.production_orders o
    where o.id = order_id
      and ((select private.is_admin()) or (o.worker_id = (select auth.uid()) and o.status <> 'draft'))
  )
);

revoke all privileges on table public.production_orders from public, anon, authenticated;
revoke all privileges on table public.production_order_items from public, anon, authenticated;
grant select on table public.production_orders to authenticated;
grant select on table public.production_order_items to authenticated;
grant all privileges on table public.production_orders to service_role;
grant all privileges on table public.production_order_items to service_role;

create or replace function public.list_production_orders(
  p_from date default null,
  p_to date default null
) returns table(
  id uuid, protocol bigint, worker_id uuid, worker_name text,
  week_start date, due_date date, status text, notes text,
  created_by uuid, creator_name text, sent_at timestamptz,
  viewed_at timestamptz, acknowledged_at timestamptz,
  cancelled_at timestamptz, cancel_reason text, created_at timestamptz,
  item_id uuid, model_id uuid, model_name text, image_path text,
  color_id uuid, color_name text, color_hex text, quantity bigint,
  item_notes text, item_position integer
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_user and p.status = 'active';
  if v_role is null then raise exception 'Acesso negado.' using errcode='42501'; end if;

  return query
  select o.id,o.protocol,o.worker_id,o.worker_name,o.week_start,o.due_date,o.status,o.notes,
    o.created_by,creator.full_name,o.sent_at,o.viewed_at,o.acknowledged_at,
    o.cancelled_at,o.cancel_reason,o.created_at,
    i.id,i.model_id,i.model_name,i.image_path,i.color_id,i.color_name,upper(i.color_hex),
    i.quantity,i.notes,i.position
  from public.production_orders o
  join public.profiles creator on creator.id=o.created_by
  join public.production_order_items i on i.order_id=o.id
  where (v_role='admin' or (o.worker_id=v_user and o.status<>'draft'))
    and (p_from is null or o.week_start>=p_from)
    and (p_to is null or o.week_start<=p_to)
  order by o.week_start desc,o.created_at desc,i.position,i.created_at;
end;
$$;

create or replace function public.admin_save_production_order(
  p_order_id uuid,
  p_worker_id uuid,
  p_week_start date,
  p_due_date date,
  p_notes text,
  p_items jsonb,
  p_send boolean default false
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_order public.production_orders%rowtype;
  v_worker public.profiles%rowtype;
  v_item jsonb;
  v_model public.finished_product_models%rowtype;
  v_color public.finished_production_colors%rowtype;
  v_position integer := 0;
  v_count integer;
  v_notification_id uuid;
  v_before jsonb;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_week_start is null or extract(isodow from p_week_start)<>1 then raise exception 'A semana deve comecar em uma segunda-feira.'; end if;
  if p_due_date is null or p_due_date<p_week_start then raise exception 'Informe uma data de entrega valida.'; end if;
  if length(coalesce(p_notes,''))>1200 then raise exception 'As orientacoes devem ter no maximo 1200 caracteres.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione pelo menos um produto.'; end if;
  if jsonb_array_length(p_items)>150 then raise exception 'Uma ordem pode ter no maximo 150 produtos.'; end if;

  select * into v_worker from public.profiles
  where id=p_worker_id and status='active' and role in ('collaborator','receiver');
  if not found then raise exception 'Colaboradora nao localizada ou inativa.'; end if;

  if p_order_id is null then
    insert into public.production_orders(worker_id,worker_name,week_start,due_date,status,notes,created_by,sent_at)
    values(v_worker.id,v_worker.full_name,p_week_start,p_due_date,case when p_send then 'sent' else 'draft' end,
      nullif(trim(coalesce(p_notes,'')),''),v_actor,case when p_send then now() end)
    returning * into v_order;
  else
    select * into v_order from public.production_orders where id=p_order_id for update;
    if not found then raise exception 'Ordem de producao nao localizada.' using errcode='P0002'; end if;
    if v_order.status='cancelled' then raise exception 'Uma ordem cancelada nao pode ser alterada. Duplique-a para criar uma nova.'; end if;
    v_before:=to_jsonb(v_order);
    update public.production_orders set
      worker_id=v_worker.id,worker_name=v_worker.full_name,week_start=p_week_start,due_date=p_due_date,
      notes=nullif(trim(coalesce(p_notes,'')),''),
      status=case when p_send then 'sent' else status end,
      sent_at=case when p_send then now() else sent_at end,
      viewed_at=case when p_send then null else viewed_at end,
      acknowledged_at=case when p_send then null else acknowledged_at end
    where id=p_order_id returning * into v_order;
    delete from public.production_order_items where order_id=v_order.id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position:=v_position+1;
    if coalesce((v_item->>'quantity')::bigint,0)<=0 then raise exception 'Informe quantidades inteiras maiores que zero.'; end if;
    select * into v_model from public.finished_product_models
    where id=(v_item->>'model_id')::uuid and (active or p_order_id is not null);
    if not found then raise exception 'Um dos modelos nao foi localizado ou esta inativo.'; end if;
    select * into v_color from public.finished_production_colors
    where id=(v_item->>'color_id')::uuid and (active or p_order_id is not null);
    if not found then raise exception 'Uma das cores nao foi localizada ou esta inativa.'; end if;
    if length(coalesce(v_item->>'notes',''))>300 then raise exception 'A observacao do produto deve ter no maximo 300 caracteres.'; end if;

    insert into public.production_order_items(
      order_id,model_id,model_name,image_path,color_id,color_name,color_hex,quantity,notes,position
    ) values (
      v_order.id,v_model.id,v_model.name,v_model.image_path,v_color.id,v_color.name,upper(v_color.hex_code),
      (v_item->>'quantity')::bigint,nullif(trim(coalesce(v_item->>'notes','')),''),v_position
    );
  end loop;

  select count(*) into v_count from public.production_order_items where order_id=v_order.id;

  if p_send then
    insert into public.app_notifications(title,body,priority,audience,target_profile_id,due_at,created_by)
    values(
      'Nova ordem de producao #'||lpad(v_order.protocol::text,4,'0'),
      'Sua lista de producao da semana esta disponivel. Confira os modelos, cores e quantidades e confirme o recebimento no aplicativo.',
      'urgent','individual',v_worker.id,p_due_date::timestamptz,v_actor
    ) returning id into v_notification_id;
    insert into public.app_notification_recipients(notification_id,recipient_id)
    values(v_notification_id,v_worker.id);
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,case when p_order_id is null then 'production_order.created' else 'production_order.updated' end,
    'production_order',v_order.id::text,'database',jsonb_build_object(
      'before',v_before,'worker_id',v_worker.id,'week_start',p_week_start,'due_date',p_due_date,
      'item_count',v_count,'sent',p_send
    ));
  return v_order.id;
exception when unique_violation then
  raise exception 'O mesmo modelo e cor foram adicionados mais de uma vez.';
end;
$$;

create or replace function public.mark_production_order_viewed(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.production_orders
  set status=case when status='sent' then 'viewed' else status end,
      viewed_at=coalesce(viewed_at,now())
  where id=p_order_id and worker_id=(select auth.uid()) and status in ('sent','viewed','acknowledged');
  if not found then raise exception 'Ordem de producao nao localizada.' using errcode='P0002'; end if;
end;
$$;

create or replace function public.acknowledge_production_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.production_orders
  set status='acknowledged',viewed_at=coalesce(viewed_at,now()),acknowledged_at=coalesce(acknowledged_at,now())
  where id=p_order_id and worker_id=(select auth.uid()) and status in ('sent','viewed','acknowledged');
  if not found then raise exception 'Ordem de producao nao localizada.' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin)
  values((select auth.uid()),'production_order.acknowledged','production_order',p_order_id::text,'database');
end;
$$;

create or replace function public.admin_cancel_production_order(p_order_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_order public.production_orders%rowtype;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<5 or length(p_reason)>500 then raise exception 'Informe o motivo do cancelamento.'; end if;
  update public.production_orders set status='cancelled',cancelled_at=now(),cancelled_by=(select auth.uid()),cancel_reason=trim(p_reason)
  where id=p_order_id and status<>'cancelled' returning * into v_order;
  if not found then raise exception 'Ordem nao localizada ou ja cancelada.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values((select auth.uid()),'production_order.cancelled','production_order',p_order_id::text,'database',jsonb_build_object('reason',trim(p_reason)));
end;
$$;

revoke all on function public.list_production_orders(date,date) from public,anon,authenticated;
revoke all on function public.admin_save_production_order(uuid,uuid,date,date,text,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.mark_production_order_viewed(uuid) from public,anon,authenticated;
revoke all on function public.acknowledge_production_order(uuid) from public,anon,authenticated;
revoke all on function public.admin_cancel_production_order(uuid,text) from public,anon,authenticated;
grant execute on function public.list_production_orders(date,date) to authenticated,service_role;
grant execute on function public.admin_save_production_order(uuid,uuid,date,date,text,jsonb,boolean) to authenticated,service_role;
grant execute on function public.mark_production_order_viewed(uuid) to authenticated,service_role;
grant execute on function public.acknowledge_production_order(uuid) to authenticated,service_role;
grant execute on function public.admin_cancel_production_order(uuid,text) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
