-- Harmony Store Oficial - correcao granular de reservas da Central de Transferencias.
-- Permite liberar uma caixa ou retirar um item manual sem cancelar toda a solicitacao.

begin;

alter table public.shipping_inventory_request_items
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references public.profiles(id) on delete restrict,
  add column if not exists remove_reason text;

alter table public.shipping_inventory_request_items
  drop constraint if exists shipping_inventory_request_items_remove_reason_check,
  drop constraint if exists shipping_inventory_request_items_removal_check,
  add constraint shipping_inventory_request_items_remove_reason_check
    check (char_length(coalesce(remove_reason,'')) <= 500),
  add constraint shipping_inventory_request_items_removal_check
    check ((removed_at is null and removed_by is null and remove_reason is null)
        or (removed_at is not null and removed_by is not null and char_length(trim(remove_reason)) between 5 and 500));

create or replace function private.refresh_transfer_center_request_status(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_any boolean;
  v_complete boolean;
  v_status text;
begin
  select
    bool_or(coverage.selected_quantity > 0),
    bool_and(coverage.selected_quantity >= coverage.required_quantity)
  into v_any,v_complete
  from (
    select ri.id,ri.required_quantity,
      coalesce(sum(rb.box_quantity) filter(where rb.released_at is null),0) selected_quantity
    from public.shipping_inventory_request_items ri
    left join public.shipping_inventory_request_boxes rb on rb.request_item_id=ri.id
    where ri.request_id=p_request_id and ri.removed_at is null
    group by ri.id
  ) coverage;

  if v_any is null then
    raise exception 'A solicitacao precisa manter pelo menos um modelo ativo.' using errcode='23514';
  end if;

  v_status:=case when v_complete then 'reserved' when v_any then 'partially_reserved' else 'requested' end;
  update public.shipping_inventory_requests set status=v_status where id=p_request_id;
  return v_status;
end;
$$;

revoke all on function private.refresh_transfer_center_request_status(uuid) from public,anon,authenticated;
grant execute on function private.refresh_transfer_center_request_status(uuid) to service_role;

create or replace function public.list_transfer_center_options(p_request_id uuid)
returns table(item jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (select private.can_access_shipping_inventory_requests()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if not exists(select 1 from public.shipping_inventory_requests r where r.id=p_request_id and r.status in ('requested','partially_reserved','reserved')) then
    raise exception 'Solicitacao indisponivel para reserva.' using errcode='23514';
  end if;
  return query
  select jsonb_build_object(
    'id',ri.id,'model_id',ri.model_id,'model_name',m.name,'image_path',m.image_path,
    'color_id',ri.color_id,'color_name',c.name,'color_hex',upper(c.hex_code),
    'required_quantity',ri.required_quantity,
    'selected_quantity',coalesce((select sum(rb.box_quantity) from public.shipping_inventory_request_boxes rb where rb.request_item_id=ri.id and rb.released_at is null),0),
    'boxes',coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'box_number',e.box_number,'box_code','CX-'||lpad(e.box_number::text,6,'0'),
      'quantity',e.current_quantity,'entry_on',e.entry_on,'location',e.box_reference
    ) order by e.entry_on asc,e.box_number asc) filter(where e.id is not null),'[]'::jsonb)
  )
  from public.shipping_inventory_request_items ri
  join public.finished_product_models m on m.id=ri.model_id
  join public.finished_production_colors c on c.id=ri.color_id
  left join public.production_inventory_entries e
    on e.model_id=ri.model_id and e.color_id=ri.color_id
    and e.label_status='applied' and e.current_quantity>0 and e.transferred_at is null
    and not exists(select 1 from public.shipping_inventory_request_boxes rb where rb.inventory_entry_id=e.id and rb.released_at is null)
  where ri.request_id=p_request_id and ri.removed_at is null
  group by ri.id,m.id,c.id
  order by ri.position;
end;
$$;

