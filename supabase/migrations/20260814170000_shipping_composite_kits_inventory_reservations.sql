-- Harmony Store Oficial - kits compostos e reserva segura do Inventario de Producao.
-- Mantem separados: produto do catalogo, item exclusivo e kit composto.

begin;

create table if not exists public.shipping_kit_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_path text,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_kit_templates_name_check
    check (char_length(trim(name)) between 2 and 140),
  constraint shipping_kit_templates_image_path_check
    check (char_length(coalesce(image_path,'')) <= 500)
);

create unique index if not exists shipping_kit_templates_active_name_uidx
  on public.shipping_kit_templates(lower(trim(name)))
  where active;

create table if not exists public.shipping_kit_template_components (
  id uuid primary key default gen_random_uuid(),
  kit_template_id uuid not null references public.shipping_kit_templates(id) on delete cascade,
  model_id uuid not null references public.finished_product_models(id) on delete restrict,
  color_id uuid not null references public.finished_production_colors(id) on delete restrict,
  units_per_volume integer not null,
  position smallint not null,
  created_at timestamptz not null default now(),
  constraint shipping_kit_template_components_units_check
    check (units_per_volume between 1 and 1000000),
  constraint shipping_kit_template_components_position_check
    check (position between 1 and 50),
  constraint shipping_kit_template_components_unique_product_color
    unique (kit_template_id, model_id, color_id),
  constraint shipping_kit_template_components_unique_position
    unique (kit_template_id, position)
);

alter table public.shipping_plan_items
  add column if not exists item_kind text,
  add column if not exists kit_template_id uuid references public.shipping_kit_templates(id) on delete restrict;

update public.shipping_plan_items
set item_kind=case when model_id is null then 'exclusive' else 'catalog' end
where item_kind is null;

alter table public.shipping_plan_items
  alter column item_kind set default 'catalog',
  alter column item_kind set not null;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.shipping_plan_items'::regclass
      and conname='shipping_plan_items_kind_check'
  ) then
    alter table public.shipping_plan_items
      add constraint shipping_plan_items_kind_check
      check (item_kind in ('catalog','exclusive','kit'));
  end if;
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.shipping_plan_items'::regclass
      and conname='shipping_plan_items_kind_reference_check'
  ) then
    alter table public.shipping_plan_items
      add constraint shipping_plan_items_kind_reference_check check (
        (item_kind='catalog' and model_id is not null and kit_template_id is null)
        or (item_kind='exclusive' and model_id is null and kit_template_id is null)
        or (item_kind='kit' and model_id is null and kit_template_id is not null)
      ) not valid;
    alter table public.shipping_plan_items
      validate constraint shipping_plan_items_kind_reference_check;
  end if;
end
$$;

create index if not exists shipping_plan_items_kind_idx
  on public.shipping_plan_items(item_kind,kit_template_id);

create table if not exists public.shipping_plan_item_components (
  id uuid primary key default gen_random_uuid(),
  plan_item_id uuid not null references public.shipping_plan_items(id) on delete cascade,
  model_id uuid not null references public.finished_product_models(id) on delete restrict,
  color_id uuid not null references public.finished_production_colors(id) on delete restrict,
  units_per_volume integer not null,
  position smallint not null,
  created_at timestamptz not null default now(),
  constraint shipping_plan_item_components_units_check
    check (units_per_volume between 1 and 1000000),
  constraint shipping_plan_item_components_position_check
    check (position between 1 and 50),
  constraint shipping_plan_item_components_unique_product_color
    unique (plan_item_id,model_id,color_id),
  constraint shipping_plan_item_components_unique_position
    unique (plan_item_id,position)
);

-- Snapshot seguro dos itens simples antigos. Combinacoes antigas permanecem sem
-- reserva automatica porque nao registravam a quantidade individual de cada cor.
insert into public.shipping_plan_item_components(
  plan_item_id,model_id,color_id,units_per_volume,position
)
select i.id,i.model_id,i.color_id,i.listing_units,1
from public.shipping_plan_items i
where i.item_kind='catalog'
  and i.model_id is not null
  and i.color_combination_id is null
on conflict (plan_item_id,model_id,color_id) do nothing;

create table if not exists public.shipping_inventory_requests (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  plan_id uuid not null references public.shipping_plans(id) on delete restrict,
  plan_item_id uuid not null references public.shipping_plan_items(id) on delete restrict,
  status text not null default 'reserved',
  notes text,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  transferred_by uuid references public.profiles(id) on delete restrict,
  transferred_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text,
  updated_at timestamptz not null default now(),
  constraint shipping_inventory_requests_status_check
    check (status in ('reserved','transferred','cancelled')),
  constraint shipping_inventory_requests_notes_check
    check (char_length(coalesce(notes,'')) <= 1200),
  constraint shipping_inventory_requests_cancel_reason_check
    check (char_length(coalesce(cancel_reason,'')) <= 500),
  constraint shipping_inventory_requests_state_check check (
    (status='reserved' and transferred_at is null and transferred_by is null and cancelled_at is null and cancelled_by is null)
    or (status='transferred' and transferred_at is not null and transferred_by is not null and cancelled_at is null and cancelled_by is null)
    or (status='cancelled' and cancelled_at is not null and cancelled_by is not null and transferred_at is null and transferred_by is null)
  )
);

