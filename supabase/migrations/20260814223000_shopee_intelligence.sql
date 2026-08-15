-- Harmony Store Oficial — Inteligência Shopee.
-- Importação auditável de relatórios oficiais, métricas determinísticas e
-- interpretação opcional por IA. Nenhuma rotina altera pedidos, estoque ou pagamentos.

begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'shopee-imports','shopee-imports',false,12582912,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.shopee_import_batches (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('shop_stats','product_funnel','promotions')),
  period_start date not null,
  period_end date not null,
  file_name text not null check (length(file_name) between 1 and 240),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 12582912),
  file_hash text not null check (file_hash ~ '^[a-f0-9]{64}$'),
  storage_path text not null check (length(storage_path) between 10 and 600),
  parser_version text not null default '1.0.0' check (length(parser_version) between 1 and 30),
  status text not null default 'validated' check (status in ('validated','superseded')),
  is_latest boolean not null default true,
  row_count integer not null default 0 check (row_count between 0 and 100000),
  validation_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_summary)='object'),
  imported_by uuid not null references public.profiles(id) on delete restrict,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (period_end>=period_start),
  unique(report_type,period_start,period_end,file_hash)
);

create unique index if not exists shopee_import_batches_latest_period_idx
  on public.shopee_import_batches(report_type,period_start,period_end)
  where is_latest and status='validated';
create index if not exists shopee_import_batches_period_idx
  on public.shopee_import_batches(period_start desc,period_end desc,report_type);
create index if not exists shopee_import_batches_imported_by_idx
  on public.shopee_import_batches(imported_by);

create table if not exists public.shopee_sales_daily (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.shopee_import_batches(id) on delete cascade,
  metric_date date not null,
  order_type text not null check (order_type in ('placed','paid')),
  sales numeric(16,2) not null default 0,
  sales_without_shopee_discount numeric(16,2) not null default 0,
  orders numeric(14,2) not null default 0,
  average_order_value numeric(14,2) not null default 0,
  product_clicks bigint not null default 0,
  visitors bigint not null default 0,
  conversion_rate numeric(9,6) not null default 0,
  cancelled_orders numeric(14,2) not null default 0,
  cancelled_sales numeric(16,2) not null default 0,
  refunded_orders numeric(14,2) not null default 0,
  refunded_sales numeric(16,2) not null default 0,
  buyers bigint not null default 0,
  new_buyers bigint not null default 0,
  returning_buyers bigint not null default 0,
  potential_buyers bigint not null default 0,
  unique(batch_id,metric_date,order_type)
);
create index if not exists shopee_sales_daily_date_idx on public.shopee_sales_daily(metric_date,order_type);

