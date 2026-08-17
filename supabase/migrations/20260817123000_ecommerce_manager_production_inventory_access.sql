begin;

create or replace function private.can_manage_production_inventory()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id=(select auth.uid())
      and p.status='active'
      and (
        p.role in ('admin','receiver')
        or coalesce(p.is_ecommerce_manager,false)
      )
  )
$$;

revoke all on function private.can_manage_production_inventory() from public, anon;
grant execute on function private.can_manage_production_inventory() to authenticated, service_role;

comment on function private.can_manage_production_inventory() is
'Permite operar o Inventário de Produção a ADM, Recebimento e Gerente de e-commerce ativa.';

commit;