create unique index if not exists shipping_inventory_requests_active_item_uidx
  on public.shipping_inventory_requests(plan_item_id)
  where status='reserved';
create index if not exists shipping_inventory_requests_status_idx
  on public.shipping_inventory_requests(status,requested_at desc);

create table if not exists public.shipping_inventory_request_boxes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.shipping_inventory_requests(id) on delete cascade,
  component_id uuid not null references public.shipping_plan_item_components(id) on delete restrict,
  inventory_entry_id uuid not null references public.production_inventory_entries(id) on delete restrict,
  box_quantity bigint not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.profiles(id) on delete restrict,
  release_reason text,
  transferred_at timestamptz,
  transferred_by uuid references public.profiles(id) on delete restrict,
  constraint shipping_inventory_request_boxes_quantity_check check (box_quantity>0),
  constraint shipping_inventory_request_boxes_release_reason_check
    check (char_length(coalesce(release_reason,'')) <= 500),
  constraint shipping_inventory_request_boxes_unique_request_box
    unique (request_id,inventory_entry_id)
);

create unique index if not exists shipping_inventory_request_boxes_active_box_uidx
  on public.shipping_inventory_request_boxes(inventory_entry_id)
  where released_at is null;
create index if not exists shipping_inventory_request_boxes_request_idx
  on public.shipping_inventory_request_boxes(request_id,component_id);

create or replace function private.can_access_shipping_inventory_requests()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select (select private.can_manage_shipping_planning())
      or (select private.can_manage_production_inventory())
$$;

revoke all on function private.can_access_shipping_inventory_requests() from public,anon;
grant execute on function private.can_access_shipping_inventory_requests() to authenticated,service_role;

drop trigger if exists shipping_kit_templates_touch_updated_at on public.shipping_kit_templates;
create trigger shipping_kit_templates_touch_updated_at
before update on public.shipping_kit_templates
for each row execute function public.touch_updated_at();

drop trigger if exists shipping_inventory_requests_touch_updated_at on public.shipping_inventory_requests;
create trigger shipping_inventory_requests_touch_updated_at
before update on public.shipping_inventory_requests
for each row execute function public.touch_updated_at();

alter table public.shipping_kit_templates enable row level security;
alter table public.shipping_kit_template_components enable row level security;
alter table public.shipping_plan_item_components enable row level security;
alter table public.shipping_inventory_requests enable row level security;
alter table public.shipping_inventory_request_boxes enable row level security;

drop policy if exists "shipping kit templates: manager" on public.shipping_kit_templates;
create policy "shipping kit templates: manager" on public.shipping_kit_templates
for all to authenticated
using ((select private.can_manage_shipping_planning()))
with check ((select private.can_manage_shipping_planning()));

drop policy if exists "shipping kit components: manager" on public.shipping_kit_template_components;
create policy "shipping kit components: manager" on public.shipping_kit_template_components
for all to authenticated
using ((select private.can_manage_shipping_planning()))
with check ((select private.can_manage_shipping_planning()));

drop policy if exists "shipping item components: authorized" on public.shipping_plan_item_components;
create policy "shipping item components: authorized" on public.shipping_plan_item_components
for select to authenticated
using ((select private.can_access_shipping_inventory_requests()));

drop policy if exists "shipping inventory requests: authorized" on public.shipping_inventory_requests;
create policy "shipping inventory requests: authorized" on public.shipping_inventory_requests
for select to authenticated
using ((select private.can_access_shipping_inventory_requests()));

drop policy if exists "shipping inventory boxes: authorized" on public.shipping_inventory_request_boxes;
create policy "shipping inventory boxes: authorized" on public.shipping_inventory_request_boxes
for select to authenticated
using ((select private.can_access_shipping_inventory_requests()));

revoke all privileges on table public.shipping_kit_templates from public,anon,authenticated;
revoke all privileges on table public.shipping_kit_template_components from public,anon,authenticated;
revoke all privileges on table public.shipping_plan_item_components from public,anon,authenticated;
revoke all privileges on table public.shipping_inventory_requests from public,anon,authenticated;
revoke all privileges on table public.shipping_inventory_request_boxes from public,anon,authenticated;
grant all privileges on table public.shipping_kit_templates to service_role;
grant all privileges on table public.shipping_kit_template_components to service_role;
grant all privileges on table public.shipping_plan_item_components to service_role;
grant all privileges on table public.shipping_inventory_requests to service_role;
grant all privileges on table public.shipping_inventory_request_boxes to service_role;

