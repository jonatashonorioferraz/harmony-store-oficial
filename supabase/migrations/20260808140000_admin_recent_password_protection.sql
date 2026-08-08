-- Fase C: confirmação recente da senha para operações administrativas irreversíveis.
-- A renovação automática do token não renova o timestamp do método "password" no AMR.

create or replace function private.has_recent_password_auth(p_max_age_seconds integer default 600)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select max((entry->>'timestamp')::bigint)
    from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) as entry
    where entry->>'method' = 'password'
  ), 0) >= extract(epoch from statement_timestamp())::bigint - greatest(60, least(coalesce(p_max_age_seconds, 600), 3600));
$$;

create or replace function private.require_recent_password_auth(p_max_age_seconds integer default 600)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.has_recent_password_auth(p_max_age_seconds)) then
    raise exception 'Confirme novamente sua senha para concluir esta ação.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.has_recent_password_auth(integer) from public, anon;
revoke all on function private.require_recent_password_auth(integer) from public, anon;
grant execute on function private.has_recent_password_auth(integer) to authenticated;
grant execute on function private.require_recent_password_auth(integer) to authenticated;

-- Protege exclusões diretas permitidas por RLS.
drop policy if exists "category: admin delete" on public.categories;
create policy "category: recent admin delete" on public.categories
  for delete to authenticated
  using ((select private.is_admin()) and (select private.has_recent_password_auth(600)));

drop policy if exists "field definition: admin delete" on public.custom_field_definitions;
create policy "field definition: recent admin delete" on public.custom_field_definitions
  for delete to authenticated
  using ((select private.is_admin()) and (select private.has_recent_password_auth(600)));

drop policy if exists "request: admin delete" on public.requests;
create policy "request: recent admin delete" on public.requests
  for delete to authenticated
  using ((select private.is_admin()) and (select private.has_recent_password_auth(600)));

create or replace function public.admin_delete_product(p_product_id uuid)
returns text
language plpgsql
security definer
set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_old public.products%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  perform private.require_recent_password_auth(600);

  select * into v_old from public.products where id = p_product_id for update;
  if not found then raise exception 'Produto não localizado.' using errcode = 'P0002'; end if;

  delete from public.products where id = p_product_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, origin, details)
  values (v_actor, 'product.deleted', 'product', p_product_id::text, 'database',
          jsonb_build_object('before', to_jsonb(v_old), 'recent_password_confirmed', true));
  return v_old.image_path;
end;
$$;

create or replace function public.admin_delete_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = '' as $$
declare
  v_status text;
  v_item record;
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  perform private.require_recent_password_auth(600);

  select status into v_status from public.requests where id = p_request_id for update;
  if v_status is null then raise exception 'Solicitação não localizada.'; end if;
  if v_status in ('separating','scheduled') then
    for v_item in
      select product_id, approved_quantity
      from public.request_items
      where request_id = p_request_id
        and coalesce(approved_quantity, 0) > 0
        and not removed_by_admin
    loop
      update public.products
      set reserved_stock = greatest(0, reserved_stock - v_item.approved_quantity)
      where id = v_item.product_id;
      insert into public.stock_movements(product_id, request_id, movement_type, quantity, reason, created_by)
      values(v_item.product_id, p_request_id, 'release', v_item.approved_quantity,
             'Solicitação excluída pelo ADM', (select auth.uid()));
    end loop;
  end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values((select auth.uid()), 'request.deleted', 'request', p_request_id::text,
         jsonb_build_object('previous_status', v_status, 'recent_password_confirmed', true));
  delete from public.requests where id = p_request_id;
end;
$$;

revoke all on function public.admin_delete_product(uuid) from public, anon;
revoke all on function public.admin_delete_request(uuid) from public, anon;
grant execute on function public.admin_delete_product(uuid) to authenticated;
grant execute on function public.admin_delete_request(uuid) to authenticated;
