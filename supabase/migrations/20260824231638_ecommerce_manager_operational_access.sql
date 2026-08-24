-- Gerente de e-commerce: união segura das operações de produção e e-commerce.
-- O perfil continua armazenado como collaborator + is_ecommerce_manager=true,
-- sem receber role admin nem acesso a valores financeiros administrativos.

create or replace function private.is_production_receiver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.profiles
    where id=(select auth.uid())
      and status='active'
      and (role='receiver' or coalesce(is_ecommerce_manager,false))
  )
$$;

revoke all on function private.is_production_receiver() from public, anon;
grant execute on function private.is_production_receiver() to authenticated;

create or replace function private.can_access_internal_supplies()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.profiles
    where id=(select auth.uid())
      and status='active'
      and (role in ('admin','receiver') or coalesce(is_ecommerce_manager,false))
  )
$$;

revoke all on function private.can_access_internal_supplies() from public, anon;
grant execute on function private.can_access_internal_supplies() to authenticated;

create or replace function private.enforce_production_request_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_role text;
  v_is_ecommerce_manager boolean := false;
  v_product_scope text;
begin
  select profile.role,coalesce(profile.is_ecommerce_manager,false)
  into v_requester_role,v_is_ecommerce_manager
  from public.requests request
  join public.profiles profile on profile.id=request.requested_by
  where request.id=new.request_id;

  select usage_scope into v_product_scope
  from public.products
  where id=new.product_id;

  if v_product_scope is null
     or v_requester_role not in ('admin','collaborator','receiver') then
    raise exception 'Produto ou perfil incompatível com esta solicitação.' using errcode='23514';
  elsif v_is_ecommerce_manager
        and v_product_scope not in ('production','ecommerce','shared') then
    raise exception 'A gerente pode solicitar somente matérias-primas, suprimentos do e-commerce ou itens compartilhados.' using errcode='23514';
  elsif v_requester_role='receiver'
        and v_product_scope not in ('ecommerce','shared') then
    raise exception 'A colaboradora de recebimento pode solicitar somente suprimentos do e-commerce ou itens compartilhados.' using errcode='23514';
  elsif v_requester_role='collaborator'
        and not v_is_ecommerce_manager
        and v_product_scope not in ('production','shared') then
    raise exception 'A colaboradora de produção pode solicitar somente matérias-primas ou itens compartilhados.' using errcode='23514';
  elsif v_requester_role='admin'
        and v_product_scope not in ('production','ecommerce','shared') then
    raise exception 'A solicitação aceita somente matérias-primas, suprimentos do e-commerce ou itens compartilhados.' using errcode='23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_production_request_product() from public, anon, authenticated;

