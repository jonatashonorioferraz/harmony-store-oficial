-- Harmony Store Oficial — recebimento de produtos acabados e pagamentos semanais.
-- Atualização aditiva: preserva solicitações, estoque, fornecedores e relatórios existentes.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'collaborator', 'receiver'));

create or replace function private.is_production_receiver()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.profiles
    where id=(select auth.uid()) and role='receiver' and status='active'
  )
$$;
revoke all on function private.is_production_receiver() from public;
grant execute on function private.is_production_receiver() to authenticated;

create table if not exists public.finished_product_models (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  colors text[] not null default '{}',
  rate_per_100 numeric(12,2) not null default 2.50 check (rate_per_100 >= 0),
  image_path text,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finished_product_models_name_unique
  on public.finished_product_models(lower(name));

create table if not exists public.production_weekly_closings (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  worker_id uuid not null references public.profiles(id) on delete restrict,
  week_start date not null,
  week_end date generated always as (week_start + 6) stored,
  total_quantity bigint not null default 0 check (total_quantity >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  status text not null default 'closed' check (status in ('closed','paid')),
  closed_by uuid not null references public.profiles(id) on delete restrict,
  closed_at timestamptz not null default now(),
  paid_by uuid references public.profiles(id) on delete set null,
  paid_at timestamptz,
  payment_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(isodow from week_start) = 1),
  unique(worker_id, week_start)
);

create table if not exists public.finished_production_receipts (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  worker_id uuid not null references public.profiles(id) on delete restrict,
  model_id uuid not null references public.finished_product_models(id) on delete restrict,
  color text not null check (length(trim(color)) between 1 and 80),
  quantity bigint not null check (quantity > 0),
  received_on date not null default current_date check (received_on <= current_date),
  rate_per_100_snapshot numeric(12,2) not null check (rate_per_100_snapshot >= 0),
  notes text,
  received_by uuid not null references public.profiles(id) on delete restrict,
  closing_id uuid references public.production_weekly_closings(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finished_receipts_worker_date_idx
  on public.finished_production_receipts(worker_id, received_on desc);
create index if not exists finished_receipts_model_idx
  on public.finished_production_receipts(model_id);
create index if not exists finished_receipts_closing_idx
  on public.finished_production_receipts(closing_id);
create index if not exists production_closings_week_idx
  on public.production_weekly_closings(week_start desc, worker_id);

drop trigger if exists finished_models_touch_updated_at on public.finished_product_models;
create trigger finished_models_touch_updated_at before update on public.finished_product_models
for each row execute function public.touch_updated_at();
drop trigger if exists finished_receipts_touch_updated_at on public.finished_production_receipts;
create trigger finished_receipts_touch_updated_at before update on public.finished_production_receipts
for each row execute function public.touch_updated_at();
drop trigger if exists production_closings_touch_updated_at on public.production_weekly_closings;
create trigger production_closings_touch_updated_at before update on public.production_weekly_closings
for each row execute function public.touch_updated_at();

alter table public.finished_product_models enable row level security;
alter table public.finished_production_receipts enable row level security;
alter table public.production_weekly_closings enable row level security;

drop policy if exists "finished model: admin all" on public.finished_product_models;
drop policy if exists "finished receipt: admin all" on public.finished_production_receipts;
drop policy if exists "production closing: admin all" on public.production_weekly_closings;
create policy "finished model: admin all" on public.finished_product_models for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "finished receipt: admin all" on public.finished_production_receipts for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "production closing: admin all" on public.production_weekly_closings for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

grant select,insert,update,delete on public.finished_product_models to authenticated;
grant select,insert,update,delete on public.finished_production_receipts to authenticated;
grant select,insert,update,delete on public.production_weekly_closings to authenticated;

create or replace function public.list_production_workers()
returns table(id uuid, full_name text, department text, avatar_path text, role text)
language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p
  where p.id=(select auth.uid()) and p.status='active';
  if v_role not in ('admin','receiver') then raise exception 'Acesso negado.'; end if;
  return query select p.id,p.full_name,p.department,p.avatar_path,p.role
  from public.profiles p
  where p.status='active' and p.role in ('collaborator','receiver')
  order by p.full_name;
end;
$$;

create or replace function public.list_finished_product_models()
returns table(id uuid, name text, colors text[], rate_per_100 numeric, image_path text, notes text, active boolean)
language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p
  where p.id=(select auth.uid()) and p.status='active';
  if v_role is null then raise exception 'Acesso negado.'; end if;
  return query select m.id,m.name,m.colors,
    case when v_role='admin' then m.rate_per_100 else null::numeric end,
    m.image_path,case when v_role='admin' then m.notes else null::text end,m.active
  from public.finished_product_models m
  where m.active or v_role='admin'
  order by m.name;
end;
$$;

create or replace function public.list_finished_production_receipts(
  p_from date default null,
  p_to date default null,
  p_worker_id uuid default null
) returns table(
  id uuid, protocol bigint, worker_id uuid, worker_name text, model_id uuid, model_name text,
  color text, quantity bigint, received_on date, received_by uuid, receiver_name text,
  notes text, closing_id uuid, created_at timestamptz, rate_per_100 numeric, amount numeric
)
language plpgsql security definer set search_path = '' as $$
declare v_role text; v_uid uuid := (select auth.uid());
begin
  select p.role into v_role from public.profiles p where p.id=v_uid and p.status='active';
  if v_role is null then raise exception 'Acesso negado.'; end if;
  return query
  select r.id,r.protocol,r.worker_id,w.full_name,r.model_id,m.name,r.color,r.quantity,
    r.received_on,r.received_by,receiver.full_name,r.notes,r.closing_id,r.created_at,
    case when v_role='admin' or (v_role='collaborator' and r.worker_id=v_uid) then r.rate_per_100_snapshot else null::numeric end,
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
  order by r.received_on desc,r.protocol desc;
end;
$$;

create or replace function public.list_production_weekly_closings(
  p_from date default null,
  p_to date default null,
  p_worker_id uuid default null
) returns table(
  id uuid, protocol bigint, worker_id uuid, worker_name text, week_start date, week_end date,
  total_quantity bigint, total_amount numeric, status text, closed_at timestamptz,
  paid_at timestamptz, payment_notes text
)
language plpgsql security definer set search_path = '' as $$
declare v_role text; v_uid uuid := (select auth.uid());
begin
  select p.role into v_role from public.profiles p where p.id=v_uid and p.status='active';
  if v_role is null then raise exception 'Acesso negado.'; end if;
  return query select c.id,c.protocol,c.worker_id,w.full_name,c.week_start,c.week_end,
    c.total_quantity,
    case when v_role='admin' or (v_role='collaborator' and c.worker_id=v_uid) then c.total_amount else null::numeric end,
    c.status,c.closed_at,c.paid_at,
    case when v_role='admin' or (v_role='collaborator' and c.worker_id=v_uid) then c.payment_notes else null::text end
  from public.production_weekly_closings c join public.profiles w on w.id=c.worker_id
  where (v_role in ('admin','receiver') or c.worker_id=v_uid)
    and (p_from is null or c.week_end>=p_from)
    and (p_to is null or c.week_start<=p_to)
    and (p_worker_id is null or c.worker_id=p_worker_id)
  order by c.week_start desc,w.full_name;
end;
$$;

create or replace function public.create_finished_production_receipt(
  p_worker_id uuid, p_model_id uuid, p_color text, p_quantity bigint,
  p_received_on date, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_rate numeric;
begin
  if not ((select private.is_admin()) or (select private.is_production_receiver())) then raise exception 'Acesso negado.'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Informe uma quantidade maior que zero.'; end if;
  if p_received_on is null or p_received_on>current_date then raise exception 'Informe uma data de recebimento válida.'; end if;
  if length(trim(coalesce(p_color,'')))=0 then raise exception 'Informe a cor.'; end if;
  if not exists(select 1 from public.profiles where id=p_worker_id and status='active' and role in ('collaborator','receiver')) then
    raise exception 'Colaboradora inválida ou inativa.';
  end if;
  if exists(select 1 from public.production_weekly_closings where worker_id=p_worker_id and p_received_on between week_start and week_end) then
    raise exception 'A semana desta colaboradora já está fechada. Reabra o fechamento antes de lançar.';
  end if;
  select rate_per_100 into v_rate from public.finished_product_models where id=p_model_id and active;
  if not found then raise exception 'Modelo inválido ou inativo.'; end if;
  insert into public.finished_production_receipts(worker_id,model_id,color,quantity,received_on,rate_per_100_snapshot,notes,received_by)
  values(p_worker_id,p_model_id,trim(p_color),p_quantity,p_received_on,v_rate,nullif(trim(p_notes),''),(select auth.uid()))
  returning id into v_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'production.receipt_created','finished_production_receipt',v_id::text,
    jsonb_build_object('worker_id',p_worker_id,'model_id',p_model_id,'quantity',p_quantity,'received_on',p_received_on));
  return v_id;
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
  if not (select private.is_admin()) and not ((select private.is_production_receiver()) and v_record.received_by=(select auth.uid())) then
    raise exception 'Você só pode corrigir recebimentos lançados por você.';
  end if;
  if v_record.closing_id is not null then raise exception 'A semana está fechada. Reabra o fechamento antes de corrigir.'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Informe uma quantidade maior que zero.'; end if;
  if p_received_on is null or p_received_on>current_date then raise exception 'Informe uma data de recebimento válida.'; end if;
  if length(trim(coalesce(p_color,'')))=0 then raise exception 'Informe a cor.'; end if;
  if not exists(select 1 from public.profiles where id=p_worker_id and status='active' and role in ('collaborator','receiver')) then raise exception 'Colaboradora inválida.'; end if;
  if exists(select 1 from public.production_weekly_closings where worker_id=p_worker_id and p_received_on between week_start and week_end) then
    raise exception 'A semana desta colaboradora já está fechada. Reabra o fechamento antes de corrigir.';
  end if;
  select rate_per_100 into v_rate from public.finished_product_models where id=p_model_id;
  if not found then raise exception 'Modelo inválido.'; end if;
  update public.finished_production_receipts set worker_id=p_worker_id,model_id=p_model_id,color=trim(p_color),
    quantity=p_quantity,received_on=p_received_on,rate_per_100_snapshot=v_rate,notes=nullif(trim(p_notes),'')
  where id=p_receipt_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values((select auth.uid()),'production.receipt_updated','finished_production_receipt',p_receipt_id::text);
end;
$$;

create or replace function public.delete_finished_production_receipt(p_receipt_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_record public.finished_production_receipts;
begin
  select * into v_record from public.finished_production_receipts where id=p_receipt_id for update;
  if not found then raise exception 'Recebimento não localizado.'; end if;
  if not (select private.is_admin()) and not ((select private.is_production_receiver()) and v_record.received_by=(select auth.uid())) then raise exception 'Acesso negado.'; end if;
  if v_record.closing_id is not null then raise exception 'A semana está fechada. Reabra o fechamento antes de excluir.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'production.receipt_deleted','finished_production_receipt',p_receipt_id::text,
    jsonb_build_object('worker_id',v_record.worker_id,'model_id',v_record.model_id,'quantity',v_record.quantity));
  delete from public.finished_production_receipts where id=p_receipt_id;
end;
$$;

create or replace function public.admin_close_production_week(p_worker_id uuid,p_week_start date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_quantity bigint; v_amount numeric;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  if p_week_start is null or extract(isodow from p_week_start)<>1 then raise exception 'A semana deve começar em uma segunda-feira.'; end if;
  if exists(select 1 from public.production_weekly_closings where worker_id=p_worker_id and week_start=p_week_start) then raise exception 'Esta semana já foi fechada para a colaboradora.'; end if;
  select coalesce(sum(quantity),0),coalesce(round(sum(quantity::numeric*rate_per_100_snapshot/100),2),0)
    into v_quantity,v_amount from public.finished_production_receipts
    where worker_id=p_worker_id and received_on between p_week_start and p_week_start+6 and closing_id is null;
  if v_quantity=0 then raise exception 'Não existem recebimentos em aberto nesta semana.'; end if;
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

create or replace function public.admin_mark_production_week_paid(p_closing_id uuid,p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  update public.production_weekly_closings set status='paid',paid_by=(select auth.uid()),paid_at=now(),payment_notes=nullif(trim(p_notes),'')
  where id=p_closing_id and status='closed';
  if not found then raise exception 'Fechamento não localizado ou já pago.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values((select auth.uid()),'production.week_paid','production_weekly_closing',p_closing_id::text);
end;
$$;

create or replace function public.admin_reopen_production_week(p_closing_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  perform 1 from public.production_weekly_closings where id=p_closing_id and status='closed' for update;
  if not found then raise exception 'Somente um fechamento ainda não pago pode ser reaberto.'; end if;
  update public.finished_production_receipts set closing_id=null where closing_id=p_closing_id;
  delete from public.production_weekly_closings where id=p_closing_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values((select auth.uid()),'production.week_reopened','production_weekly_closing',p_closing_id::text);
end;
$$;

create or replace function public.admin_production_statement(p_closing_id uuid)
returns table(
  closing_id uuid, protocol bigint, worker_name text, week_start date, week_end date,
  receipt_protocol bigint, received_on date, model_name text, color text, quantity bigint,
  rate_per_100 numeric, line_amount numeric, total_quantity bigint, total_amount numeric,
  status text, paid_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.'; end if;
  return query select c.id,c.protocol,w.full_name,c.week_start,c.week_end,r.protocol,r.received_on,
    m.name,r.color,r.quantity,r.rate_per_100_snapshot,round(r.quantity::numeric*r.rate_per_100_snapshot/100,4),
    c.total_quantity,c.total_amount,c.status,c.paid_at
  from public.production_weekly_closings c
  join public.profiles w on w.id=c.worker_id
  join public.finished_production_receipts r on r.closing_id=c.id
  join public.finished_product_models m on m.id=r.model_id
  where c.id=p_closing_id order by r.received_on,r.protocol;
end;
$$;

grant execute on function public.list_production_workers() to authenticated;
grant execute on function public.list_finished_product_models() to authenticated;
grant execute on function public.list_finished_production_receipts(date,date,uuid) to authenticated;
grant execute on function public.list_production_weekly_closings(date,date,uuid) to authenticated;
grant execute on function public.create_finished_production_receipt(uuid,uuid,text,bigint,date,text) to authenticated;
grant execute on function public.update_finished_production_receipt(uuid,uuid,uuid,text,bigint,date,text) to authenticated;
grant execute on function public.delete_finished_production_receipt(uuid) to authenticated;
grant execute on function public.admin_close_production_week(uuid,date) to authenticated;
grant execute on function public.admin_mark_production_week_paid(uuid,text) to authenticated;
grant execute on function public.admin_reopen_production_week(uuid) to authenticated;
grant execute on function public.admin_production_statement(uuid) to authenticated;

notify pgrst, 'reload schema';
