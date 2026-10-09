-- Financial foundation only. No seed records, bank calls, uploads or paid AI.
begin;
create schema if not exists private;

create table public.financial_entities (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 2 and 160),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.financial_permissions (
  entity_id uuid not null references public.financial_entities(id),
  profile_id uuid not null references public.profiles(id),
  can_write boolean not null default false,
  active boolean not null default true,
  granted_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (entity_id, profile_id)
);
create table public.financial_contracts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.financial_entities(id),
  title text not null check (length(btrim(title)) between 2 and 160),
  creditor_name text not null check (length(btrim(creditor_name)) between 2 and 200),
  reference text check (length(reference) <= 120),
  contract_date date not null check (contract_date between date '1900-01-01' and date '2200-12-31'),
  currency text not null default 'BRL' check (currency = 'BRL'),
  total_amount numeric(14,2) not null check (total_amount > 0 and total_amount <= 999999999999.99),
  revision integer not null default 1 check (revision > 0),
  notes text check (length(notes) <= 2000),
  idempotency_key uuid not null,
  request_payload jsonb not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (entity_id, idempotency_key),
  unique (id, entity_id)
);
create table public.contract_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  contract_id uuid not null,
  version integer not null check (version > 0),
  reason text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (contract_id, entity_id) references public.financial_contracts(id, entity_id),
  unique (contract_id, version),
  unique (id, contract_id, entity_id)
);
create table public.contract_installments (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  contract_id uuid not null,
  schedule_id uuid not null,
  position integer not null check (position between 1 and 600),
  kind text not null check (kind in ('installment', 'down_payment', 'balloon')),
  due_date date not null check (due_date between date '1900-01-01' and date '2200-12-31'),
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999.99),
  foreign key (schedule_id, contract_id, entity_id)
    references public.contract_schedule_versions(id, contract_id, entity_id),
  unique (schedule_id, position),
  unique (id, contract_id, entity_id)
);
create table public.contract_payments (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  contract_id uuid not null,
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999.99),
  effective_date date not null check (effective_date between date '1900-01-01' and date '2200-12-31'),
  kind text not null check (kind in ('regular', 'down_payment', 'extra', 'historical')),
  transaction_reference text check (length(transaction_reference) between 1 and 160),
  notes text check (length(notes) <= 2000),
  duplicate_reason text check (length(btrim(duplicate_reason)) between 12 and 1000),
  idempotency_key uuid not null,
  request_payload jsonb not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (contract_id, entity_id) references public.financial_contracts(id, entity_id),
  unique (entity_id, idempotency_key),
  unique (id, contract_id, entity_id)
);
create table public.contract_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  contract_id uuid not null,
  payment_id uuid not null,
  installment_id uuid not null,
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999.99),
  foreign key (payment_id, contract_id, entity_id)
    references public.contract_payments(id, contract_id, entity_id),
  foreign key (installment_id, contract_id, entity_id)
    references public.contract_installments(id, contract_id, entity_id),
  unique (payment_id, installment_id)
);
create table public.contract_payment_reversals (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  contract_id uuid not null,
  payment_id uuid not null unique,
  reason text not null check (length(btrim(reason)) between 12 and 1000),
  idempotency_key uuid not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (payment_id, contract_id, entity_id)
    references public.contract_payments(id, contract_id, entity_id),
  unique (entity_id, idempotency_key)
);
create table public.contract_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.financial_entities(id),
  contract_id uuid,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (contract_id, entity_id) references public.financial_contracts(id, entity_id)
);

create index financial_permissions_profile_idx on public.financial_permissions(profile_id, entity_id) where active;
create index financial_contracts_entity_created_idx on public.financial_contracts(entity_id, created_at desc, id);
create index financial_contracts_creditor_idx on public.financial_contracts(entity_id, lower(btrim(creditor_name)));
create index contract_installments_contract_due_idx on public.contract_installments(contract_id, due_date, id);
create index contract_installments_entity_due_idx on public.contract_installments(entity_id, due_date, id);
create index contract_payments_contract_date_idx on public.contract_payments(contract_id, effective_date desc, id);
create index contract_payments_duplicate_idx on public.contract_payments(entity_id, effective_date, amount);
create index contract_payments_reference_idx on public.contract_payments(entity_id, transaction_reference)
  where transaction_reference is not null;
