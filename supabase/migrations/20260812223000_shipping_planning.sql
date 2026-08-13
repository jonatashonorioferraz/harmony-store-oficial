-- Harmony Store Oficial - Planejamento de envios
-- Quadro operacional exclusivo da gerente de e-commerce, com contingencia do ADM principal.

alter table public.profiles
  add column if not exists is_ecommerce_manager boolean not null default false;

create index if not exists profiles_ecommerce_manager_active_idx
  on public.profiles(is_ecommerce_manager)
  where is_ecommerce_manager and status = 'active';

create or replace function private.can_manage_shipping_planning()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (p.is_ecommerce_manager or p.is_primary_admin)
  )
$$;

revoke all on function private.can_manage_shipping_planning() from public, anon;
grant execute on function private.can_manage_shipping_planning() to authenticated, service_role;

create table if not exists public.shipping_plans (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  title text not null,
  platform text not null,
  platform_label text,
  account_name text not null,
  scheduled_for timestamptz not null,
  status text not null default 'upcoming',
  is_full boolean not null default false,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_plans_title_length check (char_length(trim(title)) between 2 and 140),
  constraint shipping_plans_platform_check check (platform in ('mercado_livre','shopee','other')),
  constraint shipping_plans_other_platform_check check (platform <> 'other' or char_length(trim(coalesce(platform_label,''))) between 2 and 60),
  constraint shipping_plans_account_length check (char_length(trim(account_name)) between 2 and 100),
  constraint shipping_plans_status_check check (status in ('upcoming','preparing','checking','ready','archived','cancelled')),
  constraint shipping_plans_notes_length check (char_length(coalesce(notes,'')) <= 2000),
  constraint shipping_plans_cancel_reason_length check (char_length(coalesce(cancel_reason,'')) <= 500)
);

create table if not exists public.shipping_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.shipping_plans(id) on delete cascade,
  model_id uuid references public.finished_product_models(id) on delete restrict,
  exclusive_name text,
  exclusive_image_path text,
  color_id uuid not null references public.finished_production_colors(id) on delete restrict,
  listing_units integer not null,
  volume_quantity integer not null,
  volume_type text not null,
  notes text,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_plan_items_product_check check (
    (model_id is not null and exclusive_name is null and exclusive_image_path is null)
    or
    (model_id is null and char_length(trim(coalesce(exclusive_name,''))) between 2 and 140)
  ),
  constraint shipping_plan_items_listing_units_check check (listing_units between 1 and 1000000),
  constraint shipping_plan_items_volume_quantity_check check (volume_quantity between 1 and 100000),
  constraint shipping_plan_items_volume_type_check check (volume_type in ('kit','box')),
  constraint shipping_plan_items_notes_length check (char_length(coalesce(notes,'')) <= 500),
  constraint shipping_plan_items_image_path_length check (char_length(coalesce(exclusive_image_path,'')) <= 500),
  constraint shipping_plan_items_position_check check (position between 0 and 999)
);

create index if not exists shipping_plans_status_schedule_idx
  on public.shipping_plans(status, scheduled_for, created_at desc);
create index if not exists shipping_plans_created_by_idx
  on public.shipping_plans(created_by, created_at desc);
create index if not exists shipping_plan_items_plan_position_idx
  on public.shipping_plan_items(plan_id, position, created_at);
create index if not exists shipping_plan_items_model_idx
  on public.shipping_plan_items(model_id)
  where model_id is not null;
create index if not exists shipping_plan_items_color_idx
  on public.shipping_plan_items(color_id);

drop trigger if exists shipping_plans_touch_updated_at on public.shipping_plans;
create trigger shipping_plans_touch_updated_at
before update on public.shipping_plans
for each row execute function public.touch_updated_at();

drop trigger if exists shipping_plan_items_touch_updated_at on public.shipping_plan_items;
create trigger shipping_plan_items_touch_updated_at
before update on public.shipping_plan_items
for each row execute function public.touch_updated_at();

alter table public.shipping_plans enable row level security;
alter table public.shipping_plan_items enable row level security;

drop policy if exists "shipping plans: ecommerce manager" on public.shipping_plans;
create policy "shipping plans: ecommerce manager"
on public.shipping_plans for all to authenticated
using ((select private.can_manage_shipping_planning()))
with check ((select private.can_manage_shipping_planning()));

