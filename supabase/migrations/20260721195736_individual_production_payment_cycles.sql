-- Harmony Store Oficial — ciclos semanais de pagamento configuráveis por colaboradora.
-- Migração aditiva: preserva recebimentos e fechamentos existentes.

begin;

create table if not exists public.production_payment_schedules (
  worker_id uuid primary key references public.profiles(id) on delete cascade,
  payment_weekday smallint not null check (payment_weekday between 1 and 7),
  cutoff_weekday smallint not null check (cutoff_weekday between 1 and 7),
  cutoff_time time without time zone not null default time '18:00',
  timezone text not null default 'America/Sao_Paulo'
    check (timezone = 'America/Sao_Paulo'),
  active boolean not null default true,
  configured_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finished_production_receipts
  add column if not exists planned_payment_on date;

alter table public.production_weekly_closings
  add column if not exists payment_due_on date,
  add column if not exists cutoff_at timestamptz,
  add column if not exists cycle_start_on date,
  add column if not exists cycle_end_on date,
  add column if not exists schedule_snapshot jsonb not null default '{}'::jsonb;

update public.production_weekly_closings
set payment_due_on = coalesce(payment_due_on, week_end),
    cutoff_at = coalesce(cutoff_at, (week_end::timestamp + time '23:59') at time zone 'America/Sao_Paulo'),
    cycle_start_on = coalesce(cycle_start_on, week_start),
    cycle_end_on = coalesce(cycle_end_on, week_end)
where payment_due_on is null
   or cutoff_at is null
   or cycle_start_on is null
   or cycle_end_on is null;

alter table public.production_weekly_closings
  alter column payment_due_on set not null,
  alter column cutoff_at set not null,
  alter column cycle_start_on set not null,
  alter column cycle_end_on set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'production_closings_cycle_dates_check'
      and conrelid = 'public.production_weekly_closings'::regclass
  ) then
    alter table public.production_weekly_closings
      add constraint production_closings_cycle_dates_check
      check (cycle_start_on <= cycle_end_on and cycle_end_on <= payment_due_on);
  end if;
end $$;

create unique index if not exists production_closings_worker_payment_unique
  on public.production_weekly_closings(worker_id, payment_due_on);
create index if not exists production_payment_schedules_active_idx
  on public.production_payment_schedules(active, payment_weekday, worker_id);
create index if not exists finished_receipts_open_payment_idx
  on public.finished_production_receipts(worker_id, planned_payment_on, received_on, id)
  where closing_id is null;

drop trigger if exists production_payment_schedules_touch_updated_at on public.production_payment_schedules;
create trigger production_payment_schedules_touch_updated_at
before update on public.production_payment_schedules
for each row execute function public.touch_updated_at();

alter table public.production_payment_schedules enable row level security;
revoke all on table public.production_payment_schedules from public, anon, authenticated;
grant select on table public.production_payment_schedules to service_role;

create or replace function private.production_payment_due_for(
  p_worker_id uuid,
  p_received_on date,
  p_recorded_at timestamptz default now()
) returns date
language plpgsql stable security definer set search_path = '' as $$
declare
  v_schedule public.production_payment_schedules;
  v_candidate date;
  v_cutoff_date date;
  v_received_local timestamp without time zone;
begin
  select * into v_schedule
  from public.production_payment_schedules
  where worker_id = p_worker_id and active;
  if not found or p_received_on is null then return null; end if;

  v_candidate := p_received_on
    + mod(v_schedule.payment_weekday - extract(isodow from p_received_on)::integer + 7, 7);
  v_cutoff_date := v_candidate
    - mod(v_schedule.payment_weekday - v_schedule.cutoff_weekday + 7, 7);

  if (p_recorded_at at time zone v_schedule.timezone)::date = p_received_on then
    v_received_local := p_recorded_at at time zone v_schedule.timezone;
  else
    v_received_local := p_received_on::timestamp + time '12:00';
  end if;

  if v_received_local <= v_cutoff_date::timestamp + v_schedule.cutoff_time then
    return v_candidate;
  end if;
  return v_candidate + 7;
end;
$$;

create or replace function private.production_payment_cutoff_for(
  p_worker_id uuid,
  p_payment_due_on date
) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  v_schedule public.production_payment_schedules;
  v_cutoff_date date;
