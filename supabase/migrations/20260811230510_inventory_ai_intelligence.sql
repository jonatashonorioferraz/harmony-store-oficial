-- Harmony Store Oficial — Inteligência real do Inventário de Produção.
-- Métricas determinísticas no PostgreSQL; interpretação por IA sem alterar estoque,
-- pagamentos, ordens de produção ou cadastros operacionais.

begin;

create table if not exists public.inventory_ai_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  model text not null default 'gpt-5.6-terra'
    check (model ~ '^gpt-[a-zA-Z0-9._-]{1,80}$'),
  monthly_budget_usd numeric(10,4) not null default 5
    check (monthly_budget_usd between 0 and 1000),
  manual_cooldown_minutes integer not null default 10
    check (manual_cooldown_minutes between 1 and 1440),
  scheduled_daily_limit integer not null default 2
    check (scheduled_daily_limit between 0 and 12),
  analysis_window_days integer not null default 90
    check (analysis_window_days between 30 and 365),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.inventory_ai_settings(id)
values (1)
on conflict (id) do nothing;

create table if not exists public.inventory_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  trigger_source text not null
    check (trigger_source in ('manual','scheduled','critical')),
  status text not null default 'processing'
    check (status in ('processing','completed','failed','budget_blocked')),
  model text not null,
  period_days integer not null check (period_days between 30 and 365),
  snapshot_fingerprint text not null
    check (snapshot_fingerprint ~ '^[a-f0-9]{64}$'),
  snapshot_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(snapshot_summary) = 'object'),
  health_status text
    check (health_status is null or health_status in ('good','attention','critical')),
  overall_summary text check (overall_summary is null or length(overall_summary) <= 1600),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text check (error_code is null or length(error_code) <= 120),
  created_at timestamptz not null default now(),
  constraint inventory_ai_analysis_completion_check check (
    (status='processing' and completed_at is null)
    or (status<>'processing' and completed_at is not null)
  )
);

create table if not exists public.inventory_ai_insights (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.inventory_ai_analyses(id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  priority text not null check (priority in ('low','medium','high','critical')),
  category text not null check (category in (
    'stockout_risk','slow_stock','overstock','data_quality','production_balance',
    'worker_concentration','movement_anomaly','opportunity'
  )),
  title text not null check (length(trim(title)) between 3 and 180),
  explanation text not null check (length(trim(explanation)) between 3 and 1800),
  recommendation text not null check (length(trim(recommendation)) between 3 and 1200),
  action_type text not null default 'none' check (action_type in (
    'none','view_inventory','view_boxes','view_movements','view_worker','view_production_orders'
  )),
  model_id uuid references public.finished_product_models(id) on delete set null,
  color_id uuid references public.finished_production_colors(id) on delete set null,
  worker_id uuid references public.profiles(id) on delete set null,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence)='array'),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (analysis_id, position)
);

create index if not exists inventory_ai_analyses_completed_idx
  on public.inventory_ai_analyses(completed_at desc)
  where status='completed';
create index if not exists inventory_ai_analyses_monthly_cost_idx
  on public.inventory_ai_analyses(created_at desc,estimated_cost_usd)
  where status='completed';
create index if not exists inventory_ai_analyses_fingerprint_idx
  on public.inventory_ai_analyses(snapshot_fingerprint,completed_at desc)
  where status='completed';
create index if not exists inventory_ai_insights_analysis_idx
  on public.inventory_ai_insights(analysis_id,position);
create index if not exists inventory_ai_insights_open_idx
  on public.inventory_ai_insights(created_at desc)
  where dismissed_at is null;

drop trigger if exists inventory_ai_settings_touch_updated_at on public.inventory_ai_settings;
create trigger inventory_ai_settings_touch_updated_at
before update on public.inventory_ai_settings
for each row execute function public.touch_updated_at();

alter table public.inventory_ai_settings enable row level security;
alter table public.inventory_ai_analyses enable row level security;
alter table public.inventory_ai_insights enable row level security;

revoke all privileges on table public.inventory_ai_settings from public,anon,authenticated;
revoke all privileges on table public.inventory_ai_analyses from public,anon,authenticated;
revoke all privileges on table public.inventory_ai_insights from public,anon,authenticated;
grant select on table public.inventory_ai_settings to authenticated;
grant select on table public.inventory_ai_analyses to authenticated;
grant select on table public.inventory_ai_insights to authenticated;
grant all privileges on table public.inventory_ai_settings to service_role;
grant all privileges on table public.inventory_ai_analyses to service_role;
grant all privileges on table public.inventory_ai_insights to service_role;