create index contract_allocations_installment_idx on public.contract_payment_allocations(installment_id);
create index contract_allocations_contract_idx on public.contract_payment_allocations(contract_id, entity_id);
create index contract_reversals_contract_idx on public.contract_payment_reversals(contract_id, entity_id);
create index contract_audit_entity_created_idx on public.contract_audit_events(entity_id, created_at desc, id);
create index contract_audit_contract_created_idx on public.contract_audit_events(contract_id, created_at desc, id);

create function private.can_access_financial_entity(p_entity_id uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.status = 'active'
    and (p.is_primary_admin or exists (
      select 1 from public.financial_permissions f
      where f.entity_id = p_entity_id and f.profile_id = p.id and f.active
        and (not p_write or f.can_write)
    ))
  )
$$;
revoke all on function private.can_access_financial_entity(uuid,boolean) from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.can_access_financial_entity(uuid,boolean) to authenticated;

-- Definer-owned helpers are not callable through the client.
create function private.financial_fields(p_value jsonb, p_allowed text[])
returns void language plpgsql set search_path = '' as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' or octet_length(p_value::text) > 262144 then
    raise exception 'Objeto financeiro invalido';
  end if;
  if exists (select 1 from jsonb_object_keys(p_value) k where not (k = any(p_allowed))) then
    raise exception 'Campo financeiro nao permitido';
  end if;
end $$;
create function private.financial_money(p_value text)
returns numeric language plpgsql immutable set search_path = '' as $$
declare v numeric;
begin
  if p_value is null or p_value !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then
    raise exception 'Valor monetario invalido: use no maximo duas casas decimais';
  end if;
  v := p_value::numeric;
  if v <= 0 or v > 999999999999.99 then raise exception 'Valor monetario fora do limite'; end if;
  return v;
end $$;
create function private.financial_date(p_value text)
returns date language plpgsql immutable set search_path = '' as $$
declare v date;
begin
  if p_value is null or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Data financeira invalida';
  end if;
  v := p_value::date;
  if v not between date '1900-01-01' and date '2200-12-31' then raise exception 'Data financeira fora do limite'; end if;
  return v;
end $$;
-- Always calculate from the original anchor, never from the shortened February date.
create function private.financial_month_date(p_anchor date, p_offset integer)
returns date language plpgsql immutable set search_path = '' as $$
declare v_first date; v_last date;
begin
  if p_anchor is null or p_offset is null or p_offset not between 0 and 599 then
    raise exception 'Sequencia mensal invalida';
  end if;
  v_first := (date_trunc('month',p_anchor::timestamp) + make_interval(months=>p_offset))::date;
  v_last := (v_first + interval '1 month' - interval '1 day')::date;
  return v_first + (least(extract(day from p_anchor)::integer,extract(day from v_last)::integer)-1);
end $$;
create function private.block_financial_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Historico financeiro imutavel; registre um estorno ou uma nova versao';
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'financial_entities','financial_permissions','financial_contracts','contract_schedule_versions',
    'contract_installments','contract_payments','contract_payment_allocations',
    'contract_payment_reversals','contract_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
    execute format('grant select on public.%I to authenticated, service_role',t);
    execute format('create policy financial_read on public.%I for select to authenticated using (private.can_access_financial_entity(%I,false))',
      t,case when t='financial_entities' then 'id' else 'entity_id' end);
  end loop;
  foreach t in array array[
    'contract_schedule_versions','contract_installments','contract_payments',
    'contract_payment_allocations','contract_payment_reversals','contract_audit_events'
  ] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.block_financial_history_mutation()',t||'_immutable',t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function private.block_financial_history_mutation()',t||'_no_truncate',t);
  end loop;
end $$;

