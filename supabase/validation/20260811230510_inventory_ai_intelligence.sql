-- Executar depois da migração 20260811230510_inventory_ai_intelligence.sql.
-- Todas as linhas devem retornar true/ok. Nenhuma informação operacional é alterada.

select
  to_regclass('public.inventory_ai_settings') is not null as settings_created,
  to_regclass('public.inventory_ai_analyses') is not null as analyses_created,
  to_regclass('public.inventory_ai_insights') is not null as insights_created;

select relname,relrowsecurity
from pg_class
where relnamespace='public'::regnamespace
  and relname in ('inventory_ai_settings','inventory_ai_analyses','inventory_ai_insights')
order by relname;

select routine_name,security_type
from information_schema.routines
where routine_schema='public'
  and routine_name in (
    'admin_get_inventory_ai_usage',
    'primary_admin_update_inventory_ai_settings',
    'admin_mark_inventory_ai_insight',
    'service_inventory_ai_snapshot',
    'service_finalize_inventory_ai_analysis'
  )
order by routine_name;

select
  has_function_privilege('authenticated','public.service_inventory_ai_snapshot(integer)','EXECUTE') = false
    as snapshot_blocked_for_authenticated,
  has_function_privilege('authenticated','public.service_finalize_inventory_ai_analysis(uuid,text,text,jsonb,integer,integer,numeric)','EXECUTE') = false
    as finalize_blocked_for_authenticated,
  has_function_privilege('service_role','public.service_inventory_ai_snapshot(integer)','EXECUTE')
    as snapshot_available_to_service_role;

select id,enabled,model,monthly_budget_usd,manual_cooldown_minutes,scheduled_daily_limit,analysis_window_days
from public.inventory_ai_settings
where id=1;