create or replace function public.list_production_workers()
returns table(id uuid,full_name text,department text,avatar_path text,role text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not ((select private.is_admin()) or (select private.is_production_receiver())) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  return query
  select p.id,p.full_name,p.department,p.avatar_path,p.role
  from public.profiles p
  where p.status='active'
    and p.role in ('collaborator','receiver')
    and not coalesce(p.is_ecommerce_manager,false)
  order by p.full_name;
end;
$$;

revoke all on function public.list_production_workers() from public, anon;
grant execute on function public.list_production_workers() to authenticated;

create or replace function public.list_finished_production_receipts(
  p_from date default null,
  p_to date default null,
  p_worker_id uuid default null
) returns table(
  id uuid,collection_id uuid,protocol bigint,worker_id uuid,worker_name text,model_id uuid,model_name text,
  color text,declared_quantity bigint,quantity bigint,quantity_difference bigint,box_reference text,
  received_on date,received_by uuid,receiver_name text,notes text,closing_id uuid,planned_payment_on date,
  created_at timestamptz,rate_per_100 numeric,amount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_uid uuid := (select auth.uid());
  v_is_ecommerce_manager boolean := false;
  v_can_receive boolean := false;
begin
  select p.role,coalesce(p.is_ecommerce_manager,false)
  into v_role,v_is_ecommerce_manager
  from public.profiles p
  where p.id=v_uid and p.status='active';

  if v_role is null then raise exception 'Acesso negado.' using errcode='42501'; end if;
  v_can_receive := v_role='receiver' or v_is_ecommerce_manager;

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
  where (v_role='admin' or v_can_receive or (r.worker_id=v_uid and not v_is_ecommerce_manager))
    and (p_from is null or r.received_on>=p_from)
    and (p_to is null or r.received_on<=p_to)
    and (p_worker_id is null or r.worker_id=p_worker_id)
  order by r.received_on desc,r.collection_id,r.protocol;
end;
$$;

revoke all on function public.list_finished_production_receipts(date,date,uuid) from public, anon;
grant execute on function public.list_finished_production_receipts(date,date,uuid) to authenticated;

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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_uid uuid := (select auth.uid());
  v_is_ecommerce_manager boolean := false;
  v_can_receive boolean := false;
begin
  select p.role,coalesce(p.is_ecommerce_manager,false)
  into v_role,v_is_ecommerce_manager
  from public.profiles p
  where p.id=v_uid and p.status='active';

  if v_role is null then raise exception 'Acesso negado.' using errcode='42501'; end if;
  v_can_receive := v_role='receiver' or v_is_ecommerce_manager;

  return query
  select c.id,c.protocol,c.worker_id,w.full_name,c.cycle_start_on,c.cycle_end_on,c.payment_due_on,c.cutoff_at,
    c.total_quantity,
    case when v_role='admin' or (v_role='collaborator' and not v_is_ecommerce_manager and c.worker_id=v_uid)
      then c.total_amount else null::numeric end,
    c.status,c.closed_at,c.paid_at,
    case when v_role='admin' or (v_role='collaborator' and not v_is_ecommerce_manager and c.worker_id=v_uid)
      then c.payment_notes else null::text end
  from public.production_weekly_closings c
  join public.profiles w on w.id=c.worker_id
  where (v_role='admin' or v_can_receive or (c.worker_id=v_uid and not v_is_ecommerce_manager))
    and (p_from is null or c.payment_due_on>=p_from)
    and (p_to is null or c.payment_due_on<=p_to)
    and (p_worker_id is null or c.worker_id=p_worker_id)
  order by c.payment_due_on desc,w.full_name;
end;
$$;

revoke all on function public.list_production_payment_closings(date,date,uuid) from public, anon;
grant execute on function public.list_production_payment_closings(date,date,uuid) to authenticated;

create or replace function public.list_finished_production_colors()
returns table(id uuid,name text,hex_code text,active boolean,sort_order integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_is_ecommerce_manager boolean := false;
begin
  select p.role,coalesce(p.is_ecommerce_manager,false)
  into v_role,v_is_ecommerce_manager
  from public.profiles p
  where p.id=(select auth.uid()) and p.status='active';

  if v_role is null then raise exception 'Acesso negado.' using errcode='42501'; end if;

  return query
  select c.id,c.name,upper(c.hex_code),c.active,c.sort_order
  from public.finished_production_colors c
  where c.active or v_role in ('admin','receiver') or v_is_ecommerce_manager
  order by c.active desc,c.sort_order,c.name;
end;
$$;

revoke all on function public.list_finished_production_colors() from public, anon;
grant execute on function public.list_finished_production_colors() to authenticated;

create or replace function public.list_production_payment_overview()
returns table(
  worker_id uuid,worker_name text,schedule_active boolean,payment_weekday smallint,
  cutoff_weekday smallint,cutoff_time time without time zone,payment_due_on date,
  cutoff_at timestamptz,collection_count bigint,receipt_count bigint,total_quantity bigint,
  total_amount numeric,ready_to_close boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return query
  with workers as (
    select p.id,p.full_name,s.active,s.payment_weekday,s.cutoff_weekday,s.cutoff_time
    from public.profiles p
    left join public.production_payment_schedules s on s.worker_id=p.id
    where p.status='active'
      and p.role in ('collaborator','receiver')
      and not coalesce(p.is_ecommerce_manager,false)
  ),dues as (
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

revoke all on function public.list_production_payment_overview() from public, anon;
grant execute on function public.list_production_payment_overview() to authenticated;

insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
values(null,'system.ecommerce_manager_operational_access_enabled','system',null,
  jsonb_build_object(
    'production_requests',true,
    'ecommerce_requests',true,
    'production_receiving',true,
    'internal_supplies',true,
    'payment_values',false,
    'admin_role',false
  ));
