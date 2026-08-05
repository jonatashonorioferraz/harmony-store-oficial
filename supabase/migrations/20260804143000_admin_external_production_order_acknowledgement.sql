-- Harmony Store Oficial - confirmação externa de ordens de produção.
-- Permite ao ADM registrar, com trilha de auditoria, a ciência recebida fora do aplicativo.

begin;

alter table public.production_orders
  add column if not exists acknowledgement_source text,
  add column if not exists acknowledged_by uuid references public.profiles(id) on delete set null,
  add column if not exists acknowledgement_note text;

update public.production_orders
set acknowledgement_source = 'app',
    acknowledged_by = worker_id
where status = 'acknowledged'
  and acknowledgement_source is null;

alter table public.production_orders
  drop constraint if exists production_orders_acknowledgement_source_check;

alter table public.production_orders
  add constraint production_orders_acknowledgement_source_check
  check (acknowledgement_source is null or acknowledgement_source in ('app','whatsapp','phone','in_person','other'));

alter table public.production_orders
  drop constraint if exists production_orders_acknowledgement_note_check;

alter table public.production_orders
  add constraint production_orders_acknowledgement_note_check
  check (acknowledgement_note is null or length(acknowledgement_note) <= 500);

create index if not exists production_orders_acknowledged_by_idx
  on public.production_orders(acknowledged_by)
  where acknowledged_by is not null;

drop function if exists public.list_production_orders(date,date);

create function public.list_production_orders(
  p_from date default null,
  p_to date default null
) returns table(
  id uuid, protocol bigint, worker_id uuid, worker_name text,
  week_start date, due_date date, status text, notes text,
  created_by uuid, creator_name text, sent_at timestamptz,
  viewed_at timestamptz, acknowledged_at timestamptz,
  acknowledgement_source text, acknowledged_by uuid, acknowledged_by_name text,
  acknowledgement_note text,
  cancelled_at timestamptz, cancel_reason text, created_at timestamptz,
  item_id uuid, model_id uuid, model_name text, image_path text,
  color_id uuid, color_name text, color_hex text, quantity bigint,
  item_notes text, item_position integer
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_user and p.status = 'active';
  if v_role is null then raise exception 'Acesso negado.' using errcode='42501'; end if;

  return query
  select o.id,o.protocol,o.worker_id,o.worker_name,o.week_start,o.due_date,o.status,o.notes,
    o.created_by,creator.full_name,o.sent_at,o.viewed_at,o.acknowledged_at,
    o.acknowledgement_source,o.acknowledged_by,acknowledger.full_name,o.acknowledgement_note,
    o.cancelled_at,o.cancel_reason,o.created_at,
    i.id,i.model_id,i.model_name,i.image_path,i.color_id,i.color_name,upper(i.color_hex),
    i.quantity,i.notes,i.position
  from public.production_orders o
  join public.profiles creator on creator.id=o.created_by
  left join public.profiles acknowledger on acknowledger.id=o.acknowledged_by
  join public.production_order_items i on i.order_id=o.id
  where (v_role='admin' or (o.worker_id=v_user and o.status<>'draft'))
    and (p_from is null or o.week_start>=p_from)
    and (p_to is null or o.week_start<=p_to)
  order by o.week_start desc,o.created_at desc,i.position,i.created_at;
end;
$$;

create or replace function public.acknowledge_production_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.production_orders
  set status='acknowledged',
      viewed_at=coalesce(viewed_at,now()),
      acknowledged_at=coalesce(acknowledged_at,now()),
      acknowledgement_source=coalesce(acknowledgement_source,'app'),
      acknowledged_by=coalesce(acknowledged_by,(select auth.uid())),
      acknowledgement_note=case when acknowledgement_source is null then null else acknowledgement_note end
  where id=p_order_id
    and worker_id=(select auth.uid())
    and status in ('sent','viewed','acknowledged');
  if not found then raise exception 'Ordem de producao nao localizada.' using errcode='P0002'; end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values((select auth.uid()),'production_order.acknowledged','production_order',p_order_id::text,'database',jsonb_build_object('source','app'));
end;
$$;

create or replace function public.admin_acknowledge_production_order(
  p_order_id uuid,
  p_source text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_order public.production_orders%rowtype;
  v_source text := lower(trim(coalesce(p_source,'')));
  v_note text := nullif(trim(coalesce(p_note,'')),'');
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if v_source not in ('whatsapp','phone','in_person','other') then
    raise exception 'Selecione como a colaboradora confirmou a ordem.';
  end if;
  if v_note is not null and length(v_note)>500 then
    raise exception 'A observacao deve ter no maximo 500 caracteres.';
  end if;
  if v_source='other' and length(coalesce(v_note,''))<3 then
    raise exception 'Explique como a confirmacao foi recebida.';
  end if;

  select * into v_order
  from public.production_orders
  where id=p_order_id
  for update;

  if not found then
    raise exception 'Ordem de producao nao localizada.' using errcode='P0002';
  end if;
  if v_order.status not in ('sent','viewed') then
    raise exception 'Somente ordens enviadas ou visualizadas podem receber confirmacao externa.';
  end if;

  update public.production_orders
  set status='acknowledged',
      viewed_at=coalesce(viewed_at,now()),
      acknowledged_at=now(),
      acknowledgement_source=v_source,
      acknowledged_by=v_actor,
      acknowledgement_note=v_note
  where id=p_order_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'production_order.admin_acknowledged','production_order',p_order_id::text,'database',
    jsonb_build_object('source',v_source,'note',v_note,'previous_status',v_order.status,'worker_id',v_order.worker_id));
end;
$$;

revoke all on function public.list_production_orders(date,date) from public,anon,authenticated;
revoke all on function public.acknowledge_production_order(uuid) from public,anon,authenticated;
revoke all on function public.admin_acknowledge_production_order(uuid,text,text) from public,anon,authenticated;
grant execute on function public.list_production_orders(date,date) to authenticated,service_role;
grant execute on function public.acknowledge_production_order(uuid) to authenticated,service_role;
grant execute on function public.admin_acknowledge_production_order(uuid,text,text) to authenticated,service_role;

commit;
