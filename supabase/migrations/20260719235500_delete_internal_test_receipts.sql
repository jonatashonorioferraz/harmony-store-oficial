-- Harmony Store Oficial — exclusão administrativa de cupons criados por engano.
-- Exclusiva do ADM principal, com estorno de estoque e auditoria permanente.

begin;

create or replace function public.admin_delete_internal_purchase_receipt(
  p_receipt_id uuid,
  p_reason text,
  p_delete_orphan_products boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_receipt public.internal_purchase_receipts%rowtype;
  v_item record;
  v_product_id uuid;
  v_product_ids uuid[] := '{}';
  v_deleted_products integer := 0;
begin
  if not (select private.is_primary_admin()) then
    raise exception 'Somente o ADM principal pode excluir um cupom definitivamente.' using errcode='42501';
  end if;
  if nullif(trim(p_reason),'') is null then
    raise exception 'Informe o motivo da exclusão.';
  end if;

  select * into v_receipt
  from public.internal_purchase_receipts
  where id=p_receipt_id
  for update;
  if not found then raise exception 'Cupom não localizado.'; end if;

  select coalesce(array_agg(distinct product_id),'{}'::uuid[])
  into v_product_ids
  from public.internal_purchase_receipt_items
  where receipt_id=p_receipt_id;

  if v_receipt.status='confirmed' then
    for v_item in
      select product_id,sum(quantity) as quantity
      from public.internal_purchase_receipt_items
      where receipt_id=p_receipt_id
      group by product_id
    loop
      update public.products
      set physical_stock=physical_stock-v_item.quantity
      where id=v_item.product_id
        and physical_stock-v_item.quantity>=reserved_stock;
      if not found then
        raise exception 'Não é possível excluir: parte do estoque deste cupom já foi usada ou reservada.';
      end if;
    end loop;
  end if;

  delete from public.stock_movements where internal_receipt_id=p_receipt_id;
  delete from public.internal_purchase_receipts where id=p_receipt_id;

  if coalesce(p_delete_orphan_products,false) then
    foreach v_product_id in array v_product_ids loop
      begin
        delete from public.products p
        where p.id=v_product_id
          and p.usage_scope='internal'
          and p.description='Criado automaticamente a partir de cupom fiscal'
          and p.physical_stock=0
          and p.reserved_stock=0
          and not exists(select 1 from public.internal_supply_request_items i where i.product_id=p.id)
          and not exists(select 1 from public.internal_purchase_receipt_items i where i.product_id=p.id)
          and not exists(select 1 from public.stock_movements m where m.product_id=p.id);
        if found then v_deleted_products:=v_deleted_products+1; end if;
      exception when foreign_key_violation then
        null;
      end;
    end loop;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'internal_supply.purchase_deleted','internal_purchase_receipt',p_receipt_id::text,
    jsonb_build_object('protocol',v_receipt.protocol,'merchant',v_receipt.merchant_name,'total',v_receipt.total_value,'reason',trim(p_reason),'deleted_orphan_products',v_deleted_products));

  return jsonb_build_object('image_path',v_receipt.image_path,'deleted_products',v_deleted_products);
end;
$$;

revoke all on function public.admin_delete_internal_purchase_receipt(uuid,text,boolean) from public,anon;
grant execute on function public.admin_delete_internal_purchase_receipt(uuid,text,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