drop policy if exists "shipping plan items: ecommerce manager" on public.shipping_plan_items;
create policy "shipping plan items: ecommerce manager"
on public.shipping_plan_items for all to authenticated
using ((select private.can_manage_shipping_planning()))
with check ((select private.can_manage_shipping_planning()));

revoke all privileges on table public.shipping_plans from public, anon, authenticated;
revoke all privileges on table public.shipping_plan_items from public, anon, authenticated;
grant all privileges on table public.shipping_plans to service_role;
grant all privileges on table public.shipping_plan_items to service_role;

create or replace function public.list_shipping_plans(
  p_status text default null
) returns table(
  id uuid,
  protocol bigint,
  title text,
  platform text,
  platform_label text,
  account_name text,
  scheduled_for timestamptz,
  status text,
  is_full boolean,
  notes text,
  created_by uuid,
  created_by_name text,
  updated_by uuid,
  updated_by_name text,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  item_count bigint,
  completed_count bigint,
  total_units bigint,
  total_kits bigint,
  total_boxes bigint,
  item_id uuid,
  model_id uuid,
  product_name text,
  image_path text,
  image_bucket text,
  exclusive boolean,
  color_id uuid,
  color_name text,
  color_hex text,
  listing_units integer,
  volume_quantity integer,
  volume_type text,
  item_total_units bigint,
  item_notes text,
  item_completed boolean,
  item_completed_at timestamptz,
  item_completed_by_name text,
  item_position integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('upcoming','preparing','checking','ready','archived','cancelled') then
    raise exception 'Filtro de etapa invalido.';
  end if;

  return query
  with totals as (
    select i.plan_id,
      count(*)::bigint as item_count,
      count(*) filter (where i.completed)::bigint as completed_count,
      coalesce(sum(i.listing_units::bigint * i.volume_quantity::bigint),0)::bigint as total_units,
      coalesce(sum(i.volume_quantity) filter (where i.volume_type='kit'),0)::bigint as total_kits,
      coalesce(sum(i.volume_quantity) filter (where i.volume_type='box'),0)::bigint as total_boxes
    from public.shipping_plan_items i
    group by i.plan_id
  )
  select p.id,p.protocol,p.title,p.platform,p.platform_label,p.account_name,p.scheduled_for,p.status,p.is_full,p.notes,
    p.created_by,creator.full_name,p.updated_by,updater.full_name,p.archived_at,p.created_at,p.updated_at,
    coalesce(t.item_count,0),coalesce(t.completed_count,0),coalesce(t.total_units,0),coalesce(t.total_kits,0),coalesce(t.total_boxes,0),
    i.id,i.model_id,coalesce(m.name,i.exclusive_name),coalesce(m.image_path,i.exclusive_image_path),
    case when i.model_id is null then 'shipping-planning-images' else 'product-images' end,
    (i.model_id is null),i.color_id,c.name,upper(c.hex_code),i.listing_units,i.volume_quantity,i.volume_type,
    (i.listing_units::bigint*i.volume_quantity::bigint),i.notes,i.completed,i.completed_at,completed_by.full_name,i.position
  from public.shipping_plans p
  join public.profiles creator on creator.id=p.created_by
  join public.profiles updater on updater.id=p.updated_by
  left join totals t on t.plan_id=p.id
  left join public.shipping_plan_items i on i.plan_id=p.id
  left join public.finished_product_models m on m.id=i.model_id
  left join public.finished_production_colors c on c.id=i.color_id
  left join public.profiles completed_by on completed_by.id=i.completed_by
  where p_status is null or p.status=p_status
  order by
    case p.status when 'upcoming' then 1 when 'preparing' then 2 when 'checking' then 3 when 'ready' then 4 when 'archived' then 5 else 6 end,
    p.scheduled_for,p.created_at desc,i.position,i.created_at;
end;
$$;

create or replace function public.save_shipping_plan(
  p_plan_id uuid,
  p_title text,
  p_platform text,
  p_platform_label text,
  p_account_name text,
  p_scheduled_for timestamptz,
  p_is_full boolean,
  p_notes text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan public.shipping_plans%rowtype;
  v_item jsonb;
  v_existing public.shipping_plan_items%rowtype;
  v_item_id uuid;
  v_model_id uuid;
  v_color_id uuid;
  v_exclusive_name text;
  v_image_path text;
  v_position integer := 0;
  v_seen uuid[] := array[]::uuid[];
  v_before jsonb;
  v_item_changed boolean;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_title,''))) not between 2 and 140 then raise exception 'Informe um titulo entre 2 e 140 caracteres.'; end if;
  if p_platform not in ('mercado_livre','shopee','other') then raise exception 'Selecione uma plataforma valida.'; end if;
  if p_platform='other' and char_length(trim(coalesce(p_platform_label,''))) not between 2 and 60 then raise exception 'Informe o nome da outra plataforma.'; end if;
  if char_length(trim(coalesce(p_account_name,''))) not between 2 and 100 then raise exception 'Informe a conta da plataforma.'; end if;
  if p_scheduled_for is null then raise exception 'Informe a data e o horario do envio.'; end if;
  if char_length(coalesce(p_notes,''))>2000 then raise exception 'As observacoes gerais devem ter no maximo 2.000 caracteres.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione pelo menos um produto ao plano.'; end if;
  if jsonb_array_length(p_items)>150 then raise exception 'Um plano pode ter no maximo 150 produtos.'; end if;

  if p_plan_id is null then
    insert into public.shipping_plans(title,platform,platform_label,account_name,scheduled_for,is_full,notes,created_by,updated_by)
    values(trim(p_title),p_platform,case when p_platform='other' then trim(p_platform_label) end,trim(p_account_name),p_scheduled_for,coalesce(p_is_full,false),nullif(trim(coalesce(p_notes,'')),''),v_actor,v_actor)
    returning * into v_plan;
  else
    select * into v_plan from public.shipping_plans where id=p_plan_id for update;
    if not found then raise exception 'Plano de envio nao localizado.' using errcode='P0002'; end if;
    if v_plan.status in ('archived','cancelled') then raise exception 'Um plano arquivado ou cancelado nao pode ser editado.'; end if;
    v_before:=to_jsonb(v_plan);
    update public.shipping_plans set
      title=trim(p_title),platform=p_platform,platform_label=case when p_platform='other' then trim(p_platform_label) end,
      account_name=trim(p_account_name),scheduled_for=p_scheduled_for,is_full=coalesce(p_is_full,false),
      notes=nullif(trim(coalesce(p_notes,'')),''),updated_by=v_actor
    where id=p_plan_id returning * into v_plan;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position:=v_position+1;
    v_item_id:=nullif(v_item->>'id','')::uuid;
    v_model_id:=nullif(v_item->>'model_id','')::uuid;
    v_color_id:=nullif(v_item->>'color_id','')::uuid;
    v_exclusive_name:=nullif(trim(coalesce(v_item->>'exclusive_name','')),'');
    v_image_path:=nullif(trim(coalesce(v_item->>'exclusive_image_path','')),'');

    if v_model_id is null and (v_exclusive_name is null or char_length(v_exclusive_name)>140) then raise exception 'Informe o nome do produto exclusivo.'; end if;
    if v_model_id is not null then
      perform 1 from public.finished_product_models m where m.id=v_model_id and m.active;
      if not found then raise exception 'Um dos produtos do catalogo nao foi localizado ou esta inativo.'; end if;
      v_exclusive_name:=null;v_image_path:=null;
    end if;
    perform 1 from public.finished_production_colors c where c.id=v_color_id and c.active;
    if not found then raise exception 'Uma das cores nao foi localizada ou esta inativa.'; end if;
    if coalesce((v_item->>'listing_units')::integer,0) not between 1 and 1000000 then raise exception 'Informe uma quantidade valida por anuncio.'; end if;
    if coalesce((v_item->>'volume_quantity')::integer,0) not between 1 and 100000 then raise exception 'Informe a quantidade de caixas ou kits.'; end if;
    if coalesce(v_item->>'volume_type','') not in ('kit','box') then raise exception 'Escolha Caixa ou Kit.'; end if;
    if char_length(coalesce(v_item->>'notes',''))>500 then raise exception 'A observacao do produto deve ter no maximo 500 caracteres.'; end if;
    if v_image_path is not null and (
      char_length(v_image_path)>500
      or v_image_path like '%..%'
      or v_image_path like '/%'
      or split_part(v_image_path,'/',1)<>v_actor::text
    ) then raise exception 'Caminho de imagem invalido.'; end if;

    if v_item_id is not null then
      select * into v_existing from public.shipping_plan_items where id=v_item_id and plan_id=v_plan.id for update;
      if not found then raise exception 'Um dos itens editados nao pertence a este plano.'; end if;
      v_item_changed := v_existing.model_id is distinct from v_model_id
        or v_existing.exclusive_name is distinct from v_exclusive_name
        or v_existing.exclusive_image_path is distinct from v_image_path
        or v_existing.color_id is distinct from v_color_id
        or v_existing.listing_units is distinct from (v_item->>'listing_units')::integer
        or v_existing.volume_quantity is distinct from (v_item->>'volume_quantity')::integer
        or v_existing.volume_type is distinct from (v_item->>'volume_type')
        or v_existing.notes is distinct from nullif(trim(coalesce(v_item->>'notes','')),'');
      update public.shipping_plan_items set
        model_id=v_model_id,exclusive_name=v_exclusive_name,exclusive_image_path=v_image_path,color_id=v_color_id,
        listing_units=(v_item->>'listing_units')::integer,volume_quantity=(v_item->>'volume_quantity')::integer,
        volume_type=v_item->>'volume_type',notes=nullif(trim(coalesce(v_item->>'notes','')),''),position=v_position,
        completed=case when v_item_changed then false else completed end,
        completed_at=case when v_item_changed then null else completed_at end,
        completed_by=case when v_item_changed then null else completed_by end
      where id=v_item_id;
    else
      insert into public.shipping_plan_items(plan_id,model_id,exclusive_name,exclusive_image_path,color_id,listing_units,volume_quantity,volume_type,notes,position)
      values(v_plan.id,v_model_id,v_exclusive_name,v_image_path,v_color_id,(v_item->>'listing_units')::integer,(v_item->>'volume_quantity')::integer,v_item->>'volume_type',nullif(trim(coalesce(v_item->>'notes','')),''),v_position)
      returning id into v_item_id;
    end if;
    v_seen:=array_append(v_seen,v_item_id);
  end loop;

  delete from public.shipping_plan_items i where i.plan_id=v_plan.id and not (i.id=any(v_seen));
  if v_plan.status='ready' and exists(
    select 1 from public.shipping_plan_items i where i.plan_id=v_plan.id and not i.completed
  ) then
    update public.shipping_plans set status='checking',updated_by=v_actor where id=v_plan.id;
  end if;
  update public.shipping_plans set updated_by=v_actor where id=v_plan.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,case when p_plan_id is null then 'shipping_plan.created' else 'shipping_plan.updated' end,
    'shipping_plan',v_plan.id::text,'database',jsonb_build_object('before',v_before,'item_count',array_length(v_seen,1),'platform',p_platform,'scheduled_for',p_scheduled_for));
  return v_plan.id;
