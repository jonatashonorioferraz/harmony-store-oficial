-- Harmony Store Oficial — ativa o controle individual no produto personalizado já existente.
-- O produto está com saldo compartilhado zerado; cada colaboradora começa com saldo zero
-- até o ADM registrar a contagem física correspondente ao nome impresso nas etiquetas.

begin;

do $$
declare
  v_product_id uuid;
  v_match_count integer;
  v_physical numeric(14,3);
  v_reserved numeric(14,3);
  v_minimum numeric(14,3);
begin
  select count(*),min(id),min(physical_stock),min(reserved_stock),min(minimum_stock)
  into v_match_count,v_product_id,v_physical,v_reserved,v_minimum
  from public.products
  where lower(trim(name))=lower('Etiquetas de validade e lote 40x60 cm');

  if v_match_count<>1 then
    raise exception 'A ativação exige exatamente um produto Etiquetas de validade e lote 40x60 cm; encontrados: %.',v_match_count;
  end if;
  if v_physical<>0 or v_reserved<>0 then
    raise exception 'O saldo compartilhado das etiquetas precisa estar zerado antes da ativação individual.';
  end if;

  update public.products
  set stock_control_mode='collaborator'
  where id=v_product_id;

  insert into public.product_collaborator_stocks(product_id,collaborator_id,minimum_stock)
  select v_product_id,p.id,v_minimum
  from public.profiles p
  where p.role='collaborator'
  on conflict(product_id,collaborator_id) do nothing;

  update public.request_items item
  set stock_owner_id=request.requested_by
  from public.requests request
  where item.request_id=request.id
    and item.product_id=v_product_id
    and request.status in ('pending','separating','scheduled');

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(null,'product.stock_control_mode_activated','product',v_product_id::text,'migration',
    jsonb_build_object(
      'mode','collaborator',
      'reason','Produto personalizado por nome de colaboradora',
      'initial_balance_per_collaborator',0
    ));
end;
$$;

notify pgrst,'reload schema';
commit;