begin
  select * into v_schedule
  from public.production_payment_schedules
  where worker_id = p_worker_id and active;
  if not found or p_payment_due_on is null then return null; end if;
  if extract(isodow from p_payment_due_on)::integer <> v_schedule.payment_weekday then
    return null;
  end if;
  v_cutoff_date := p_payment_due_on
    - mod(v_schedule.payment_weekday - v_schedule.cutoff_weekday + 7, 7);
  return (v_cutoff_date::timestamp + v_schedule.cutoff_time) at time zone v_schedule.timezone;
end;
$$;

create or replace function private.next_open_production_payment_due(
  p_worker_id uuid,
  p_received_on date,
  p_recorded_at timestamptz default now()
) returns date
language plpgsql stable security definer set search_path = '' as $$
declare
  v_due date;
begin
  v_due := private.production_payment_due_for(p_worker_id, p_received_on, p_recorded_at);
  while v_due is not null and exists (
    select 1 from public.production_weekly_closings
    where worker_id = p_worker_id and payment_due_on = v_due
  ) loop
    v_due := v_due + 7;
  end loop;
  return v_due;
end;
$$;

revoke all on function private.production_payment_due_for(uuid,date,timestamptz) from public, anon, authenticated;
revoke all on function private.production_payment_cutoff_for(uuid,date) from public, anon, authenticated;
revoke all on function private.next_open_production_payment_due(uuid,date,timestamptz) from public, anon, authenticated;

