-- Ensaio transacional da v25.59. Nenhuma caixa ou movimentação de teste permanece salva.
begin;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where role='admin' and status='active' order by is_primary_admin desc limit 1),
  true
);

do $$
declare
  v_model uuid;
  v_color uuid;
  v_worker uuid;
  v_entry uuid;
  v_partial_blocked boolean := false;
  v_repeat_blocked boolean := false;
  v_adjustment_blocked boolean := false;
begin
  select id into v_model from public.finished_product_models where active order by name limit 1;
  select id into v_color from public.finished_production_colors where active order by sort_order,name limit 1;
  select id into v_worker from public.profiles where role='collaborator' and status='active' order by full_name limit 1;
  if v_model is null or v_color is null or v_worker is null then
    raise exception 'Catálogos de validação indisponíveis.';
  end if;

  select created.id into v_entry
  from public.create_production_inventory_entry_v2(
    v_model,v_color,v_worker,150,current_date,859000000000001,
    'TESTE TRANSACIONAL V25.59','Validação automática com rollback'
  ) created;

  begin
    perform public.withdraw_production_inventory_entry(
      v_entry,149,current_date,'Tentativa parcial','Deve falhar'
    );
  exception when check_violation then
    v_partial_blocked:=true;
  end;
  if not v_partial_blocked then raise exception 'A retirada parcial não foi bloqueada.'; end if;
  if (select current_quantity from public.production_inventory_entries where id=v_entry)<>150 then
    raise exception 'A tentativa parcial alterou o saldo.';
  end if;

  perform public.transfer_production_inventory_box_to_ecommerce(
    v_entry,current_date,'Ensaio de transferência integral'
  );
  if not exists(
    select 1 from public.production_inventory_entries
    where id=v_entry and current_quantity=0 and transfer_destination='ecommerce'
      and transferred_on=current_date and transferred_at is not null and transferred_by=auth.uid()
  ) then
    raise exception 'A transferência integral não gravou o estado esperado.';
  end if;
  if not exists(
    select 1 from public.production_inventory_movements
    where entry_id=v_entry and movement_type='exit' and quantity=150
      and balance_before=150 and balance_after=0
  ) then
    raise exception 'A movimentação integral não foi registrada corretamente.';
  end if;

  begin
    perform public.transfer_production_inventory_box_to_ecommerce(v_entry,current_date,null);
  exception when check_violation then
    v_repeat_blocked:=true;
  end;
  if not v_repeat_blocked then raise exception 'A segunda transferência não foi bloqueada.'; end if;

  begin
    perform public.adjust_production_inventory_entry(
      v_entry,10,current_date,'Tentativa após transferência',null
    );
  exception when check_violation then
    v_adjustment_blocked:=true;
  end;
  if not v_adjustment_blocked then raise exception 'O ajuste posterior não foi bloqueado.'; end if;
end
$$;

rollback;

select
  count(distinct e.id) filter (where e.box_reference='TESTE TRANSACIONAL V25.59') as test_entries,
  count(m.id) filter (where m.notes='Ensaio de transferência integral') as test_movements
from public.production_inventory_entries e
left join public.production_inventory_movements m on m.entry_id=e.id;