create or replace function public.list_shipping_kit_templates()
returns table(kit jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  return query
  select jsonb_build_object(
    'id',k.id,'name',k.name,'image_path',k.image_path,'active',k.active,
    'created_at',k.created_at,'updated_at',k.updated_at,
    'components',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',kc.id,'model_id',kc.model_id,'model_name',m.name,
        'image_path',m.image_path,'color_id',kc.color_id,
        'color_name',c.name,'color_hex',upper(c.hex_code),
        'units_per_volume',kc.units_per_volume,'position',kc.position
      ) order by kc.position)
      from public.shipping_kit_template_components kc
      join public.finished_product_models m on m.id=kc.model_id
      join public.finished_production_colors c on c.id=kc.color_id
      where kc.kit_template_id=k.id
    ),'[]'::jsonb)
  )
  from public.shipping_kit_templates k
  where k.active
  order by lower(k.name),k.created_at;
end;
$$;

create or replace function public.save_shipping_kit_template(
  p_kit_id uuid,
  p_name text,
  p_image_path text,
  p_components jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_component jsonb;
  v_position smallint:=0;
  v_model_id uuid;
  v_color_id uuid;
  v_units integer;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 140 then
    raise exception 'Informe um nome de kit entre 2 e 140 caracteres.';
  end if;
  if jsonb_typeof(p_components)<>'array' or jsonb_array_length(p_components) not between 2 and 50 then
    raise exception 'Um kit composto precisa ter de 2 a 50 componentes.';
  end if;
  if p_image_path is not null and (
    char_length(p_image_path)>500 or p_image_path like '%..%' or p_image_path like '/%'
    or split_part(p_image_path,'/',1)<>v_actor::text
  ) then raise exception 'Caminho de imagem do kit invalido.'; end if;

  if p_kit_id is null then
    insert into public.shipping_kit_templates(name,image_path,created_by,updated_by)
    values(trim(p_name),nullif(trim(coalesce(p_image_path,'')),''),v_actor,v_actor) returning id into v_id;
  else
    update public.shipping_kit_templates
    set name=trim(p_name),image_path=nullif(trim(coalesce(p_image_path,'')),''),updated_by=v_actor
    where id=p_kit_id and active
    returning id into v_id;
    if v_id is null then raise exception 'Kit composto nao localizado.' using errcode='P0002'; end if;
    if exists(
      select 1 from public.shipping_plan_items i where i.kit_template_id=v_id
    ) then
      raise exception 'Este kit ja possui historico. Crie uma nova versao para preservar os envios anteriores.' using errcode='23514';
    end if;
    delete from public.shipping_kit_template_components where kit_template_id=v_id;
  end if;

  for v_component in select value from jsonb_array_elements(p_components)
  loop
    v_position:=v_position+1;
    v_model_id:=nullif(v_component->>'model_id','')::uuid;
    v_color_id:=nullif(v_component->>'color_id','')::uuid;
    v_units:=coalesce((v_component->>'units_per_volume')::integer,0);
    if v_units not between 1 and 1000000 then raise exception 'Informe a quantidade por kit em todos os componentes.'; end if;
    perform 1 from public.finished_product_models where id=v_model_id and active;
    if not found then raise exception 'Um modelo do kit nao foi localizado ou esta inativo.'; end if;
    perform 1 from public.finished_production_colors where id=v_color_id and active;
    if not found then raise exception 'Uma cor do kit nao foi localizada ou esta inativa.'; end if;
    insert into public.shipping_kit_template_components(
      kit_template_id,model_id,color_id,units_per_volume,position
    ) values(v_id,v_model_id,v_color_id,v_units,v_position);
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_kit_template.saved','shipping_kit_template',v_id::text,'database',
    jsonb_build_object('name',trim(p_name),'component_count',jsonb_array_length(p_components)));
  return v_id;
exception when unique_violation then
  raise exception 'Ja existe um kit ativo com este nome ou com o mesmo modelo e cor repetidos.' using errcode='23505';
end;
$$;

create or replace function public.archive_shipping_kit_template(
  p_kit_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_name text;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  if char_length(coalesce(p_reason,''))>500 then raise exception 'Motivo muito longo.'; end if;
  update public.shipping_kit_templates
  set active=false,updated_by=v_actor
  where id=p_kit_id and active
  returning name into v_name;
  if v_name is null then raise exception 'Kit composto nao localizado.' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_kit_template.archived','shipping_kit_template',p_kit_id::text,'database',
    jsonb_build_object('name',v_name,'reason',nullif(trim(coalesce(p_reason,'')),''),
      'history_preserved',true));
end;
$$;