create table if not exists public.shopee_traffic_sources (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.shopee_import_batches(id) on delete cascade,
  order_type text not null check (order_type in ('placed','paid')),
  source_name text not null check (length(trim(source_name)) between 1 and 160),
  sales_share numeric(9,6) not null default 0,
  sales numeric(16,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  orders numeric(14,2) not null default 0,
  units numeric(14,2) not null default 0,
  ctr numeric(9,6) not null default 0,
  conversion_rate numeric(9,6) not null default 0,
  average_order_value numeric(14,2) not null default 0,
  buyers bigint not null default 0,
  unique_impressions bigint not null default 0,
  unique_clicks bigint not null default 0,
  unique(batch_id,order_type,source_name)
);
create index if not exists shopee_traffic_sources_batch_idx on public.shopee_traffic_sources(batch_id,order_type);

create table if not exists public.shopee_product_performance (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.shopee_import_batches(id) on delete cascade,
  order_type text not null check (order_type in ('placed','paid')),
  item_id text not null check (length(item_id) between 1 and 80),
  product_name text not null check (length(trim(product_name)) between 1 and 600),
  item_status text,
  sales_share numeric(9,6) not null default 0,
  sales numeric(16,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  orders numeric(14,2) not null default 0,
  units numeric(14,2) not null default 0,
  ctr numeric(9,6) not null default 0,
  conversion_rate numeric(9,6) not null default 0,
  average_order_value numeric(14,2) not null default 0,
  buyers bigint not null default 0,
  unique_impressions bigint not null default 0,
  unique_clicks bigint not null default 0,
  unique(batch_id,order_type,item_id)
);
create index if not exists shopee_product_performance_item_idx on public.shopee_product_performance(item_id,order_type);

create table if not exists public.shopee_product_funnel_daily (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.shopee_import_batches(id) on delete cascade,
  metric_date date not null,
  visitors bigint not null default 0,
  page_views bigint not null default 0,
  items_visited bigint not null default 0,
  exits bigint not null default 0,
  bounce_rate numeric(9,6) not null default 0,
  search_clicks bigint not null default 0,
  likes bigint not null default 0,
  cart_visitors bigint not null default 0,
  cart_units bigint not null default 0,
  cart_conversion numeric(9,6) not null default 0,
  placed_buyers bigint not null default 0,
  placed_units bigint not null default 0,
  products_ordered bigint not null default 0,
  placed_sales numeric(16,2) not null default 0,
  placed_conversion numeric(9,6) not null default 0,
  paid_buyers bigint not null default 0,
  paid_units bigint not null default 0,
  paid_items bigint not null default 0,
  paid_sales numeric(16,2) not null default 0,
  paid_conversion numeric(9,6) not null default 0,
  unique(batch_id,metric_date)
);
create index if not exists shopee_product_funnel_daily_date_idx on public.shopee_product_funnel_daily(metric_date);

create table if not exists public.shopee_promotion_metrics (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.shopee_import_batches(id) on delete cascade,
  record_kind text not null check (record_kind in ('period','daily')),
  metric_date date,
  promotion_type text not null check (length(trim(promotion_type)) between 1 and 160),
  placed_sales numeric(16,2) not null default 0,
  paid_sales numeric(16,2) not null default 0,
  placed_orders bigint not null default 0,
  paid_orders bigint not null default 0,
  placed_units bigint not null default 0,
  paid_units bigint not null default 0,
  placed_buyers bigint not null default 0,
  paid_buyers bigint not null default 0,
  placed_sales_per_buyer numeric(14,2) not null default 0,
  paid_sales_per_buyer numeric(14,2) not null default 0,
  placed_bundle_orders bigint not null default 0,
  paid_bundle_orders bigint not null default 0,
  check ((record_kind='period' and metric_date is null) or (record_kind='daily' and metric_date is not null))
);
create unique index if not exists shopee_promotion_metrics_unique_idx
  on public.shopee_promotion_metrics(batch_id,record_kind,promotion_type,coalesce(metric_date,'1900-01-01'::date));

create table if not exists public.shopee_promotion_campaigns (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.shopee_import_batches(id) on delete cascade,
  campaign_name text not null check (length(trim(campaign_name)) between 1 and 400),
  promotion_type text not null check (length(trim(promotion_type)) between 1 and 160),
  campaign_period text,
  campaign_status text,
  placed_sales numeric(16,2) not null default 0,
  paid_sales numeric(16,2) not null default 0,
  placed_orders bigint not null default 0,
  paid_orders bigint not null default 0,
  placed_units bigint not null default 0,
  paid_units bigint not null default 0,
  placed_buyers bigint not null default 0,
  paid_buyers bigint not null default 0,
  placed_sales_per_buyer numeric(14,2) not null default 0,
  paid_sales_per_buyer numeric(14,2) not null default 0,
  unique(batch_id,campaign_name,promotion_type)
);
create index if not exists shopee_promotion_campaigns_batch_idx on public.shopee_promotion_campaigns(batch_id);

create table if not exists public.shopee_ai_settings (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default true,
  model text not null default 'gpt-5.6-terra' check (model ~ '^gpt-[a-zA-Z0-9._-]{1,80}$'),
  monthly_budget_usd numeric(10,4) not null default 5 check (monthly_budget_usd between 0 and 1000),
  manual_cooldown_minutes integer not null default 10 check (manual_cooldown_minutes between 1 and 1440),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.shopee_ai_settings(id) values(1) on conflict(id) do nothing;
create index if not exists shopee_ai_settings_updated_by_idx on public.shopee_ai_settings(updated_by);

create table if not exists public.shopee_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  model text not null,
  period_start date not null,
  period_end date not null,
  snapshot_fingerprint text not null check (snapshot_fingerprint ~ '^[a-f0-9]{64}$'),
  snapshot_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot_summary)='object'),
  health_status text check (health_status is null or health_status in ('good','attention','critical')),
  overall_summary text check (overall_summary is null or length(overall_summary)<=1800),
  input_tokens integer not null default 0 check (input_tokens>=0),
  output_tokens integer not null default 0 check (output_tokens>=0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd>=0),
  created_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text check (error_code is null or length(error_code)<=120),
  created_at timestamptz not null default now(),
  check (period_end>=period_start),
  check ((status='processing' and completed_at is null) or (status<>'processing' and completed_at is not null))
);
create index if not exists shopee_ai_analyses_completed_idx on public.shopee_ai_analyses(completed_at desc) where status='completed';
create index if not exists shopee_ai_analyses_fingerprint_idx on public.shopee_ai_analyses(snapshot_fingerprint,completed_at desc) where status='completed';
create index if not exists shopee_ai_analyses_created_by_idx on public.shopee_ai_analyses(created_by);