create or replace function public.release_transfer_center_box(
  p_request_id uuid,
  p_inventory_entry_id uuid,
  p_reason text
) returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_request public.shipping_inventory_requests%rowtype;
  v_reservation public.shipping_inventory_request_boxes%rowtype;
  v_box_code text;
  v_status text;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'A liberacao exige gerente de e-commerce ou ADM principal.' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then
    raise exception 'Informe o motivo da liberacao.' using errcode='23514';
  end if;

  select * into v_request from public.shipping_inventory_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitacao nao localizada.' using errcode='P0002'; end if;
  if v_request.status not in ('partially_reserved','reserved') then
    raise exception 'Somente caixas ainda nao despachadas podem ser liberadas.' using errcode='23514';
  end if;

  select * into v_reservation
  from public.shipping_inventory_request_boxes
  where request_id=p_request_id and inventory_entry_id=p_inventory_entry_id and released_at is null
  for update;
  if not found then raise exception 'Esta caixa nao possui uma reserva ativa nesta solicitacao.' using errcode='P0002'; end if;

  update public.shipping_inventory_request_boxes
  set released_at=now(),released_by=v_actor,release_reason=trim(p_reason)
  where id=v_reservation.id;

  v_status:=private.refresh_transfer_center_request_status(p_request_id);
  select 'CX-'||lpad(e.box_number::text,6,'0') into v_box_code
  from public.production_inventory_entries e where e.id=p_inventory_entry_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'transfer_center.box_released','shipping_inventory_request',p_request_id::text,'database',
    jsonb_build_object('inventory_entry_id',p_inventory_entry_id,'box_code',v_box_code,
      'request_item_id',v_reservation.request_item_id,'reason',trim(p_reason),'status',v_status));
  return v_status;
end;
$$;

create or replace function public.remove_transfer_center_request_item(
  p_request_id uuid,
  p_request_item_id uuid,
  p_reason text
) returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_request public.shipping_inventory_requests%rowtype;
  v_item public.shipping_inventory_request_items%rowtype;
  v_active_count integer;
  v_released_count integer;
  v_status text;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'A alteracao exige gerente de e-commerce ou ADM principal.' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then
    raise exception 'Informe o motivo da retirada do modelo.' using errcode='23514';
  end if;

  select * into v_request from public.shipping_inventory_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitacao nao localizada.' using errcode='P0002'; end if;
  if v_request.status not in ('requested','partially_reserved','reserved') then
    raise exception 'Somente solicitacoes ainda nao despachadas podem ser alteradas.' using errcode='23514';
  end if;
  if v_request.source_type<>'manual' then
    raise exception 'Este modelo veio do Planejamento FULL. Corrija o plano original ou libere somente as caixas.' using errcode='23514';
  end if;

  select * into v_item from public.shipping_inventory_request_items
  where id=p_request_item_id and request_id=p_request_id and removed_at is null for update;
  if not found then raise exception 'Modelo nao localizado nesta solicitacao.' using errcode='P0002'; end if;

  select count(*) into v_active_count from public.shipping_inventory_request_items
  where request_id=p_request_id and removed_at is null;
  if v_active_count<=1 then
    raise exception 'A solicitacao precisa manter pelo menos um modelo. Para retirar o ultimo, cancele a solicitacao.' using errcode='23514';
  end if;

  update public.shipping_inventory_request_boxes
  set released_at=now(),released_by=v_actor,release_reason='Modelo retirado: '||trim(p_reason)
  where request_item_id=p_request_item_id and released_at is null;
  get diagnostics v_released_count=row_count;

  update public.shipping_inventory_request_items
  set removed_at=now(),removed_by=v_actor,remove_reason=trim(p_reason)
  where id=p_request_item_id;

  v_status:=private.refresh_transfer_center_request_status(p_request_id);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'transfer_center.item_removed','shipping_inventory_request',p_request_id::text,'database',
    jsonb_build_object('request_item_id',p_request_item_id,'model_id',v_item.model_id,
      'color_id',v_item.color_id,'released_box_count',v_released_count,
      'reason',trim(p_reason),'status',v_status));
  return v_status;