create or replace function public.save_shipping_plan_v2(
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
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan_id uuid;
  v_item jsonb;
  v_normalized jsonb:='[]'::jsonb;
  v_kind text;
  v_kit_id uuid;
  v_kit_name text;
  v_primary_color uuid;
  v_units integer;
  v_position integer:=0;
  v_item_id uuid;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  if jsonb_typeof(p_items)<>'array' then raise exception 'Lista de produtos invalida.'; end if;
  if p_plan_id is not null and exists(
    select 1 from public.shipping_inventory_requests r
    where r.plan_id=p_plan_id and r.status='reserved'
  ) then
    raise exception 'Cancele ou conclua as reservas do Inventario antes de editar este plano.' using errcode='23514';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_kind:=coalesce(nullif(v_item->>'item_kind',''),
      case when nullif(v_item->>'model_id','') is null then 'exclusive' else 'catalog' end);
    if v_kind not in ('catalog','exclusive','kit') then raise exception 'Tipo de item invalido.'; end if;
    if v_kind='kit' then
      v_kit_id:=nullif(v_item->>'kit_template_id','')::uuid;
      select k.name,
        sum(c.units_per_volume)::integer,
        (array_agg(c.color_id order by c.position))[1]
      into v_kit_name,v_units,v_primary_color
      from public.shipping_kit_templates k
      join public.shipping_kit_template_components c on c.kit_template_id=k.id
      where k.id=v_kit_id and k.active
      group by k.id,k.name;
      if v_kit_name is null then raise exception 'Kit composto nao localizado.' using errcode='P0002'; end if;
      v_item:=jsonb_set(v_item,'{model_id}','null'::jsonb,true);
      v_item:=jsonb_set(v_item,'{exclusive_name}',to_jsonb(v_kit_name),true);
      v_item:=jsonb_set(v_item,'{exclusive_image_path}','null'::jsonb,true);
      v_item:=jsonb_set(v_item,'{color_id}',to_jsonb(v_primary_color::text),true);
      v_item:=jsonb_set(v_item,'{color_combination_id}','null'::jsonb,true);
      v_item:=jsonb_set(v_item,'{listing_units}',to_jsonb(v_units),true);
      v_item:=jsonb_set(v_item,'{volume_type}',to_jsonb('kit'::text),true);
    end if;
    v_normalized:=v_normalized||jsonb_build_array(v_item);
  end loop;

  v_plan_id:=public.save_shipping_plan_with_colors(
    p_plan_id,p_title,p_platform,p_platform_label,p_account_name,
    p_scheduled_for,p_is_full,p_notes,v_normalized
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position:=v_position+1;
    v_kind:=coalesce(nullif(v_item->>'item_kind',''),
      case when nullif(v_item->>'model_id','') is null then 'exclusive' else 'catalog' end);
    v_kit_id:=case when v_kind='kit' then nullif(v_item->>'kit_template_id','')::uuid end;
    select id into v_item_id
    from public.shipping_plan_items
    where plan_id=v_plan_id and position=v_position
    for update;
    update public.shipping_plan_items
    set item_kind=v_kind,kit_template_id=v_kit_id
    where id=v_item_id;
    delete from public.shipping_plan_item_components where plan_item_id=v_item_id;
    if v_kind='kit' then
      insert into public.shipping_plan_item_components(
        plan_item_id,model_id,color_id,units_per_volume,position
      )
      select v_item_id,c.model_id,c.color_id,c.units_per_volume,c.position
      from public.shipping_kit_template_components c
      where c.kit_template_id=v_kit_id
      order by c.position;
    elsif v_kind='catalog' and nullif(v_item->>'color_combination_id','') is null then
      insert into public.shipping_plan_item_components(
        plan_item_id,model_id,color_id,units_per_volume,position
      ) values(
        v_item_id,nullif(v_item->>'model_id','')::uuid,
        nullif(v_item->>'color_id','')::uuid,
        (v_item->>'listing_units')::integer,1
      );
    end if;
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_plan.v2_saved','shipping_plan',v_plan_id::text,'database',
    jsonb_build_object('item_count',jsonb_array_length(p_items),'supports_composite_kits',true));
  return v_plan_id;
end;
$$;

create or replace function public.list_shipping_plans_v2(p_status text default null)
returns table(plan jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  if p_status is not null and p_status not in ('upcoming','preparing','checking','ready','archived','cancelled') then
    raise exception 'Filtro de etapa invalido.';
  end if;
  return query
  select jsonb_build_object(
    'id',p.id,'protocol',p.protocol,'title',p.title,'platform',p.platform,
    'platform_label',p.platform_label,'account_name',p.account_name,
    'scheduled_for',p.scheduled_for,'status',p.status,'is_full',p.is_full,
    'notes',p.notes,'created_by',p.created_by,'created_by_name',creator.full_name,
    'updated_by',p.updated_by,'updated_by_name',updater.full_name,
    'archived_at',p.archived_at,'created_at',p.created_at,'updated_at',p.updated_at,
    'item_count',count(i.id),
    'completed_count',count(i.id) filter(where i.completed),
    'total_units',coalesce(sum(i.listing_units::bigint*i.volume_quantity::bigint),0),
    'total_kits',coalesce(sum(i.volume_quantity) filter(where i.volume_type='kit'),0),
    'total_boxes',coalesce(sum(i.volume_quantity) filter(where i.volume_type='box'),0),
    'items',coalesce(jsonb_agg(
      jsonb_build_object(
        'id',i.id,'model_id',i.model_id,'item_kind',i.item_kind,
        'kit_template_id',i.kit_template_id,
        'product_name',case when i.item_kind='kit' then k.name else coalesce(m.name,i.exclusive_name) end,
        'image_path',case when i.item_kind='kit' then coalesce(k.image_path,first_component.image_path) else coalesce(m.image_path,i.exclusive_image_path) end,
        'image_bucket',case when i.item_kind='exclusive' or (i.item_kind='kit' and k.image_path is not null)
          then 'shipping-planning-images' else 'product-images' end,
        'exclusive',(i.item_kind='exclusive'),
        'color_id',i.color_id,'color_combination_id',i.color_combination_id,
        'color_name',case when i.item_kind='kit' then 'Composicao do kit' else coalesce(sc.name,c.name) end,
        'color_hex',case when i.item_kind='kit' then coalesce(component_colors.hexes,upper(c.hex_code))
          else coalesce(combination_colors.hexes,upper(c.hex_code)) end,
        'listing_units',i.listing_units,'volume_quantity',i.volume_quantity,
        'volume_type',i.volume_type,
        'total_units',(i.listing_units::bigint*i.volume_quantity::bigint),
        'notes',i.notes,'completed',i.completed,'completed_at',i.completed_at,
        'completed_by_name',completed_by.full_name,'position',i.position,
        'components',coalesce(components.items,'[]'::jsonb),
        'inventory_request',latest_request.request
      ) order by i.position,i.created_at
    ) filter(where i.id is not null),'[]'::jsonb)
  )
  from public.shipping_plans p
  join public.profiles creator on creator.id=p.created_by
  join public.profiles updater on updater.id=p.updated_by
  left join public.shipping_plan_items i on i.plan_id=p.id
  left join public.finished_product_models m on m.id=i.model_id
  left join public.finished_production_colors c on c.id=i.color_id
  left join public.shipping_kit_templates k on k.id=i.kit_template_id
  left join public.shipping_color_combinations sc on sc.id=i.color_combination_id
  left join public.profiles completed_by on completed_by.id=i.completed_by
  left join lateral(
    select fm.image_path
    from public.shipping_plan_item_components pc
    join public.finished_product_models fm on fm.id=pc.model_id
    where pc.plan_item_id=i.id order by pc.position limit 1
  ) first_component on true
  left join lateral(
    select string_agg(upper(fc.hex_code),'|' order by pc.position) as hexes
    from public.shipping_plan_item_components pc
    join public.finished_production_colors fc on fc.id=pc.color_id
    where pc.plan_item_id=i.id
  ) component_colors on true
  left join lateral(
    select string_agg(upper(fc.hex_code),'|' order by ci.position) as hexes
    from public.shipping_color_combination_items ci
    join public.finished_production_colors fc on fc.id=ci.color_id
    where ci.combination_id=i.color_combination_id
  ) combination_colors on true
  left join lateral(
    select jsonb_agg(jsonb_build_object(
      'id',pc.id,'model_id',pc.model_id,'model_name',fm.name,
      'image_path',fm.image_path,'color_id',pc.color_id,'color_name',fc.name,
      'color_hex',upper(fc.hex_code),'units_per_volume',pc.units_per_volume,
      'required_quantity',(pc.units_per_volume::bigint*i.volume_quantity::bigint),
      'position',pc.position
    ) order by pc.position) as items
    from public.shipping_plan_item_components pc
    join public.finished_product_models fm on fm.id=pc.model_id
    join public.finished_production_colors fc on fc.id=pc.color_id
    where pc.plan_item_id=i.id
  ) components on true
  left join lateral(
    select jsonb_build_object(
      'id',r.id,'protocol',r.protocol,'status',r.status,'requested_at',r.requested_at,
      'transferred_at',r.transferred_at,'cancelled_at',r.cancelled_at,
      'box_count',count(rb.id) filter(where rb.released_at is null),
      'selected_quantity',coalesce(sum(rb.box_quantity) filter(where rb.released_at is null),0)
    ) as request
    from public.shipping_inventory_requests r
    left join public.shipping_inventory_request_boxes rb on rb.request_id=r.id
    where r.plan_item_id=i.id
    group by r.id
    order by r.requested_at desc limit 1
  ) latest_request on true
  where p_status is null or p.status=p_status
  group by p.id,creator.full_name,updater.full_name
  order by case p.status when 'upcoming' then 1 when 'preparing' then 2 when 'checking' then 3 when 'ready' then 4 when 'archived' then 5 else 6 end,
    p.scheduled_for,p.created_at desc;
end;
$$;

create or replace function public.list_shipping_inventory_options(p_plan_item_id uuid)
returns table(component jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  perform 1
  from public.shipping_plan_items i join public.shipping_plans p on p.id=i.plan_id
  where i.id=p_plan_item_id and p.is_full and p.status not in ('archived','cancelled');
  if not found then raise exception 'A solicitacao ao Inventario exige um plano FULL ativo.' using errcode='23514'; end if;

  return query
  select jsonb_build_object(
    'id',pc.id,'model_id',pc.model_id,'model_name',m.name,'image_path',m.image_path,
    'color_id',pc.color_id,'color_name',c.name,'color_hex',upper(c.hex_code),
    'units_per_volume',pc.units_per_volume,
    'required_quantity',(pc.units_per_volume::bigint*i.volume_quantity::bigint),
    'boxes',coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'box_number',e.box_number,'box_code','CX-'||lpad(e.box_number::text,6,'0'),
      'quantity',e.current_quantity,'entry_on',e.entry_on,
      'location',e.box_reference
    ) order by e.box_number desc) filter(where e.id is not null),'[]'::jsonb)
  )
  from public.shipping_plan_item_components pc
  join public.shipping_plan_items i on i.id=pc.plan_item_id
  join public.finished_product_models m on m.id=pc.model_id
  join public.finished_production_colors c on c.id=pc.color_id
  left join public.production_inventory_entries e
    on e.model_id=pc.model_id and e.color_id=pc.color_id
    and e.label_status='applied' and e.current_quantity>0 and e.transferred_at is null
    and not exists(
      select 1 from public.shipping_inventory_request_boxes rb
      join public.shipping_inventory_requests r on r.id=rb.request_id
      where rb.inventory_entry_id=e.id and rb.released_at is null and r.status='reserved'
    )
  where pc.plan_item_id=p_plan_item_id
  group by pc.id,m.id,c.id,i.volume_quantity
  order by pc.position;