create table if not exists public.shopee_ai_insights (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.shopee_ai_analyses(id) on delete cascade,
  position smallint not null check (position between 1 and 12),
  priority text not null check (priority in ('low','medium','high','critical')),
  category text not null check (category in ('sales','conversion','traffic','product','promotion','cancellation','data_quality','opportunity')),
  title text not null check (length(trim(title)) between 3 and 180),
  explanation text not null check (length(trim(explanation)) between 3 and 1800),
  recommendation text not null check (length(trim(recommendation)) between 3 and 1200),
  action_type text not null default 'none' check (action_type in ('none','view_overview','view_products','view_marketing','view_promotions','view_imports')),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence)='array'),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(analysis_id,position)
);
create index if not exists shopee_ai_insights_analysis_idx on public.shopee_ai_insights(analysis_id,position);
create index if not exists shopee_ai_insights_reviewed_by_idx on public.shopee_ai_insights(reviewed_by);
create index if not exists shopee_ai_insights_dismissed_by_idx on public.shopee_ai_insights(dismissed_by);

drop trigger if exists shopee_ai_settings_touch_updated_at on public.shopee_ai_settings;
create trigger shopee_ai_settings_touch_updated_at before update on public.shopee_ai_settings
for each row execute function public.touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array[
    'shopee_import_batches','shopee_sales_daily','shopee_traffic_sources','shopee_product_performance',
    'shopee_product_funnel_daily','shopee_promotion_metrics','shopee_promotion_campaigns',
    'shopee_ai_settings','shopee_ai_analyses','shopee_ai_insights'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all privileges on table public.%I from public,anon,authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
    execute format('grant all privileges on table public.%I to service_role',t);
    execute format('drop policy if exists %I on public.%I','shopee intelligence: admin read',t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_admin()))','shopee intelligence: admin read',t);
  end loop;
end $$;

