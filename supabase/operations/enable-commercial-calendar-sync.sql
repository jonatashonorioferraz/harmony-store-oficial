-- MANUAL RUNBOOK ONLY. Not a migration. Never run before explicit activation approval.
-- Before running:
-- 1. Deploy sync-commercial-calendar with --no-verify-jwt (own secret authentication).
-- 2. Configure CALENDAR_CRON_SECRET (>=32 random chars), OPENAI_API_KEY and
--    CALENDAR_RESEARCH_APPROVED=yes as Edge secrets.
-- 3. Store that same cron secret in Vault as commercial_calendar_cron_secret.
-- 4. Approve model availability/prices, BRL conversion/margin, provider safeguards,
--    and the INTERNAL monthly reservation policy (not a provider billing guarantee).
-- 5. Set pricing_approved=true and enabled=true explicitly in the singleton settings.
-- No secret value belongs in this file or the browser.
do $$
declare secret_exists boolean; job record;
begin
  if not exists(select 1 from public.commercial_calendar_settings where enabled and pricing_approved and monthly_budget_cents<=3000) then
    raise exception 'Pesquisa ainda nao aprovada e habilitada.';
  end if;
  if not exists(select 1 from pg_extension where extname='pg_cron') or not exists(select 1 from pg_extension where extname='pg_net') then
    raise exception 'pg_cron e pg_net precisam ser habilitados previamente por um administrador.';
  end if;
  select exists(select 1 from vault.decrypted_secrets where name='commercial_calendar_cron_secret' and length(decrypted_secret)>=32) into secret_exists;
  if not secret_exists then raise exception 'Segredo de agendamento ausente no Vault.'; end if;
  for job in select jobid from cron.job where jobname='harmony-commercial-calendar-daily' loop perform cron.unschedule(job.jobid); end loop;
  perform cron.schedule('harmony-commercial-calendar-daily','0 10 * * *',$cron$
    select net.http_post(
      url:='https://tyzfznwvjzmudxtcbbaf.supabase.co/functions/v1/sync-commercial-calendar',
      headers:=jsonb_build_object('Content-Type','application/json','x-calendar-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='commercial_calendar_cron_secret' limit 1)),
      body:='{}'::jsonb,
      timeout_milliseconds:=90000
    );
  $cron$);
end $$;
-- Pause safely: set enabled=false in commercial_calendar_settings, then unschedule
-- only harmony-commercial-calendar-daily. Do not touch other reminders or jobs.