create function public.create_financial_entity(p_id uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.financial_entities;
begin
  if not private.is_primary_admin() then raise exception 'Acesso financeiro principal necessario'; end if;
  if p_id is null or p_name is null or length(btrim(p_name)) not between 2 and 160 then raise exception 'Empresa invalida'; end if;
  insert into public.financial_entities(id,name,created_by) values(p_id,btrim(p_name),auth.uid())
    on conflict(id) do nothing returning * into v;
  if v.id is null then
    select * into v from public.financial_entities where id=p_id;
    if v.name <> btrim(p_name) then raise exception 'Identificador ja utilizado'; end if;
    return to_jsonb(v);
  end if;
  insert into public.contract_audit_events(entity_id,actor_id,action,after_data)
    values(v.id,auth.uid(),'entity.created',to_jsonb(v));
  return to_jsonb(v);
end $$;

create function public.set_financial_permission(p_entity_id uuid,p_profile_id uuid,p_access text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_primary_admin() then raise exception 'Acesso financeiro principal necessario'; end if;
  if p_access is null or p_access not in ('read','write','revoked') then raise exception 'Permissao invalida'; end if;
  perform 1 from public.financial_entities where id=p_entity_id for update;
  if not found then raise exception 'Empresa indisponivel'; end if;
  if not exists(select 1 from public.profiles where id=p_profile_id and
    (p_access='revoked' or (role='admin' and status='active'))) then raise exception 'Administrador elegivel necessario'; end if;
  select to_jsonb(f) into v_before from public.financial_permissions f where entity_id=p_entity_id and profile_id=p_profile_id;
  insert into public.financial_permissions(entity_id,profile_id,can_write,active,granted_by)
    values(p_entity_id,p_profile_id,p_access='write',p_access<>'revoked',auth.uid())
    on conflict(entity_id,profile_id) do update set
      can_write=excluded.can_write,active=excluded.active,granted_by=excluded.granted_by,updated_at=now()
    returning to_jsonb(financial_permissions) into v_after;
  insert into public.contract_audit_events(entity_id,actor_id,action,before_data,after_data)
    values(p_entity_id,auth.uid(),'permission.changed',v_before,v_after);
  return v_after;
end $$;

create function public.financial_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,
    'can_write',private.can_access_financial_entity(e.id,true)) order by e.name,e.id),'[]'::jsonb)
  from public.financial_entities e where private.can_access_financial_entity(e.id,false)
$$;

