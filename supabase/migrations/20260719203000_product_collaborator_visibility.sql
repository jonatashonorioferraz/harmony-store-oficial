-- Harmony Store Oficial — visibilidade do catálogo por perfil.
-- Mantém produtos de e-commerce ativos para ADMs e recebimento, ocultando-os apenas da colaboradora comum.

begin;

alter table public.products
  add column if not exists hidden_from_collaborators boolean not null default false;

comment on column public.products.hidden_from_collaborators is
  'Quando true, oculta o produto apenas do catálogo de novas solicitações do perfil collaborator.';

create or replace function public.admin_save_product_v2(
  p_product_id uuid,
  p_product jsonb,
  p_supplier_id uuid default null,
  p_custom_values jsonb default '[]'::jsonb,
  p_manage_supplier boolean default true,
  p_hidden_from_collaborators boolean default false
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_before boolean;
  v_after boolean := coalesce(p_hidden_from_collaborators, false);
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if p_product_id is not null then
    select hidden_from_collaborators into v_before
    from public.products where id = p_product_id for update;
  end if;

  v_id := public.admin_save_product(
    p_product_id, p_product, p_supplier_id, p_custom_values, p_manage_supplier
  );

  update public.products
  set hidden_from_collaborators = v_after
  where id = v_id;

  if v_before is distinct from v_after then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, origin, details)
    values (
      v_actor, 'product.collaborator_visibility_updated', 'product', v_id::text,
      'database', jsonb_build_object('before', v_before, 'after', v_after)
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_save_product_v2(uuid,jsonb,uuid,jsonb,boolean,boolean)
  from public, anon;
grant execute on function public.admin_save_product_v2(uuid,jsonb,uuid,jsonb,boolean,boolean)
  to authenticated;

notify pgrst, 'reload schema';

commit;
