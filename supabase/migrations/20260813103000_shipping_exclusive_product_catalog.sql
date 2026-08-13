begin;

-- Catálogo interno reutilizável do Planejamento de envios.
-- Ele não possui vínculo com finished_product_models e, portanto, nunca aparece
-- nos catálogos oficiais de Produção, Solicitações ou Inventário.
create table if not exists public.shipping_exclusive_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_path text,
  default_color_id uuid references public.finished_production_colors(id) on delete set null,
  default_listing_units integer not null default 100,
  default_volume_type text not null default 'kit',
  default_notes text,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_exclusive_products_name_length check (char_length(trim(name)) between 2 and 140),
  constraint shipping_exclusive_products_image_path_length check (char_length(coalesce(image_path,'')) <= 500),
  constraint shipping_exclusive_products_listing_units_check check (default_listing_units between 1 and 1000000),
  constraint shipping_exclusive_products_volume_type_check check (default_volume_type in ('kit','box')),
  constraint shipping_exclusive_products_notes_length check (char_length(coalesce(default_notes,'')) <= 500)
);

create unique index if not exists shipping_exclusive_products_name_active_uidx
  on public.shipping_exclusive_products(lower(trim(name))) where active;
create index if not exists shipping_exclusive_products_active_name_idx
  on public.shipping_exclusive_products(active, lower(name));
create index if not exists shipping_exclusive_products_default_color_idx
  on public.shipping_exclusive_products(default_color_id) where default_color_id is not null;
create index if not exists shipping_exclusive_products_created_by_idx
  on public.shipping_exclusive_products(created_by);
create index if not exists shipping_exclusive_products_updated_by_idx
  on public.shipping_exclusive_products(updated_by);

drop trigger if exists shipping_exclusive_products_touch_updated_at on public.shipping_exclusive_products;
create trigger shipping_exclusive_products_touch_updated_at
before update on public.shipping_exclusive_products
for each row execute function public.touch_updated_at();

alter table public.shipping_exclusive_products enable row level security;

drop policy if exists "shipping exclusive products: ecommerce manager" on public.shipping_exclusive_products;
create policy "shipping exclusive products: ecommerce manager"
on public.shipping_exclusive_products for all to authenticated
using ((select private.can_manage_shipping_planning()))
with check ((select private.can_manage_shipping_planning()));

revoke all privileges on table public.shipping_exclusive_products from public, anon, authenticated;
grant all privileges on table public.shipping_exclusive_products to service_role;

create or replace function public.list_shipping_exclusive_products()
returns table(
  id uuid,
  name text,
  image_path text,
  default_color_id uuid,
  default_listing_units integer,
  default_volume_type text,
  default_notes text,
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
  select p.id,p.name,p.image_path,p.default_color_id,p.default_listing_units,p.default_volume_type,
    p.default_notes,p.created_at,p.updated_at
  from public.shipping_exclusive_products p
  where p.active
  order by lower(p.name),p.created_at;
end;
$$;

create or replace function public.save_shipping_exclusive_product(
  p_product_id uuid,
  p_name text,
  p_image_path text,
  p_default_color_id uuid,
  p_default_listing_units integer,
  p_default_volume_type text,
  p_default_notes text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_name text := trim(coalesce(p_name,''));
  v_image text := nullif(trim(coalesce(p_image_path,'')),'');
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  if char_length(v_name) not between 2 and 140 then raise exception 'Informe o nome do produto exclusivo.'; end if;
  if coalesce(p_default_listing_units,0) not between 1 and 1000000 then raise exception 'Informe uma quantidade válida por anúncio.'; end if;
  if p_default_volume_type not in ('kit','box') then raise exception 'Escolha Caixa ou Kit.'; end if;
  if char_length(coalesce(p_default_notes,''))>500 then raise exception 'A observação deve ter no máximo 500 caracteres.'; end if;
  if p_default_color_id is not null and not exists(
    select 1 from public.finished_production_colors c where c.id=p_default_color_id and c.active
  ) then raise exception 'A cor selecionada não foi localizada.'; end if;
  if v_image is not null and (
    char_length(v_image)>500 or v_image like '%..%' or v_image like '/%'
    or (
      split_part(v_image,'/',1)<>v_actor::text
      and not exists(
        select 1 from public.shipping_exclusive_products p
        where p.id=p_product_id and p.active and p.image_path=v_image
      )
    )
  ) then raise exception 'Caminho de imagem inválido.'; end if;

  if p_product_id is null then
    select p.id into v_id from public.shipping_exclusive_products p
    where p.active and lower(trim(p.name))=lower(v_name) for update;
    if found then
      update public.shipping_exclusive_products set
        image_path=coalesce(v_image,image_path),
        default_color_id=coalesce(p_default_color_id,default_color_id),
        default_listing_units=p_default_listing_units,
        default_volume_type=p_default_volume_type,
        default_notes=nullif(trim(coalesce(p_default_notes,'')),''),updated_by=v_actor
      where id=v_id;
    else
      insert into public.shipping_exclusive_products(
        name,image_path,default_color_id,default_listing_units,default_volume_type,default_notes,created_by,updated_by
      ) values(
        v_name,v_image,p_default_color_id,p_default_listing_units,p_default_volume_type,
        nullif(trim(coalesce(p_default_notes,'')),''),v_actor,v_actor
      ) returning id into v_id;
    end if;
  else
    update public.shipping_exclusive_products set
      name=v_name,image_path=v_image,default_color_id=p_default_color_id,
      default_listing_units=p_default_listing_units,default_volume_type=p_default_volume_type,
      default_notes=nullif(trim(coalesce(p_default_notes,'')),''),updated_by=v_actor
    where id=p_product_id and active returning id into v_id;
    if v_id is null then raise exception 'Produto exclusivo não localizado.' using errcode='P0002'; end if;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_exclusive_product.saved','shipping_exclusive_product',v_id::text,'database',
    jsonb_build_object('name',v_name,'listing_units',p_default_listing_units,'volume_type',p_default_volume_type));
  return v_id;
end;
$$;

revoke all on function public.list_shipping_exclusive_products() from public, anon, authenticated;
revoke all on function public.save_shipping_exclusive_product(uuid,text,text,uuid,integer,text,text) from public, anon, authenticated;
grant execute on function public.list_shipping_exclusive_products() to authenticated, service_role;
grant execute on function public.save_shipping_exclusive_product(uuid,text,text,uuid,integer,text,text) to authenticated, service_role;

-- Permite que gerente e ADM principal reutilizem a foto de um produto do
-- catálogo interno. Qualquer outro caminho continua limitado à pasta do ator.
do $$
declare
  v_definition text;
  v_old text := 'or split_part(v_image_path,''/'',1)<>v_actor::text';
  v_new text := 'or (split_part(v_image_path,''/'',1)<>v_actor::text and not exists(select 1 from public.shipping_exclusive_products ep where ep.active and ep.image_path=v_image_path))';
begin
  select pg_get_functiondef('public.save_shipping_plan(uuid,text,text,text,text,timestamptz,boolean,text,jsonb)'::regprocedure)
  into v_definition;
  if position(v_old in v_definition)=0 then
    raise exception 'Validação de imagem do plano não localizada para atualização segura.';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$$;

notify pgrst, 'reload schema';
commit;