end;
$$;

create or replace function public.reserve_shipping_inventory_boxes(
  p_plan_item_id uuid,
  p_selections jsonb,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan_id uuid;
  v_request_id uuid;
  v_selection jsonb;
  v_component public.shipping_plan_item_components%rowtype;
  v_box_id uuid;
  v_entry public.production_inventory_entries%rowtype;
  v_count integer:=0;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  if jsonb_typeof(p_selections)<>'array' then raise exception 'Selecao de caixas invalida.'; end if;
  if char_length(coalesce(p_notes,''))>1200 then raise exception 'Observacao muito longa.'; end if;
  select p.id into v_plan_id
  from public.shipping_plan_items i join public.shipping_plans p on p.id=i.plan_id
  where i.id=p_plan_item_id and p.is_full and p.status not in ('archived','cancelled')
  for update of i,p;
  if v_plan_id is null then raise exception 'O item precisa pertencer a um plano FULL ativo.' using errcode='23514'; end if;
  if not exists(select 1 from public.shipping_plan_item_components where plan_item_id=p_plan_item_id) then
    raise exception 'Este item nao possui composicao exata de modelo e cor para consultar o Inventario.' using errcode='23514';
  end if;

  insert into public.shipping_inventory_requests(plan_id,plan_item_id,notes,requested_by)
  values(v_plan_id,p_plan_item_id,nullif(trim(coalesce(p_notes,'')),''),v_actor)
  returning id into v_request_id;

  for v_selection in select value from jsonb_array_elements(p_selections)
  loop
    select * into v_component
    from public.shipping_plan_item_components
    where id=nullif(v_selection->>'component_id','')::uuid and plan_item_id=p_plan_item_id;
    if not found then raise exception 'Um componente selecionado nao pertence a este item.'; end if;
    if jsonb_typeof(v_selection->'box_ids')<>'array' then raise exception 'Selecao de caixas invalida.'; end if;
    for v_box_id in
      select value::uuid from jsonb_array_elements_text(v_selection->'box_ids') as selected(value)
    loop
      select * into v_entry
      from public.production_inventory_entries
      where id=v_box_id for update;
      if not found or v_entry.model_id<>v_component.model_id or v_entry.color_id<>v_component.color_id then
        raise exception 'Uma caixa nao corresponde ao modelo e a cor do componente.' using errcode='23514';
      end if;
      if v_entry.label_status<>'applied' or v_entry.current_quantity<=0 or v_entry.transferred_at is not null then
        raise exception 'Uma caixa selecionada nao esta disponivel.' using errcode='23514';
      end if;
      if exists(
        select 1 from public.shipping_inventory_request_boxes rb
        where rb.inventory_entry_id=v_box_id and rb.released_at is null
      ) then raise exception 'Uma caixa selecionada ja esta reservada para outro envio.' using errcode='23505'; end if;
      insert into public.shipping_inventory_request_boxes(
        request_id,component_id,inventory_entry_id,box_quantity,created_by
      ) values(v_request_id,v_component.id,v_box_id,v_entry.current_quantity,v_actor);
      v_count:=v_count+1;
    end loop;
  end loop;
  if v_count=0 then raise exception 'Selecione pelo menos uma caixa do Inventario.'; end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_inventory.request_reserved','shipping_inventory_request',v_request_id::text,'database',
    jsonb_build_object('plan_id',v_plan_id,'plan_item_id',p_plan_item_id,'box_count',v_count));
  return v_request_id;
