-- Harmony Store Oficial — coleta com vários modelos e conferência de quantidades.
-- Atualização aditiva: cada recebimento antigo se torna uma coleta individual sem divergência.

begin;

alter table public.finished_production_receipts
  add column if not exists collection_id uuid,
  add column if not exists declared_quantity bigint,
  add column if not exists box_reference text;

update public.finished_production_receipts
set collection_id = coalesce(collection_id, gen_random_uuid()),
    declared_quantity = coalesce(declared_quantity, quantity)
where collection_id is null or declared_quantity is null;

alter table public.finished_production_receipts
  alter column collection_id set not null,
  alter column collection_id set default gen_random_uuid(),
  alter column declared_quantity set not null,
  add column if not exists quantity_difference bigint
    generated always as (quantity - declared_quantity) stored;

alter table public.finished_production_receipts
  drop constraint if exists finished_production_receipts_quantity_check,
  drop constraint if exists finished_receipts_official_quantity_check,
  drop constraint if exists finished_receipts_declared_quantity_check,
  drop constraint if exists finished_receipts_box_reference_check;

alter table public.finished_production_receipts
  add constraint finished_receipts_official_quantity_check check (quantity >= 0),
  add constraint finished_receipts_declared_quantity_check check (declared_quantity >= 0),
  add constraint finished_receipts_box_reference_check check (
    box_reference is null or length(trim(box_reference)) between 1 and 80
  );

create index if not exists finished_receipts_collection_idx
  on public.finished_production_receipts(collection_id);

drop function if exists public.list_finished_production_receipts(date,date,uuid);
create function public.list_finished_production_receipts(
  p_from date default null,
  p_to date default null,
  p_worker_id uuid default null
) returns table(
  id uuid, collection_id uuid, protocol bigint, worker_id uuid, worker_name text,
  model_id uuid, model_name text, color text, declared_quantity bigint, quantity bigint,
  quantity_difference bigint, box_reference text, received_on date, received_by uuid,
  receiver_name text, notes text, closing_id uuid, created_at timestamptz,
  rate_per_100 numeric, amount numeric
)
language plpgsql security definer set search_path = '' as $$
declare v_role text; v_uid uuid := (select auth.uid());
begin
  select p.role into v_role from public.profiles p where p.id=v_uid and p.status='active';
  if v_role is null then raise exception 'Acesso negado.'; end if;
  return query
  select r.id,r.collection_id,r.protocol,r.worker_id,w.full_name,r.model_id,m.name,r.color,
    r.declared_quantity,r.quantity,r.quantity_difference,r.box_reference,r.received_on,
    r.received_by,receiver.full_name,r.notes,r.closing_id,r.created_at,
    case when v_role='admin' or (v_role='collaborator' and r.worker_id=v_uid)
      then r.rate_per_100_snapshot else null::numeric end,
    case when v_role='admin' or (v_role='collaborator' and r.worker_id=v_uid)
      then round(r.quantity::numeric*r.rate_per_100_snapshot/100,4) else null::numeric end
  from public.finished_production_receipts r
  join public.profiles w on w.id=r.worker_id
  join public.profiles receiver on receiver.id=r.received_by
  join public.finished_product_models m on m.id=r.model_id
  where (v_role in ('admin','receiver') or r.worker_id=v_uid)
    and (p_from is null or r.received_on>=p_from)
    and (p_to is null or r.received_on<=p_to)
    and (p_worker_id is null or r.worker_id=p_worker_id)
  order by r.received_on desc,r.collection_id,r.protocol;
end;
$$;

