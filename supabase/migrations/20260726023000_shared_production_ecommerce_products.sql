-- Harmony Store Oficial — produtos compartilhados entre produção e e-commerce.
-- Mantém um único cadastro e estoque, ampliando apenas os catálogos autorizados.

begin;

alter table public.products
  drop constraint if exists products_usage_scope_check;
alter table public.products
  add constraint products_usage_scope_check
  check (usage_scope in ('production','ecommerce','shared','internal'));

comment on column public.products.usage_scope is
  'Finalidade operacional: production, ecommerce, shared (produção e e-commerce) ou internal.';

create or replace function private.enforce_production_request_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_role text;
  v_product_scope text;
begin
  select profile.role
  into v_requester_role
  from public.requests request
  join public.profiles profile on profile.id = request.requested_by
  where request.id = new.request_id;

  select usage_scope
  into v_product_scope
  from public.products
  where id = new.product_id;

  if v_requester_role = 'receiver'
     and v_product_scope not in ('ecommerce', 'shared') then
    raise exception 'A colaboradora de recebimento pode solicitar somente suprimentos do e-commerce ou itens compartilhados.'
      using errcode = '23514';
  elsif v_requester_role = 'collaborator'
        and v_product_scope not in ('production', 'shared') then
    raise exception 'A colaboradora de produção pode solicitar somente matérias-primas ou itens compartilhados.'
      using errcode = '23514';
  elsif v_requester_role = 'admin'
        and v_product_scope not in ('production', 'ecommerce', 'shared') then
    raise exception 'A solicitação aceita somente matérias-primas, suprimentos do e-commerce ou itens compartilhados.'
      using errcode = '23514';
  elsif v_requester_role not in ('admin', 'collaborator', 'receiver')
        or v_product_scope is null then
    raise exception 'Produto ou perfil incompatível com esta solicitação.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_production_request_product()
  from public, anon, authenticated;

create or replace function public.admin_save_product_v5(
  p_product_id uuid,
  p_product jsonb,
  p_supplier_id uuid default null,
  p_custom_values jsonb default '[]'::jsonb,
  p_manage_supplier boolean default true,
  p_hidden_from_collaborators boolean default false,
  p_availability_status text default 'available',
  p_availability_reason text default null,
  p_availability_expected_on date default null,
  p_usage_scope text default 'production'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_before text;
  v_scope text := coalesce(nullif(trim(p_usage_scope), ''), 'production');
  v_hidden boolean;
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if v_scope not in ('production', 'ecommerce', 'shared') then
    raise exception 'Finalidade operacional inválida.' using errcode = '22023';
  end if;

  v_hidden := case
    when v_scope = 'ecommerce' then true
    when v_scope = 'shared' then false
    else p_hidden_from_collaborators
  end;

  if p_product_id is not null then
    select usage_scope into v_before
    from public.products
    where id = p_product_id
    for update;
  end if;

  v_id := public.admin_save_product_v3(
    p_product_id,
    p_product,
    p_supplier_id,
    p_custom_values,
    p_manage_supplier,
    v_hidden,
    p_availability_status,
    p_availability_reason,
    p_availability_expected_on
  );

  update public.products
  set usage_scope = v_scope,
      hidden_from_collaborators = v_hidden
  where id = v_id;

  if v_before is distinct from v_scope then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, origin, details)
    values (
      v_actor,
      'product.usage_scope_updated',
      'product',
      v_id::text,
      'database',
      jsonb_build_object('before', v_before, 'after', v_scope)
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_save_product_v5(uuid,jsonb,uuid,jsonb,boolean,boolean,text,text,date,text)
  from public, anon, authenticated;
grant execute on function public.admin_save_product_v5(uuid,jsonb,uuid,jsonb,boolean,boolean,text,text,date,text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
