begin;

-- Corrige a contagem fisica sem perder a solicitacao aberta nem alterar reservas.
create function public.admin_correct_stock_during_separation(
  p_request_id uuid,
  p_request_item_id uuid,
  p_counted_stock numeric,
  p_expected_stock numeric,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_request_status text;
  v_item public.request_items%rowtype;
  v_product public.products%rowtype;
  v_stock public.product_collaborator_stocks%rowtype;
  v_check_status text;
  v_physical numeric(14,3);
  v_reserved numeric(14,3);
  v_own_reserved numeric(14,3) := 0;
  v_required numeric(14,3);
  v_discrepancy_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_counted_stock is null or p_counted_stock < 0 or p_counted_stock <> round(p_counted_stock,3) then
    raise exception 'Informe um total fisico valido, com ate tres casas decimais.';
  end if;
  if length(trim(coalesce(p_reason,''))) < 3 or length(trim(p_reason)) > 500 then
    raise exception 'Informe um motivo entre 3 e 500 caracteres.';
  end if;

  select status into v_request_status from public.requests
  where id = p_request_id for update;
  if v_request_status is null or v_request_status not in ('pending','separating') then
    raise exception 'Esta solicitacao nao aceita correcoes de estoque durante a separacao.';
  end if;
  select * into v_item from public.request_items
  where id = p_request_item_id and request_id = p_request_id for update;
  if not found then raise exception 'Item da solicitacao nao localizado.'; end if;
  select * into v_product from public.products where id = v_item.product_id for update;
  if not found then raise exception 'Produto nao localizado.'; end if;

  select status into v_check_status from public.separation_checkup_items
  where request_id = p_request_id and request_item_id = p_request_item_id for update;
  if v_check_status = 'out_of_stock' then
    raise exception 'Este item ja foi marcado como sem estoque. Revise a ocorrencia antes de corrigir o saldo.';
  end if;

  if v_product.stock_control_mode = 'collaborator' then
    if v_item.stock_owner_id is null then
      raise exception 'A colaboradora responsavel pelo estoque nao foi identificada.';
    end if;
    select * into v_stock from public.product_collaborator_stocks
    where product_id = v_product.id and collaborator_id = v_item.stock_owner_id for update;
    if not found then raise exception 'Estoque individual nao localizado.'; end if;
    v_physical := v_stock.physical_stock;
    v_reserved := v_stock.reserved_stock;
  else
    if v_item.stock_owner_id is not null then
      raise exception 'O item tem uma proprietaria de estoque inesperada. Revise o cadastro.';
    end if;
    v_physical := v_product.physical_stock;
    v_reserved := v_product.reserved_stock;
  end if;

  if p_expected_stock is null or p_expected_stock is distinct from v_physical then
    raise exception 'O saldo mudou desde que a tela foi aberta. Reabra a correcao para conferir o valor atual.';
  end if;
  if p_counted_stock < v_reserved then
    raise exception 'O total fisico nao pode ficar abaixo do estoque reservado (%).',v_reserved;
  end if;
  if p_counted_stock = v_physical then
    raise exception 'A contagem informada e igual ao saldo atual.';
  end if;
  if v_check_status = 'separated' then
    if v_request_status = 'separating' then
      v_own_reserved := coalesce(v_item.approved_quantity,0);
    end if;
    v_required := coalesce(v_item.approved_quantity,v_item.requested_quantity);
    if p_counted_stock - v_reserved + v_own_reserved < v_required then
      raise exception 'A nova contagem nao cobre este item ja separado. Desmarque Separado antes de corrigir.';
    end if;
  end if;

  if v_product.stock_control_mode = 'collaborator' then
    update public.product_collaborator_stocks
    set physical_stock = p_counted_stock, updated_at = now()
    where id = v_stock.id;
  else
    update public.products
    set physical_stock = p_counted_stock, updated_at = now()
    where id = v_product.id;
  end if;

  insert into public.stock_movements(
    product_id, stock_owner_id, request_id, movement_type, quantity, reason, created_by
  ) values (
    v_product.id, v_item.stock_owner_id, p_request_id, 'adjustment',
    abs(p_counted_stock - v_physical),
    'Correcao de contagem durante separacao: ' || trim(p_reason), v_actor
  );
  insert into public.stock_discrepancies(
    product_id, stock_owner_id, request_id, request_item_id, discrepancy_type,
    system_stock, counted_stock, difference, reason, status, recorded_by,
    reviewed_by, reviewed_at, review_note
  ) values (
    v_product.id, v_item.stock_owner_id, p_request_id, v_item.id, 'count_difference',
    v_physical, p_counted_stock, p_counted_stock - v_physical, trim(p_reason),
    'adjusted', v_actor, v_actor, now(), 'Corrigido durante a separacao: ' || trim(p_reason)
  ) returning id into v_discrepancy_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, origin, details)
  values(v_actor, 'stock.corrected_during_separation', 'stock_discrepancy',
    v_discrepancy_id::text, 'database', jsonb_build_object(
      'request_id', p_request_id, 'request_item_id', v_item.id,
      'product_id', v_product.id, 'stock_owner_id', v_item.stock_owner_id,
      'before', v_physical, 'after', p_counted_stock,
      'reserved_stock', v_reserved, 'reason', trim(p_reason)));

  return jsonb_build_object('physical_stock',p_counted_stock,
    'reserved_stock',v_reserved,'discrepancy_id',v_discrepancy_id);
end;
$$;

revoke all on function public.admin_correct_stock_during_separation(uuid,uuid,numeric,numeric,text)
  from public, anon, authenticated;
grant execute on function public.admin_correct_stock_during_separation(uuid,uuid,numeric,numeric,text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
