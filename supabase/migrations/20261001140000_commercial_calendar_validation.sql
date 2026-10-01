-- An exceptional validation requires a separately recorded, expiring operator authorization.
-- Ordinary cron still uses claim_commercial_calendar_sync: at most one attempt per day.
begin;
alter table public.commercial_calendar_runs add column if not exists attempt_number integer not null default 1 check(attempt_number>0);
alter table public.commercial_calendar_runs drop constraint if exists commercial_calendar_runs_run_day_key;
create unique index if not exists commercial_calendar_run_attempt on public.commercial_calendar_runs(run_day,attempt_number);
create table if not exists public.commercial_calendar_validation_authorizations(
  id uuid primary key default gen_random_uuid(),
  run_day date not null,
  reason text not null check(length(reason) between 10 and 500),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check(expires_at>created_at),
  used_at timestamptz,
  run_id uuid unique references public.commercial_calendar_runs(id)
);
alter table public.commercial_calendar_validation_authorizations enable row level security;
revoke all on public.commercial_calendar_validation_authorizations from public,anon,authenticated,service_role;
-- Operator SQL can issue an authorization; the Edge service can only consume it through this RPC.
create or replace function public.claim_commercial_calendar_validation(p_authorization uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg public.commercial_calendar_settings; approval public.commercial_calendar_validation_authorizations;
  day date:=(now() at time zone 'America/Sao_Paulo')::date; spent bigint; run public.commercial_calendar_runs; next_attempt integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Servico necessario.' using errcode='42501'; end if;
  select * into strict cfg from public.commercial_calendar_settings where singleton for update;
  select * into approval from public.commercial_calendar_validation_authorizations where id=p_authorization for update;
  if approval.id is null or approval.used_at is not null or approval.expires_at<=now() or approval.run_day<>day then
    return jsonb_build_object('allowed',false,'reason','validation_not_authorized');
  end if;
  if not cfg.enabled or not cfg.pricing_approved then return jsonb_build_object('allowed',false,'reason','disabled'); end if;
  if exists(select 1 from public.commercial_calendar_runs where run_day=day and status='running') then
    return jsonb_build_object('allowed',false,'reason','already_running');
  end if;
  select coalesce(sum(reserved_cents),0) into spent from public.commercial_calendar_runs
    where run_day>=date_trunc('month',day)::date and run_day<(date_trunc('month',day)+interval '1 month')::date;
  if spent+cfg.reserve_per_run_cents>cfg.monthly_budget_cents then return jsonb_build_object('allowed',false,'reason','budget_blocked'); end if;
  select coalesce(max(attempt_number),0)+1 into next_attempt from public.commercial_calendar_runs where run_day=day;
  insert into public.commercial_calendar_runs(run_day,attempt_number,status,reserved_cents)
    values(day,next_attempt,'running',cfg.reserve_per_run_cents) returning * into run;
  update public.commercial_calendar_validation_authorizations set used_at=now(),run_id=run.id where id=approval.id;
  return jsonb_build_object('allowed',true,'run_id',run.id,'run_day',day,'reserved_cents',run.reserved_cents,
    'domains',coalesce((select jsonb_agg(domain order by domain) from public.commercial_calendar_sources where enabled),'[]'::jsonb));
end $$;
revoke all on function public.claim_commercial_calendar_validation(uuid) from public,anon,authenticated;
grant execute on function public.claim_commercial_calendar_validation(uuid) to service_role;
notify pgrst,'reload schema';
commit;
