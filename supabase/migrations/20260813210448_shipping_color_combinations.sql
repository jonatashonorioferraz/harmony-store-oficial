begin;

-- Catálogo de combinações usado somente pelo Planejamento de envios.
-- As cores continuam vindo do cadastro oficial; este catálogo guarda apenas
-- agrupamentos ordenados de duas a quatro cores, sem duplicar o cadastro base.
create table if not exists public.shipping_color_combinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color_signature text not null,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_color_combinations_name_length check (char_length(trim(name)) between 5 and 300)
);

create table if not exists public.shipping_color_combination_items (
  id uuid primary key default gen_random_uuid(),
  combination_id uuid not null references public.shipping_color_combinations(id) on delete cascade,
  color_id uuid not null references public.finished_production_colors(id) on delete restrict,
  position smallint not null,
  created_at timestamptz not null default now(),
  constraint shipping_color_combination_items_position check (position between 1 and 4),
  constraint shipping_color_combination_items_position_unique unique (combination_id, position),
  constraint shipping_color_combination_items_color_unique unique (combination_id, color_id)
);

alter table public.shipping_plan_items
  add column if not exists color_combination_id uuid
  references public.shipping_color_combinations(id) on delete restrict;

create unique index if not exists shipping_color_combinations_active_name_uidx
  on public.shipping_color_combinations(lower(trim(name))) where active;
create unique index if not exists shipping_color_combinations_active_signature_uidx
  on public.shipping_color_combinations(color_signature) where active;
create index if not exists shipping_color_combinations_active_name_idx
  on public.shipping_color_combinations(active, lower(name));
create index if not exists shipping_color_combinations_created_by_idx
  on public.shipping_color_combinations(created_by);
create index if not exists shipping_color_combinations_updated_by_idx
  on public.shipping_color_combinations(updated_by);
create index if not exists shipping_color_combination_items_color_idx
  on public.shipping_color_combination_items(color_id);
create index if not exists shipping_plan_items_color_combination_idx
  on public.shipping_plan_items(color_combination_id)
  where color_combination_id is not null;

drop trigger if exists shipping_color_combinations_touch_updated_at on public.shipping_color_combinations;
create trigger shipping_color_combinations_touch_updated_at
before update on public.shipping_color_combinations
for each row execute function public.touch_updated_at();

alter table public.shipping_color_combinations enable row level security;
alter table public.shipping_color_combination_items enable row level security;

drop policy if exists "shipping color combinations: ecommerce manager" on public.shipping_color_combinations;
create policy "shipping color combinations: ecommerce manager"
on public.shipping_color_combinations for all to authenticated
using ((select private.can_manage_shipping_planning()))
with check ((select private.can_manage_shipping_planning()));

drop policy if exists "shipping color combination items: ecommerce manager" on public.shipping_color_combination_items;
create policy "shipping color combination items: ecommerce manager"
on public.shipping_color_combination_items for all to authenticated
using ((select private.can_manage_shipping_planning()))
with check ((select private.can_manage_shipping_planning()));

revoke all privileges on table public.shipping_color_combinations from public, anon, authenticated;
revoke all privileges on table public.shipping_color_combination_items from public, anon, authenticated;
grant all privileges on table public.shipping_color_combinations to service_role;
grant all privileges on table public.shipping_color_combination_items to service_role;

