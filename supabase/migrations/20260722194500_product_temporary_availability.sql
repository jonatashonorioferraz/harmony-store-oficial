-- Harmony Store Oficial — disponibilidade temporária de matérias-primas.
-- Mantém o produto visível no catálogo, mas impede novas solicitações enquanto indisponível.

begin;

alter table public.products
  add column if not exists availability_status text not null default 'available',
  add column if not exists availability_reason text,
  add column if not exists availability_expected_on date;

alter table public.products
  drop constraint if exists products_availability_status_check;

alter table public.products
  add constraint products_availability_status_check
  check (availability_status in ('available', 'supplier_unavailable', 'awaiting_restock', 'temporarily_paused'));

comment on column public.products.availability_status is
  'Controla se o produto pode ser incluído ou aumentado em uma nova solicitação de matéria-prima.';
comment on column public.products.availability_reason is
  'Motivo exibido aos perfis solicitantes quando o produto está temporariamente indisponível.';
comment on column public.products.availability_expected_on is
  'Previsão opcional de retorno do produto ao catálogo solicitável.';

create or replace function public.admin_save_product_v3(
  p_product_id uuid,
  p_product jsonb,
  p_supplier_id uuid default null,
  p_custom_values jsonb default '[]'::jsonb,
  p_manage_supplier boolean default true,
  p_hidden_from_collaborators boolean default false,
  p_availability_status text default 'available',
  p_availability_reason text default null,
  p_availability_expected_on date default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_before jsonb;
  v_status text := coalesce(nullif(trim(p_availability_status), ''), 'available');
  v_reason text := nullif(trim(p_availability_reason), '');
  v_after jsonb;
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if v_status not in ('available', 'supplier_unavailable', 'awaiting_restock', 'temporarily_paused') then
    raise exception 'Situação de disponibilidade inválida.' using errcode = '22023';
  end if;

  if v_status <> 'available' and v_reason is null then
    raise exception 'Informe o motivo da indisponibilidade.' using errcode = '22023';
  end if;

  if v_status = 'available' then
    v_reason := null;
    p_availability_expected_on := null;
  end if;

  if p_product_id is not null then
    select jsonb_build_object(
      'status', availability_status,
      'reason', availability_reason,
      'expected_on', availability_expected_on
    ) into v_before
    from public.products
    where id = p_product_id
    for update;
  end if;

  v_id := public.admin_save_product_v2(
    p_product_id,
    p_product,
    p_supplier_id,
    p_custom_values,
    p_manage_supplier,
    p_hidden_from_collaborators
  );

  update public.products
  set availability_status = v_status,
      availability_reason = v_reason,
      availability_expected_on = p_availability_expected_on
  where id = v_id;

  v_after := jsonb_build_object(
    'status', v_status,
    'reason', v_reason,
    'expected_on', p_availability_expected_on
  );

  if v_before is distinct from v_after then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, origin, details)
    values (
      v_actor,
      'product.availability_updated',
      'product',
      v_id::text,
      'database',
      jsonb_build_object('before', v_before, 'after', v_after)
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_save_product_v3(uuid,jsonb,uuid,jsonb,boolean,boolean,text,text,date)
  from public, anon;
grant execute on function public.admin_save_product_v3(uuid,jsonb,uuid,jsonb,boolean,boolean,text,text,date)
  to authenticated;

create or replace function private.enforce_production_request_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_requires_availability boolean;
begin
  select * into v_product
  from public.products
  where id = new.product_id;

  if not found or v_product.usage_scope <> 'production' then
    raise exception 'A solicitação de matéria-prima aceita somente produtos do catálogo de produção.'
      using errcode = '23514';
  end if;

  v_requires_availability := tg_op = 'INSERT'
    or new.product_id is distinct from old.product_id
    or new.requested_quantity > old.requested_quantity;

  if v_requires_availability
     and not (select private.is_admin())
     and (not v_product.active or v_product.availability_status <> 'available') then
    raise exception 'O produto "%" está temporariamente indisponível e não pode ser solicitado agora.', v_product.name
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_production_request_product on public.request_items;
create trigger enforce_production_request_product
before insert or update of product_id, requested_quantity on public.request_items
for each row execute function private.enforce_production_request_product();

notify pgrst, 'reload schema';

commit;
