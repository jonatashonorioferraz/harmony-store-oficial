-- Harmony Store Oficial — operações da versão completa
-- Execute no SQL Editor depois de 001_harmony_store.sql.

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','products','custom_field_values','requests'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

create or replace function public.update_own_profile(
  p_full_name text,
  p_department text default null,
  p_phone text default null
) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare result public.profiles;
begin
  if nullif(trim(p_full_name), '') is null then raise exception 'Informe o nome.'; end if;
  update public.profiles
     set full_name = trim(p_full_name), department = nullif(trim(p_department), ''), phone = nullif(trim(p_phone), '')
   where id = (select auth.uid())
   returning * into result;
  if result.id is null then raise exception 'Perfil não localizado.'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id)
  values ((select auth.uid()), 'profile.self_update', 'profile', result.id::text);
  return result;
end;
$$;
grant execute on function public.update_own_profile(text,text,text) to authenticated;

create or replace function public.admin_prepare_request(
  p_request_id uuid,
  p_items jsonb,
  p_admin_notes text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_item record;
  v_old numeric(14,3);
  v_old_reserved numeric(14,3);
  v_new numeric(14,3);
  v_product public.products;
  v_delta numeric(14,3);
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  select status into v_status from public.requests where id = p_request_id for update;
  if v_status is null then raise exception 'Solicitação não localizada.'; end if;
  if v_status in ('delivered','cancelled') then raise exception 'Solicitação já encerrada.'; end if;

  for v_item in
    select * from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
      as x(item_id uuid, approved_quantity numeric, removed boolean, admin_note text)
  loop
    select coalesce(approved_quantity,0),
           case when v_status in ('separating','scheduled') then coalesce(approved_quantity,0) else 0 end
      into v_old, v_old_reserved
      from public.request_items where id = v_item.item_id and request_id = p_request_id for update;
    if not found then raise exception 'Item inválido.'; end if;
    v_new := case when coalesce(v_item.removed,false) then 0 else greatest(coalesce(v_item.approved_quantity,0),0) end;
    if v_new > (select requested_quantity from public.request_items where id = v_item.item_id) then
      raise exception 'A quantidade aprovada não pode superar a solicitada.';
    end if;
    select p.* into v_product from public.products p
      join public.request_items i on i.product_id = p.id where i.id = v_item.item_id for update;
    v_delta := v_new - v_old_reserved;
    if v_product.reserved_stock + v_delta > v_product.physical_stock then
      raise exception 'Estoque insuficiente para %.', v_product.name;
    end if;
    update public.products set reserved_stock = reserved_stock + v_delta where id = v_product.id;
    if v_delta <> 0 then
      insert into public.stock_movements(product_id, request_id, movement_type, quantity, reason, created_by)
      values (v_product.id, p_request_id, case when v_delta > 0 then 'reserve' else 'release' end,
              abs(v_delta), 'Separação da solicitação', (select auth.uid()));
    end if;
    update public.request_items
       set approved_quantity = v_new,
           removed_by_admin = coalesce(v_item.removed,false),
           admin_note = nullif(trim(v_item.admin_note),'')
     where id = v_item.item_id;
  end loop;

  update public.requests set status='separating', separated_by=(select auth.uid()), admin_notes=nullif(trim(p_admin_notes),'')
   where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values ((select auth.uid()),'request.prepared','request',p_request_id::text,jsonb_build_object('items',p_items));
end;
$$;

create or replace function public.admin_schedule_request(
  p_request_id uuid,
  p_fulfillment_method text,
  p_scheduled_for timestamptz
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  if p_fulfillment_method not in ('delivery','pickup') then raise exception 'Escolha entrega ou coleta.'; end if;
  if p_scheduled_for is null then raise exception 'Informe a data.'; end if;
  update public.requests set status='scheduled', fulfillment_method=p_fulfillment_method, scheduled_for=p_scheduled_for
   where id=p_request_id and status='separating';
  if not found then raise exception 'Conclua a separação antes de agendar.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values ((select auth.uid()),'request.scheduled','request',p_request_id::text,
          jsonb_build_object('method',p_fulfillment_method,'scheduled_for',p_scheduled_for));
end;
$$;

create or replace function public.admin_complete_request(
  p_request_id uuid,
  p_delivered_by_name text,
  p_received_by_name text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_item record;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  if nullif(trim(p_delivered_by_name),'') is null or nullif(trim(p_received_by_name),'') is null then
    raise exception 'Informe quem entregou e quem recebeu.';
  end if;
  perform 1 from public.requests where id=p_request_id and status='scheduled' for update;
  if not found then raise exception 'A solicitação precisa estar agendada.'; end if;
  for v_item in select i.product_id, i.approved_quantity from public.request_items i
                 where i.request_id=p_request_id and not i.removed_by_admin and coalesce(i.approved_quantity,0)>0
  loop
    update public.products set physical_stock=physical_stock-v_item.approved_quantity,
                               reserved_stock=reserved_stock-v_item.approved_quantity
     where id=v_item.product_id and physical_stock>=v_item.approved_quantity and reserved_stock>=v_item.approved_quantity;
    if not found then raise exception 'Estoque inconsistente. Revise a separação.'; end if;
    insert into public.stock_movements(product_id,request_id,movement_type,quantity,reason,created_by)
    values(v_item.product_id,p_request_id,'delivery',v_item.approved_quantity,'Entrega concluída',(select auth.uid()));
  end loop;
  update public.requests set status='delivered', delivered_by_name=trim(p_delivered_by_name),
    received_by_name=trim(p_received_by_name), closed_at=now() where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values ((select auth.uid()),'request.completed','request',p_request_id::text,
          jsonb_build_object('delivered_by',p_delivered_by_name,'received_by',p_received_by_name));
end;
$$;

create or replace function public.admin_cancel_request(p_request_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_item record;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  select status into v_status from public.requests where id=p_request_id for update;
  if v_status is null then raise exception 'Solicitação não localizada.'; end if;
  if v_status in ('delivered','cancelled') then raise exception 'Solicitação já encerrada.'; end if;
  if v_status in ('separating','scheduled') then
    for v_item in select product_id, approved_quantity from public.request_items
                   where request_id=p_request_id and coalesce(approved_quantity,0)>0 and not removed_by_admin
    loop
      update public.products set reserved_stock=greatest(0,reserved_stock-v_item.approved_quantity) where id=v_item.product_id;
      insert into public.stock_movements(product_id,request_id,movement_type,quantity,reason,created_by)
      values(v_item.product_id,p_request_id,'release',v_item.approved_quantity,'Solicitação cancelada',(select auth.uid()));
    end loop;
  end if;
  update public.requests set status='cancelled', admin_notes=coalesce(nullif(trim(p_reason),''),admin_notes), closed_at=now()
   where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values ((select auth.uid()),'request.cancelled','request',p_request_id::text,jsonb_build_object('reason',p_reason));
end;
$$;

grant execute on function public.admin_prepare_request(uuid,jsonb,text) to authenticated;
grant execute on function public.admin_schedule_request(uuid,text,timestamptz) to authenticated;
grant execute on function public.admin_complete_request(uuid,text,text) to authenticated;
grant execute on function public.admin_cancel_request(uuid,text) to authenticated;

-- A colaboradora pode cancelar apenas uma solicitação ainda pendente.
create or replace function public.cancel_own_pending_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.requests set status='cancelled', closed_at=now()
   where id=p_request_id and requested_by=(select auth.uid()) and status='pending';
  if not found then raise exception 'Somente pedidos pendentes podem ser cancelados.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values((select auth.uid()),'request.cancelled_by_owner','request',p_request_id::text);
end;
$$;
grant execute on function public.cancel_own_pending_request(uuid) to authenticated;