create or replace function private.shopee_dashboard_data(p_from date default null,p_to date default null)
returns jsonb
language sql
security definer
set search_path=''
stable
as $$
with bounds as (
  select
    coalesce(p_from,(select min(period_start) from public.shopee_import_batches where is_latest and status='validated'),current_date-29) as date_from,
    coalesce(p_to,(select max(period_end) from public.shopee_import_batches where is_latest and status='validated'),current_date) as date_to
), batches as (
  select b.* from public.shopee_import_batches b,bounds x
  where b.is_latest and b.status='validated' and b.period_end>=x.date_from and b.period_start<=x.date_to
), sales as (
  select s.* from public.shopee_sales_daily s join batches b on b.id=s.batch_id,bounds x
  where s.metric_date between x.date_from and x.date_to
), funnel as (
  select f.* from public.shopee_product_funnel_daily f join batches b on b.id=f.batch_id,bounds x
  where f.metric_date between x.date_from and x.date_to
), promotion as (
  select m.* from public.shopee_promotion_metrics m join batches b on b.id=m.batch_id,bounds x
  where m.record_kind='daily' and m.metric_date between x.date_from and x.date_to
), sales_totals as (
  select order_type,sum(sales)::numeric(16,2) sales,sum(sales_without_shopee_discount)::numeric(16,2) sales_without_discount,
    sum(orders)::numeric(16,2) orders,sum(cancelled_orders)::numeric(16,2) cancelled_orders,
    sum(cancelled_sales)::numeric(16,2) cancelled_sales,sum(refunded_orders)::numeric(16,2) refunded_orders,
    sum(refunded_sales)::numeric(16,2) refunded_sales,sum(buyers)::bigint buyers,sum(new_buyers)::bigint new_buyers,
    sum(returning_buyers)::bigint returning_buyers,sum(product_clicks)::bigint clicks,sum(visitors)::bigint visitors
  from sales group by order_type
), traffic as (
  select t.order_type,t.source_name,sum(t.sales)::numeric(16,2) sales,sum(t.impressions)::bigint impressions,
    sum(t.clicks)::bigint clicks,sum(t.orders)::numeric(16,2) orders,sum(t.units)::numeric(16,2) units,
    case when sum(t.impressions)>0 then sum(t.clicks)::numeric/sum(t.impressions) else 0 end ctr,
    case when sum(t.clicks)>0 then sum(t.orders)::numeric/sum(t.clicks) else 0 end conversion_rate,
    sum(t.buyers)::bigint buyers
  from public.shopee_traffic_sources t join batches b on b.id=t.batch_id group by t.order_type,t.source_name
), products as (
  select p.order_type,p.item_id,max(p.product_name) product_name,max(p.item_status) item_status,
    sum(p.sales)::numeric(16,2) sales,sum(p.impressions)::bigint impressions,sum(p.clicks)::bigint clicks,
    sum(p.orders)::numeric(16,2) orders,sum(p.units)::numeric(16,2) units,
    case when sum(p.impressions)>0 then sum(p.clicks)::numeric/sum(p.impressions) else 0 end ctr,
    case when sum(p.clicks)>0 then sum(p.orders)::numeric/sum(p.clicks) else 0 end conversion_rate,
    sum(p.buyers)::bigint buyers
  from public.shopee_product_performance p join batches b on b.id=p.batch_id group by p.order_type,p.item_id
), campaigns as (
  select c.* from public.shopee_promotion_campaigns c join batches b on b.id=c.batch_id
), completeness as (
  select period_start,period_end,count(distinct report_type)::int report_count,
    array_agg(distinct report_type order by report_type) report_types
  from batches group by period_start,period_end order by period_start desc
)
select jsonb_build_object(
  'period',jsonb_build_object('from',(select date_from from bounds),'to',(select date_to from bounds)),
  'imports',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'report_type',b.report_type,'period_start',b.period_start,'period_end',b.period_end,'file_name',b.file_name,'row_count',b.row_count,'imported_at',b.imported_at,'imported_by',coalesce(p.full_name,'Administrador')) order by b.imported_at desc) from batches b left join public.profiles p on p.id=b.imported_by),'[]'::jsonb),
  'completeness',coalesce((select jsonb_agg(to_jsonb(c) order by c.period_start desc) from completeness c),'[]'::jsonb),
  'sales',coalesce((select jsonb_agg(to_jsonb(s) order by s.order_type) from sales_totals s),'[]'::jsonb),
  'trend',coalesce((select jsonb_agg(to_jsonb(x) order by x.metric_date) from (select metric_date,sum(sales) filter(where order_type='placed')::numeric(16,2) placed_sales,sum(sales) filter(where order_type='paid')::numeric(16,2) paid_sales,sum(orders) filter(where order_type='placed')::numeric(16,2) placed_orders,sum(orders) filter(where order_type='paid')::numeric(16,2) paid_orders from sales group by metric_date) x),'[]'::jsonb),
  'traffic',coalesce((select jsonb_agg(to_jsonb(t) order by t.sales desc) from traffic t),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.sales desc) from products p),'[]'::jsonb),
  'funnel',coalesce((select jsonb_build_object('visitors',sum(visitors),'page_views',sum(page_views),'cart_visitors',sum(cart_visitors),'cart_units',sum(cart_units),'placed_buyers',sum(placed_buyers),'placed_units',sum(placed_units),'placed_sales',sum(placed_sales),'paid_buyers',sum(paid_buyers),'paid_units',sum(paid_units),'paid_sales',sum(paid_sales),'bounce_rate',case when sum(visitors)>0 then sum(exits)::numeric/sum(visitors) else 0 end) from funnel),'{}'::jsonb),
  'promotions',coalesce((select jsonb_agg(to_jsonb(x) order by x.paid_sales desc) from (select promotion_type,sum(placed_sales)::numeric(16,2) placed_sales,sum(paid_sales)::numeric(16,2) paid_sales,sum(placed_orders)::bigint placed_orders,sum(paid_orders)::bigint paid_orders,sum(placed_units)::bigint placed_units,sum(paid_units)::bigint paid_units,sum(placed_buyers)::bigint placed_buyers,sum(paid_buyers)::bigint paid_buyers from promotion group by promotion_type) x),'[]'::jsonb),
  'campaigns',coalesce((select jsonb_agg(to_jsonb(c) order by c.paid_sales desc) from campaigns c),'[]'::jsonb)
)
$$;