create or replace function public.list_production_payment_schedules()
returns table(
  worker_id uuid,
  payment_weekday smallint,
  cutoff_weekday smallint,
  cutoff_time time without time zone,
  timezone text,
  active boolean,
  updated_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  return query
  select s.worker_id,s.payment_weekday,s.cutoff_weekday,s.cutoff_time,s.timezone,s.active,s.updated_at
  from public.production_payment_schedules s
  order by s.worker_id;
end;
$$;

create or replace function public.admin_save_production_payment_schedule(
  p_worker_id uuid,
  p_payment_weekday smallint,
  p_cutoff_weekday smallint,
  p_cutoff_time time without time zone,
  p_active boolean default true
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_collection record;
  v_due date;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  if p_payment_weekday not between 1 and 7 or p_cutoff_weekday not between 1 and 7 then
    raise exception 'Escolha dias válidos para o corte e o pagamento.';
  end if;
  if p_cutoff_time is null then raise exception 'Informe o horário de corte.'; end if;
  if not exists (
    select 1 from public.profiles
    where id=p_worker_id and status='active' and role in ('collaborator','receiver')
  ) then raise exception 'Colaboradora inválida ou inativa.'; end if;

  insert into public.production_payment_schedules(
    worker_id,payment_weekday,cutoff_weekday,cutoff_time,active,configured_by
  ) values(
    p_worker_id,p_payment_weekday,p_cutoff_weekday,p_cutoff_time,coalesce(p_active,true),(select auth.uid())
  )
  on conflict(worker_id) do update set
    payment_weekday=excluded.payment_weekday,
    cutoff_weekday=excluded.cutoff_weekday,
    cutoff_time=excluded.cutoff_time,
    active=excluded.active,
    configured_by=(select auth.uid());

  for v_collection in
    select collection_id,received_on,min(created_at) as recorded_at
    from public.finished_production_receipts
    where worker_id=p_worker_id and closing_id is null
    group by collection_id,received_on
    order by received_on,collection_id
  loop
    v_due := case when coalesce(p_active,true)
      then private.next_open_production_payment_due(p_worker_id,v_collection.received_on,v_collection.recorded_at)
      else null
    end;
    update public.finished_production_receipts
    set planned_payment_on=v_due
    where collection_id=v_collection.collection_id and closing_id is null;
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'production.payment_schedule_saved','production_payment_schedule',p_worker_id::text,
    jsonb_build_object('payment_weekday',p_payment_weekday,'cutoff_weekday',p_cutoff_weekday,'cutoff_time',p_cutoff_time,'active',coalesce(p_active,true)));
end;
$$;

create or replace function public.list_production_payment_overview()
returns table(
  worker_id uuid,
  worker_name text,
  schedule_active boolean,
  payment_weekday smallint,
  cutoff_weekday smallint,
  cutoff_time time without time zone,
  payment_due_on date,
  cutoff_at timestamptz,
  collection_count bigint,
  receipt_count bigint,
  total_quantity bigint,
  total_amount numeric,
  ready_to_close boolean
)
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  return query
  with workers as (
    select p.id,p.full_name,s.active,s.payment_weekday,s.cutoff_weekday,s.cutoff_time
    from public.profiles p
    left join public.production_payment_schedules s on s.worker_id=p.id
    where p.status='active' and p.role in ('collaborator','receiver')
  ), dues as (
    select w.*,
      coalesce(
        (select min(r.planned_payment_on) from public.finished_production_receipts r
         where r.worker_id=w.id and r.closing_id is null and r.planned_payment_on is not null),
        case when w.active then private.production_payment_due_for(w.id,current_date,now()) else null end
      ) as due_on
    from workers w
  )
  select d.id,d.full_name,coalesce(d.active,false),d.payment_weekday,d.cutoff_weekday,d.cutoff_time,d.due_on,
    private.production_payment_cutoff_for(d.id,d.due_on),
    coalesce(count(distinct r.collection_id),0),coalesce(count(r.id),0),coalesce(sum(r.quantity),0)::bigint,
    coalesce(round(sum(r.quantity::numeric*r.rate_per_100_snapshot/100),2),0),
    coalesce(now()>=private.production_payment_cutoff_for(d.id,d.due_on) and count(r.id)>0,false)
  from dues d
  left join public.finished_production_receipts r
    on r.worker_id=d.id and r.closing_id is null and r.planned_payment_on<=d.due_on
  group by d.id,d.full_name,d.active,d.payment_weekday,d.cutoff_weekday,d.cutoff_time,d.due_on
  order by d.full_name;
end;
$$;

create or replace function public.admin_preview_production_payment(
  p_worker_id uuid,
  p_payment_due_on date
) returns table(
  collection_id uuid,
  received_on date,
  box_reference text,
  model_name text,
  color text,
  declared_quantity bigint,
  quantity bigint,
  rate_per_100 numeric,
  line_amount numeric
)
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  if private.production_payment_cutoff_for(p_worker_id,p_payment_due_on) is null then
    raise exception 'A data escolhida não corresponde à agenda da colaboradora.';
  end if;
  return query
  select r.collection_id,r.received_on,r.box_reference,m.name,r.color,r.declared_quantity,r.quantity,
    r.rate_per_100_snapshot,round(r.quantity::numeric*r.rate_per_100_snapshot/100,4)
  from public.finished_production_receipts r
  join public.finished_product_models m on m.id=r.model_id
  where r.worker_id=p_worker_id and r.closing_id is null
    and r.planned_payment_on<=p_payment_due_on
  order by r.received_on,r.collection_id,r.protocol;
end;
$$;

create or replace function public.admin_move_production_collection_payment(
  p_collection_id uuid,
  p_payment_on date,
  p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_worker_id uuid;
  v_received_on date;
  v_cutoff_at timestamptz;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Informe o motivo da alteração.'; end if;
  select worker_id,received_on into v_worker_id,v_received_on
  from public.finished_production_receipts
  where collection_id=p_collection_id
  order by protocol limit 1 for update;
  if not found then raise exception 'Recebimento não localizado.'; end if;
  if exists(select 1 from public.finished_production_receipts where collection_id=p_collection_id and closing_id is not null) then
    raise exception 'Reabra o pagamento antes de mover este recebimento.';
  end if;
  v_cutoff_at:=private.production_payment_cutoff_for(v_worker_id,p_payment_on);
  if p_payment_on<v_received_on or v_cutoff_at is null then
    raise exception 'Escolha uma data de pagamento válida para a agenda desta colaboradora.';
  end if;
  if v_received_on>(v_cutoff_at at time zone 'America/Sao_Paulo')::date then
    raise exception 'Este recebimento ocorreu depois do corte desse pagamento.';
  end if;
  if exists(select 1 from public.production_weekly_closings where worker_id=v_worker_id and payment_due_on=p_payment_on) then
    raise exception 'Este pagamento já foi fechado.';
  end if;
  update public.finished_production_receipts set planned_payment_on=p_payment_on
  where collection_id=p_collection_id and closing_id is null;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'production.collection_payment_moved','finished_production_collection',p_collection_id::text,
    jsonb_build_object('payment_on',p_payment_on,'reason',trim(p_reason)));
end;
$$;

create or replace function public.admin_close_production_payment(
  p_worker_id uuid,
  p_payment_due_on date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_schedule public.production_payment_schedules;
  v_cutoff_at timestamptz;
  v_id uuid;
  v_quantity bigint;
  v_amount numeric;
  v_receipt_count bigint;
  v_cycle_start date;
  v_cycle_end date;
  v_week_start date;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  select * into v_schedule from public.production_payment_schedules
  where worker_id=p_worker_id and active for update;
  if not found then raise exception 'Configure a agenda de pagamento desta colaboradora.'; end if;
  v_cutoff_at := private.production_payment_cutoff_for(p_worker_id,p_payment_due_on);
  if v_cutoff_at is null then raise exception 'A data não corresponde ao dia de pagamento configurado.'; end if;
  if now()<v_cutoff_at then raise exception 'O período ainda não atingiu o horário de corte.'; end if;
  if exists(select 1 from public.production_weekly_closings where worker_id=p_worker_id and payment_due_on=p_payment_due_on) then
    raise exception 'Este pagamento já foi fechado.';
  end if;

  perform 1 from public.finished_production_receipts
  where worker_id=p_worker_id and closing_id is null and planned_payment_on<=p_payment_due_on
  order by id for update;
  select count(*),coalesce(sum(quantity),0),coalesce(round(sum(quantity::numeric*rate_per_100_snapshot/100),2),0),
    min(received_on),(v_cutoff_at at time zone v_schedule.timezone)::date
  into v_receipt_count,v_quantity,v_amount,v_cycle_start,v_cycle_end
  from public.finished_production_receipts
  where worker_id=p_worker_id and closing_id is null and planned_payment_on<=p_payment_due_on;
  if v_receipt_count=0 then raise exception 'Não existem recebimentos prontos para este pagamento.'; end if;

  v_week_start := p_payment_due_on-(extract(isodow from p_payment_due_on)::integer-1);
  insert into public.production_weekly_closings(
    worker_id,week_start,total_quantity,total_amount,closed_by,payment_due_on,cutoff_at,
    cycle_start_on,cycle_end_on,schedule_snapshot
  ) values(
    p_worker_id,v_week_start,v_quantity,v_amount,(select auth.uid()),p_payment_due_on,v_cutoff_at,
    v_cycle_start,v_cycle_end,jsonb_build_object(
      'payment_weekday',v_schedule.payment_weekday,'cutoff_weekday',v_schedule.cutoff_weekday,
      'cutoff_time',v_schedule.cutoff_time,'timezone',v_schedule.timezone
    )
  ) returning id into v_id;

  update public.finished_production_receipts set closing_id=v_id
  where worker_id=p_worker_id and closing_id is null and planned_payment_on<=p_payment_due_on;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'production.payment_closed','production_weekly_closing',v_id::text,
    jsonb_build_object('worker_id',p_worker_id,'payment_due_on',p_payment_due_on,'cutoff_at',v_cutoff_at,'quantity',v_quantity,'amount',v_amount));
  return v_id;
end;
$$;

create or replace function public.list_production_payment_closings(
  p_from date default null,
  p_to date default null,
  p_worker_id uuid default null
) returns table(
  id uuid,protocol bigint,worker_id uuid,worker_name text,
  cycle_start_on date,cycle_end_on date,payment_due_on date,cutoff_at timestamptz,
  total_quantity bigint,total_amount numeric,status text,closed_at timestamptz,
  paid_at timestamptz,payment_notes text
)
language plpgsql security definer set search_path = '' as $$
declare v_role text; v_uid uuid := (select auth.uid());
begin
  select p.role into v_role from public.profiles p where p.id=v_uid and p.status='active';
  if v_role is null then raise exception 'Acesso negado.'; end if;
  return query
  select c.id,c.protocol,c.worker_id,w.full_name,c.cycle_start_on,c.cycle_end_on,c.payment_due_on,c.cutoff_at,
    c.total_quantity,
    case when v_role='admin' or (v_role='collaborator' and c.worker_id=v_uid) then c.total_amount else null::numeric end,
    c.status,c.closed_at,c.paid_at,
    case when v_role='admin' or (v_role='collaborator' and c.worker_id=v_uid) then c.payment_notes else null::text end
  from public.production_weekly_closings c join public.profiles w on w.id=c.worker_id
  where (v_role in ('admin','receiver') or c.worker_id=v_uid)
    and (p_from is null or c.payment_due_on>=p_from)
    and (p_to is null or c.payment_due_on<=p_to)
    and (p_worker_id is null or c.worker_id=p_worker_id)
  order by c.payment_due_on desc,w.full_name;
end;
$$;

create or replace function public.admin_mark_production_payment_paid(
  p_closing_id uuid,
  p_notes text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  update public.production_weekly_closings
  set status='paid',paid_by=(select auth.uid()),paid_at=now(),payment_notes=nullif(trim(p_notes),'')
  where id=p_closing_id and status='closed';
  if not found then raise exception 'Pagamento não localizado ou já confirmado.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values((select auth.uid()),'production.payment_paid','production_weekly_closing',p_closing_id::text);
end;
$$;

create or replace function public.admin_reopen_production_payment(p_closing_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  perform 1 from public.production_weekly_closings where id=p_closing_id and status='closed' for update;
  if not found then raise exception 'Somente um pagamento ainda não realizado pode ser reaberto.'; end if;
  update public.finished_production_receipts set closing_id=null where closing_id=p_closing_id;
  delete from public.production_weekly_closings where id=p_closing_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values((select auth.uid()),'production.payment_reopened','production_weekly_closing',p_closing_id::text);
end;
$$;

create or replace function public.admin_production_payment_statement(p_closing_id uuid)
returns table(
  closing_id uuid,protocol bigint,worker_name text,cycle_start_on date,cycle_end_on date,
  payment_due_on date,collection_id uuid,receipt_protocol bigint,received_on date,box_reference text,
  model_name text,color text,declared_quantity bigint,quantity bigint,quantity_difference bigint,
  rate_per_100 numeric,line_amount numeric,total_quantity bigint,total_amount numeric,status text,paid_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  return query
  select c.id,c.protocol,w.full_name,c.cycle_start_on,c.cycle_end_on,c.payment_due_on,r.collection_id,r.protocol,
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

drop function if exists public.list_finished_production_receipts(date,date,uuid);
create function public.list_finished_production_receipts(
  p_from date default null,
  p_to date default null,
  p_worker_id uuid default null
) returns table(
  id uuid,collection_id uuid,protocol bigint,worker_id uuid,worker_name text,model_id uuid,model_name text,
  color text,declared_quantity bigint,quantity bigint,quantity_difference bigint,box_reference text,
  received_on date,received_by uuid,receiver_name text,notes text,closing_id uuid,planned_payment_on date,
  created_at timestamptz,rate_per_100 numeric,amount numeric
)
language plpgsql security definer set search_path = '' as $$
declare v_role text; v_uid uuid := (select auth.uid());
begin
  select p.role into v_role from public.profiles p where p.id=v_uid and p.status='active';
  if v_role is null then raise exception 'Acesso negado.'; end if;
  return query
  select r.id,r.collection_id,r.protocol,r.worker_id,w.full_name,r.model_id,m.name,r.color,
    r.declared_quantity,r.quantity,r.quantity_difference,r.box_reference,r.received_on,r.received_by,
    receiver.full_name,r.notes,r.closing_id,r.planned_payment_on,r.created_at,
    case when v_role='admin' then r.rate_per_100_snapshot else null::numeric end,
    case when v_role='admin' then round(r.quantity::numeric*r.rate_per_100_snapshot/100,4) else null::numeric end
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
  p_worker_id uuid,p_received_on date,p_box_reference text default null,p_notes text default null,p_items jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_collection_id uuid:=gen_random_uuid(); v_item record; v_rate numeric; v_due date;
begin
  if not ((select private.is_admin()) or (select private.is_production_receiver())) then raise exception 'Acesso negado.'; end if;
  if p_received_on is null or p_received_on>current_date then raise exception 'Informe uma data de recebimento válida.'; end if;
  if length(trim(coalesce(p_box_reference,'')))>80 then raise exception 'A identificação da coleta deve ter no máximo 80 caracteres.'; end if;
  if not exists(select 1 from public.profiles where id=p_worker_id and status='active' and role in ('collaborator','receiver')) then raise exception 'Colaboradora inválida ou inativa.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Adicione de 1 a 100 modelos neste recebimento.'; end if;
  v_due:=private.next_open_production_payment_due(p_worker_id,p_received_on,now());
  for v_item in select * from jsonb_to_recordset(p_items) as x(model_id uuid,color text,declared_quantity bigint,quantity bigint)
  loop
    if v_item.quantity is null or v_item.quantity<0 then raise exception 'Informe uma contagem oficial igual ou maior que zero.'; end if;
    if v_item.declared_quantity is null or v_item.declared_quantity<0 then raise exception 'Informe a quantidade anotada na folha.'; end if;
    if length(trim(coalesce(v_item.color,'')))=0 then raise exception 'Informe a cor de todos os modelos.'; end if;
    select rate_per_100 into v_rate from public.finished_product_models where id=v_item.model_id and active;
    if not found then raise exception 'Um dos modelos é inválido ou está inativo.'; end if;
    insert into public.finished_production_receipts(
      collection_id,worker_id,model_id,color,declared_quantity,quantity,box_reference,received_on,
      rate_per_100_snapshot,notes,received_by,planned_payment_on
    ) values(
      v_collection_id,p_worker_id,v_item.model_id,trim(v_item.color),v_item.declared_quantity,v_item.quantity,
      nullif(trim(p_box_reference),''),p_received_on,v_rate,nullif(trim(p_notes),''),(select auth.uid()),v_due
    );
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'production.collection_created','finished_production_collection',v_collection_id::text,
    jsonb_build_object('worker_id',p_worker_id,'received_on',p_received_on,'planned_payment_on',v_due,'items',jsonb_array_length(p_items)));
  return v_collection_id;
end;
$$;

create or replace function public.update_finished_production_collection(
  p_collection_id uuid,p_worker_id uuid,p_received_on date,p_box_reference text default null,p_notes text default null,p_items jsonb default '[]'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_record public.finished_production_receipts; v_item record; v_rate numeric; v_closing_id uuid;
  v_closing_status text; v_old_items bigint; v_new_quantity bigint; v_new_amount numeric; v_due date;
begin
  if not ((select private.is_admin()) or (select private.is_production_receiver())) then raise exception 'Apenas ADM ou Recebimento pode corrigir esta coleta.'; end if;
  select * into v_record from public.finished_production_receipts
  where collection_id=p_collection_id order by protocol limit 1 for update;
  if not found then raise exception 'Recebimento não localizado.'; end if;
  select count(*) into v_old_items from public.finished_production_receipts where collection_id=p_collection_id;
  v_closing_id:=v_record.closing_id;
  if exists(select 1 from public.finished_production_receipts where collection_id=p_collection_id and closing_id is distinct from v_closing_id) then raise exception 'A coleta possui vínculos de pagamento inconsistentes.'; end if;
  if v_closing_id is not null then
    select status into v_closing_status from public.production_weekly_closings where id=v_closing_id for update;
    if not found then raise exception 'Pagamento da coleta não localizado.'; end if;
    if v_closing_status='paid' then raise exception 'Este pagamento já foi realizado. Registre um ajuste em uma nova coleta.'; end if;
    if p_worker_id is distinct from v_record.worker_id or p_received_on is distinct from v_record.received_on then raise exception 'Em uma coleta fechada, mantenha a colaboradora e a data originais.'; end if;
  end if;
  if p_received_on is null or p_received_on>current_date then raise exception 'Informe uma data de recebimento válida.'; end if;
  if length(trim(coalesce(p_box_reference,'')))>80 then raise exception 'A identificação da coleta deve ter no máximo 80 caracteres.'; end if;
  if not exists(select 1 from public.profiles where id=p_worker_id and status='active' and role in ('collaborator','receiver')) then raise exception 'Colaboradora inválida ou inativa.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Adicione de 1 a 100 modelos neste recebimento.'; end if;
  for v_item in select * from jsonb_to_recordset(p_items) as x(model_id uuid,color text,declared_quantity bigint,quantity bigint)
  loop
    if v_item.quantity is null or v_item.quantity<0 then raise exception 'Informe uma contagem oficial igual ou maior que zero.'; end if;
    if v_item.declared_quantity is null or v_item.declared_quantity<0 then raise exception 'Informe a quantidade anotada na folha.'; end if;
    if length(trim(coalesce(v_item.color,'')))=0 then raise exception 'Informe a cor de todos os modelos.'; end if;
    perform 1 from public.finished_product_models where id=v_item.model_id;
    if not found then raise exception 'Um dos modelos é inválido.'; end if;
  end loop;
  v_due:=case when v_closing_id is not null then v_record.planned_payment_on else private.next_open_production_payment_due(p_worker_id,p_received_on,now()) end;
  delete from public.finished_production_receipts where collection_id=p_collection_id;
  for v_item in select * from jsonb_to_recordset(p_items) as x(model_id uuid,color text,declared_quantity bigint,quantity bigint)
  loop
    select rate_per_100 into v_rate from public.finished_product_models where id=v_item.model_id;
    insert into public.finished_production_receipts(
      collection_id,worker_id,model_id,color,declared_quantity,quantity,box_reference,received_on,
      rate_per_100_snapshot,notes,received_by,closing_id,planned_payment_on
    ) values(
      p_collection_id,p_worker_id,v_item.model_id,trim(v_item.color),v_item.declared_quantity,v_item.quantity,
      nullif(trim(p_box_reference),''),p_received_on,v_rate,nullif(trim(p_notes),''),(select auth.uid()),v_closing_id,v_due
    );
  end loop;
  if v_closing_id is not null then
    select coalesce(sum(quantity),0),coalesce(round(sum(quantity::numeric*rate_per_100_snapshot/100),2),0)
    into v_new_quantity,v_new_amount from public.finished_production_receipts where closing_id=v_closing_id;
    update public.production_weekly_closings set total_quantity=v_new_quantity,total_amount=v_new_amount where id=v_closing_id and status='closed';
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),case when v_closing_id is null then 'production.collection_updated' else 'production.collection_reopened_updated' end,
    'finished_production_collection',p_collection_id::text,jsonb_build_object(
      'worker_id',p_worker_id,'received_on',p_received_on,'planned_payment_on',v_due,
      'previous_items',v_old_items,'items',jsonb_array_length(p_items),'closing_id',v_closing_id
    ));
end;
$$;

revoke all on function public.list_production_payment_schedules() from public, anon;
revoke all on function public.admin_save_production_payment_schedule(uuid,smallint,smallint,time without time zone,boolean) from public, anon;
revoke all on function public.list_production_payment_overview() from public, anon;
revoke all on function public.admin_preview_production_payment(uuid,date) from public, anon;
revoke all on function public.admin_move_production_collection_payment(uuid,date,text) from public, anon;
revoke all on function public.admin_close_production_payment(uuid,date) from public, anon;
revoke all on function public.list_production_payment_closings(date,date,uuid) from public, anon;
revoke all on function public.admin_mark_production_payment_paid(uuid,text) from public, anon;
revoke all on function public.admin_reopen_production_payment(uuid) from public, anon;
revoke all on function public.admin_production_payment_statement(uuid) from public, anon;
revoke all on function public.list_finished_production_receipts(date,date,uuid) from public, anon;
revoke all on function public.create_finished_production_collection(uuid,date,text,text,jsonb) from public, anon;
revoke all on function public.update_finished_production_collection(uuid,uuid,date,text,text,jsonb) from public, anon;

grant execute on function public.list_production_payment_schedules() to authenticated;
grant execute on function public.admin_save_production_payment_schedule(uuid,smallint,smallint,time without time zone,boolean) to authenticated;
grant execute on function public.list_production_payment_overview() to authenticated;
grant execute on function public.admin_preview_production_payment(uuid,date) to authenticated;
grant execute on function public.admin_move_production_collection_payment(uuid,date,text) to authenticated;
grant execute on function public.admin_close_production_payment(uuid,date) to authenticated;
grant execute on function public.list_production_payment_closings(date,date,uuid) to authenticated;
grant execute on function public.admin_mark_production_payment_paid(uuid,text) to authenticated;
grant execute on function public.admin_reopen_production_payment(uuid) to authenticated;
grant execute on function public.admin_production_payment_statement(uuid) to authenticated;
grant execute on function public.list_finished_production_receipts(date,date,uuid) to authenticated;
grant execute on function public.create_finished_production_collection(uuid,date,text,text,jsonb) to authenticated;
grant execute on function public.update_finished_production_collection(uuid,uuid,date,text,text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
