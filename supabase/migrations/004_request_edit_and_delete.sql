-- Edição de solicitações pendentes e exclusão administrativa definitiva.

create or replace function public.update_own_pending_request(
  p_request_id uuid,
  p_notes text,
  p_items jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_item record;
begin
  perform 1 from public.requests
   where id=p_request_id and requested_by=(select auth.uid()) and status='pending'
   for update;
  if not found then raise exception 'Somente solicitações pendentes podem ser editadas.'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'Escolha ao menos um produto.'; end if;

  delete from public.request_items
   where request_id=p_request_id
     and product_id not in (
       select product_id from jsonb_to_recordset(p_items) as x(product_id uuid, requested_quantity numeric)
     );

  for v_item in select * from jsonb_to_recordset(p_items) as x(product_id uuid, requested_quantity numeric)
  loop
    if coalesce(v_item.requested_quantity,0)<=0 then raise exception 'Informe quantidades maiores que zero.'; end if;
    if not exists(select 1 from public.products where id=v_item.product_id and active) then raise exception 'Produto indisponível.'; end if;
    insert into public.request_items(request_id,product_id,requested_quantity)
    values(p_request_id,v_item.product_id,v_item.requested_quantity)
    on conflict(request_id,product_id) do update set requested_quantity=excluded.requested_quantity,
      approved_quantity=null, removed_by_admin=false, admin_note=null;
  end loop;
  update public.requests set notes=nullif(trim(p_notes),'') where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'request.edited_by_owner','request',p_request_id::text,jsonb_build_object('items',p_items));
end;
$$;

create or replace function public.admin_delete_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_item record;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  select status into v_status from public.requests where id=p_request_id for update;
  if v_status is null then raise exception 'Solicitação não localizada.'; end if;
  if v_status in ('separating','scheduled') then
    for v_item in select product_id,approved_quantity from public.request_items
      where request_id=p_request_id and coalesce(approved_quantity,0)>0 and not removed_by_admin
    loop
      update public.products set reserved_stock=greatest(0,reserved_stock-v_item.approved_quantity)
       where id=v_item.product_id;
      insert into public.stock_movements(product_id,request_id,movement_type,quantity,reason,created_by)
      values(v_item.product_id,p_request_id,'release',v_item.approved_quantity,'Solicitação excluída pelo ADM',(select auth.uid()));
    end loop;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'request.deleted','request',p_request_id::text,jsonb_build_object('previous_status',v_status));
  delete from public.requests where id=p_request_id;
end;
$$;

grant execute on function public.update_own_pending_request(uuid,text,jsonb) to authenticated;
grant execute on function public.admin_delete_request(uuid) to authenticated;
