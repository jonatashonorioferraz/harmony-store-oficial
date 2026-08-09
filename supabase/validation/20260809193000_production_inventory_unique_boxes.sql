-- Ensaio transacional da v25.58. Nada é persistido; números consumidos não são reutilizados.
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
  v_box_1 bigint;
  v_box_2 bigint;
  v_entry uuid;
  v_duplicate_blocked boolean := false;
  v_change_blocked boolean := false;
begin
  select id into v_model from public.finished_product_models where active order by name limit 1;
  select id into v_color from public.finished_production_colors where active order by sort_order,name limit 1;
  select id into v_worker from public.profiles where role='collaborator' and status='active' order by full_name limit 1;
  if v_model is null or v_color is null or v_worker is null then
    raise exception 'Catálogos de validação indisponíveis.';
  end if;

  v_box_1:=public.generate_production_inventory_box_number();
  v_box_2:=public.generate_production_inventory_box_number();
  if v_box_2<=v_box_1 then raise exception 'O gerador não avançou.'; end if;

  select created.id into v_entry
  from public.create_production_inventory_entry_v2(
    v_model,v_color,v_worker,10,current_date,v_box_1,
    'TESTE TRANSACIONAL','Validação automática com rollback'
  ) created;

  begin
    perform public.create_production_inventory_entry_v2(
      v_model,v_color,v_worker,1,current_date,v_box_1,
      'TESTE DUPLICADO','Deve falhar'
    );
  exception when unique_violation then
    v_duplicate_blocked:=true;
  end;
  if not v_duplicate_blocked then raise exception 'Código duplicado não foi bloqueado.'; end if;

  begin
    update public.production_inventory_entries set box_number=v_box_2 where id=v_entry;
  exception when check_violation then
    v_change_blocked:=true;
  end;
  if not v_change_blocked then raise exception 'Alteração do código não foi bloqueada.'; end if;

  perform public.withdraw_production_inventory_entry(
    v_entry,4,current_date,'Validação automática','Rollback ao final'
  );
  if (select current_quantity from public.production_inventory_entries where id=v_entry)<>6 then
    raise exception 'A saída parcial não preservou o saldo correto.';
  end if;
  if (select box_number from public.production_inventory_entries where id=v_entry)<>v_box_1 then
    raise exception 'A saída parcial alterou a identidade da caixa.';
  end if;
end
$$;

rollback;

select
  count(*) filter (where box_reference like 'TESTE%') as test_entries,
  count(*) filter (where m.notes like '%rollback%') as test_movements
from public.production_inventory_entries e
left join public.production_inventory_movements m on m.entry_id=e.id;
