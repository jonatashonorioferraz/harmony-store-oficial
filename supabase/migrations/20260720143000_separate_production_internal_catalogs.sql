-- Harmony Store Oficial — separação definitiva dos catálogos e fotos de suprimentos.
-- Mantém os IDs e históricos existentes; impede vínculos cruzados no banco.

begin;

do $$
begin
  if exists (
    select 1
    from public.products p
    join public.request_items ri on ri.product_id = p.id
    join public.internal_supply_request_items ii on ii.product_id = p.id
  ) then
    raise exception 'Existem produtos vinculados simultaneamente aos catálogos de produção e interno.';
  end if;
end
$$;

update public.products p
set usage_scope = 'internal', hidden_from_collaborators = true
where exists (
  select 1 from public.internal_supply_request_items i where i.product_id = p.id
)
and not exists (
  select 1 from public.request_items i where i.product_id = p.id
);

update public.products p
set usage_scope = 'production'
where exists (
  select 1 from public.request_items i where i.product_id = p.id
)
and not exists (
  select 1 from public.internal_supply_request_items i where i.product_id = p.id
);

create or replace function private.enforce_production_request_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.products
    where id = new.product_id and usage_scope = 'production'
  ) then
    raise exception 'A solicitação de matéria-prima aceita somente produtos do catálogo de produção.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_internal_supply_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.products
    where id = new.product_id and usage_scope = 'internal'
  ) then
    raise exception 'A operação interna aceita somente produtos do catálogo de suprimentos.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_production_request_product on public.request_items;
create trigger enforce_production_request_product
before insert or update of product_id on public.request_items
for each row execute function private.enforce_production_request_product();

drop trigger if exists enforce_internal_request_product on public.internal_supply_request_items;
create trigger enforce_internal_request_product
before insert or update of product_id on public.internal_supply_request_items
for each row execute function private.enforce_internal_supply_product();

drop trigger if exists enforce_internal_receipt_product on public.internal_purchase_receipt_items;
create trigger enforce_internal_receipt_product
before insert or update of product_id on public.internal_purchase_receipt_items
for each row execute function private.enforce_internal_supply_product();

create or replace function public.admin_save_internal_supply_product_v2(
  p_product_id uuid,
  p_name text,
  p_unit text,
  p_description text,
  p_minimum_stock numeric,
  p_physical_stock numeric,
  p_supplier_id uuid default null,
  p_active boolean default true,
  p_image_path text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_actor uuid := (select auth.uid());
  v_before_image text;
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if p_product_id is not null then
    select image_path into v_before_image
    from public.products
    where id = p_product_id and usage_scope = 'internal'
    for update;
  end if;

  if p_image_path is not null
    and p_image_path is distinct from v_before_image
    and (
      length(p_image_path) > 500
      or p_image_path like '%..%'
      or p_image_path not like v_actor::text || '/%'
    ) then
    raise exception 'Caminho da foto inválido.' using errcode = '22023';
  end if;

  v_id := public.admin_save_internal_supply_product(
    p_product_id,
    p_name,
    p_unit,
    p_description,
    p_minimum_stock,
    p_physical_stock,
    p_supplier_id,
    p_active
  );

  update public.products
  set image_path = nullif(trim(p_image_path), ''),
      usage_scope = 'internal',
      hidden_from_collaborators = true
  where id = v_id;

  if v_before_image is distinct from nullif(trim(p_image_path), '') then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, origin, details)
    values (
      v_actor,
      'internal_supply.product_photo_updated',
      'product',
      v_id::text,
      'database',
      jsonb_build_object(
        'before', v_before_image,
        'after', nullif(trim(p_image_path), '')
      )
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_save_internal_supply_product_v2(uuid,text,text,text,numeric,numeric,uuid,boolean,text)
  from public, anon;
grant execute on function public.admin_save_internal_supply_product_v2(uuid,text,text,text,numeric,numeric,uuid,boolean,text)
  to authenticated;

comment on function public.admin_save_internal_supply_product_v2(uuid,text,text,text,numeric,numeric,uuid,boolean,text)
  is 'Cria ou edita suprimento interno, incluindo foto, com validação administrativa e auditoria.';

notify pgrst, 'reload schema';

commit;