revoke all on function private.shopee_dashboard_data(date,date) from public,anon,authenticated;
grant execute on function private.shopee_dashboard_data(date,date) to service_role;

create or replace function public.admin_get_shopee_dashboard(p_from date default null,p_to date default null)
returns jsonb language plpgsql security definer set search_path='' stable as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_from is not null and p_to is not null and p_to<p_from then raise exception 'Período inválido.'; end if;
  return private.shopee_dashboard_data(p_from,p_to);
end $$;

create or replace function public.service_commit_shopee_import(
  p_report_type text,p_period_start date,p_period_end date,p_file_name text,p_file_size_bytes bigint,
  p_file_hash text,p_storage_path text,p_parser_version text,p_imported_by uuid,p_validation_summary jsonb,
  p_sales jsonb default '[]'::jsonb,p_traffic jsonb default '[]'::jsonb,p_products jsonb default '[]'::jsonb,
  p_funnel jsonb default '[]'::jsonb,p_promotion_metrics jsonb default '[]'::jsonb,p_campaigns jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_batch uuid;v_existing uuid;v_rows integer:=0;
begin
  if p_report_type not in ('shop_stats','product_funnel','promotions') or p_period_end<p_period_start then raise exception 'Relatório ou período inválido.'; end if;
  if not exists(select 1 from public.profiles where id=p_imported_by and role='admin' and status='active') then raise exception 'Administrador inválido.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext(p_report_type||':'||p_period_start::text||':'||p_period_end::text));
  select id into v_existing from public.shopee_import_batches where report_type=p_report_type and period_start=p_period_start and period_end=p_period_end and file_hash=p_file_hash limit 1;
  if v_existing is not null then return jsonb_build_object('status','duplicate','batch_id',v_existing); end if;
  update public.shopee_import_batches set is_latest=false,status='superseded' where report_type=p_report_type and period_start=p_period_start and period_end=p_period_end and is_latest;
  insert into public.shopee_import_batches(report_type,period_start,period_end,file_name,file_size_bytes,file_hash,storage_path,parser_version,row_count,validation_summary,imported_by)
  values(p_report_type,p_period_start,p_period_end,left(p_file_name,240),p_file_size_bytes,p_file_hash,left(p_storage_path,600),left(p_parser_version,30),jsonb_array_length(p_sales)+jsonb_array_length(p_traffic)+jsonb_array_length(p_products)+jsonb_array_length(p_funnel)+jsonb_array_length(p_promotion_metrics)+jsonb_array_length(p_campaigns),coalesce(p_validation_summary,'{}'::jsonb),p_imported_by)
  returning id,row_count into v_batch,v_rows;
  insert into public.shopee_sales_daily(batch_id,metric_date,order_type,sales,sales_without_shopee_discount,orders,average_order_value,product_clicks,visitors,conversion_rate,cancelled_orders,cancelled_sales,refunded_orders,refunded_sales,buyers,new_buyers,returning_buyers,potential_buyers)
  select v_batch,x.metric_date,x.order_type,x.sales,x.sales_without_shopee_discount,x.orders,x.average_order_value,x.product_clicks,x.visitors,x.conversion_rate,x.cancelled_orders,x.cancelled_sales,x.refunded_orders,x.refunded_sales,x.buyers,x.new_buyers,x.returning_buyers,x.potential_buyers
  from jsonb_to_recordset(p_sales) as x(metric_date date,order_type text,sales numeric,sales_without_shopee_discount numeric,orders numeric,average_order_value numeric,product_clicks bigint,visitors bigint,conversion_rate numeric,cancelled_orders numeric,cancelled_sales numeric,refunded_orders numeric,refunded_sales numeric,buyers bigint,new_buyers bigint,returning_buyers bigint,potential_buyers bigint);
  insert into public.shopee_traffic_sources(batch_id,order_type,source_name,sales_share,sales,impressions,clicks,orders,units,ctr,conversion_rate,average_order_value,buyers,unique_impressions,unique_clicks)
  select v_batch,x.order_type,left(x.source_name,160),x.sales_share,x.sales,x.impressions,x.clicks,x.orders,x.units,x.ctr,x.conversion_rate,x.average_order_value,x.buyers,x.unique_impressions,x.unique_clicks
  from jsonb_to_recordset(p_traffic) as x(order_type text,source_name text,sales_share numeric,sales numeric,impressions bigint,clicks bigint,orders numeric,units numeric,ctr numeric,conversion_rate numeric,average_order_value numeric,buyers bigint,unique_impressions bigint,unique_clicks bigint);
  insert into public.shopee_product_performance(batch_id,order_type,item_id,product_name,item_status,sales_share,sales,impressions,clicks,orders,units,ctr,conversion_rate,average_order_value,buyers,unique_impressions,unique_clicks)
  select v_batch,x.order_type,left(x.item_id,80),left(x.product_name,600),left(x.item_status,120),x.sales_share,x.sales,x.impressions,x.clicks,x.orders,x.units,x.ctr,x.conversion_rate,x.average_order_value,x.buyers,x.unique_impressions,x.unique_clicks
  from jsonb_to_recordset(p_products) as x(order_type text,item_id text,product_name text,item_status text,sales_share numeric,sales numeric,impressions bigint,clicks bigint,orders numeric,units numeric,ctr numeric,conversion_rate numeric,average_order_value numeric,buyers bigint,unique_impressions bigint,unique_clicks bigint);
  insert into public.shopee_product_funnel_daily(batch_id,metric_date,visitors,page_views,items_visited,exits,bounce_rate,search_clicks,likes,cart_visitors,cart_units,cart_conversion,placed_buyers,placed_units,products_ordered,placed_sales,placed_conversion,paid_buyers,paid_units,paid_items,paid_sales,paid_conversion)
  select v_batch,x.metric_date,x.visitors,x.page_views,x.items_visited,x.exits,x.bounce_rate,x.search_clicks,x.likes,x.cart_visitors,x.cart_units,x.cart_conversion,x.placed_buyers,x.placed_units,x.products_ordered,x.placed_sales,x.placed_conversion,x.paid_buyers,x.paid_units,x.paid_items,x.paid_sales,x.paid_conversion
  from jsonb_to_recordset(p_funnel) as x(metric_date date,visitors bigint,page_views bigint,items_visited bigint,exits bigint,bounce_rate numeric,search_clicks bigint,likes bigint,cart_visitors bigint,cart_units bigint,cart_conversion numeric,placed_buyers bigint,placed_units bigint,products_ordered bigint,placed_sales numeric,placed_conversion numeric,paid_buyers bigint,paid_units bigint,paid_items bigint,paid_sales numeric,paid_conversion numeric);
  insert into public.shopee_promotion_metrics(batch_id,record_kind,metric_date,promotion_type,placed_sales,paid_sales,placed_orders,paid_orders,placed_units,paid_units,placed_buyers,paid_buyers,placed_sales_per_buyer,paid_sales_per_buyer,placed_bundle_orders,paid_bundle_orders)
  select v_batch,x.record_kind,x.metric_date,left(x.promotion_type,160),x.placed_sales,x.paid_sales,x.placed_orders,x.paid_orders,x.placed_units,x.paid_units,x.placed_buyers,x.paid_buyers,x.placed_sales_per_buyer,x.paid_sales_per_buyer,x.placed_bundle_orders,x.paid_bundle_orders
  from jsonb_to_recordset(p_promotion_metrics) as x(record_kind text,metric_date date,promotion_type text,placed_sales numeric,paid_sales numeric,placed_orders bigint,paid_orders bigint,placed_units bigint,paid_units bigint,placed_buyers bigint,paid_buyers bigint,placed_sales_per_buyer numeric,paid_sales_per_buyer numeric,placed_bundle_orders bigint,paid_bundle_orders bigint);
  insert into public.shopee_promotion_campaigns(batch_id,campaign_name,promotion_type,campaign_period,campaign_status,placed_sales,paid_sales,placed_orders,paid_orders,placed_units,paid_units,placed_buyers,paid_buyers,placed_sales_per_buyer,paid_sales_per_buyer)
  select v_batch,left(x.campaign_name,400),left(x.promotion_type,160),left(x.campaign_period,240),left(x.campaign_status,120),x.placed_sales,x.paid_sales,x.placed_orders,x.paid_orders,x.placed_units,x.paid_units,x.placed_buyers,x.paid_buyers,x.placed_sales_per_buyer,x.paid_sales_per_buyer
  from jsonb_to_recordset(p_campaigns) as x(campaign_name text,promotion_type text,campaign_period text,campaign_status text,placed_sales numeric,paid_sales numeric,placed_orders bigint,paid_orders bigint,placed_units bigint,paid_units bigint,placed_buyers bigint,paid_buyers bigint,placed_sales_per_buyer numeric,paid_sales_per_buyer numeric);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(p_imported_by,'shopee.report_imported','shopee_import_batch',v_batch::text,jsonb_build_object('report_type',p_report_type,'period_start',p_period_start,'period_end',p_period_end,'row_count',v_rows,'file_hash',p_file_hash));
  return jsonb_build_object('status','imported','batch_id',v_batch,'row_count',v_rows);
end $$;

create or replace function public.admin_get_shopee_ai_usage()
returns table(enabled boolean,model text,monthly_budget_usd numeric,manual_cooldown_minutes integer,month_cost_usd numeric,month_analysis_count bigint,remaining_budget_usd numeric,last_completed_at timestamptz)
language plpgsql security definer set search_path='' stable as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return query select s.enabled,s.model,s.monthly_budget_usd,s.manual_cooldown_minutes,
    coalesce(sum(a.estimated_cost_usd) filter(where a.status='completed' and a.created_at>=date_trunc('month',now())),0)::numeric,
    count(a.id) filter(where a.status='completed' and a.created_at>=date_trunc('month',now()))::bigint,
    greatest(0,s.monthly_budget_usd-coalesce(sum(a.estimated_cost_usd) filter(where a.status='completed' and a.created_at>=date_trunc('month',now())),0))::numeric,
    max(a.completed_at) filter(where a.status='completed')
  from public.shopee_ai_settings s left join public.shopee_ai_analyses a on true where s.id=1 group by s.id;
end $$;

create or replace function public.primary_admin_update_shopee_ai_settings(p_enabled boolean,p_monthly_budget_usd numeric,p_manual_cooldown_minutes integer default 10)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());
begin
  if not (select private.is_primary_admin()) then raise exception 'Somente o ADM principal pode alterar a Inteligência Shopee.' using errcode='42501'; end if;
  if p_monthly_budget_usd not between 0 and 1000 or p_manual_cooldown_minutes not between 1 and 1440 then raise exception 'Configuração inválida.'; end if;
  update public.shopee_ai_settings set enabled=coalesce(p_enabled,false),monthly_budget_usd=p_monthly_budget_usd,manual_cooldown_minutes=p_manual_cooldown_minutes,updated_by=v_actor where id=1;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(v_actor,'shopee_ai.settings_updated','shopee_ai_settings','1',jsonb_build_object('enabled',coalesce(p_enabled,false),'monthly_budget_usd',p_monthly_budget_usd,'manual_cooldown_minutes',p_manual_cooldown_minutes));