create function public.create_financial_contract(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_entity uuid; v_key uuid; v_schedule uuid; v_contract public.financial_contracts;
  v_item jsonb; v_items jsonb; v_amount numeric; v_total numeric:=0; v_position integer:=0;
begin
  perform private.financial_fields(p_input,array['entity_id','idempotency_key','title','creditor_name','reference','contract_date','notes','installments']);
  v_entity := (p_input->>'entity_id')::uuid; v_key := (p_input->>'idempotency_key')::uuid;
  if not private.can_access_financial_entity(v_entity,true) then raise exception 'Acesso financeiro negado'; end if;
  perform 1 from public.financial_entities where id=v_entity for update;
  if not found then raise exception 'Empresa indisponivel'; end if;
  if not private.can_access_financial_entity(v_entity,true) then raise exception 'Acesso financeiro negado'; end if;
  select * into v_contract from public.financial_contracts where entity_id=v_entity and idempotency_key=v_key;
  if found then
    if v_contract.request_payload <> p_input then raise exception 'Chave de repeticao com dados diferentes'; end if;
    return jsonb_build_object('id',v_contract.id,'revision',v_contract.revision,'replayed',true);
  end if;
  v_items := p_input->'installments';
  if jsonb_typeof(v_items) is distinct from 'array' then raise exception 'Parcelas invalidas'; end if;
  if jsonb_array_length(v_items) not between 1 and 600 then raise exception 'Informe de 1 a 600 parcelas'; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    perform private.financial_fields(v_item,array['amount','due_date','kind']);
    v_amount := private.financial_money(v_item->>'amount');
    perform private.financial_date(v_item->>'due_date');
    v_total := v_total + v_amount;
  end loop;
  insert into public.financial_contracts(entity_id,title,creditor_name,reference,contract_date,total_amount,notes,idempotency_key,request_payload,created_by)
    values(v_entity,btrim(p_input->>'title'),btrim(p_input->>'creditor_name'),nullif(btrim(p_input->>'reference'),''),
      private.financial_date(p_input->>'contract_date'),v_total,nullif(btrim(p_input->>'notes'),''),v_key,p_input,auth.uid())
    returning * into v_contract;
  insert into public.contract_schedule_versions(entity_id,contract_id,version,reason,created_by)
    values(v_entity,v_contract.id,1,'Cronograma original informado e confirmado pelo administrador',auth.uid()) returning id into v_schedule;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_position := v_position+1;
    insert into public.contract_installments(entity_id,contract_id,schedule_id,position,kind,due_date,amount)
      values(v_entity,v_contract.id,v_schedule,v_position,coalesce(v_item->>'kind','installment'),
        private.financial_date(v_item->>'due_date'),private.financial_money(v_item->>'amount'));
  end loop;
  insert into public.contract_audit_events(entity_id,contract_id,actor_id,action,after_data)
    values(v_entity,v_contract.id,auth.uid(),'contract.created',
      jsonb_build_object('contract',to_jsonb(v_contract)-'request_payload','schedule_id',v_schedule,'installments',v_items));
  return jsonb_build_object('id',v_contract.id,'revision',1,'replayed',false);
end $$;

-- Only non-reversed allocations reduce the planned schedule balance.
create function private.financial_installment_balances(p_contract_id uuid)
returns table(id uuid,"position" integer,kind text,due_date date,amount numeric,paid numeric,remaining numeric)
language sql stable security definer set search_path = '' as $$
  select i.id,i.position,i.kind,i.due_date,i.amount,coalesce(a.paid,0),i.amount-coalesce(a.paid,0)
  from public.contract_installments i
  left join (
    select a.installment_id,sum(a.amount) paid
    from public.contract_payment_allocations a
    where a.contract_id=p_contract_id and not exists(
      select 1 from public.contract_payment_reversals r where r.payment_id=a.payment_id
    ) group by a.installment_id
  ) a on a.installment_id=i.id
  where i.contract_id=p_contract_id
$$;
create function private.financial_contract_totals(p_contract_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'scheduled_amount',coalesce(sum(amount),0)::text,
    'paid_amount',coalesce(sum(paid),0)::text,
    'remaining_amount',coalesce(sum(remaining),0)::text,
    'overdue_amount',coalesce(sum(remaining) filter(where due_date < (now() at time zone 'America/Sao_Paulo')::date),0)::text,
    'installment_count',count(*),'settled_installments',count(*) filter(where remaining=0),
    'next_due_date',min(due_date) filter(where remaining>0),
    'balance_type','scheduled_balance_not_creditor_settlement_quote'
  ) from private.financial_installment_balances(p_contract_id)
$$;

create function public.record_contract_payment(p_contract_id uuid,p_expected_revision integer,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_entity uuid; v_contract public.financial_contracts; v_payment public.contract_payments;
  v_key uuid; v_amount numeric; v_date date; v_ref text; v_items jsonb; v_item jsonb;
  v_sum numeric:=0; v_alloc numeric; v_installment uuid; v_seen uuid[]:='{}'; v_remaining numeric;
  v_reason text; v_duplicate boolean; v_before jsonb;
begin
  select entity_id into v_entity from public.financial_contracts where id=p_contract_id;
  if v_entity is null or not private.can_access_financial_entity(v_entity,true) then raise exception 'Acesso financeiro negado'; end if;
  -- Entity lock serializes duplicate detection across contracts and permission revocation.
  perform 1 from public.financial_entities where id=v_entity for update;
  if not private.can_access_financial_entity(v_entity,true) then raise exception 'Acesso financeiro negado'; end if;
  select * into strict v_contract from public.financial_contracts where id=p_contract_id for update;
  perform private.financial_fields(p_input,array['idempotency_key','amount','effective_date','kind','transaction_reference','notes','duplicate_reason','allocations']);
  v_key := (p_input->>'idempotency_key')::uuid;
  select * into v_payment from public.contract_payments where entity_id=v_entity and idempotency_key=v_key;
  if found then
    if v_payment.contract_id<>p_contract_id or v_payment.request_payload<>p_input then raise exception 'Chave de repeticao com dados diferentes'; end if;
    return jsonb_build_object('id',v_payment.id,'revision',v_contract.revision,'replayed',true,
      'reversed',exists(select 1 from public.contract_payment_reversals where payment_id=v_payment.id));
  end if;
  if p_expected_revision is distinct from v_contract.revision then raise exception 'Contrato mudou; atualize antes de confirmar'; end if;
  v_amount := private.financial_money(p_input->>'amount');
  v_date := private.financial_date(p_input->>'effective_date');
  if v_date > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Pagamento futuro nao pode ser confirmado'; end if;
  v_ref := nullif(upper(btrim(p_input->>'transaction_reference')),'');
  v_reason := nullif(btrim(p_input->>'duplicate_reason'),'');
  if v_ref is not null and exists(select 1 from public.contract_payments p where p.entity_id=v_entity
    and p.transaction_reference=v_ref and not exists(select 1 from public.contract_payment_reversals r where r.payment_id=p.id)) then
    raise exception 'Transacao ja registrada; confira o pagamento existente';
  end if;
  select exists(select 1 from public.contract_payments p
    join public.financial_contracts c on c.id=p.contract_id
    where p.entity_id=v_entity and p.amount=v_amount and p.effective_date=v_date
      and lower(btrim(c.creditor_name))=lower(btrim(v_contract.creditor_name))
      and not exists(select 1 from public.contract_payment_reversals r where r.payment_id=p.id))
    into v_duplicate;
  if v_duplicate and (v_reason is null or length(v_reason)<12) then
    raise exception 'Possivel duplicidade: confira e informe uma justificativa';
  end if;
  v_items := p_input->'allocations';
  if jsonb_typeof(v_items) is distinct from 'array' then raise exception 'Distribuicao invalida'; end if;
  if jsonb_array_length(v_items) not between 1 and 600 then raise exception 'Distribuicao invalida'; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    perform private.financial_fields(v_item,array['installment_id','amount']);
    v_installment := (v_item->>'installment_id')::uuid;
    if v_installment is null or v_installment=any(v_seen) then raise exception 'Parcela ausente ou repetida'; end if;
    v_seen := array_append(v_seen,v_installment);
    v_alloc := private.financial_money(v_item->>'amount');
    select b.remaining into v_remaining from private.financial_installment_balances(p_contract_id) b where b.id=v_installment;
    if not found then raise exception 'Parcela nao pertence ao contrato'; end if;
    if v_alloc>v_remaining then raise exception 'Valor ultrapassa o saldo da parcela'; end if;
    v_sum := v_sum+v_alloc;
  end loop;
  if v_sum<>v_amount then raise exception 'Distribuicao deve somar exatamente o pagamento'; end if;
  v_before := private.financial_contract_totals(p_contract_id);
  insert into public.contract_payments(entity_id,contract_id,amount,effective_date,kind,transaction_reference,notes,duplicate_reason,idempotency_key,request_payload,created_by)
    values(v_entity,p_contract_id,v_amount,v_date,coalesce(p_input->>'kind','regular'),v_ref,
      nullif(btrim(p_input->>'notes'),''),v_reason,v_key,p_input,auth.uid()) returning * into v_payment;
  for v_item in select value from jsonb_array_elements(v_items) loop
    insert into public.contract_payment_allocations(entity_id,contract_id,payment_id,installment_id,amount)
      values(v_entity,p_contract_id,v_payment.id,(v_item->>'installment_id')::uuid,private.financial_money(v_item->>'amount'));
  end loop;
  update public.financial_contracts set revision=revision+1 where id=p_contract_id;
  insert into public.contract_audit_events(entity_id,contract_id,actor_id,action,before_data,after_data)
    values(v_entity,p_contract_id,auth.uid(),'payment.recorded',v_before,
      jsonb_build_object('payment',to_jsonb(v_payment)-'request_payload','allocations',v_items,
        'totals',private.financial_contract_totals(p_contract_id)));
  return jsonb_build_object('id',v_payment.id,'revision',v_contract.revision+1,'replayed',false,'reversed',false);
end $$;

create function public.reverse_contract_payment(p_payment_id uuid,p_expected_revision integer,p_idempotency_key uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payment public.contract_payments; v_revision integer; v_reversal public.contract_payment_reversals; v_before jsonb;
begin
  select * into v_payment from public.contract_payments where id=p_payment_id;
  if v_payment.id is null or not private.can_access_financial_entity(v_payment.entity_id,true) then raise exception 'Acesso financeiro negado'; end if;
  perform 1 from public.financial_entities where id=v_payment.entity_id for update;
  if not private.can_access_financial_entity(v_payment.entity_id,true) then raise exception 'Acesso financeiro negado'; end if;
  select revision into v_revision from public.financial_contracts where id=v_payment.contract_id for update;
  select * into v_reversal from public.contract_payment_reversals where entity_id=v_payment.entity_id and idempotency_key=p_idempotency_key;
  if found then
    if v_reversal.payment_id<>p_payment_id or v_reversal.reason is distinct from btrim(p_reason) then raise exception 'Chave de repeticao com dados diferentes'; end if;
    return jsonb_build_object('id',v_reversal.id,'revision',v_revision,'replayed',true);
  end if;
  if p_expected_revision is distinct from v_revision then raise exception 'Contrato mudou; atualize antes de confirmar'; end if;
  if exists(select 1 from public.contract_payment_reversals where payment_id=p_payment_id) then raise exception 'Pagamento ja estornado'; end if;
  v_before := private.financial_contract_totals(v_payment.contract_id);
  insert into public.contract_payment_reversals(entity_id,contract_id,payment_id,reason,idempotency_key,created_by)
    values(v_payment.entity_id,v_payment.contract_id,p_payment_id,btrim(p_reason),p_idempotency_key,auth.uid()) returning * into v_reversal;
  update public.financial_contracts set revision=revision+1 where id=v_payment.contract_id;
  insert into public.contract_audit_events(entity_id,contract_id,actor_id,action,before_data,after_data)
    values(v_payment.entity_id,v_payment.contract_id,auth.uid(),'payment.reversed',v_before,
      jsonb_build_object('reversal',to_jsonb(v_reversal),'totals',private.financial_contract_totals(v_payment.contract_id)));
  return jsonb_build_object('id',v_reversal.id,'revision',v_revision+1,'replayed',false);
end $$;

create function public.financial_contract_detail(p_contract_id uuid,p_payment_offset integer default 0,p_audit_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.financial_contracts;
begin
  select * into v from public.financial_contracts where id=p_contract_id;
  if v.id is null or not private.can_access_financial_entity(v.entity_id,false) then raise exception 'Acesso financeiro negado'; end if;
  if p_payment_offset is null or p_audit_offset is null or least(p_payment_offset,p_audit_offset)<0 then raise exception 'Paginacao invalida'; end if;
  return jsonb_build_object('contract',to_jsonb(v)-'request_payload',
    'totals',private.financial_contract_totals(v.id),
    'installments',(select coalesce(jsonb_agg(to_jsonb(b) order by b.position),'[]'::jsonb) from private.financial_installment_balances(v.id) b),
    'payments',(select coalesce(jsonb_agg(x.data order by x.created_at desc,x.id desc),'[]'::jsonb) from (
      select p.id,p.created_at,(to_jsonb(p)-'request_payload') || jsonb_build_object(
        'reversal',(select to_jsonb(r) from public.contract_payment_reversals r where r.payment_id=p.id),
        'allocations',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from public.contract_payment_allocations a where a.payment_id=p.id)) data
      from public.contract_payments p where p.contract_id=v.id order by p.created_at desc,p.id desc limit 50 offset p_payment_offset
    ) x),
    'payment_count',(select count(*) from public.contract_payments where contract_id=v.id),
    'audit',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) from (
      select a.* from public.contract_audit_events a where a.contract_id=v.id order by a.created_at desc,a.id desc limit 50 offset p_audit_offset
    ) x),
    'audit_count',(select count(*) from public.contract_audit_events where contract_id=v.id),
    'history_page_size',50,'can_write',private.can_access_financial_entity(v.entity_id,true));
end $$;

create function public.financial_contracts_list(p_entity_id uuid,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_access_financial_entity(p_entity_id,false) then raise exception 'Acesso financeiro negado'; end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then raise exception 'Paginacao invalida'; end if;
  return jsonb_build_object(
    'items',(select coalesce(jsonb_agg(x.data order by x.created_at desc,x.id desc),'[]'::jsonb) from (
      select c.id,c.created_at,(to_jsonb(c)-'request_payload') || jsonb_build_object('totals',private.financial_contract_totals(c.id)) data
      from public.financial_contracts c where c.entity_id=p_entity_id order by c.created_at desc,c.id desc limit p_limit offset p_offset
    ) x),
    'count',(select count(*) from public.financial_contracts where entity_id=p_entity_id),
    'can_write',private.can_access_financial_entity(p_entity_id,true));
end $$;

-- Revoke inherited/default execution privileges explicitly, including service_role.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature,n.nspname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname in (
      'financial_fields','financial_money','financial_date','financial_month_date',
      'block_financial_history_mutation','financial_installment_balances','financial_contract_totals'
    )) or (n.nspname='public' and p.proname in (
      'create_financial_entity','set_financial_permission','financial_access','create_financial_contract',
      'record_contract_payment','reverse_contract_payment','financial_contract_detail','financial_contracts_list'
    ))
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    -- Client grants are listed explicitly below for auditability.
  end loop;
end $$;
grant execute on function public.create_financial_entity(uuid,text),
 public.set_financial_permission(uuid,uuid,text),
 public.financial_access(),
 public.create_financial_contract(jsonb),
 public.record_contract_payment(uuid,integer,jsonb),
 public.reverse_contract_payment(uuid,integer,uuid,text),
 public.financial_contract_detail(uuid,integer,integer),
 public.financial_contracts_list(uuid,integer,integer) to authenticated;
comment on table public.contract_payments is 'Human-confirmed bookkeeping only; does not execute or independently verify a bank transfer.';
comment on table public.financial_contracts is 'Scheduled debt in BRL, not the creditor early-settlement quote. Foundation v1 has one immutable original schedule.';
commit;
