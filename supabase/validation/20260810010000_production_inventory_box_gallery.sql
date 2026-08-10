-- Validação transacional da galeria e do contador de caixas. Não altera dados.
begin;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where role='admin' and status='active' order by is_primary_admin desc limit 1),
  true
);

do $$
declare
  v_expected bigint;
  v_counter bigint;
  v_listed bigint;
  v_wrong_order boolean;
begin
  select count(*)::bigint into v_expected
  from public.production_inventory_entries
  where current_quantity>0 and transferred_at is null;

  select public.get_production_inventory_available_box_count() into v_counter;
  select count(*)::bigint into v_listed
  from public.list_available_production_inventory_boxes();

  if v_counter<>v_expected or v_listed<>v_expected then
    raise exception 'Contador ou galeria divergente: esperado %, contador %, lista %.',v_expected,v_counter,v_listed;
  end if;

  if exists(
    select 1 from public.list_available_production_inventory_boxes()
    where current_quantity<=0
  ) then
    raise exception 'A galeria retornou uma caixa sem saldo.';
  end if;

  select exists(
    select 1
    from (
      select box_number,lag(box_number) over() as previous_box
      from public.list_available_production_inventory_boxes()
    ) ordered
    where previous_box is not null and box_number>previous_box
  ) into v_wrong_order;
  if v_wrong_order then
    raise exception 'A galeria não está ordenada da caixa mais nova para a mais antiga.';
  end if;
end
$$;

rollback;
