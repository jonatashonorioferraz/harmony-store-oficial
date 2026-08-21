begin;

create or replace function private.can_request_transfer_center()
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
        p.role='admin'
        or coalesce(p.is_primary_admin,false)
        or coalesce(p.is_ecommerce_manager,false)
      )
  )
$$;

revoke all on function private.can_request_transfer_center() from public,anon;
grant execute on function private.can_request_transfer_center() to authenticated,service_role;

comment on function private.can_request_transfer_center() is
'Autoriza criar solicitacoes diretas na Central de Transferencias para ADM principal, ADM normal e Gerente de e-commerce ativos.';

create or replace function public.create_transfer_center_request(
  p_plan_item_id uuid default null,
  p_title text default null,
  p_purpose text default 'ad_hoc',
  p_needed_on date default null,
  p_priority text default 'normal',
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_request_id uuid;
  v_plan_id uuid;
  v_plan_title text;
  v_item jsonb;
  v_model_id uuid;
  v_color_id uuid;
  v_quantity bigint;
  v_position integer:=0;
begin
  if p_plan_item_id is null then
    if not (select private.can_request_transfer_center()) then
      raise exception 'A criacao de solicitacao exige perfil ADM ou Gerente de e-commerce.' using errcode='42501';
    end if;
  elsif not (select private.can_manage_shipping_planning()) then
    raise exception 'Solicitacoes vinculadas ao Planejamento exigem Gerente de e-commerce ou ADM principal.' using errcode='42501';
  end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'Prioridade invalida.'; end if;
  if p_purpose not in ('full_shipping','routine_restock','campaign','ad_hoc','shipping_plan') then raise exception 'Finalidade invalida.'; end if;
  if char_length(coalesce(p_notes,''))>1200 then raise exception 'Observacao muito longa.'; end if;
  if p_needed_on is not null and p_needed_on<current_date then raise exception 'A data necessaria nao pode estar no passado.'; end if;

  if p_plan_item_id is not null then
    select p.id,coalesce(nullif(trim(p.title),''),'Plano de envio #'||p.protocol::text)
      into v_plan_id,v_plan_title
    from public.shipping_plan_items i
    join public.shipping_plans p on p.id=i.plan_id
    where i.id=p_plan_item_id and p.is_full and p.status not in ('archived','cancelled')
    for update of i,p;
    if v_plan_id is null then raise exception 'O item precisa pertencer a um plano FULL ativo.' using errcode='23514'; end if;
    select r.id into v_request_id
    from public.shipping_inventory_requests r
    where r.plan_item_id=p_plan_item_id and r.status in ('requested','partially_reserved','reserved','in_transit')
    limit 1;
    if v_request_id is not null then return v_request_id; end if;
    insert into public.shipping_inventory_requests(
      plan_id,plan_item_id,source_type,title,purpose,needed_on,priority,notes,requested_by,status
    ) values(
      v_plan_id,p_plan_item_id,'shipping_plan',v_plan_title,'full_shipping',p_needed_on,p_priority,
      nullif(trim(coalesce(p_notes,'')),''),v_actor,'requested'
    ) returning id into v_request_id;
    insert into public.shipping_inventory_request_items(
      request_id,plan_component_id,model_id,color_id,required_quantity,position
    )
    select v_request_id,pc.id,pc.model_id,pc.color_id,
           pc.units_per_volume::bigint*i.volume_quantity::bigint,pc.position
    from public.shipping_plan_item_components pc
    join public.shipping_plan_items i on i.id=pc.plan_item_id
    where pc.plan_item_id=p_plan_item_id;
    if not found then raise exception 'Este item nao possui modelos e cores vinculados ao Inventario.' using errcode='23514'; end if;
  else
    if char_length(trim(coalesce(p_title,''))) not between 2 and 140 then raise exception 'Informe um titulo para a solicitacao.'; end if;
    if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione pelo menos um produto.'; end if;
    insert into public.shipping_inventory_requests(
      source_type,title,purpose,needed_on,priority,notes,requested_by,status
    ) values(
      'manual',trim(p_title),p_purpose,p_needed_on,p_priority,
      nullif(trim(coalesce(p_notes,'')),''),v_actor,'requested'
    ) returning id into v_request_id;
    for v_item in select value from jsonb_array_elements(p_items)
    loop
      v_model_id=nullif(v_item->>'model_id','')::uuid;
      v_color_id=nullif(v_item->>'color_id','')::uuid;
      v_quantity=coalesce(nullif(v_item->>'required_quantity','')::bigint,0);
      if v_quantity<=0 or not exists(select 1 from public.finished_product_models where id=v_model_id and active)
        or not exists(select 1 from public.finished_production_colors where id=v_color_id and active) then
        raise exception 'Um item possui modelo, cor ou quantidade invalida.';
      end if;
      insert into public.shipping_inventory_request_items(
        request_id,model_id,color_id,required_quantity,position,notes
      ) values(
        v_request_id,v_model_id,v_color_id,v_quantity,v_position,
        nullif(trim(coalesce(v_item->>'notes','')),'')
      );
      v_position:=v_position+1;
    end loop;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'transfer_center.request_created','shipping_inventory_request',v_request_id::text,'database',
    jsonb_build_object('source_type',case when p_plan_item_id is null then 'manual' else 'shipping_plan' end,
                       'plan_item_id',p_plan_item_id,'purpose',p_purpose,'needed_on',p_needed_on));
  return v_request_id;
exception when unique_violation then
  select r.id into v_request_id from public.shipping_inventory_requests r
  where r.plan_item_id=p_plan_item_id and r.status in ('requested','partially_reserved','reserved','in_transit') limit 1;
  if v_request_id is not null then return v_request_id; end if;
  raise;
end;
$$;

revoke all on function public.create_transfer_center_request(uuid,text,text,date,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_transfer_center_request(uuid,text,text,date,text,text,jsonb) to authenticated,service_role;

notify pgrst,'reload schema';

commit;