exception when unique_violation then
  raise exception 'Este item ja possui uma reserva ativa ou uma das caixas acabou de ser reservada.' using errcode='23505';
end;
$$;

create or replace function public.list_shipping_inventory_requests(p_status text default null)
returns table(request jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (select private.can_access_shipping_inventory_requests()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_status is not null and p_status not in ('reserved','transferred','cancelled') then
    raise exception 'Filtro de solicitacao invalido.';
  end if;
  return query
  select jsonb_build_object(
    'id',r.id,'protocol',r.protocol,'status',r.status,'notes',r.notes,
    'plan_id',r.plan_id,'plan_protocol',p.protocol,'plan_title',p.title,
    'plan_item_id',r.plan_item_id,'item_name',case when i.item_kind='kit' then k.name else coalesce(m.name,i.exclusive_name) end,
    'item_kind',i.item_kind,'platform',p.platform,'is_full',p.is_full,
    'requested_by_name',requester.full_name,'requested_at',r.requested_at,
    'transferred_by_name',transferred.full_name,'transferred_at',r.transferred_at,
    'cancelled_by_name',cancelled.full_name,'cancelled_at',r.cancelled_at,
    'cancel_reason',r.cancel_reason,
    'components',coalesce((
      select jsonb_agg(component_row order by component_position)
      from(
        select pc.position as component_position,jsonb_build_object(
          'id',pc.id,'model_name',fm.name,'image_path',fm.image_path,
          'color_name',fc.name,'color_hex',upper(fc.hex_code),
          'required_quantity',(pc.units_per_volume::bigint*i.volume_quantity::bigint),
          'selected_quantity',coalesce(sum(rb.box_quantity) filter(where rb.released_at is null),0),
          'boxes',coalesce(jsonb_agg(jsonb_build_object(
            'id',e.id,'box_code','CX-'||lpad(e.box_number::text,6,'0'),
            'quantity',rb.box_quantity,'location',e.box_reference,'entry_on',e.entry_on,
            'transferred_at',rb.transferred_at
          ) order by e.box_number desc) filter(where rb.id is not null and rb.released_at is null),'[]'::jsonb)
        ) as component_row
        from public.shipping_plan_item_components pc
        join public.finished_product_models fm on fm.id=pc.model_id
        join public.finished_production_colors fc on fc.id=pc.color_id
        left join public.shipping_inventory_request_boxes rb on rb.component_id=pc.id and rb.request_id=r.id
        left join public.production_inventory_entries e on e.id=rb.inventory_entry_id
        where pc.plan_item_id=r.plan_item_id
        group by pc.id,fm.id,fc.id,i.volume_quantity
      ) grouped_components
    ),'[]'::jsonb)
  )
  from public.shipping_inventory_requests r
  join public.shipping_plans p on p.id=r.plan_id
  join public.shipping_plan_items i on i.id=r.plan_item_id
  left join public.shipping_kit_templates k on k.id=i.kit_template_id
  left join public.finished_product_models m on m.id=i.model_id
  join public.profiles requester on requester.id=r.requested_by
  left join public.profiles transferred on transferred.id=r.transferred_by
  left join public.profiles cancelled on cancelled.id=r.cancelled_by
  where p_status is null or r.status=p_status
  order by case r.status when 'reserved' then 1 when 'transferred' then 2 else 3 end,r.requested_at desc;
end;
$$;

create or replace function public.cancel_shipping_inventory_request(
  p_request_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_status text;
begin
  if not (select private.can_access_shipping_inventory_requests()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then
    raise exception 'Informe o motivo do cancelamento.';
  end if;
  select status into v_status from public.shipping_inventory_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitacao nao localizada.' using errcode='P0002'; end if;
  if v_status<>'reserved' then raise exception 'Somente uma reserva pendente pode ser cancelada.' using errcode='23514'; end if;
  update public.shipping_inventory_request_boxes
  set released_at=now(),released_by=v_actor,release_reason=trim(p_reason)
  where request_id=p_request_id and released_at is null;
  update public.shipping_inventory_requests
  set status='cancelled',cancelled_at=now(),cancelled_by=v_actor,cancel_reason=trim(p_reason)
  where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_inventory.request_cancelled','shipping_inventory_request',p_request_id::text,'database',
    jsonb_build_object('reason',trim(p_reason)));
end;
$$;

create or replace function private.protect_reserved_inventory_box()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_request_id uuid;v_context text;
begin
  if new.current_quantity is distinct from old.current_quantity then
    select rb.request_id into v_request_id
    from public.shipping_inventory_request_boxes rb
    join public.shipping_inventory_requests r on r.id=rb.request_id
    where rb.inventory_entry_id=old.id and rb.released_at is null and r.status='reserved'
    limit 1;
    if v_request_id is not null then
      v_context:=nullif(current_setting('app.shipping_inventory_request_id',true),'');
      if v_context is null or v_context::uuid<>v_request_id then
        raise exception 'Caixa reservada para um Planejamento de envio. Cancele ou confirme a solicitacao antes de movimenta-la.' using errcode='23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists production_inventory_entries_protect_shipping_reservation on public.production_inventory_entries;
create trigger production_inventory_entries_protect_shipping_reservation
before update of current_quantity on public.production_inventory_entries
for each row execute function private.protect_reserved_inventory_box();

create or replace function public.confirm_shipping_inventory_request_transfer(
  p_request_id uuid,
  p_occurred_on date,
  p_notes text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_request public.shipping_inventory_requests%rowtype;v_box record;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'A confirmacao exige perfil ADM ou Recebimento.' using errcode='42501';
  end if;
  if p_occurred_on is null or p_occurred_on>current_date then raise exception 'Informe uma data valida.'; end if;
  select * into v_request from public.shipping_inventory_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitacao nao localizada.' using errcode='P0002'; end if;
  if v_request.status<>'reserved' then raise exception 'Esta solicitacao nao esta pendente.' using errcode='23514'; end if;
  perform set_config('app.shipping_inventory_request_id',p_request_id::text,true);
  for v_box in
    select rb.id as reservation_box_id,rb.inventory_entry_id
    from public.shipping_inventory_request_boxes rb
    where rb.request_id=p_request_id and rb.released_at is null
    order by rb.created_at for update
  loop
    perform public.transfer_production_inventory_box_to_ecommerce(
      v_box.inventory_entry_id,p_occurred_on,
      concat('Planejamento de envio #',v_request.plan_id,'. ',coalesce(p_notes,''))
    );
    update public.shipping_inventory_request_boxes
    set transferred_at=now(),transferred_by=v_actor
    where id=v_box.reservation_box_id;
  end loop;
  perform set_config('app.shipping_inventory_request_id','',true);
  update public.shipping_inventory_requests
  set status='transferred',transferred_at=now(),transferred_by=v_actor
  where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_inventory.request_transferred','shipping_inventory_request',p_request_id::text,'database',
    jsonb_build_object('occurred_on',p_occurred_on,'plan_id',v_request.plan_id,'plan_item_id',v_request.plan_item_id));
end;
$$;

create or replace function private.release_shipping_reservations_on_plan_cancel()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=coalesce((select auth.uid()),new.updated_by);
begin
  if new.status='cancelled' and old.status is distinct from new.status then
    update public.shipping_inventory_request_boxes rb
    set released_at=now(),released_by=v_actor,release_reason='Plano de envio cancelado'
    from public.shipping_inventory_requests r
    where r.plan_id=new.id and r.status='reserved' and rb.request_id=r.id and rb.released_at is null;
    update public.shipping_inventory_requests
    set status='cancelled',cancelled_at=now(),cancelled_by=v_actor,
        cancel_reason=coalesce(new.cancel_reason,'Plano de envio cancelado')
    where plan_id=new.id and status='reserved';
  elsif new.status='archived' and exists(
    select 1 from public.shipping_inventory_requests where plan_id=new.id and status='reserved'
  ) then
    raise exception 'Conclua ou cancele a solicitacao ao Inventario antes de arquivar o plano.' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists shipping_plans_release_inventory_reservations on public.shipping_plans;
create trigger shipping_plans_release_inventory_reservations
before update of status on public.shipping_plans
for each row execute function private.release_shipping_reservations_on_plan_cancel();

-- A API de escrita antiga fica reservada ao servico para impedir edicoes que
-- contornem snapshots e reservas. O aplicativo usa exclusivamente a versao v2.
revoke all on function public.save_shipping_plan(uuid,text,text,text,text,timestamptz,boolean,text,jsonb) from authenticated;
revoke all on function public.save_shipping_plan_with_colors(uuid,text,text,text,text,timestamptz,boolean,text,jsonb) from authenticated;
grant execute on function public.save_shipping_plan(uuid,text,text,text,text,timestamptz,boolean,text,jsonb) to service_role;
grant execute on function public.save_shipping_plan_with_colors(uuid,text,text,text,text,timestamptz,boolean,text,jsonb) to service_role;

revoke all on function public.list_shipping_kit_templates() from public,anon,authenticated;
revoke all on function public.save_shipping_kit_template(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.archive_shipping_kit_template(uuid,text) from public,anon,authenticated;
revoke all on function public.save_shipping_plan_v2(uuid,text,text,text,text,timestamptz,boolean,text,jsonb) from public,anon,authenticated;
revoke all on function public.list_shipping_plans_v2(text) from public,anon,authenticated;
revoke all on function public.list_shipping_inventory_options(uuid) from public,anon,authenticated;
revoke all on function public.reserve_shipping_inventory_boxes(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.list_shipping_inventory_requests(text) from public,anon,authenticated;
revoke all on function public.cancel_shipping_inventory_request(uuid,text) from public,anon,authenticated;
revoke all on function public.confirm_shipping_inventory_request_transfer(uuid,date,text) from public,anon,authenticated;

grant execute on function public.list_shipping_kit_templates() to authenticated,service_role;
grant execute on function public.save_shipping_kit_template(uuid,text,text,jsonb) to authenticated,service_role;
grant execute on function public.archive_shipping_kit_template(uuid,text) to authenticated,service_role;
grant execute on function public.save_shipping_plan_v2(uuid,text,text,text,text,timestamptz,boolean,text,jsonb) to authenticated,service_role;
grant execute on function public.list_shipping_plans_v2(text) to authenticated,service_role;
grant execute on function public.list_shipping_inventory_options(uuid) to authenticated,service_role;
grant execute on function public.reserve_shipping_inventory_boxes(uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.list_shipping_inventory_requests(text) to authenticated,service_role;
grant execute on function public.cancel_shipping_inventory_request(uuid,text) to authenticated,service_role;
grant execute on function public.confirm_shipping_inventory_request_transfer(uuid,date,text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