end $$;

create or replace function public.service_shopee_ai_snapshot(p_from date,p_to date)
returns jsonb language sql security definer set search_path='' stable as $$
select private.shopee_dashboard_data(p_from,p_to)
$$;

create or replace function public.service_finalize_shopee_ai_analysis(p_analysis_id uuid,p_health_status text,p_overall_summary text,p_insights jsonb,p_input_tokens integer,p_output_tokens integer,p_estimated_cost_usd numeric)
returns void language plpgsql security definer set search_path='' as $$
declare item jsonb;position integer:=0;
begin
  if p_health_status not in ('good','attention','critical') or jsonb_typeof(p_insights)<>'array' or jsonb_array_length(p_insights) not between 1 and 8 then raise exception 'Resposta da IA inválida.'; end if;
  delete from public.shopee_ai_insights where analysis_id=p_analysis_id;
  for item in select value from jsonb_array_elements(p_insights) loop
    position:=position+1;
    insert into public.shopee_ai_insights(analysis_id,position,priority,category,title,explanation,recommendation,action_type,evidence)
    values(p_analysis_id,position,item->>'priority',item->>'category',item->>'title',item->>'explanation',item->>'recommendation',coalesce(item->>'action_type','none'),coalesce(item->'evidence','[]'::jsonb));
  end loop;
  update public.shopee_ai_analyses set status='completed',health_status=p_health_status,overall_summary=left(p_overall_summary,1800),input_tokens=greatest(0,p_input_tokens),output_tokens=greatest(0,p_output_tokens),estimated_cost_usd=greatest(0,p_estimated_cost_usd),completed_at=now() where id=p_analysis_id and status='processing';
  if not found then raise exception 'Análise não localizada ou já concluída.'; end if;
