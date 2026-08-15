-- Harmony Store Oficial - correcao transacional de kits compostos e
-- importacao Shopee incremental por dia, sem duplicar periodos sobrepostos.

begin;

-- O lote continua sendo o documento auditavel. Esta tabela define qual lote
-- e a fonte canonica de cada dia/tipo de relatorio no dashboard.
create table if not exists public.shopee_import_days (
  report_type text not null check (report_type in ('shop_stats','product_funnel','promotions')),
  metric_date date not null,
  batch_id uuid not null references public.shopee_import_batches(id) on delete cascade,
  imported_at timestamptz not null default now(),
  primary key (report_type,metric_date)
);

create index if not exists shopee_import_days_batch_id_idx
  on public.shopee_import_days(batch_id);

alter table public.shopee_import_batches
  add column if not exists aggregate_active boolean not null default true;

create index if not exists shopee_import_batches_active_aggregate_idx
  on public.shopee_import_batches(report_type,period_start,period_end,imported_at desc)
  where aggregate_active and status='validated';

alter table public.shopee_import_days enable row level security;
revoke all privileges on table public.shopee_import_days from public,anon,authenticated;
grant select on table public.shopee_import_days to authenticated;
grant all privileges on table public.shopee_import_days to service_role;
drop policy if exists "shopee intelligence: admin read" on public.shopee_import_days;
create policy "shopee intelligence: admin read"
  on public.shopee_import_days for select to authenticated
  using ((select private.is_admin()));

-- Preserva todos os dados atuais e registra como fonte de cada dia o lote
-- validado mais recente que ja continha aquele dia.
with candidates as (
  select 'shop_stats'::text report_type,s.metric_date,s.batch_id,b.imported_at
  from public.shopee_sales_daily s
  join public.shopee_import_batches b on b.id=s.batch_id
  where b.status='validated' and b.is_latest
  union all
  select 'product_funnel',f.metric_date,f.batch_id,b.imported_at
  from public.shopee_product_funnel_daily f
  join public.shopee_import_batches b on b.id=f.batch_id
  where b.status='validated' and b.is_latest
  union all
  select 'promotions',m.metric_date,m.batch_id,b.imported_at
  from public.shopee_promotion_metrics m
  join public.shopee_import_batches b on b.id=m.batch_id
  where b.status='validated' and b.is_latest and m.record_kind='daily'
), ranked as (
  select *,row_number() over(
    partition by report_type,metric_date order by imported_at desc,batch_id desc
  ) position
  from candidates
)
insert into public.shopee_import_days(report_type,metric_date,batch_id,imported_at)
select report_type,metric_date,batch_id,imported_at
from ranked where position=1
on conflict (report_type,metric_date) do nothing;

-- A API-base foi criada antes da coluna item_kind e nao a inclui no INSERT.
-- Normalizar antes da constraint preserva itens de catalogo, exclusivos e o
-- estado intermediario seguro usado por kits, sem aceitar referencias invalidas.
create or replace function private.normalize_shipping_plan_item_kind_on_insert()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.item_kind:=case
    when new.kit_template_id is not null then 'kit'
    when new.model_id is null then 'exclusive'
    else 'catalog'
  end;
  return new;
end;
$$;

drop trigger if exists normalize_shipping_plan_item_kind_on_insert
  on public.shipping_plan_items;
create trigger normalize_shipping_plan_item_kind_on_insert
before insert on public.shipping_plan_items
for each row execute function private.normalize_shipping_plan_item_kind_on_insert();