drop policy if exists "inventory ai settings: admin read" on public.inventory_ai_settings;
create policy "inventory ai settings: admin read"
on public.inventory_ai_settings for select to authenticated
using ((select private.is_admin()));

drop policy if exists "inventory ai analyses: admin read" on public.inventory_ai_analyses;
create policy "inventory ai analyses: admin read"
on public.inventory_ai_analyses for select to authenticated
using ((select private.is_admin()));

drop policy if exists "inventory ai insights: admin read" on public.inventory_ai_insights;
create policy "inventory ai insights: admin read"
on public.inventory_ai_insights for select to authenticated
using ((select private.is_admin()));

create or replace function public.admin_get_inventory_ai_usage()
returns table(
  enabled boolean,
  model text,
  monthly_budget_usd numeric,
  manual_cooldown_minutes integer,
  scheduled_daily_limit integer,
  analysis_window_days integer,
  month_cost_usd numeric,
  month_analysis_count bigint,
  remaining_budget_usd numeric,
  last_completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select s.enabled,s.model,s.monthly_budget_usd,s.manual_cooldown_minutes,
    s.scheduled_daily_limit,s.analysis_window_days,
    coalesce(sum(a.estimated_cost_usd) filter (
      where a.status='completed'
        and a.created_at>=date_trunc('month',now())
    ),0)::numeric,
    count(a.id) filter (
      where a.status='completed'
        and a.created_at>=date_trunc('month',now())
    )::bigint,
    greatest(0,s.monthly_budget_usd-coalesce(sum(a.estimated_cost_usd) filter (
      where a.status='completed'
        and a.created_at>=date_trunc('month',now())
    ),0))::numeric,
    max(a.completed_at) filter (where a.status='completed')
  from public.inventory_ai_settings s
  left join public.inventory_ai_analyses a on true
  where s.id=1
  group by s.id,s.enabled,s.model,s.monthly_budget_usd,s.manual_cooldown_minutes,
    s.scheduled_daily_limit,s.analysis_window_days;
end;
$$;

create or replace function public.primary_admin_update_inventory_ai_settings(
  p_enabled boolean,
  p_monthly_budget_usd numeric,
  p_manual_cooldown_minutes integer default 10
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if not (select private.is_primary_admin()) then
    raise exception 'Somente o ADM principal pode alterar o orçamento da Inteligência.' using errcode='42501';
  end if;
  if p_monthly_budget_usd is null or p_monthly_budget_usd<0 or p_monthly_budget_usd>1000 then
    raise exception 'Informe um orçamento entre US$ 0 e US$ 1.000.';
  end if;
  if p_manual_cooldown_minutes is null or p_manual_cooldown_minutes not between 1 and 1440 then
    raise exception 'O intervalo deve ficar entre 1 e 1.440 minutos.';
  end if;
  update public.inventory_ai_settings
  set enabled=coalesce(p_enabled,false),monthly_budget_usd=p_monthly_budget_usd,
    manual_cooldown_minutes=p_manual_cooldown_minutes,updated_by=v_actor
  where id=1;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'inventory_ai.settings_updated','inventory_ai_settings','1',
    jsonb_build_object('enabled',coalesce(p_enabled,false),'monthly_budget_usd',p_monthly_budget_usd,
      'manual_cooldown_minutes',p_manual_cooldown_minutes));
end;
$$;

create or replace function public.admin_mark_inventory_ai_insight(
  p_insight_id uuid,
  p_action text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_action='reviewed' then
    update public.inventory_ai_insights
    set reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,v_actor)
    where id=p_insight_id;
  elsif p_action='dismissed' then
    update public.inventory_ai_insights
    set dismissed_at=coalesce(dismissed_at,now()),dismissed_by=coalesce(dismissed_by,v_actor),
      reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,v_actor)
    where id=p_insight_id;
  else
    raise exception 'Ação inválida.';
  end if;
  if not found then raise exception 'Insight não localizado.' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'inventory_ai.insight_'||p_action,'inventory_ai_insight',p_insight_id::text,'{}'::jsonb);
end;
$$;

