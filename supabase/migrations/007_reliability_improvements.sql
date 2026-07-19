-- Criação atômica de solicitações e validação da data de entrega/coleta.

create or replace function public.create_own_request(
  p_notes text,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_request_id uuid;
  v_item record;
begin
  if (select auth.uid()) is null then raise exception 'Sessão inválida.'; end if;
  if not exists (
    select 1 from public.profiles
    where id=(select auth.uid()) and status='active'
  ) then raise exception 'Cadastro inativo.'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'Escolha ao menos um produto.';
  end if;

  insert into public.requests(requested_by,status,notes)
  values((select auth.uid()),'pending',nullif(trim(p_notes),''))
  returning id into v_request_id;

  for v_item in
    select product_id, sum(requested_quantity) as requested_quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, requested_quantity numeric)
    group by product_id
  loop
    if coalesce(v_item.requested_quantity,0)<=0 then
      raise exception 'Informe quantidades maiores que zero.';
    end if;
    if not exists(select 1 from public.products where id=v_item.product_id and active) then
      raise exception 'Um dos produtos não está disponível.';
    end if;
    insert into public.request_items(request_id,product_id,requested_quantity)
    values(v_request_id,v_item.product_id,v_item.requested_quantity);
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'request.created','request',v_request_id::text,jsonb_build_object('items',p_items));
  return v_request_id;
end;
$$;

grant execute on function public.create_own_request(text,jsonb) to authenticated;

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
  if p_scheduled_for<=now() then raise exception 'Escolha uma data futura.'; end if;
  update public.requests set status='scheduled', fulfillment_method=p_fulfillment_method, scheduled_for=p_scheduled_for
   where id=p_request_id and status='separating';
  if not found then raise exception 'Conclua a separação antes de agendar.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values ((select auth.uid()),'request.scheduled','request',p_request_id::text,
          jsonb_build_object('method',p_fulfillment_method,'scheduled_for',p_scheduled_for));
end;
$$;

grant execute on function public.admin_schedule_request(uuid,text,timestamptz) to authenticated;
