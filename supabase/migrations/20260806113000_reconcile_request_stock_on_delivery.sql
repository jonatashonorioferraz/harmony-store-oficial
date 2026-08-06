-- Harmony Store Oficial — conclusão resiliente de entrega com reconciliação de reservas.
-- Corrige reservas históricas fora de sincronia sem consumir o estoque reservado
-- para outras solicitações ainda em separação ou agendadas.

begin;

create or replace function public.admin_complete_request(
  p_request_id uuid,
  p_delivered_by_name text,
  p_received_by_name text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_item record;
  v_product public.products%rowtype;
  v_other_reserved numeric(14,3);
  v_available numeric(14,3);
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if nullif(trim(p_delivered_by_name),'') is null or nullif(trim(p_received_by_name),'') is null then
    raise exception 'Informe quem entregou e quem recebeu.';
  end if;

  perform 1
  from public.requests
  where id=p_request_id and status='scheduled'
  for update;
  if not found then
    raise exception 'A solicitação precisa estar agendada.';
  end if;

  -- Bloqueia todos os produtos em ordem fixa antes dos cálculos. Isso mantém a
  -- entrega e as separações concorrentes consistentes e evita deadlocks.
  perform 1
  from public.products p
  where p.id in (
    select i.product_id
    from public.request_items i
    where i.request_id=p_request_id
      and not i.removed_by_admin
      and coalesce(i.approved_quantity,0)>0
  )
  order by p.id
  for update;

  for v_item in
    select i.product_id, sum(i.approved_quantity)::numeric(14,3) as approved_quantity
    from public.request_items i
    where i.request_id=p_request_id
      and not i.removed_by_admin
      and coalesce(i.approved_quantity,0)>0
    group by i.product_id
    order by i.product_id
  loop
    select p.* into strict v_product
    from public.products p
    where p.id=v_item.product_id;

    -- A reserva correta depois desta entrega é a soma das demais solicitações
    -- abertas. Assim uma reserva antiga incorreta é reparada sem prejudicar
    -- materiais já comprometidos com outras colaboradoras.
    select coalesce(sum(i.approved_quantity),0)::numeric(14,3)
    into v_other_reserved
    from public.request_items i
    join public.requests r on r.id=i.request_id
    where i.product_id=v_item.product_id
      and i.request_id<>p_request_id
      and r.status in ('separating','scheduled')
      and not i.removed_by_admin
      and coalesce(i.approved_quantity,0)>0;

    v_available:=greatest(0,v_product.physical_stock-v_other_reserved);
    if v_product.physical_stock-v_item.approved_quantity<v_other_reserved then
      raise exception 'Estoque físico insuficiente para %. Disponível para esta entrega: %, necessário: %.',
        v_product.name,v_available,v_item.approved_quantity;
    end if;

    update public.products
    set physical_stock=physical_stock-v_item.approved_quantity,
        reserved_stock=v_other_reserved
    where id=v_item.product_id;

    insert into public.stock_movements(product_id,request_id,movement_type,quantity,reason,created_by)
    values(v_item.product_id,p_request_id,'delivery',v_item.approved_quantity,
      'Entrega concluída com reconciliação de reservas',v_actor);
  end loop;

  update public.requests
  set status='delivered',
      delivered_by_name=trim(p_delivered_by_name),
      received_by_name=trim(p_received_by_name),
      closed_at=now()
  where id=p_request_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'request.completed','request',p_request_id::text,
    jsonb_build_object(
      'delivered_by',trim(p_delivered_by_name),
      'received_by',trim(p_received_by_name),
      'stock_reservations_reconciled',true
    ));
end;
$$;

revoke all on function public.admin_complete_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_complete_request(uuid,text,text) to authenticated,service_role;

notify pgrst, 'reload schema';

commit;
