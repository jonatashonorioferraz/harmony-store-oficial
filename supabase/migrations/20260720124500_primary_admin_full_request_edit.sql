-- Harmony Store Oficial — edição integral e auditada de solicitações pelo ADM principal.

begin;

create or replace function public.primary_admin_update_request(
  p_request_id uuid,
  p_items jsonb,
  p_admin_notes text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_status text;
  v_before jsonb;
  v_after jsonb;
  v_item record;
  v_product public.products%rowtype;
  v_requested numeric(14,3);
  v_approved numeric(14,3);
  v_old_effective numeric(14,3);
  v_new_effective numeric(14,3);
  v_delta numeric(14,3);
begin
  if not (select private.is_primary_admin()) then
    raise exception 'Apenas o ADM principal pode editar completamente uma solicitação.' using errcode='42501';
  end if;
  if nullif(trim(p_reason),'') is null or length(trim(p_reason))<5 then
    raise exception 'Informe o motivo da alteração com pelo menos 5 caracteres.';
  end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'A solicitação precisa ter pelo menos um produto.';
  end if;
  if exists(
    select 1
    from jsonb_to_recordset(p_items) as x(product_id uuid,requested_quantity numeric,approved_quantity numeric,removed boolean,admin_note text)
    group by x.product_id having count(*)>1
  ) then
    raise exception 'O mesmo produto não pode aparecer duas vezes.';
  end if;

  select r.status into v_status
  from public.requests r
  where r.id=p_request_id
  for update;
  if v_status is null then raise exception 'Solicitação não localizada.' using errcode='P0002'; end if;
  if v_status='cancelled' then raise exception 'Solicitações canceladas permanecem protegidas.'; end if;
  if v_status not in ('pending','separating','scheduled','delivered') then raise exception 'Situação da solicitação inválida.'; end if;

  select jsonb_build_object(
    'request',to_jsonb(r),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from public.request_items i where i.request_id=r.id),'[]'::jsonb)
  ) into v_before
  from public.requests r where r.id=p_request_id;

  -- Bloqueio determinístico evita concorrência e mantém estoque/itens na mesma transação.
  perform 1
  from public.products p
  where p.id in (
    select i.product_id from public.request_items i where i.request_id=p_request_id
    union
    select x.product_id from jsonb_to_recordset(p_items) as x(product_id uuid)
  )
  order by p.id
  for update;

  if exists(
    select 1
    from jsonb_to_recordset(p_items) as x(product_id uuid,requested_quantity numeric,approved_quantity numeric,removed boolean,admin_note text)
    left join public.products p on p.id=x.product_id
    left join public.request_items old on old.request_id=p_request_id and old.product_id=x.product_id
    where p.id is null
       or p.usage_scope='internal'
       or (old.id is null and not p.active)
       or coalesce(x.requested_quantity,0)<=0
       or (not coalesce(x.removed,false) and v_status<>'pending' and (x.approved_quantity is null or x.approved_quantity<0 or x.approved_quantity>x.requested_quantity))
  ) then
    raise exception 'Revise produtos e quantidades. Use apenas matérias-primas válidas e mantenha a quantidade enviada entre zero e a solicitada.';
  end if;
  if not exists(
    select 1 from jsonb_to_recordset(p_items) as x(product_id uuid,requested_quantity numeric,approved_quantity numeric,removed boolean,admin_note text)
    where not coalesce(x.removed,false)
  ) then
    raise exception 'Mantenha pelo menos um produto na solicitação.';
  end if;

  for v_item in
    with old_items as (
      select i.* from public.request_items i where i.request_id=p_request_id
    ), incoming as (
      select * from jsonb_to_recordset(p_items)
        as x(product_id uuid,requested_quantity numeric,approved_quantity numeric,removed boolean,admin_note text)
    )
    select coalesce(n.product_id,o.product_id) as product_id,
      o.id as item_id,o.requested_quantity as old_requested,o.approved_quantity as old_approved,
      coalesce(o.removed_by_admin,false) as old_removed,
      n.requested_quantity as new_requested,n.approved_quantity as new_approved,
      case when n.product_id is null then true else coalesce(n.removed,false) end as new_removed,
      n.admin_note as new_note
    from old_items o full join incoming n using(product_id)
    order by coalesce(n.product_id,o.product_id)
  loop
    select * into v_product from public.products p where p.id=v_item.product_id;
    v_requested:=coalesce(v_item.new_requested,v_item.old_requested);
    v_approved:=case
      when v_status='pending' then null
      when v_item.new_removed then 0
      else coalesce(v_item.new_approved,0)
    end;
    v_old_effective:=case when v_item.item_id is not null and not v_item.old_removed then coalesce(v_item.old_approved,0) else 0 end;
    v_new_effective:=case when v_item.new_removed then 0 else coalesce(v_approved,0) end;
    v_delta:=v_new_effective-v_old_effective;

    if v_status in ('separating','scheduled') and v_delta<>0 then
      if v_product.reserved_stock+v_delta<0 or v_product.reserved_stock+v_delta>v_product.physical_stock then
        raise exception 'Estoque disponível insuficiente para %.',v_product.name;
      end if;
      update public.products set reserved_stock=reserved_stock+v_delta where id=v_product.id;
      insert into public.stock_movements(product_id,request_id,movement_type,quantity,reason,created_by)
      values(v_product.id,p_request_id,case when v_delta>0 then 'reserve' else 'release' end,abs(v_delta),
        'Correção integral pelo ADM principal: '||trim(p_reason),v_actor);
    elsif v_status='delivered' and v_delta<>0 then
      if v_delta>0 and v_product.physical_stock<v_delta then
        raise exception 'Estoque físico insuficiente para acrescentar %.',v_product.name;
      end if;
      update public.products
      set physical_stock=physical_stock-v_delta
      where id=v_product.id;
      insert into public.stock_movements(product_id,request_id,movement_type,quantity,reason,created_by)
      values(v_product.id,p_request_id,'adjustment',abs(v_delta),
        case when v_delta>0 then 'Correção de entrega: saída adicional — ' else 'Correção de entrega: devolução ao estoque — ' end||trim(p_reason),v_actor);
    end if;

    if v_item.item_id is null then
      if not v_item.new_removed then
        insert into public.request_items(request_id,product_id,requested_quantity,approved_quantity,removed_by_admin,admin_note)
        values(p_request_id,v_item.product_id,v_requested,v_approved,false,nullif(trim(v_item.new_note),''));
      end if;
    else
      update public.request_items
      set requested_quantity=v_requested,
          approved_quantity=v_approved,
          removed_by_admin=v_item.new_removed,
          admin_note=nullif(trim(v_item.new_note),'')
      where id=v_item.item_id;
    end if;
  end loop;

  update public.requests set admin_notes=nullif(trim(p_admin_notes),'') where id=p_request_id;

  select jsonb_build_object(
    'request',to_jsonb(r),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from public.request_items i where i.request_id=r.id),'[]'::jsonb)
  ) into v_after
  from public.requests r where r.id=p_request_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'request.primary_admin_full_update','request',p_request_id::text,
    jsonb_build_object('status',v_status,'reason',trim(p_reason),'before',v_before,'after',v_after));
end;
$$;

revoke all on function public.primary_admin_update_request(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.primary_admin_update_request(uuid,jsonb,text,text) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
