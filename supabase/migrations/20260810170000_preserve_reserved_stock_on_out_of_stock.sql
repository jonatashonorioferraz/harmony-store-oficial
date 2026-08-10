begin;

-- "Sem estoque" significa que o saldo livre contado é zero. Materiais já
-- separados para outras solicitações continuam fisicamente existentes e não
-- podem ter suas reservas apagadas.
create or replace function public.admin_set_material_separation_item(
  p_request_id uuid,
  p_request_item_id uuid,
  p_status text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_request_status text;
  v_item public.request_items%rowtype;
  v_product public.products%rowtype;
  v_stock public.product_collaborator_stocks%rowtype;
  v_existing text;
  v_own_reserved numeric(14,3):=0;
  v_other_reserved numeric(14,3):=0;
  v_free_stock numeric(14,3):=0;
  v_required numeric(14,3);
  v_physical numeric(14,3);
  v_reserved numeric(14,3);
  v_minimum numeric(14,3);
  v_replenishment_id uuid;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_status not in ('pending','separated','out_of_stock') then raise exception 'Situação de conferência inválida.'; end if;
  select status into v_request_status from public.requests where id=p_request_id for update;
  if v_request_status not in ('pending','separating') then raise exception 'O checklist só pode ser alterado antes do agendamento.'; end if;
  select * into v_item from public.request_items where id=p_request_item_id and request_id=p_request_id for update;
  if not found then raise exception 'Item da solicitação não localizado.'; end if;
  select * into v_product from public.products where id=v_item.product_id for update;

  if v_product.stock_control_mode='collaborator' then
    select * into v_stock from public.product_collaborator_stocks
    where product_id=v_product.id and collaborator_id=v_item.stock_owner_id for update;
    if not found then raise exception 'Estoque individual da colaboradora não localizado.'; end if;
    v_physical:=v_stock.physical_stock;v_reserved:=v_stock.reserved_stock;v_minimum:=v_stock.minimum_stock;
  else
    v_physical:=v_product.physical_stock;v_reserved:=v_product.reserved_stock;v_minimum:=v_product.minimum_stock;
  end if;

  select status into v_existing from public.separation_checkup_items
  where request_id=p_request_id and request_item_id=p_request_item_id for update;
  if v_existing='out_of_stock' and p_status<>'out_of_stock' then
    raise exception 'O item já registrou falta de estoque. Corrija o saldo no cadastro antes de alterar esta marcação.';
  end if;

  if p_status='separated' then
    if v_request_status='separating' then v_own_reserved:=coalesce(v_item.approved_quantity,0); end if;
    v_required:=coalesce(v_item.approved_quantity,v_item.requested_quantity);
    if v_physical-v_reserved+v_own_reserved<v_required then
      raise exception 'Estoque insuficiente para %. Use Sem estoque ou registre uma divergência.',v_product.name;
    end if;
  elsif p_status='out_of_stock' then
    if nullif(trim(p_note),'') is null then raise exception 'Informe o motivo da falta de estoque.'; end if;

    -- Recalcula sob bloqueio apenas o que pertence a outras solicitações.
    select coalesce(sum(i.approved_quantity),0)::numeric(14,3)
      into v_other_reserved
    from public.request_items i
    join public.requests r on r.id=i.request_id
    where i.product_id=v_product.id
      and i.id<>v_item.id
      and r.status in ('separating','scheduled')
      and not i.removed_by_admin
      and coalesce(i.approved_quantity,0)>0
      and i.stock_owner_id is not distinct from
        case when v_product.stock_control_mode='collaborator' then v_item.stock_owner_id else null end;

    v_free_stock:=greatest(v_physical-v_reserved,0);
    if v_free_stock>0 then
      insert into public.stock_movements(product_id,stock_owner_id,request_id,movement_type,quantity,reason,created_by)
      values(v_product.id,v_item.stock_owner_id,p_request_id,'adjustment',v_free_stock,
        'Saldo livre zerado durante o check-up; reservas de outras solicitações preservadas: '||trim(p_note),v_actor);
    end if;
    insert into public.stock_discrepancies(product_id,stock_owner_id,request_id,request_item_id,
      discrepancy_type,system_stock,counted_stock,difference,reason,recorded_by)
    values(v_product.id,v_item.stock_owner_id,p_request_id,v_item.id,'out_of_stock',v_free_stock,0,-v_free_stock,trim(p_note),v_actor);

    if v_product.stock_control_mode='collaborator' then
      update public.product_collaborator_stocks
      set physical_stock=v_other_reserved,reserved_stock=v_other_reserved,updated_at=now()
      where id=v_stock.id;
    else
      update public.products
      set physical_stock=v_other_reserved,reserved_stock=v_other_reserved,updated_at=now()
      where id=v_product.id;
    end if;
    update public.request_items set approved_quantity=0,removed_by_admin=true,
      admin_note=concat_ws(E'\n',admin_note,'Sem estoque: '||trim(p_note)) where id=v_item.id;
    v_required:=greatest(v_item.requested_quantity,v_minimum,1);
    select id into v_replenishment_id from public.stock_replenishment_requests
    where product_id=v_product.id and stock_owner_id is not distinct from v_item.stock_owner_id
      and status in ('open','in_progress') for update;
    if v_replenishment_id is null then
      insert into public.stock_replenishment_requests(product_id,stock_owner_id,source_request_id,source_request_item_id,
        replenishment_type,requested_quantity,reason,created_by)
      values(v_product.id,v_item.stock_owner_id,p_request_id,v_item.id,v_product.replenishment_mode,v_required,
        'Estoque livre zerado durante a separação: '||trim(p_note),v_actor)
      returning id into v_replenishment_id;
    else
      update public.stock_replenishment_requests
      set requested_quantity=greatest(requested_quantity,v_required),source_request_id=p_request_id,
        source_request_item_id=v_item.id,reason=concat_ws(E'\n',reason,'Nova falta registrada: '||trim(p_note)),updated_at=now()
      where id=v_replenishment_id;
    end if;
  end if;

  insert into public.separation_checkup_items(request_id,request_item_id,product_id,status,note,checked_by,checked_at)
  values(p_request_id,v_item.id,v_product.id,p_status,nullif(trim(p_note),''),v_actor,case when p_status='pending' then null else now() end)
  on conflict(request_id,request_item_id) do update set status=excluded.status,note=excluded.note,
    checked_by=excluded.checked_by,checked_at=excluded.checked_at,updated_at=now();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'request.separation_item_checked','request_item',v_item.id::text,'database',
    jsonb_build_object('request_id',p_request_id,'status',p_status,'stock_owner_id',v_item.stock_owner_id,
      'replenishment_id',v_replenishment_id,'preserved_reserved_stock',v_other_reserved));
  return jsonb_build_object('status',p_status,'replenishment_id',v_replenishment_id,
    'preserved_reserved_stock',v_other_reserved);
