-- Harmony Store Oficial — transferência integral de caixas para o estoque do e-commerce.
-- A caixa deixa o Inventário de Produção inteira; retiradas parciais são bloqueadas no banco.

begin;

alter table public.production_inventory_entries
  add column if not exists transfer_destination text,
  add column if not exists transferred_on date,
  add column if not exists transferred_at timestamptz,
  add column if not exists transferred_by uuid references public.profiles(id) on delete restrict;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.production_inventory_entries'::regclass
      and conname='production_inventory_transfer_destination_check'
  ) then
    alter table public.production_inventory_entries
      add constraint production_inventory_transfer_destination_check
      check (transfer_destination is null or transfer_destination='ecommerce');
  end if;
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.production_inventory_entries'::regclass
      and conname='production_inventory_transfer_state_check'
  ) then
    alter table public.production_inventory_entries
      add constraint production_inventory_transfer_state_check check (
        (
          transfer_destination is null and transferred_on is null
          and transferred_at is null and transferred_by is null
        ) or (
          transfer_destination='ecommerce' and transferred_on is not null
          and transferred_at is not null and transferred_by is not null
          and current_quantity=0
        )
      );
  end if;
end
$$;

create index if not exists production_inventory_entries_transfer_idx
  on public.production_inventory_entries(transferred_on desc,transfer_destination)
  where transferred_at is not null;

comment on column public.production_inventory_entries.transfer_destination is
  'Destino físico final da caixa. ecommerce significa transferência integral para o estoque do e-commerce.';
comment on column public.production_inventory_entries.transferred_at is
  'Momento auditável em que a caixa completa deixou o Inventário de Produção.';