-- RPC interna: somente a Edge Function (service_role) recebe os dados consolidados.
create or replace function public.service_inventory_ai_snapshot(p_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_days integer := greatest(30,least(coalesce(p_days,90),365));
  v_result jsonb;
begin
  with
  available_boxes as (
    select e.*
    from public.production_inventory_entries e
    where e.label_status='applied' and e.current_quantity>0 and e.transferred_at is null
  ),
  stock as (
    select e.model_id,e.color_id,sum(e.current_quantity)::bigint as units_available,
      count(*)::bigint as boxes_available,count(distinct e.worker_id)::bigint as producer_count,
      min(e.entry_on) as oldest_entry_on,max(e.entry_on) as latest_entry_on,
      count(*) filter (where nullif(trim(e.box_reference),'') is null)::bigint as missing_location_boxes,
      count(*) filter (where e.entry_on<current_date-45)::bigint as boxes_over_45_days,
      count(*) filter (where e.entry_on<current_date-90)::bigint as boxes_over_90_days
    from available_boxes e
    group by e.model_id,e.color_id
  ),
  flow as (
    select e.model_id,e.color_id,
      coalesce(sum(m.quantity) filter (where m.movement_type in ('entry','adjustment_in')),0)::bigint as entries_units,
      coalesce(sum(m.quantity) filter (where m.movement_type in ('exit','adjustment_out')),0)::bigint as exits_units,
      count(*) filter (where m.movement_type in ('adjustment_in','adjustment_out'))::bigint as adjustment_count
    from public.production_inventory_movements m
    join public.production_inventory_entries e on e.id=m.entry_id
    where m.occurred_on>=current_date-v_days
    group by e.model_id,e.color_id
  ),
  planned as (
    select i.model_id,i.color_id,sum(i.quantity)::bigint as ordered_units,
      count(distinct o.id)::bigint as order_count,min(o.due_date) as next_due_date
    from public.production_order_items i
    join public.production_orders o on o.id=i.order_id
    where o.status in ('sent','viewed','acknowledged')
      and o.due_date>=current_date-v_days
    group by i.model_id,i.color_id
  ),
  item_keys as (
    select model_id,color_id from stock
    union
    select model_id,color_id from flow
    union
    select model_id,color_id from planned
  ),
  inventory_items as (
    select k.model_id,m.name as model_name,k.color_id,c.name as color_name,
      upper(c.hex_code) as color_hex,coalesce(s.units_available,0) as units_available,
      coalesce(s.boxes_available,0) as boxes_available,coalesce(s.producer_count,0) as producer_count,
      s.oldest_entry_on,s.latest_entry_on,
      case when s.oldest_entry_on is null then null else current_date-s.oldest_entry_on end as oldest_box_age_days,
      coalesce(s.missing_location_boxes,0) as missing_location_boxes,
      coalesce(s.boxes_over_45_days,0) as boxes_over_45_days,
      coalesce(s.boxes_over_90_days,0) as boxes_over_90_days,
      coalesce(f.entries_units,0) as entries_units_period,coalesce(f.exits_units,0) as exits_units_period,
      coalesce(f.adjustment_count,0) as adjustment_count,
      round(coalesce(f.exits_units,0)::numeric/v_days,3) as average_daily_exit,
      case when coalesce(f.exits_units,0)>0
        then round(coalesce(s.units_available,0)::numeric/(f.exits_units::numeric/v_days),1)
        else null end as estimated_coverage_days,
      coalesce(p.ordered_units,0) as ordered_units_period,coalesce(p.order_count,0) as order_count,
      p.next_due_date
    from item_keys k
    join public.finished_product_models m on m.id=k.model_id
    join public.finished_production_colors c on c.id=k.color_id
    left join stock s on s.model_id=k.model_id and s.color_id=k.color_id
    left join flow f on f.model_id=k.model_id and f.color_id=k.color_id
    left join planned p on p.model_id=k.model_id and p.color_id=k.color_id
    order by coalesce(s.units_available,0) desc,lower(m.name),c.sort_order,lower(c.name)
  ),
  worker_summary as (
    select e.worker_id,p.full_name as worker_name,
      sum(e.current_quantity)::bigint as units_available,count(*)::bigint as boxes_available,
      count(distinct (e.model_id,e.color_id))::bigint as model_color_count,
      min(e.entry_on) as oldest_entry_on,max(e.entry_on) as latest_entry_on
    from available_boxes e
    join public.profiles p on p.id=e.worker_id
    group by e.worker_id,p.full_name
    order by sum(e.current_quantity) desc,p.full_name
  ),
  weekly_flow as (
    select date_trunc('week',m.occurred_on)::date as week_start,
      coalesce(sum(m.quantity) filter (where m.movement_type in ('entry','adjustment_in')),0)::bigint as entries_units,
      coalesce(sum(m.quantity) filter (where m.movement_type in ('exit','adjustment_out')),0)::bigint as exits_units,
      count(*) filter (where m.movement_type in ('adjustment_in','adjustment_out'))::bigint as adjustments
    from public.production_inventory_movements m
    where m.occurred_on>=current_date-v_days
    group by date_trunc('week',m.occurred_on)::date
    order by week_start
  )
  select jsonb_build_object(
    'generated_at',now(),
    'period_days',v_days,
    'overall',jsonb_build_object(
      'boxes_available',(select count(*) from available_boxes),
      'units_available',(select coalesce(sum(current_quantity),0) from available_boxes),
      'models_available',(select count(distinct model_id) from available_boxes),
      'model_color_combinations',(select count(*) from stock),
      'producers_with_stock',(select count(distinct worker_id) from available_boxes),
      'pending_labels',(select count(*) from public.production_inventory_entries where label_status='pending'),
      'missing_location_boxes',(select count(*) from available_boxes where nullif(trim(box_reference),'') is null),
      'boxes_over_45_days',(select count(*) from available_boxes where entry_on<current_date-45),
      'boxes_over_90_days',(select count(*) from available_boxes where entry_on<current_date-90),
      'entries_units_period',(select coalesce(sum(entries_units),0) from flow),
      'exits_units_period',(select coalesce(sum(exits_units),0) from flow),
      'adjustments_period',(select coalesce(sum(adjustment_count),0) from flow)
    ),
    'items',coalesce((select jsonb_agg(to_jsonb(i)) from inventory_items i),'[]'::jsonb),
    'workers',coalesce((select jsonb_agg(to_jsonb(w)) from worker_summary w),'[]'::jsonb),
    'weekly_flow',coalesce((select jsonb_agg(to_jsonb(f)) from weekly_flow f),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.service_finalize_inventory_ai_analysis(
  p_analysis_id uuid,
  p_health_status text,
  p_overall_summary text,
  p_insights jsonb,
  p_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost_usd numeric
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_item jsonb; v_position integer := 0; v_analysis public.inventory_ai_analyses%rowtype;
begin
  if p_health_status not in ('good','attention','critical') then raise exception 'Estado geral inválido.'; end if;
  if jsonb_typeof(p_insights)<>'array' or jsonb_array_length(p_insights)>12 then
    raise exception 'Lista de insights inválida.';
  end if;
  select * into v_analysis from public.inventory_ai_analyses where id=p_analysis_id for update;
  if not found or v_analysis.status<>'processing' then raise exception 'Análise não está em processamento.'; end if;
  for v_item in select value from jsonb_array_elements(p_insights) loop
    v_position:=v_position+1;
    insert into public.inventory_ai_insights(
      analysis_id,position,priority,category,title,explanation,recommendation,action_type,
      model_id,color_id,worker_id,evidence
    ) values(
      p_analysis_id,v_position,v_item->>'priority',v_item->>'category',trim(v_item->>'title'),
      trim(v_item->>'explanation'),trim(v_item->>'recommendation'),coalesce(v_item->>'action_type','none'),
      nullif(v_item->>'model_id','')::uuid,nullif(v_item->>'color_id','')::uuid,
      nullif(v_item->>'worker_id','')::uuid,coalesce(v_item->'evidence','[]'::jsonb)
    );
  end loop;
  update public.inventory_ai_analyses
  set status='completed',health_status=p_health_status,overall_summary=trim(p_overall_summary),
    input_tokens=greatest(coalesce(p_input_tokens,0),0),output_tokens=greatest(coalesce(p_output_tokens,0),0),
    estimated_cost_usd=greatest(coalesce(p_estimated_cost_usd,0),0),completed_at=now(),error_code=null
  where id=p_analysis_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_analysis.created_by,'inventory_ai.analysis_completed','inventory_ai_analysis',p_analysis_id::text,
    jsonb_build_object('trigger',v_analysis.trigger_source,'model',v_analysis.model,
      'insights',v_position,'estimated_cost_usd',greatest(coalesce(p_estimated_cost_usd,0),0)));
end;
$$;

revoke all on function public.admin_get_inventory_ai_usage() from public,anon,authenticated;
revoke all on function public.primary_admin_update_inventory_ai_settings(boolean,numeric,integer) from public,anon,authenticated;
revoke all on function public.admin_mark_inventory_ai_insight(uuid,text) from public,anon,authenticated;
revoke all on function public.service_inventory_ai_snapshot(integer) from public,anon,authenticated;
revoke all on function public.service_finalize_inventory_ai_analysis(uuid,text,text,jsonb,integer,integer,numeric) from public,anon,authenticated;

grant execute on function public.admin_get_inventory_ai_usage() to authenticated,service_role;
grant execute on function public.primary_admin_update_inventory_ai_settings(boolean,numeric,integer) to authenticated,service_role;
grant execute on function public.admin_mark_inventory_ai_insight(uuid,text) to authenticated,service_role;
grant execute on function public.service_inventory_ai_snapshot(integer) to service_role;
grant execute on function public.service_finalize_inventory_ai_analysis(uuid,text,text,jsonb,integer,integer,numeric) to service_role;

notify pgrst, 'reload schema';

commit;