end;
$$;

create or replace function public.set_shipping_plan_item_completed(
  p_item_id uuid,
  p_completed boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan_id uuid;
  v_status text;
begin
  if not (select private.can_manage_shipping_planning()) then raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501'; end if;
  select i.plan_id,p.status into v_plan_id,v_status
  from public.shipping_plan_items i join public.shipping_plans p on p.id=i.plan_id
  where i.id=p_item_id for update of i,p;
  if not found then raise exception 'Item nao localizado.' using errcode='P0002'; end if;
  if v_status in ('archived','cancelled') then raise exception 'Este plano nao aceita novas alteracoes.'; end if;
  update public.shipping_plan_items set completed=coalesce(p_completed,false),completed_at=case when p_completed then now() end,completed_by=case when p_completed then v_actor end where id=p_item_id;
  if not p_completed and v_status='ready' then update public.shipping_plans set status='checking',updated_by=v_actor where id=v_plan_id; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,case when p_completed then 'shipping_plan.item_completed' else 'shipping_plan.item_reopened' end,'shipping_plan_item',p_item_id::text,'database',jsonb_build_object('plan_id',v_plan_id));
end;
$$;

create or replace function public.move_shipping_plan(
  p_plan_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan public.shipping_plans%rowtype;
  v_total bigint;
  v_completed bigint;
begin
  if not (select private.can_manage_shipping_planning()) then raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501'; end if;
  if p_status not in ('upcoming','preparing','checking','ready','archived') then raise exception 'Etapa de destino invalida.'; end if;
  select * into v_plan from public.shipping_plans where id=p_plan_id for update;
  if not found then raise exception 'Plano de envio nao localizado.' using errcode='P0002'; end if;
  if v_plan.status='cancelled' then raise exception 'Um plano cancelado nao pode mudar de etapa.'; end if;
  select count(*),count(*) filter(where completed) into v_total,v_completed from public.shipping_plan_items where plan_id=p_plan_id;
  if p_status in ('ready','archived') and (v_total=0 or v_completed<>v_total) then raise exception 'Conclua todos os produtos antes de marcar o envio como pronto.'; end if;
  if p_status='archived' and v_plan.status<>'ready' then raise exception 'Somente um envio pronto para coleta pode ser arquivado.'; end if;
  update public.shipping_plans set status=p_status,archived_at=case when p_status='archived' then now() else null end,updated_by=v_actor where id=p_plan_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_plan.status_changed','shipping_plan',p_plan_id::text,'database',jsonb_build_object('before',v_plan.status,'after',p_status));
end;
$$;

create or replace function public.cancel_shipping_plan(
  p_plan_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_before text;
begin
  if not (select private.can_manage_shipping_planning()) then raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Informe o motivo do cancelamento.'; end if;
  select status into v_before from public.shipping_plans where id=p_plan_id for update;
  if not found then raise exception 'Plano de envio nao localizado.' using errcode='P0002'; end if;
  if v_before='archived' then raise exception 'Um plano arquivado nao pode ser cancelado.'; end if;
  update public.shipping_plans set status='cancelled',cancelled_at=now(),cancel_reason=trim(p_reason),updated_by=v_actor where id=p_plan_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_plan.cancelled','shipping_plan',p_plan_id::text,'database',jsonb_build_object('before',v_before,'reason',trim(p_reason)));
end;
$$;

revoke all on function public.list_shipping_plans(text) from public, anon, authenticated;
revoke all on function public.save_shipping_plan(uuid,text,text,text,text,timestamptz,boolean,text,jsonb) from public, anon, authenticated;
revoke all on function public.set_shipping_plan_item_completed(uuid,boolean) from public, anon, authenticated;
revoke all on function public.move_shipping_plan(uuid,text) from public, anon, authenticated;
revoke all on function public.cancel_shipping_plan(uuid,text) from public, anon, authenticated;
grant execute on function public.list_shipping_plans(text) to authenticated, service_role;
grant execute on function public.save_shipping_plan(uuid,text,text,text,text,timestamptz,boolean,text,jsonb) to authenticated, service_role;
grant execute on function public.set_shipping_plan_item_completed(uuid,boolean) to authenticated, service_role;
grant execute on function public.move_shipping_plan(uuid,text) to authenticated, service_role;
grant execute on function public.cancel_shipping_plan(uuid,text) to authenticated, service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('shipping-planning-images','shipping-planning-images',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "shipping planning images: manager insert" on storage.objects;
create policy "shipping planning images: manager insert" on storage.objects for insert to authenticated
with check (bucket_id='shipping-planning-images' and (storage.foldername(name))[1]=(select auth.uid())::text and (select private.can_manage_shipping_planning()));
drop policy if exists "shipping planning images: manager update" on storage.objects;
create policy "shipping planning images: manager update" on storage.objects for update to authenticated
using (bucket_id='shipping-planning-images' and (select private.can_manage_shipping_planning()))
with check (bucket_id='shipping-planning-images' and (select private.can_manage_shipping_planning()));
drop policy if exists "shipping planning images: manager delete" on storage.objects;
create policy "shipping planning images: manager delete" on storage.objects for delete to authenticated
using (bucket_id='shipping-planning-images' and (select private.can_manage_shipping_planning()));

notify pgrst, 'reload schema';