create or replace function public.list_shipping_color_combinations()
returns table(
  id uuid,
  name text,
  color_ids uuid[],
  color_names text[],
  color_hexes text[],
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  return query
  select sc.id,sc.name,
    array_agg(ci.color_id order by ci.position),
    array_agg(c.name order by ci.position),
    array_agg(upper(c.hex_code) order by ci.position),
    sc.created_at,sc.updated_at
  from public.shipping_color_combinations sc
  join public.shipping_color_combination_items ci on ci.combination_id=sc.id
  join public.finished_production_colors c on c.id=ci.color_id
  where sc.active
  group by sc.id,sc.name,sc.created_at,sc.updated_at
  having count(*) between 2 and 4
  order by lower(sc.name),sc.created_at;
end;
$$;

create or replace function public.save_shipping_color_combination(
  p_combination_id uuid,
  p_color_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_name text;
  v_signature text;
  v_count integer := coalesce(array_length(p_color_ids,1),0);
  v_distinct integer;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  if v_count not between 2 and 4 then
    raise exception 'Escolha entre 2 e 4 cores para o kit.';
  end if;
  select count(distinct value)::integer into v_distinct from unnest(p_color_ids) as value;
  if v_distinct<>v_count then raise exception 'Não repita a mesma cor na combinação.'; end if;
  if exists(
    select 1 from unnest(p_color_ids) as selected(color_id)
    left join public.finished_production_colors c on c.id=selected.color_id and c.active
    where c.id is null
  ) then raise exception 'Uma das cores não foi localizada ou está inativa.'; end if;

  select string_agg(c.name,' / ' order by selected.position)
  into v_name
  from unnest(p_color_ids) with ordinality as selected(color_id,position)
  join public.finished_production_colors c on c.id=selected.color_id;

  select string_agg(selected.color_id::text,',' order by selected.color_id::text)
  into v_signature
  from unnest(p_color_ids) as selected(color_id);

  if p_combination_id is null then
    select sc.id into v_id
    from public.shipping_color_combinations sc
    where sc.active and sc.color_signature=v_signature
    for update;
    if v_id is null then
      begin
        insert into public.shipping_color_combinations(name,color_signature,created_by,updated_by)
        values(v_name,v_signature,v_actor,v_actor) returning id into v_id;
      exception when unique_violation then
        select sc.id into v_id
        from public.shipping_color_combinations sc
        where sc.active and sc.color_signature=v_signature
        for update;
      end;
    else
      update public.shipping_color_combinations set updated_by=v_actor where id=v_id;
    end if;
  else
    update public.shipping_color_combinations
    set name=v_name,color_signature=v_signature,updated_by=v_actor
    where id=p_combination_id and active
    returning id into v_id;
    if v_id is null then raise exception 'Combinação de cores não localizada.' using errcode='P0002'; end if;
  end if;

  delete from public.shipping_color_combination_items where combination_id=v_id;
  insert into public.shipping_color_combination_items(combination_id,color_id,position)
  select v_id,selected.color_id,selected.position::smallint
  from unnest(p_color_ids) with ordinality as selected(color_id,position);

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_color_combination.saved','shipping_color_combination',v_id::text,'database',
    jsonb_build_object('name',v_name,'color_ids',to_jsonb(p_color_ids),'color_count',v_count));
  return v_id;
end;
$$;

-- Mantém a API original intacta e oferece uma versão compatível com combinações.
create or replace function public.list_shipping_plans_with_colors(
  p_status text default null
) returns table(
  id uuid, protocol bigint, title text, platform text, platform_label text,
  account_name text, scheduled_for timestamptz, status text, is_full boolean,
  notes text, created_by uuid, created_by_name text, updated_by uuid,
  updated_by_name text, archived_at timestamptz, created_at timestamptz,
  updated_at timestamptz, item_count bigint, completed_count bigint,
  total_units bigint, total_kits bigint, total_boxes bigint, item_id uuid,
  model_id uuid, product_name text, image_path text, image_bucket text,
  exclusive boolean, color_id uuid, color_combination_id uuid,
  color_name text, color_hex text,
  listing_units integer, volume_quantity integer, volume_type text,
  item_total_units bigint, item_notes text, item_completed boolean,
  item_completed_at timestamptz, item_completed_by_name text, item_position integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  return query
  select p.id,p.protocol,p.title,p.platform,p.platform_label,p.account_name,
    p.scheduled_for,p.status,p.is_full,p.notes,p.created_by,p.created_by_name,
    p.updated_by,p.updated_by_name,p.archived_at,p.created_at,p.updated_at,
    p.item_count,p.completed_count,p.total_units,p.total_kits,p.total_boxes,
    p.item_id,p.model_id,p.product_name,p.image_path,p.image_bucket,p.exclusive,
    p.color_id,i.color_combination_id,coalesce(sc.name,p.color_name),
    coalesce((
      select string_agg(upper(c.hex_code),'|' order by ci.position)
      from public.shipping_color_combination_items ci
      join public.finished_production_colors c on c.id=ci.color_id
      where ci.combination_id=i.color_combination_id
    ),p.color_hex),
    p.listing_units,p.volume_quantity,p.volume_type,p.item_total_units,
    p.item_notes,p.item_completed,p.item_completed_at,p.item_completed_by_name,p.item_position
  from public.list_shipping_plans(p_status) p
  left join public.shipping_plan_items i on i.id=p.item_id
  left join public.shipping_color_combinations sc on sc.id=i.color_combination_id;
end;
$$;

create or replace function public.save_shipping_plan_with_colors(
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
  v_plan_id uuid;
  v_item jsonb;
  v_normalized jsonb := '[]'::jsonb;
  v_combination_id uuid;
  v_primary_color uuid;
  v_matches integer;
  v_item_id uuid;
  v_position integer := 0;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  if jsonb_typeof(p_items)<>'array' then raise exception 'Lista de produtos inválida.'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_combination_id:=nullif(v_item->>'color_combination_id','')::uuid;
    if v_combination_id is not null then
      select ci.color_id into v_primary_color
      from public.shipping_color_combinations sc
      join public.shipping_color_combination_items ci on ci.combination_id=sc.id
      where sc.id=v_combination_id and sc.active
      order by ci.position limit 1;
      if v_primary_color is null then raise exception 'Combinação de cores não localizada.'; end if;
      v_item:=jsonb_set(v_item,'{color_id}',to_jsonb(v_primary_color::text),true);
    end if;
    v_normalized:=v_normalized||jsonb_build_array(v_item);
  end loop;

  v_plan_id:=public.save_shipping_plan(p_plan_id,p_title,p_platform,p_platform_label,
    p_account_name,p_scheduled_for,p_is_full,p_notes,v_normalized);

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position:=v_position+1;
    v_combination_id:=nullif(v_item->>'color_combination_id','')::uuid;
    v_item_id:=nullif(v_item->>'id','')::uuid;
    update public.shipping_plan_items
    set color_combination_id=v_combination_id
    where plan_id=v_plan_id
      and ((v_item_id is not null and id=v_item_id) or (v_item_id is null and position=v_position));
    get diagnostics v_matches = row_count;
    if v_matches<>1 then
      raise exception 'Não foi possível vincular a combinação ao produto % do plano.',v_position;
    end if;
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_plan.color_combinations_saved','shipping_plan',v_plan_id::text,'database',
    jsonb_build_object('items',jsonb_array_length(p_items)));
  return v_plan_id;
end;
$$;

-- Alterar uma combinação reabre a conferência do item, como qualquer outro dado operacional.
create or replace function private.reopen_shipping_plan_item_on_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.model_id is distinct from new.model_id
    or old.exclusive_name is distinct from new.exclusive_name
    or old.exclusive_image_path is distinct from new.exclusive_image_path
    or old.color_id is distinct from new.color_id
    or old.color_combination_id is distinct from new.color_combination_id
    or old.listing_units is distinct from new.listing_units
    or old.volume_quantity is distinct from new.volume_quantity
    or old.volume_type is distinct from new.volume_type
    or old.notes is distinct from new.notes
  then
    new.completed:=false; new.completed_at:=null; new.completed_by:=null;
  end if;
  return new;
end;
$$;

revoke all on function public.list_shipping_color_combinations() from public, anon, authenticated;
revoke all on function public.save_shipping_color_combination(uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.list_shipping_plans_with_colors(text) from public, anon, authenticated;
revoke all on function public.save_shipping_plan_with_colors(uuid,text,text,text,text,timestamptz,boolean,text,jsonb) from public, anon, authenticated;
grant execute on function public.list_shipping_color_combinations() to authenticated, service_role;
grant execute on function public.save_shipping_color_combination(uuid,uuid[]) to authenticated, service_role;
grant execute on function public.list_shipping_plans_with_colors(text) to authenticated, service_role;
grant execute on function public.save_shipping_plan_with_colors(uuid,text,text,text,text,timestamptz,boolean,text,jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
