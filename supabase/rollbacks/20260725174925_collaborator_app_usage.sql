-- Reverte somente a telemetria mínima da v25.34.
begin;

drop function if exists public.admin_list_app_usage_summary();
drop function if exists public.record_own_app_usage(text);
drop table if exists public.app_usage_sessions;

commit;