create or replace function public.withdraw_production_inventory_entry(
  p_entry_id uuid,
  p_quantity bigint,
  p_occurred_on date,
  p_reason text default null,
  p_notes text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_entry public.production_inventory_entries%rowtype;
  v_reason constant text := 'Transferência da caixa completa para o estoque do e-commerce';
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_occurred_on is null or p_occurred_on>current_date then
    raise exception 'Informe uma data de transferência válida.';
  end if;
  select * into v_entry
  from public.production_inventory_entries
  where id=p_entry_id
  for update;
  if not found then raise exception 'Caixa não localizada.' using errcode='P0002'; end if;
  if v_entry.transferred_at is not null then
    raise exception 'Esta caixa já foi transferida para o estoque do e-commerce.' using errcode='23514';
  end if;
  if v_entry.current_quantity<=0 then
    raise exception 'Esta caixa não possui saldo disponível para transferência.' using errcode='23514';
  end if;
  if coalesce(p_quantity,0)<>v_entry.current_quantity then
    raise exception 'A retirada parcial foi bloqueada. Transfira a caixa completa com % unidade(s).',v_entry.current_quantity using errcode='23514';
  end if;

  update public.production_inventory_entries
  set current_quantity=0,
      transfer_destination='ecommerce',
      transferred_on=p_occurred_on,
      transferred_at=now(),
      transferred_by=v_actor
  where id=p_entry_id;

  insert into public.production_inventory_movements(
    entry_id,movement_type,quantity,balance_before,balance_after,
    occurred_on,reason,notes,created_by
  ) values(
    p_entry_id,'exit',v_entry.current_quantity,v_entry.current_quantity,0,
    p_occurred_on,v_reason,nullif(trim(p_notes),''),v_actor
  );

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(
    v_actor,'production_inventory.box_transferred_to_ecommerce',
    'production_inventory_entry',p_entry_id::text,
    jsonb_build_object(
      'entry_protocol',v_entry.protocol,
      'box_number',v_entry.box_number,
      'box_code','CX-'||lpad(v_entry.box_number::text,6,'0'),
      'quantity',v_entry.current_quantity,
      'balance_before',v_entry.current_quantity,
      'balance_after',0,
      'destination','ecommerce',
      'occurred_on',p_occurred_on
    )
  );
  return 0;
end;
$$;

create or replace function public.transfer_production_inventory_box_to_ecommerce(
  p_entry_id uuid,
  p_occurred_on date,
  p_notes text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_quantity bigint;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  select current_quantity into v_quantity
  from public.production_inventory_entries
  where id=p_entry_id
  for update;
  if not found then raise exception 'Caixa não localizada.' using errcode='P0002'; end if;
  return public.withdraw_production_inventory_entry(
    p_entry_id,v_quantity,p_occurred_on,
    'Transferência da caixa completa para o estoque do e-commerce',p_notes
  );
end;
$$;

create or replace function public.adjust_production_inventory_entry(
  p_entry_id uuid,
  p_counted_quantity bigint,
  p_occurred_on date,
  p_reason text,
  p_notes text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_entry public.production_inventory_entries%rowtype;
  v_type text;
  v_delta bigint;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if coalesce(p_counted_quantity,-1)<0 then raise exception 'Informe a quantidade física conferida.'; end if;
  if p_occurred_on is null or p_occurred_on>current_date then raise exception 'Informe uma data de ajuste válida.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'O motivo do ajuste é obrigatório.'; end if;
  select * into v_entry from public.production_inventory_entries where id=p_entry_id for update;
  if not found then raise exception 'Caixa não localizada.' using errcode='P0002'; end if;
  if v_entry.transferred_at is not null then
    raise exception 'A caixa já foi transferida. O histórico não pode ser alterado.' using errcode='23514';
  end if;
  if p_counted_quantity=v_entry.current_quantity then raise exception 'A contagem informada é igual ao saldo atual.'; end if;
  v_type:=case when p_counted_quantity>v_entry.current_quantity then 'adjustment_in' else 'adjustment_out' end;
  v_delta:=abs(p_counted_quantity-v_entry.current_quantity);
  update public.production_inventory_entries set current_quantity=p_counted_quantity where id=p_entry_id;
  insert into public.production_inventory_movements(
    entry_id,movement_type,quantity,balance_before,balance_after,occurred_on,reason,notes,created_by
  ) values(p_entry_id,v_type,v_delta,v_entry.current_quantity,p_counted_quantity,p_occurred_on,trim(p_reason),nullif(trim(p_notes),''),v_actor);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'production_inventory.stock_adjusted','production_inventory_entry',p_entry_id::text,
    jsonb_build_object('entry_protocol',v_entry.protocol,'box_number',v_entry.box_number,'difference',p_counted_quantity-v_entry.current_quantity,'balance_before',v_entry.current_quantity,'balance_after',p_counted_quantity,'occurred_on',p_occurred_on,'reason',trim(p_reason)));
  return p_counted_quantity;
end;
$$;

create or replace function public.list_production_inventory_entries_v3(
  p_model_id uuid,
  p_color_id uuid,
  p_include_depleted boolean default true
) returns table(
  id uuid, protocol bigint, box_number bigint, box_code text,
  model_id uuid, model_name text, image_path text,
  color_id uuid, color_name text, color_hex text, worker_id uuid, worker_name text,
  entry_on date, box_reference text, notes text, original_quantity bigint,
  current_quantity bigint, source_type text, source_receipt_id uuid,
  transfer_destination text, transferred_on date, transferred_at timestamptz,
  transferred_by uuid, transferred_by_name text,
  created_by uuid, created_by_name text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select e.id,e.protocol,e.box_number,'CX-'||lpad(e.box_number::text,6,'0'),
    e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    e.worker_id,w.full_name,e.entry_on,e.box_reference,e.notes,e.original_quantity,
    e.current_quantity,e.source_type,e.source_receipt_id,
    e.transfer_destination,e.transferred_on,e.transferred_at,e.transferred_by,
    transferred.full_name,e.created_by,creator.full_name,e.created_at,e.updated_at
  from public.production_inventory_entries e
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  join public.profiles w on w.id=e.worker_id
  join public.profiles creator on creator.id=e.created_by
  left join public.profiles transferred on transferred.id=e.transferred_by
  where e.model_id=p_model_id and e.color_id=p_color_id
    and (coalesce(p_include_depleted,true) or e.current_quantity>0)
  order by (e.current_quantity>0) desc,e.entry_on,e.box_number;
end;
$$;

revoke all on function public.transfer_production_inventory_box_to_ecommerce(uuid,date,text) from public,anon,authenticated;
revoke all on function public.list_production_inventory_entries_v3(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.transfer_production_inventory_box_to_ecommerce(uuid,date,text) to authenticated,service_role;
grant execute on function public.list_production_inventory_entries_v3(uuid,uuid,boolean) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