end;
$$;

create or replace function public.reserve_transfer_center_boxes(
  p_request_id uuid,
  p_selections jsonb,
  p_notes text default null
) returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_request public.shipping_inventory_requests%rowtype;
  v_selection jsonb;
  v_item public.shipping_inventory_request_items%rowtype;
  v_box_id uuid;
  v_entry public.production_inventory_entries%rowtype;
  v_added integer:=0;
  v_status text;
begin
  if not (select private.can_manage_shipping_planning()) then raise exception 'A reserva exige gerente de e-commerce ou ADM principal.' using errcode='42501'; end if;
  if jsonb_typeof(p_selections)<>'array' then raise exception 'Selecao de caixas invalida.'; end if;
  select * into v_request from public.shipping_inventory_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitacao nao localizada.' using errcode='P0002'; end if;
  if v_request.status not in ('requested','partially_reserved','reserved') then raise exception 'Esta solicitacao nao aceita novas reservas.' using errcode='23514'; end if;

  for v_selection in select value from jsonb_array_elements(p_selections)
  loop
    select * into v_item from public.shipping_inventory_request_items
    where id=nullif(v_selection->>'item_id','')::uuid and request_id=p_request_id and removed_at is null;
    if not found then raise exception 'Um item selecionado nao pertence a esta solicitacao.'; end if;
    if jsonb_typeof(v_selection->'box_ids')<>'array' then raise exception 'Selecao de caixas invalida.'; end if;
    for v_box_id in select value::uuid from jsonb_array_elements_text(v_selection->'box_ids') selected(value)
    loop
      select * into v_entry from public.production_inventory_entries where id=v_box_id for update;
      if not found or v_entry.model_id<>v_item.model_id or v_entry.color_id<>v_item.color_id then
        raise exception 'Uma caixa nao corresponde ao modelo e a cor solicitados.' using errcode='23514';
      end if;
      if v_entry.label_status<>'applied' or v_entry.current_quantity<=0 or v_entry.transferred_at is not null then
        raise exception 'Uma caixa selecionada nao esta disponivel.' using errcode='23514';
      end if;
      if exists(select 1 from public.shipping_inventory_request_boxes where inventory_entry_id=v_box_id and released_at is null) then
        raise exception 'A caixa % ja esta reservada para outra solicitacao. Atualize a lista.', 'CX-'||lpad(v_entry.box_number::text,6,'0') using errcode='23505';
      end if;
      insert into public.shipping_inventory_request_boxes(
        request_id,request_item_id,component_id,inventory_entry_id,box_quantity,created_by
      ) values(p_request_id,v_item.id,v_item.plan_component_id,v_box_id,v_entry.current_quantity,v_actor);
      v_added:=v_added+1;
    end loop;
  end loop;
  if v_added=0 then raise exception 'Selecione pelo menos uma caixa nova.'; end if;
  v_status:=private.refresh_transfer_center_request_status(p_request_id);
  update public.shipping_inventory_requests
  set notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes)
  where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'transfer_center.boxes_reserved','shipping_inventory_request',p_request_id::text,'database',
    jsonb_build_object('box_count',v_added,'status',v_status));
  return v_status;
exception when unique_violation then
  raise exception 'Uma caixa acabou de ser reservada por outra pessoa. Atualize a lista e tente novamente.' using errcode='23505';
end;
$$;