-- Corrige o estado intermediario do kit. O registro nasce temporariamente
-- como exclusivo valido e, na mesma transacao, recebe tipo e referencia do kit.
create or replace function public.save_shipping_plan_v2(
  p_plan_id uuid,
  p_title text,
  p_platform text,
  p_platform_label text,
  p_account_name text,
  p_scheduled_for timestamptz,
  p_is_full boolean,
  p_notes text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan_id uuid;
  v_item jsonb;
  v_normalized jsonb:='[]'::jsonb;
  v_kind text;
  v_kit_id uuid;
  v_kit_name text;
  v_primary_color uuid;
  v_units integer;
  v_position integer:=0;
  v_item_id uuid;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  if jsonb_typeof(p_items)<>'array' then raise exception 'Lista de produtos invalida.'; end if;
  if p_plan_id is not null and exists(
    select 1 from public.shipping_inventory_requests r
    where r.plan_id=p_plan_id and r.status='reserved'
  ) then
    raise exception 'Cancele ou conclua as reservas do Inventario antes de editar este plano.' using errcode='23514';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_kind:=coalesce(nullif(v_item->>'item_kind',''),
      case when nullif(v_item->>'model_id','') is null then 'exclusive' else 'catalog' end);
    if v_kind not in ('catalog','exclusive','kit') then raise exception 'Tipo de item invalido.'; end if;
    if v_kind='kit' then
      v_kit_id:=nullif(v_item->>'kit_template_id','')::uuid;
      select k.name,sum(c.units_per_volume)::integer,
        (array_agg(c.color_id order by c.position))[1]
      into v_kit_name,v_units,v_primary_color
      from public.shipping_kit_templates k
      join public.shipping_kit_template_components c on c.kit_template_id=k.id
      where k.id=v_kit_id and k.active
      group by k.id,k.name;
      if v_kit_name is null then raise exception 'Kit composto nao localizado.' using errcode='P0002'; end if;
      v_item:=jsonb_set(v_item,'{item_kind}',to_jsonb('exclusive'::text),true);
      v_item:=jsonb_set(v_item,'{kit_template_id}','null'::jsonb,true);
      v_item:=jsonb_set(v_item,'{model_id}','null'::jsonb,true);
      v_item:=jsonb_set(v_item,'{exclusive_name}',to_jsonb(v_kit_name),true);
      v_item:=jsonb_set(v_item,'{exclusive_image_path}','null'::jsonb,true);
      v_item:=jsonb_set(v_item,'{color_id}',to_jsonb(v_primary_color::text),true);
      v_item:=jsonb_set(v_item,'{color_combination_id}','null'::jsonb,true);
      v_item:=jsonb_set(v_item,'{listing_units}',to_jsonb(v_units),true);
      v_item:=jsonb_set(v_item,'{volume_type}',to_jsonb('kit'::text),true);
    end if;
    v_normalized:=v_normalized||jsonb_build_array(v_item);
  end loop;

  v_plan_id:=public.save_shipping_plan_with_colors(
    p_plan_id,p_title,p_platform,p_platform_label,p_account_name,
    p_scheduled_for,p_is_full,p_notes,v_normalized
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position:=v_position+1;
    v_kind:=coalesce(nullif(v_item->>'item_kind',''),
      case when nullif(v_item->>'model_id','') is null then 'exclusive' else 'catalog' end);
    v_kit_id:=case when v_kind='kit' then nullif(v_item->>'kit_template_id','')::uuid end;
    select id into v_item_id
    from public.shipping_plan_items
    where plan_id=v_plan_id and position=v_position
    for update;
    update public.shipping_plan_items
    set item_kind=v_kind,kit_template_id=v_kit_id
    where id=v_item_id;
    delete from public.shipping_plan_item_components where plan_item_id=v_item_id;
    if v_kind='kit' then
      insert into public.shipping_plan_item_components(
        plan_item_id,model_id,color_id,units_per_volume,position
      )
      select v_item_id,c.model_id,c.color_id,c.units_per_volume,c.position
      from public.shipping_kit_template_components c
      where c.kit_template_id=v_kit_id
      order by c.position;
    elsif v_kind='catalog' and nullif(v_item->>'color_combination_id','') is null then
      insert into public.shipping_plan_item_components(
        plan_item_id,model_id,color_id,units_per_volume,position
      ) values(
        v_item_id,nullif(v_item->>'model_id','')::uuid,
        nullif(v_item->>'color_id','')::uuid,
        (v_item->>'listing_units')::integer,1
      );
    end if;
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_plan.v2_saved','shipping_plan',v_plan_id::text,'database',
    jsonb_build_object('item_count',jsonb_array_length(p_items),'supports_composite_kits',true,
      'constraint_safe_insert',true));
  return v_plan_id;
end;
$$;

-- Importacao incremental: append preserva dias existentes; replace e a unica
-- acao capaz de corrigir explicitamente os dias do periodo enviado.
create or replace function public.service_commit_shopee_import_v2(
  p_report_type text,p_period_start date,p_period_end date,p_file_name text,p_file_size_bytes bigint,
  p_file_hash text,p_storage_path text,p_parser_version text,p_imported_by uuid,p_validation_summary jsonb,
  p_sales jsonb default '[]'::jsonb,p_traffic jsonb default '[]'::jsonb,p_products jsonb default '[]'::jsonb,
  p_funnel jsonb default '[]'::jsonb,p_promotion_metrics jsonb default '[]'::jsonb,
  p_campaigns jsonb default '[]'::jsonb,p_import_mode text default 'append'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_batch uuid;
  v_existing uuid;
  v_candidate_dates date[]:='{}'::date[];
  v_accepted_dates date[]:='{}'::date[];
  v_skipped_dates date[]:='{}'::date[];
  v_rows integer:=0;
  v_inserted integer:=0;
  v_status text;
  v_summary jsonb;
  v_aggregate_active boolean:=true;
begin
  if p_report_type not in ('shop_stats','product_funnel','promotions')
    or p_period_end<p_period_start then raise exception 'Relatorio ou periodo invalido.'; end if;
  if p_import_mode not in ('append','replace') then raise exception 'Modo de importacao invalido.'; end if;
  if not exists(
    select 1 from public.profiles
    where id=p_imported_by and role='admin' and status='active'
  ) then raise exception 'Administrador invalido.' using errcode='42501'; end if;

  perform pg_advisory_xact_lock(hashtext('shopee:'||p_report_type));
  select id into v_existing
  from public.shopee_import_batches
  where report_type=p_report_type and period_start=p_period_start
    and period_end=p_period_end and file_hash=p_file_hash
  order by imported_at desc limit 1;
  if v_existing is not null then
    return jsonb_build_object('status','duplicate','batch_id',v_existing,
      'accepted_dates','[]'::jsonb,'skipped_dates','[]'::jsonb);
  end if;

  select coalesce(array_agg(distinct source.metric_date order by source.metric_date),'{}'::date[])
  into v_candidate_dates
  from (
    select nullif(value->>'metric_date','')::date metric_date from jsonb_array_elements(p_sales)
    union all
    select nullif(value->>'metric_date','')::date from jsonb_array_elements(p_funnel)
    union all
    select nullif(value->>'metric_date','')::date
    from jsonb_array_elements(p_promotion_metrics)
    where value->>'record_kind'='daily'
  ) source
  where source.metric_date between p_period_start and p_period_end;

  if cardinality(v_candidate_dates)=0 then
    raise exception 'O relatorio nao possui dias validos para registrar.';
  end if;

  if p_import_mode='replace' then
    v_accepted_dates:=v_candidate_dates;
  else
    select coalesce(array_agg(candidate.metric_date order by candidate.metric_date),'{}'::date[])
    into v_accepted_dates
    from unnest(v_candidate_dates) as candidate(metric_date)
    where not exists(
      select 1 from public.shopee_import_days d
      where d.report_type=p_report_type and d.metric_date=candidate.metric_date
    );
  end if;

  select coalesce(array_agg(candidate.metric_date order by candidate.metric_date),'{}'::date[])
  into v_skipped_dates
  from unnest(v_candidate_dates) as candidate(metric_date)
  where not (candidate.metric_date=any(v_accepted_dates));

  if cardinality(v_accepted_dates)=0 then
    return jsonb_build_object('status','already_covered','accepted_count',0,
      'skipped_count',cardinality(v_skipped_dates),'accepted_dates',to_jsonb(v_accepted_dates),
      'skipped_dates',to_jsonb(v_skipped_dates));
  end if;

  update public.shopee_import_batches
  set is_latest=false,status='superseded',aggregate_active=false
  where report_type=p_report_type and period_start=p_period_start
    and period_end=p_period_end and is_latest and status='validated';

  -- Dados diarios podem ser combinados com seguranca. Trafego, produtos e
  -- campanhas sao retratos agregados do arquivo: o periodo mais amplo deve
  -- continuar sendo a fonte para evitar soma dupla ou perda parcial.
  select not exists(
    select 1 from public.shopee_import_batches b
    where b.report_type=p_report_type and b.aggregate_active and b.status='validated'
      and b.period_start<=p_period_start and b.period_end>=p_period_end
  ) into v_aggregate_active;
  update public.shopee_import_batches
  set aggregate_active=false
  where report_type=p_report_type and aggregate_active and status='validated'
    and period_start>=p_period_start and period_end<=p_period_end;

  v_summary:=coalesce(p_validation_summary,'{}'::jsonb)||jsonb_build_object(
    'import_mode',p_import_mode,'accepted_dates',to_jsonb(v_accepted_dates),
    'skipped_dates',to_jsonb(v_skipped_dates),'accepted_day_count',cardinality(v_accepted_dates),
    'skipped_day_count',cardinality(v_skipped_dates),'day_level_deduplication',true
  );
  insert into public.shopee_import_batches(
    report_type,period_start,period_end,file_name,file_size_bytes,file_hash,storage_path,
    parser_version,row_count,validation_summary,imported_by,aggregate_active
  ) values(
    p_report_type,p_period_start,p_period_end,left(p_file_name,240),p_file_size_bytes,p_file_hash,
    left(p_storage_path,600),left(p_parser_version,30),0,v_summary,p_imported_by,v_aggregate_active
  ) returning id into v_batch;

  if p_import_mode='replace' then
    insert into public.shopee_import_days(report_type,metric_date,batch_id,imported_at)
    select p_report_type,candidate.metric_date,v_batch,now()
    from unnest(v_accepted_dates) as candidate(metric_date)
    on conflict (report_type,metric_date) do update
      set batch_id=excluded.batch_id,imported_at=excluded.imported_at;
  else
    insert into public.shopee_import_days(report_type,metric_date,batch_id,imported_at)
    select p_report_type,candidate.metric_date,v_batch,now()
    from unnest(v_accepted_dates) as candidate(metric_date)
    on conflict (report_type,metric_date) do nothing;
  end if;

  insert into public.shopee_sales_daily(
    batch_id,metric_date,order_type,sales,sales_without_shopee_discount,orders,average_order_value,
    product_clicks,visitors,conversion_rate,cancelled_orders,cancelled_sales,refunded_orders,
    refunded_sales,buyers,new_buyers,returning_buyers,potential_buyers
  )
  select v_batch,x.metric_date,x.order_type,x.sales,x.sales_without_shopee_discount,x.orders,
    x.average_order_value,x.product_clicks,x.visitors,x.conversion_rate,x.cancelled_orders,
    x.cancelled_sales,x.refunded_orders,x.refunded_sales,x.buyers,x.new_buyers,
    x.returning_buyers,x.potential_buyers
  from jsonb_to_recordset(p_sales) as x(
    metric_date date,order_type text,sales numeric,sales_without_shopee_discount numeric,
    orders numeric,average_order_value numeric,product_clicks bigint,visitors bigint,
    conversion_rate numeric,cancelled_orders numeric,cancelled_sales numeric,refunded_orders numeric,
    refunded_sales numeric,buyers bigint,new_buyers bigint,returning_buyers bigint,potential_buyers bigint
  ) where x.metric_date=any(v_accepted_dates);
  get diagnostics v_inserted=row_count;v_rows:=v_rows+v_inserted;

  insert into public.shopee_traffic_sources(
    batch_id,order_type,source_name,sales_share,sales,impressions,clicks,orders,units,ctr,
    conversion_rate,average_order_value,buyers,unique_impressions,unique_clicks
  )
  select v_batch,x.order_type,left(x.source_name,160),x.sales_share,x.sales,x.impressions,x.clicks,
    x.orders,x.units,x.ctr,x.conversion_rate,x.average_order_value,x.buyers,x.unique_impressions,x.unique_clicks
  from jsonb_to_recordset(p_traffic) as x(
    order_type text,source_name text,sales_share numeric,sales numeric,impressions bigint,clicks bigint,
    orders numeric,units numeric,ctr numeric,conversion_rate numeric,average_order_value numeric,
    buyers bigint,unique_impressions bigint,unique_clicks bigint
  );
  get diagnostics v_inserted=row_count;v_rows:=v_rows+v_inserted;

  insert into public.shopee_product_performance(
    batch_id,order_type,item_id,product_name,item_status,sales_share,sales,impressions,clicks,
    orders,units,ctr,conversion_rate,average_order_value,buyers,unique_impressions,unique_clicks
  )
  select v_batch,x.order_type,left(x.item_id,80),left(x.product_name,600),left(x.item_status,120),
    x.sales_share,x.sales,x.impressions,x.clicks,x.orders,x.units,x.ctr,x.conversion_rate,
    x.average_order_value,x.buyers,x.unique_impressions,x.unique_clicks
  from jsonb_to_recordset(p_products) as x(
    order_type text,item_id text,product_name text,item_status text,sales_share numeric,sales numeric,
    impressions bigint,clicks bigint,orders numeric,units numeric,ctr numeric,conversion_rate numeric,
    average_order_value numeric,buyers bigint,unique_impressions bigint,unique_clicks bigint
  );
  get diagnostics v_inserted=row_count;v_rows:=v_rows+v_inserted;

  insert into public.shopee_product_funnel_daily(
    batch_id,metric_date,visitors,page_views,items_visited,exits,bounce_rate,search_clicks,likes,
    cart_visitors,cart_units,cart_conversion,placed_buyers,placed_units,products_ordered,placed_sales,
    placed_conversion,paid_buyers,paid_units,paid_items,paid_sales,paid_conversion
  )
  select v_batch,x.metric_date,x.visitors,x.page_views,x.items_visited,x.exits,x.bounce_rate,
    x.search_clicks,x.likes,x.cart_visitors,x.cart_units,x.cart_conversion,x.placed_buyers,
    x.placed_units,x.products_ordered,x.placed_sales,x.placed_conversion,x.paid_buyers,
    x.paid_units,x.paid_items,x.paid_sales,x.paid_conversion
  from jsonb_to_recordset(p_funnel) as x(
    metric_date date,visitors bigint,page_views bigint,items_visited bigint,exits bigint,
    bounce_rate numeric,search_clicks bigint,likes bigint,cart_visitors bigint,cart_units bigint,
    cart_conversion numeric,placed_buyers bigint,placed_units bigint,products_ordered bigint,
    placed_sales numeric,placed_conversion numeric,paid_buyers bigint,paid_units bigint,
    paid_items bigint,paid_sales numeric,paid_conversion numeric
  ) where x.metric_date=any(v_accepted_dates);
  get diagnostics v_inserted=row_count;v_rows:=v_rows+v_inserted;

  insert into public.shopee_promotion_metrics(
    batch_id,record_kind,metric_date,promotion_type,placed_sales,paid_sales,placed_orders,paid_orders,
    placed_units,paid_units,placed_buyers,paid_buyers,placed_sales_per_buyer,paid_sales_per_buyer,
    placed_bundle_orders,paid_bundle_orders
  )
  select v_batch,x.record_kind,x.metric_date,left(x.promotion_type,160),x.placed_sales,x.paid_sales,
    x.placed_orders,x.paid_orders,x.placed_units,x.paid_units,x.placed_buyers,x.paid_buyers,
    x.placed_sales_per_buyer,x.paid_sales_per_buyer,x.placed_bundle_orders,x.paid_bundle_orders
  from jsonb_to_recordset(p_promotion_metrics) as x(
    record_kind text,metric_date date,promotion_type text,placed_sales numeric,paid_sales numeric,
    placed_orders bigint,paid_orders bigint,placed_units bigint,paid_units bigint,placed_buyers bigint,
    paid_buyers bigint,placed_sales_per_buyer numeric,paid_sales_per_buyer numeric,
    placed_bundle_orders bigint,paid_bundle_orders bigint
  ) where x.record_kind='period' or x.metric_date=any(v_accepted_dates);
  get diagnostics v_inserted=row_count;v_rows:=v_rows+v_inserted;

  insert into public.shopee_promotion_campaigns(
    batch_id,campaign_name,promotion_type,campaign_period,campaign_status,placed_sales,paid_sales,
    placed_orders,paid_orders,placed_units,paid_units,placed_buyers,paid_buyers,
    placed_sales_per_buyer,paid_sales_per_buyer
  )
  select v_batch,left(x.campaign_name,400),left(x.promotion_type,160),left(x.campaign_period,240),
    left(x.campaign_status,120),x.placed_sales,x.paid_sales,x.placed_orders,x.paid_orders,
    x.placed_units,x.paid_units,x.placed_buyers,x.paid_buyers,x.placed_sales_per_buyer,
    x.paid_sales_per_buyer
  from jsonb_to_recordset(p_campaigns) as x(
    campaign_name text,promotion_type text,campaign_period text,campaign_status text,
    placed_sales numeric,paid_sales numeric,placed_orders bigint,paid_orders bigint,placed_units bigint,
    paid_units bigint,placed_buyers bigint,paid_buyers bigint,placed_sales_per_buyer numeric,
    paid_sales_per_buyer numeric
  );
  get diagnostics v_inserted=row_count;v_rows:=v_rows+v_inserted;

  update public.shopee_import_batches set row_count=v_rows where id=v_batch;
  v_status:=case when cardinality(v_skipped_dates)>0 then 'imported_partial' else 'imported' end;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(p_imported_by,'shopee.report_imported','shopee_import_batch',v_batch::text,
    jsonb_build_object('report_type',p_report_type,'period_start',p_period_start,
      'period_end',p_period_end,'row_count',v_rows,'file_hash',p_file_hash,'import_mode',p_import_mode,
      'accepted_dates',to_jsonb(v_accepted_dates),'skipped_dates',to_jsonb(v_skipped_dates)));
  return jsonb_build_object('status',v_status,'batch_id',v_batch,'row_count',v_rows,
    'accepted_count',cardinality(v_accepted_dates),'skipped_count',cardinality(v_skipped_dates),
    'accepted_dates',to_jsonb(v_accepted_dates),'skipped_dates',to_jsonb(v_skipped_dates));
end;
$$;

revoke all on function public.service_commit_shopee_import_v2(
  text,date,date,text,bigint,text,text,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text
) from public,anon,authenticated;
grant execute on function public.service_commit_shopee_import_v2(
  text,date,date,text,bigint,text,text,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text
) to service_role;

create or replace function private.shopee_dashboard_data(p_from date default null,p_to date default null)
returns jsonb
language sql
security definer
set search_path=''
stable
as $$
with bounds as (
  select
    coalesce(p_from,(select min(metric_date) from public.shopee_import_days),current_date-29) date_from,
    coalesce(p_to,(select max(metric_date) from public.shopee_import_days),current_date) date_to
), aggregate_batches as (
  select b.* from public.shopee_import_batches b,bounds x
  where b.aggregate_active and b.status='validated'
    and b.period_end>=x.date_from and b.period_start<=x.date_to
), sales as (
  select s.* from public.shopee_sales_daily s
  join public.shopee_import_days d on d.report_type='shop_stats'
    and d.metric_date=s.metric_date and d.batch_id=s.batch_id,bounds x
  where s.metric_date between x.date_from and x.date_to
), funnel as (
  select f.* from public.shopee_product_funnel_daily f
  join public.shopee_import_days d on d.report_type='product_funnel'
    and d.metric_date=f.metric_date and d.batch_id=f.batch_id,bounds x
  where f.metric_date between x.date_from and x.date_to
), promotion as (
  select m.* from public.shopee_promotion_metrics m
  join public.shopee_import_days d on d.report_type='promotions'
    and d.metric_date=m.metric_date and d.batch_id=m.batch_id,bounds x
  where m.record_kind='daily' and m.metric_date between x.date_from and x.date_to
), sales_totals as (
  select order_type,sum(sales)::numeric(16,2) sales,
    sum(sales_without_shopee_discount)::numeric(16,2) sales_without_discount,
    sum(orders)::numeric(16,2) orders,sum(cancelled_orders)::numeric(16,2) cancelled_orders,
    sum(cancelled_sales)::numeric(16,2) cancelled_sales,sum(refunded_orders)::numeric(16,2) refunded_orders,
    sum(refunded_sales)::numeric(16,2) refunded_sales,sum(buyers)::bigint buyers,
    sum(new_buyers)::bigint new_buyers,sum(returning_buyers)::bigint returning_buyers,
    sum(product_clicks)::bigint clicks,sum(visitors)::bigint visitors
  from sales group by order_type
), traffic as (
  select t.order_type,t.source_name,sum(t.sales)::numeric(16,2) sales,
    sum(t.impressions)::bigint impressions,sum(t.clicks)::bigint clicks,
    sum(t.orders)::numeric(16,2) orders,sum(t.units)::numeric(16,2) units,
    case when sum(t.impressions)>0 then sum(t.clicks)::numeric/sum(t.impressions) else 0 end ctr,
    case when sum(t.clicks)>0 then sum(t.orders)::numeric/sum(t.clicks) else 0 end conversion_rate,
    sum(t.buyers)::bigint buyers
  from public.shopee_traffic_sources t join aggregate_batches b on b.id=t.batch_id
  group by t.order_type,t.source_name
), products as (
  select p.order_type,p.item_id,max(p.product_name) product_name,max(p.item_status) item_status,
    sum(p.sales)::numeric(16,2) sales,sum(p.impressions)::bigint impressions,
    sum(p.clicks)::bigint clicks,sum(p.orders)::numeric(16,2) orders,sum(p.units)::numeric(16,2) units,
    case when sum(p.impressions)>0 then sum(p.clicks)::numeric/sum(p.impressions) else 0 end ctr,
    case when sum(p.clicks)>0 then sum(p.orders)::numeric/sum(p.clicks) else 0 end conversion_rate,
    sum(p.buyers)::bigint buyers
  from public.shopee_product_performance p join aggregate_batches b on b.id=p.batch_id
  group by p.order_type,p.item_id
), campaigns as (
  select c.* from public.shopee_promotion_campaigns c join aggregate_batches b on b.id=c.batch_id
), completeness as (
  select d.metric_date period_start,d.metric_date period_end,count(distinct d.report_type)::int report_count,
    array_agg(distinct d.report_type order by d.report_type) report_types
  from public.shopee_import_days d,bounds x
  where d.metric_date between x.date_from and x.date_to
  group by d.metric_date order by d.metric_date desc
), import_history as (
  select b.* from public.shopee_import_batches b
  where b.status='validated'
  order by b.imported_at desc limit 50
)
select jsonb_build_object(
  'period',jsonb_build_object('from',(select date_from from bounds),'to',(select date_to from bounds)),
  'imports',coalesce((select jsonb_agg(jsonb_build_object(
    'id',b.id,'report_type',b.report_type,'period_start',b.period_start,'period_end',b.period_end,
    'file_name',b.file_name,'row_count',b.row_count,'validation_summary',b.validation_summary,
    'imported_at',b.imported_at,'imported_by',coalesce(p.full_name,'Administrador'),
    'in_selected_period',(b.period_end>=(select date_from from bounds)
      and b.period_start<=(select date_to from bounds))
  ) order by b.imported_at desc) from import_history b
    left join public.profiles p on p.id=b.imported_by),'[]'::jsonb),
  'completeness',coalesce((select jsonb_agg(to_jsonb(c) order by c.period_start desc)
    from completeness c),'[]'::jsonb),
  'sales',coalesce((select jsonb_agg(to_jsonb(s) order by s.order_type) from sales_totals s),'[]'::jsonb),
  'trend',coalesce((select jsonb_agg(to_jsonb(x) order by x.metric_date) from (
    select metric_date,sum(sales) filter(where order_type='placed')::numeric(16,2) placed_sales,
      sum(sales) filter(where order_type='paid')::numeric(16,2) paid_sales,
      sum(orders) filter(where order_type='placed')::numeric(16,2) placed_orders,
      sum(orders) filter(where order_type='paid')::numeric(16,2) paid_orders
    from sales group by metric_date
  ) x),'[]'::jsonb),
  'traffic',coalesce((select jsonb_agg(to_jsonb(t) order by t.sales desc) from traffic t),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.sales desc) from products p),'[]'::jsonb),
  'funnel',coalesce((select jsonb_build_object(
    'visitors',sum(visitors),'page_views',sum(page_views),'cart_visitors',sum(cart_visitors),
    'cart_units',sum(cart_units),'placed_buyers',sum(placed_buyers),'placed_units',sum(placed_units),
    'placed_sales',sum(placed_sales),'paid_buyers',sum(paid_buyers),'paid_units',sum(paid_units),
    'paid_sales',sum(paid_sales),'bounce_rate',case when sum(visitors)>0
      then sum(exits)::numeric/sum(visitors) else 0 end
  ) from funnel),'{}'::jsonb),
  'promotions',coalesce((select jsonb_agg(to_jsonb(x) order by x.paid_sales desc) from (
    select promotion_type,sum(placed_sales)::numeric(16,2) placed_sales,
      sum(paid_sales)::numeric(16,2) paid_sales,sum(placed_orders)::bigint placed_orders,
      sum(paid_orders)::bigint paid_orders,sum(placed_units)::bigint placed_units,
      sum(paid_units)::bigint paid_units,sum(placed_buyers)::bigint placed_buyers,
      sum(paid_buyers)::bigint paid_buyers
    from promotion group by promotion_type
  ) x),'[]'::jsonb),
  'campaigns',coalesce((select jsonb_agg(to_jsonb(c) order by c.paid_sales desc)
    from campaigns c),'[]'::jsonb)
)
$$;

revoke all on function private.shopee_dashboard_data(date,date) from public,anon,authenticated;
grant execute on function private.shopee_dashboard_data(date,date) to service_role;

commit;