create or replace function public.create_finished_production_collection(
  p_worker_id uuid, p_received_on date, p_box_reference text default null,
  p_notes text default null, p_items jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_collection_id uuid := gen_random_uuid();
  v_item record;
  v_rate numeric;
begin
  if not ((select private.is_admin()) or (select private.is_production_receiver())) then raise exception 'Acesso negado.'; end if;
  if p_received_on is null or p_received_on>current_date then raise exception 'Informe uma data de recebimento válida.'; end if;
  if length(trim(coalesce(p_box_reference,'')))>80 then raise exception 'A identificação da coleta deve ter no máximo 80 caracteres.'; end if;
  if not exists(select 1 from public.profiles where id=p_worker_id and status='active' and role in ('collaborator','receiver')) then
    raise exception 'Colaboradora inválida ou inativa.';
  end if;
  if exists(select 1 from public.production_weekly_closings where worker_id=p_worker_id and p_received_on between week_start and week_end) then
    raise exception 'A semana desta colaboradora já está fechada. Reabra o fechamento antes de lançar.';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Adicione de 1 a 100 modelos neste recebimento.';
  end if;
  for v_item in
    select * from jsonb_to_recordset(p_items) as x(
      model_id uuid, color text, declared_quantity bigint, quantity bigint
    )
  loop
    if v_item.quantity is null or v_item.quantity<0 then raise exception 'Informe uma contagem oficial igual ou maior que zero.'; end if;
    if v_item.declared_quantity is null or v_item.declared_quantity<0 then raise exception 'Informe a quantidade anotada na folha.'; end if;
    if length(trim(coalesce(v_item.color,'')))=0 then raise exception 'Informe a cor de todos os modelos.'; end if;
    select rate_per_100 into v_rate from public.finished_product_models where id=v_item.model_id and active;
    if not found then raise exception 'Um dos modelos é inválido ou está inativo.'; end if;
    insert into public.finished_production_receipts(
      collection_id,worker_id,model_id,color,declared_quantity,quantity,box_reference,
      received_on,rate_per_100_snapshot,notes,received_by
    ) values(
      v_collection_id,p_worker_id,v_item.model_id,trim(v_item.color),v_item.declared_quantity,
      v_item.quantity,nullif(trim(p_box_reference),''),p_received_on,v_rate,
      nullif(trim(p_notes),''),(select auth.uid())
    );
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'production.collection_created','finished_production_collection',v_collection_id::text,
    jsonb_build_object('worker_id',p_worker_id,'received_on',p_received_on,'box_reference',nullif(trim(p_box_reference),''),'items',jsonb_array_length(p_items)));
  return v_collection_id;
end;
$$;

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
begin
  select * into v_record from public.finished_production_receipts
  where collection_id=p_collection_id order by protocol limit 1 for update;
  if not found then raise exception 'Recebimento não localizado.'; end if;
  if not (select private.is_admin()) and not ((select private.is_production_receiver()) and v_record.received_by=(select auth.uid())) then
    raise exception 'Você só pode corrigir recebimentos lançados por você.';
  end if;
  if exists(select 1 from public.finished_production_receipts where collection_id=p_collection_id and closing_id is not null) then
    raise exception 'A semana está fechada. Reabra o fechamento antes de corrigir.';
  end if;
  if p_received_on is null or p_received_on>current_date then raise exception 'Informe uma data de recebimento válida.'; end if;
  if length(trim(coalesce(p_box_reference,'')))>80 then raise exception 'A identificação da coleta deve ter no máximo 80 caracteres.'; end if;
  if not exists(select 1 from public.profiles where id=p_worker_id and status='active' and role in ('collaborator','receiver')) then raise exception 'Colaboradora inválida.'; end if;
  if exists(select 1 from public.production_weekly_closings where worker_id=p_worker_id and p_received_on between week_start and week_end) then
    raise exception 'A semana desta colaboradora já está fechada. Reabra o fechamento antes de corrigir.';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Adicione de 1 a 100 modelos neste recebimento.';
  end if;
  delete from public.finished_production_receipts where collection_id=p_collection_id;
  for v_item in
    select * from jsonb_to_recordset(p_items) as x(
      model_id uuid, color text, declared_quantity bigint, quantity bigint
    )
  loop
    if v_item.quantity is null or v_item.quantity<0 then raise exception 'Informe uma contagem oficial igual ou maior que zero.'; end if;
    if v_item.declared_quantity is null or v_item.declared_quantity<0 then raise exception 'Informe a quantidade anotada na folha.'; end if;
    if length(trim(coalesce(v_item.color,'')))=0 then raise exception 'Informe a cor de todos os modelos.'; end if;
    select rate_per_100 into v_rate from public.finished_product_models where id=v_item.model_id;
    if not found then raise exception 'Um dos modelos é inválido.'; end if;
    insert into public.finished_production_receipts(
      collection_id,worker_id,model_id,color,declared_quantity,quantity,box_reference,
      received_on,rate_per_100_snapshot,notes,received_by
    ) values(
      p_collection_id,p_worker_id,v_item.model_id,trim(v_item.color),v_item.declared_quantity,
      v_item.quantity,nullif(trim(p_box_reference),''),p_received_on,v_rate,
      nullif(trim(p_notes),''),v_record.received_by
    );
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'production.collection_updated','finished_production_collection',p_collection_id::text,
    jsonb_build_object('worker_id',p_worker_id,'received_on',p_received_on,'box_reference',nullif(trim(p_box_reference),''),'items',jsonb_array_length(p_items)));