create or replace function public.list_shipping_inventory_requests(p_status text default null)
returns table(request jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (select private.can_access_shipping_inventory_requests()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('requested','partially_reserved','reserved','in_transit','received','transferred','cancelled') then raise exception 'Filtro invalido.'; end if;
  return query
  select jsonb_build_object(
    'id',r.id,'protocol',r.protocol,'status',r.status,'source_type',r.source_type,
    'title',r.title,'purpose',r.purpose,'needed_on',r.needed_on,'priority',r.priority,'notes',r.notes,
    'plan_id',r.plan_id,'plan_protocol',p.protocol,'plan_title',p.title,'plan_item_id',r.plan_item_id,
    'item_name',case when i.item_kind='kit' then k.name else coalesce(m.name,i.exclusive_name,r.title) end,
    'item_kind',i.item_kind,'platform',p.platform,'is_full',p.is_full,
    'requested_by_name',requester.full_name,'requested_at',r.requested_at,
    'dispatched_by_name',dispatcher.full_name,'dispatched_at',r.dispatched_at,
    'received_by_name',receiver.full_name,'received_at',r.received_at,'receipt_notes',r.receipt_notes,
    'transferred_by_name',coalesce(dispatcher.full_name,transferred.full_name),'transferred_at',coalesce(r.dispatched_at,r.transferred_at),
    'cancelled_by_name',cancelled.full_name,'cancelled_at',r.cancelled_at,'cancel_reason',r.cancel_reason,
    'box_count',coalesce((select count(*) from public.shipping_inventory_request_boxes rb where rb.request_id=r.id and rb.released_at is null),0),
    'selected_quantity',coalesce((select sum(rb.box_quantity) from public.shipping_inventory_request_boxes rb where rb.request_id=r.id and rb.released_at is null),0),
    'components',coalesce((select jsonb_agg(jsonb_build_object(
      'id',ri.id,'model_id',ri.model_id,'model_name',fm.name,'image_path',fm.image_path,
      'color_id',ri.color_id,'color_name',fc.name,'color_hex',upper(fc.hex_code),
      'required_quantity',ri.required_quantity,
      'selected_quantity',coalesce((select sum(rb.box_quantity) from public.shipping_inventory_request_boxes rb where rb.request_item_id=ri.id and rb.released_at is null),0),
      'boxes',coalesce((select jsonb_agg(jsonb_build_object(
        'id',e.id,'box_code','CX-'||lpad(e.box_number::text,6,'0'),'quantity',rb.box_quantity,
        'location',e.box_reference,'entry_on',e.entry_on,'transferred_at',rb.transferred_at
      ) order by e.entry_on,e.box_number) from public.shipping_inventory_request_boxes rb
      join public.production_inventory_entries e on e.id=rb.inventory_entry_id
      where rb.request_item_id=ri.id and rb.released_at is null),'[]'::jsonb)
    ) order by ri.position) from public.shipping_inventory_request_items ri
      join public.finished_product_models fm on fm.id=ri.model_id
      join public.finished_production_colors fc on fc.id=ri.color_id
      where ri.request_id=r.id and ri.removed_at is null),'[]'::jsonb)
  )
  from public.shipping_inventory_requests r
  left join public.shipping_plans p on p.id=r.plan_id
  left join public.shipping_plan_items i on i.id=r.plan_item_id
  left join public.shipping_kit_templates k on k.id=i.kit_template_id
  left join public.finished_product_models m on m.id=i.model_id
  join public.profiles requester on requester.id=r.requested_by
  left join public.profiles dispatcher on dispatcher.id=r.dispatched_by
  left join public.profiles receiver on receiver.id=r.received_by
  left join public.profiles transferred on transferred.id=r.transferred_by
  left join public.profiles cancelled on cancelled.id=r.cancelled_by
  where p_status is null or r.status=p_status
  order by case r.status when 'requested' then 1 when 'partially_reserved' then 2 when 'reserved' then 3 when 'in_transit' then 4 else 5 end,
           r.requested_at desc;
end;
$$;

revoke all on function public.release_transfer_center_box(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.remove_transfer_center_request_item(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.list_transfer_center_options(uuid) from public,anon,authenticated;
revoke all on function public.reserve_transfer_center_boxes(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.list_shipping_inventory_requests(text) from public,anon,authenticated;

grant execute on function public.release_transfer_center_box(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.remove_transfer_center_request_item(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.list_transfer_center_options(uuid) to authenticated,service_role;
grant execute on function public.reserve_transfer_center_boxes(uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.list_shipping_inventory_requests(text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
