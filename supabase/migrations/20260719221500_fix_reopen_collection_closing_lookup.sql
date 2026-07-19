-- Corrige a leitura do UUID do fechamento na reabertura de coletas.
-- Mantém a função completa para instalações novas e bancos que já receberam a versão anterior.

begin;

create or replace function public.update_finished_production_collection(
  p_collection_id uuid, p_worker_id uuid, p_received_on date,
  p_box_reference text default null, p_notes text default null,
  p_items jsonb default '[]'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_record public.finished_production_receipts;
  v_item record;
  v_rate numeric;
  v_closing_id uuid;
  v_closing_status text;
  v_old_items bigint;
  v_new_quantity bigint;
  v_new_amount numeric;
begin
  if not ((select private.is_admin()) or (select private.is_production_receiver())) then
    raise exception 'Apenas ADM ou Recebimento pode corrigir esta coleta.';
  end if;

  select * into v_record
  from public.finished_production_receipts
  where collection_id = p_collection_id
  order by protocol
  limit 1
  for update;

  if not found then raise exception 'Recebimento não localizado.'; end if;

  select count(*) into v_old_items
  from public.finished_production_receipts
  where collection_id = p_collection_id;

  v_closing_id := v_record.closing_id;
  if exists(
    select 1 from public.finished_production_receipts
    where collection_id = p_collection_id
      and closing_id is distinct from v_closing_id
  ) then
    raise exception 'A coleta possui vínculos de fechamento inconsistentes.';
  end if;

  if v_closing_id is not null then
    select status into v_closing_status
    from public.production_weekly_closings
    where id = v_closing_id
    for update;

    if not found then raise exception 'Fechamento da coleta não localizado.'; end if;
    if v_closing_status = 'paid' then
      raise exception 'Este pagamento já foi realizado. Registre um ajuste em uma nova coleta.';
    end if;
    if v_closing_status <> 'closed' then
      raise exception 'O fechamento desta coleta está em uma situação inválida.';
    end if;
    if p_worker_id is distinct from v_record.worker_id or p_received_on is distinct from v_record.received_on then
      raise exception 'Em uma coleta fechada, mantenha a colaboradora e a data originais.';
    end if;
  end if;

  if p_received_on is null or p_received_on > current_date then
    raise exception 'Informe uma data de recebimento válida.';
  end if;
  if length(trim(coalesce(p_box_reference, ''))) > 80 then
    raise exception 'A identificação da coleta deve ter no máximo 80 caracteres.';
  end if;
  if not exists(
    select 1 from public.profiles
    where id = p_worker_id and status = 'active' and role in ('collaborator', 'receiver')
  ) then
    raise exception 'Colaboradora inválida ou inativa.';
  end if;
  if v_closing_id is null and exists(
    select 1 from public.production_weekly_closings
    where worker_id = p_worker_id and p_received_on between week_start and week_end
  ) then
    raise exception 'A semana desta colaboradora já está fechada.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Adicione de 1 a 100 modelos neste recebimento.';
  end if;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(
      model_id uuid, color text, declared_quantity bigint, quantity bigint
    )
  loop
    if v_item.quantity is null or v_item.quantity < 0 then
      raise exception 'Informe uma contagem oficial igual ou maior que zero.';
    end if;
    if v_item.declared_quantity is null or v_item.declared_quantity < 0 then
      raise exception 'Informe a quantidade anotada na folha.';
    end if;
    if length(trim(coalesce(v_item.color, ''))) = 0 then
      raise exception 'Informe a cor de todos os modelos.';
    end if;
    perform 1 from public.finished_product_models where id = v_item.model_id;
    if not found then raise exception 'Um dos modelos é inválido.'; end if;
  end loop;

  delete from public.finished_production_receipts
  where collection_id = p_collection_id;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(
      model_id uuid, color text, declared_quantity bigint, quantity bigint
    )
  loop
    select rate_per_100 into v_rate
    from public.finished_product_models
    where id = v_item.model_id;

    insert into public.finished_production_receipts(
      collection_id, worker_id, model_id, color, declared_quantity, quantity,
      box_reference, received_on, rate_per_100_snapshot, notes, received_by, closing_id
    ) values (
      p_collection_id, p_worker_id, v_item.model_id, trim(v_item.color),
      v_item.declared_quantity, v_item.quantity, nullif(trim(p_box_reference), ''),
      p_received_on, v_rate, nullif(trim(p_notes), ''), (select auth.uid()), v_closing_id
    );
  end loop;

  if v_closing_id is not null then
    select coalesce(sum(quantity), 0),
           coalesce(round(sum(quantity::numeric * rate_per_100_snapshot / 100), 2), 0)
    into v_new_quantity, v_new_amount
    from public.finished_production_receipts
    where closing_id = v_closing_id;

    update public.production_weekly_closings
    set total_quantity = v_new_quantity,
        total_amount = v_new_amount
    where id = v_closing_id and status = 'closed';
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values(
    (select auth.uid()),
    case when v_closing_id is null
      then 'production.collection_updated'
      else 'production.collection_reopened_updated'
    end,
    'finished_production_collection',
    p_collection_id::text,
    jsonb_build_object(
      'worker_id', p_worker_id,
      'received_on', p_received_on,
      'box_reference', nullif(trim(p_box_reference), ''),
      'previous_items', v_old_items,
      'items', jsonb_array_length(p_items),
      'closing_id', v_closing_id,
      'closed_totals_recalculated', v_closing_id is not null
    )
  );
end;
$$;

revoke all on function public.update_finished_production_collection(uuid,uuid,date,text,text,jsonb)
  from public, anon;
grant execute on function public.update_finished_production_collection(uuid,uuid,date,text,text,jsonb)
  to authenticated;

notify pgrst, 'reload schema';

commit;