end;
$$;

create or replace function public.delete_finished_production_collection(p_collection_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_record public.finished_production_receipts; v_items bigint;
begin
  select * into v_record from public.finished_production_receipts
  where collection_id=p_collection_id order by protocol limit 1 for update;
  if not found then raise exception 'Recebimento não localizado.'; end if;
  if not (select private.is_admin()) and not ((select private.is_production_receiver()) and v_record.received_by=(select auth.uid())) then raise exception 'Acesso negado.'; end if;
  if exists(select 1 from public.finished_production_receipts where collection_id=p_collection_id and closing_id is not null) then
    raise exception 'A semana está fechada. Reabra o fechamento antes de excluir.';
  end if;
  select count(*) into v_items from public.finished_production_receipts where collection_id=p_collection_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'production.collection_deleted','finished_production_collection',p_collection_id::text,
    jsonb_build_object('worker_id',v_record.worker_id,'received_on',v_record.received_on,'items',v_items));
  delete from public.finished_production_receipts where collection_id=p_collection_id;
end;
$$;

-- Compatibilidade temporária com uma versão antiga ainda armazenada no celular.
create or replace function public.create_finished_production_receipt(
  p_worker_id uuid, p_model_id uuid, p_color text, p_quantity bigint,
  p_received_on date, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  return public.create_finished_production_collection(
    p_worker_id,p_received_on,null,p_notes,
    jsonb_build_array(jsonb_build_object('model_id',p_model_id,'color',p_color,'declared_quantity',p_quantity,'quantity',p_quantity))
  );
end;
$$;

create or replace function public.update_finished_production_receipt(
  p_receipt_id uuid, p_worker_id uuid, p_model_id uuid, p_color text,
  p_quantity bigint, p_received_on date, p_notes text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_record public.finished_production_receipts; v_rate numeric;
begin
  select * into v_record from public.finished_production_receipts where id=p_receipt_id for update;
  if not found then raise exception 'Recebimento não localizado.'; end if;
  if not (select private.is_admin()) and not ((select private.is_production_receiver()) and v_record.received_by=(select auth.uid())) then raise exception 'Acesso negado.'; end if;
  if v_record.closing_id is not null then raise exception 'A semana está fechada. Reabra o fechamento antes de corrigir.'; end if;
  select rate_per_100 into v_rate from public.finished_product_models where id=p_model_id;
  if not found then raise exception 'Modelo inválido.'; end if;
  update public.finished_production_receipts set worker_id=p_worker_id,model_id=p_model_id,color=trim(p_color),
    declared_quantity=p_quantity,quantity=p_quantity,received_on=p_received_on,rate_per_100_snapshot=v_rate,
    notes=nullif(trim(p_notes),'') where id=p_receipt_id;
end;
$$;

create or replace function public.admin_close_production_week(p_worker_id uuid,p_week_start date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_quantity bigint; v_amount numeric; v_receipt_count bigint;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  if p_week_start is null or extract(isodow from p_week_start)<>1 then raise exception 'A semana deve começar em uma segunda-feira.'; end if;
  if exists(select 1 from public.production_weekly_closings where worker_id=p_worker_id and week_start=p_week_start) then raise exception 'Esta semana já foi fechada para a colaboradora.'; end if;
  select count(*),coalesce(sum(quantity),0),coalesce(round(sum(quantity::numeric*rate_per_100_snapshot/100),2),0)
    into v_receipt_count,v_quantity,v_amount from public.finished_production_receipts
    where worker_id=p_worker_id and received_on between p_week_start and p_week_start+6 and closing_id is null;
  if v_receipt_count=0 then raise exception 'Não existem recebimentos em aberto nesta semana.'; end if;
  insert into public.production_weekly_closings(worker_id,week_start,total_quantity,total_amount,closed_by)
  values(p_worker_id,p_week_start,v_quantity,v_amount,(select auth.uid())) returning id into v_id;
  update public.finished_production_receipts set closing_id=v_id
  where worker_id=p_worker_id and received_on between p_week_start and p_week_start+6 and closing_id is null;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'production.week_closed','production_weekly_closing',v_id::text,
    jsonb_build_object('worker_id',p_worker_id,'week_start',p_week_start,'quantity',v_quantity,'amount',v_amount));
  return v_id;
end;
$$;

drop function if exists public.admin_production_statement(uuid);
create function public.admin_production_statement(p_closing_id uuid)
returns table(
  closing_id uuid, protocol bigint, worker_name text, week_start date, week_end date,
  collection_id uuid, receipt_protocol bigint, received_on date, box_reference text,
  model_name text, color text, declared_quantity bigint, quantity bigint,
  quantity_difference bigint, rate_per_100 numeric, line_amount numeric,
  total_quantity bigint, total_amount numeric, status text, paid_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  return query select c.id,c.protocol,w.full_name,c.week_start,c.week_end,r.collection_id,r.protocol,
    r.received_on,r.box_reference,m.name,r.color,r.declared_quantity,r.quantity,r.quantity_difference,
    r.rate_per_100_snapshot,round(r.quantity::numeric*r.rate_per_100_snapshot/100,4),
    c.total_quantity,c.total_amount,c.status,c.paid_at
  from public.production_weekly_closings c
  join public.profiles w on w.id=c.worker_id
  join public.finished_production_receipts r on r.closing_id=c.id
  join public.finished_product_models m on m.id=r.model_id
  where c.id=p_closing_id order by r.received_on,r.collection_id,r.protocol;
end;
$$;

revoke all on function public.list_finished_production_receipts(date,date,uuid) from public, anon;
revoke all on function public.create_finished_production_collection(uuid,date,text,text,jsonb) from public, anon;
revoke all on function public.update_finished_production_collection(uuid,uuid,date,text,text,jsonb) from public, anon;
revoke all on function public.delete_finished_production_collection(uuid) from public, anon;
revoke all on function public.create_finished_production_receipt(uuid,uuid,text,bigint,date,text) from public, anon;
revoke all on function public.update_finished_production_receipt(uuid,uuid,uuid,text,bigint,date,text) from public, anon;
revoke all on function public.admin_close_production_week(uuid,date) from public, anon;
revoke all on function public.admin_production_statement(uuid) from public, anon;

grant execute on function public.list_finished_production_receipts(date,date,uuid) to authenticated;
grant execute on function public.create_finished_production_collection(uuid,date,text,text,jsonb) to authenticated;
grant execute on function public.update_finished_production_collection(uuid,uuid,date,text,text,jsonb) to authenticated;
grant execute on function public.delete_finished_production_collection(uuid) to authenticated;
grant execute on function public.create_finished_production_receipt(uuid,uuid,text,bigint,date,text) to authenticated;
grant execute on function public.update_finished_production_receipt(uuid,uuid,uuid,text,bigint,date,text) to authenticated;
grant execute on function public.admin_close_production_week(uuid,date) to authenticated;
grant execute on function public.admin_production_statement(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