end;
$$;

revoke all on function public.admin_set_material_separation_item(uuid,uuid,text,text) from public,anon;
grant execute on function public.admin_set_material_separation_item(uuid,uuid,text,text) to authenticated,service_role;

-- Repara somente reservas individuais ativas que têm evidência explícita de
-- separação concluída. Este bloco não cria saldo livre.
with evidenced as (
  select p.id as product_id,i.stock_owner_id,
    sum(i.approved_quantity)::numeric(14,3) as reserved_quantity
  from public.products p
  join public.request_items i on i.product_id=p.id
  join public.requests r on r.id=i.request_id and r.status in ('separating','scheduled')
  join public.separation_checkup_items c on c.request_id=i.request_id and c.request_item_id=i.id and c.status='separated'
  where p.stock_control_mode='collaborator'
    and not i.removed_by_admin and coalesce(i.approved_quantity,0)>0
  group by p.id,i.stock_owner_id
), repaired as (
  update public.product_collaborator_stocks s
  set physical_stock=e.reserved_quantity,reserved_stock=e.reserved_quantity,updated_at=now()
  from evidenced e
  where s.product_id=e.product_id and s.collaborator_id=e.stock_owner_id
    and s.physical_stock<e.reserved_quantity
  returning s.product_id,s.collaborator_id,e.reserved_quantity
)
insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
select null,'stock.active_checked_reservation_repaired','product',product_id::text,'migration',
  jsonb_build_object('stock_owner_id',collaborator_id,'physical_stock',reserved_quantity,
    'reserved_stock',reserved_quantity,'free_stock_created',0)
from repaired;

notify pgrst,'reload schema';
commit;