end $$;

create or replace function public.admin_mark_shopee_ai_insight(p_insight_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_action='reviewed' then update public.shopee_ai_insights set reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,v_actor) where id=p_insight_id;
  elsif p_action='dismissed' then update public.shopee_ai_insights set dismissed_at=coalesce(dismissed_at,now()),dismissed_by=coalesce(dismissed_by,v_actor),reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,v_actor) where id=p_insight_id;
  else raise exception 'Ação inválida.'; end if;
  if not found then raise exception 'Insight não localizado.' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(v_actor,'shopee_ai.insight_'||p_action,'shopee_ai_insight',p_insight_id::text,'{}'::jsonb);
end $$;

revoke all on function public.admin_get_shopee_dashboard(date,date) from public,anon;
revoke all on function public.admin_get_shopee_ai_usage() from public,anon;
revoke all on function public.primary_admin_update_shopee_ai_settings(boolean,numeric,integer) from public,anon;
revoke all on function public.admin_mark_shopee_ai_insight(uuid,text) from public,anon;
grant execute on function public.admin_get_shopee_dashboard(date,date) to authenticated;
grant execute on function public.admin_get_shopee_ai_usage() to authenticated;
grant execute on function public.primary_admin_update_shopee_ai_settings(boolean,numeric,integer) to authenticated;
grant execute on function public.admin_mark_shopee_ai_insight(uuid,text) to authenticated;

revoke all on function public.service_commit_shopee_import(text,date,date,text,bigint,text,text,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.service_shopee_ai_snapshot(date,date) from public,anon,authenticated;
revoke all on function public.service_finalize_shopee_ai_analysis(uuid,text,text,jsonb,integer,integer,numeric) from public,anon,authenticated;
grant execute on function public.service_commit_shopee_import(text,date,date,text,bigint,text,text,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.service_shopee_ai_snapshot(date,date) to service_role;
grant execute on function public.service_finalize_shopee_ai_analysis(uuid,text,text,jsonb,integer,integer,numeric) to service_role;

commit;
