-- Agenda Comercial. No existing operational tables are modified.
-- AI remains disabled. All costs below are internal reservations, not provider invoices.
begin;

create table if not exists public.commercial_calendar_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  pricing_approved boolean not null default false,
  monthly_budget_cents integer not null default 3000 check (monthly_budget_cents between 0 and 3000),
  reserve_per_run_cents integer not null default 100 check (reserve_per_run_cents between 1 and 3000)
);
insert into public.commercial_calendar_settings(singleton) values(true) on conflict do nothing;

create table if not exists public.commercial_calendar_sources (
  domain text primary key check (domain ~ '^[a-z0-9][a-z0-9.-]+[a-z0-9]$'),
  label text not null,
  enabled boolean not null default true
);
insert into public.commercial_calendar_sources(domain,label) values
('shopee.com.br','Shopee Brasil'),
('ads.shopee.com.br','Shopee Ads'),
('mercadolivre.com.br','Mercado Livre Brasil'),
('vendedores.mercadolivre.com.br','Central de vendedores Mercado Livre'),
('sebrae.com.br','Sebrae'),
('gov.br','Governo Federal')
on conflict do nothing;

create table if not exists public.commercial_calendar_runs (
  id uuid primary key default gen_random_uuid(),
  run_day date not null unique,
  status text not null check (status in ('running','completed','failed')),
  reserved_cents integer not null check (reserved_cents>0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result_count integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  error_code text check (length(error_code)<=80)
);
create table if not exists public.commercial_calendar_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  title text not null check (length(title) between 3 and 180),
  start_date date not null,
  end_date date not null check (end_date>=start_date),
  channel text not null check (channel in ('Geral','Shopee','Mercado Livre','Loja própria')),
  source_url text not null check (source_url ~ '^https://' and length(source_url)<=2000),
  source_excerpt text not null check (length(source_excerpt) between 10 and 1500),
  source_published_at date,
  source_checked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  baseline_key text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  revision integer not null default 1,
  run_id uuid not null references public.commercial_calendar_runs(id)
);
create unique index if not exists commercial_calendar_confirmed_baseline
on public.commercial_calendar_events(baseline_key) where status='confirmed' and baseline_key is not null;
create index if not exists commercial_calendar_events_date on public.commercial_calendar_events(start_date,status);

create table if not exists public.commercial_calendar_plans (
  event_key text primary key check (length(event_key) between 3 and 200),
  title text not null check (length(title) between 3 and 180),
  event_date date not null,
  channel text not null check (channel in ('Geral','Shopee','Mercado Livre','Loja própria')),
  owner_id uuid references public.profiles(id),
  status text not null default 'planning' check (status in ('planning','ready','live','completed','cancelled')),
  lead_days integer not null default 60 check (lead_days between 0 and 365),
  production_days integer not null default 15 check (production_days between 0 and 180),
  shipping_days integer not null default 7 check (shipping_days between 0 and 90),
  checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist)='object'),
  notes text not null default '' check (length(notes)<=6000),
  revision integer not null default 1,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (lead_days>=production_days+shipping_days)
);
create table if not exists public.commercial_calendar_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  entity_key text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.commercial_calendar_settings enable row level security;
alter table public.commercial_calendar_sources enable row level security;
alter table public.commercial_calendar_runs enable row level security;
alter table public.commercial_calendar_events enable row level security;
alter table public.commercial_calendar_plans enable row level security;
alter table public.commercial_calendar_audit enable row level security;
revoke all on public.commercial_calendar_settings,public.commercial_calendar_sources,
public.commercial_calendar_runs,public.commercial_calendar_events,public.commercial_calendar_plans,
public.commercial_calendar_audit from public,anon,authenticated;
grant all on public.commercial_calendar_settings,public.commercial_calendar_sources,
public.commercial_calendar_runs,public.commercial_calendar_events,public.commercial_calendar_plans,
public.commercial_calendar_audit to service_role;
grant usage,select on sequence public.commercial_calendar_audit_id_seq to service_role;

create or replace function public.commercial_calendar_require_admin()
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor and role='admin' and status='active') then
    raise exception 'Acesso administrativo necessario.' using errcode='42501';
  end if;
  return actor;
end $$;

create or replace function public.commercial_calendar_dashboard(p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; cfg public.commercial_calendar_settings; reserved bigint; month_start date;
begin
  actor:=public.commercial_calendar_require_admin();
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>730 then raise exception 'Periodo invalido.'; end if;
  month_start:=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date;
  select * into strict cfg from public.commercial_calendar_settings where singleton;
  select coalesce(sum(reserved_cents),0) into reserved from public.commercial_calendar_runs where run_day>=month_start and run_day<(month_start+interval '1 month')::date;
  return jsonb_build_object(
    'settings',to_jsonb(cfg)||jsonb_build_object('reserved_cents',reserved,'budget_month',month_start,'budget_blocked',reserved+cfg.reserve_per_run_cents>cfg.monthly_budget_cents),
    'events',coalesce((select jsonb_agg(e order by e.start_date,e.title) from public.commercial_calendar_events e where e.end_date>=p_from and e.start_date<=p_to and e.status<>'rejected'),'[]'::jsonb),
    'plans',coalesce((select jsonb_agg(p order by p.event_date) from public.commercial_calendar_plans p where p.event_date between p_from and p_to),'[]'::jsonb),
    'owners',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name) order by full_name) from public.profiles where role='admin' and status='active'),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(jsonb_build_object('domain',domain,'label',label)) from public.commercial_calendar_sources where enabled),'[]'::jsonb),
    'last_run',(select to_jsonb(r) from public.commercial_calendar_runs r order by r.started_at desc limit 1),
    'last_success_at',(select max(finished_at) from public.commercial_calendar_runs where status='completed'),
    'read_at',now()
  );
end $$;

create or replace function public.save_commercial_campaign(p_plan jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid; old public.commercial_calendar_plans; saved public.commercial_calendar_plans;
  k text; expected integer; owner uuid; checks jsonb; plan_status text; lead integer; production integer; shipping integer;
begin
  actor:=public.commercial_calendar_require_admin();
  if jsonb_typeof(p_plan) is distinct from 'object' then raise exception 'Plano invalido.'; end if;
  k:=p_plan->>'event_key'; expected:=coalesce((p_plan->>'revision')::integer,0);
  if k is null or k !~ '^[a-z0-9][a-z0-9:._-]{2,199}$' then raise exception 'Identificador invalido.'; end if;
  owner:=nullif(p_plan->>'owner_id','')::uuid;
  if owner is not null and not exists(select 1 from public.profiles where id=owner and role='admin' and status='active') then raise exception 'Responsavel invalido.'; end if;
  checks:=coalesce(p_plan->'checklist','{}'::jsonb);
  if jsonb_typeof(checks)<>'object' then raise exception 'Checklist invalido.'; end if;
  if exists(select 1 from jsonb_each(checks) kv where kv.key not in ('offer','stock','creative','logistics') or jsonb_typeof(kv.value)<>'boolean') then raise exception 'Checklist invalido.'; end if;
  plan_status:=coalesce(p_plan->>'status','planning');
  if plan_status in ('ready','live') and not(checks @> '{"offer":true,"stock":true,"creative":true,"logistics":true}'::jsonb) then raise exception 'Conclua o checklist antes de marcar como pronta ou em execucao.'; end if;
  lead:=coalesce((p_plan->>'lead_days')::integer,60);
  production:=coalesce((p_plan->>'production_days')::integer,15);
  shipping:=coalesce((p_plan->>'shipping_days')::integer,7);
  if lead<production+shipping then raise exception 'Antecedencia deve cobrir producao e envio.'; end if;
  select * into old from public.commercial_calendar_plans where event_key=k for update;
  if (old.event_key is null and expected<>0) or (old.event_key is not null and old.revision<>expected) then raise exception 'Este plano mudou. Atualize antes de salvar.' using errcode='40001'; end if;
  insert into public.commercial_calendar_plans(event_key,title,event_date,channel,owner_id,status,lead_days,production_days,shipping_days,checklist,notes,updated_by)
  values(k,btrim(p_plan->>'title'),(p_plan->>'event_date')::date,p_plan->>'channel',owner,plan_status,lead,production,shipping,checks,coalesce(p_plan->>'notes',''),actor)
  on conflict(event_key) do update set title=excluded.title,event_date=excluded.event_date,channel=excluded.channel,
    owner_id=excluded.owner_id,status=excluded.status,lead_days=excluded.lead_days,production_days=excluded.production_days,
    shipping_days=excluded.shipping_days,checklist=excluded.checklist,notes=excluded.notes,updated_by=actor,updated_at=now(),
    revision=public.commercial_calendar_plans.revision+1
  where public.commercial_calendar_plans.revision=expected
  returning * into saved;
  if saved.event_key is null then raise exception 'Este plano mudou. Atualize antes de salvar.' using errcode='40001'; end if;
  insert into public.commercial_calendar_audit(actor_id,action,entity_key,details)
  values(actor,case when old.event_key is null then 'plan_created' else 'plan_updated' end,k,jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(saved)));
  return to_jsonb(saved);
end $$;

create or replace function public.review_commercial_event(p_id uuid,p_revision integer,p_decision text,p_baseline_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; old public.commercial_calendar_events; saved public.commercial_calendar_events;
begin
  actor:=public.commercial_calendar_require_admin();
  if p_decision not in ('confirmed','rejected') or p_decision is null then raise exception 'Decisao invalida.'; end if;
  if p_baseline_key is not null and p_baseline_key !~ '^[a-z0-9-]+:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data-base invalida.'; end if;
  select * into old from public.commercial_calendar_events where id=p_id for update;
  if old.id is null or old.status<>'pending' or old.revision is distinct from p_revision then raise exception 'Esta proposta mudou. Atualize a lista.' using errcode='40001'; end if;
  if p_baseline_key is not null and p_decision='confirmed' then
    -- Retire the previous proposal only after an explicit administrator decision.
    update public.commercial_calendar_events set status='rejected',reviewed_by=actor,reviewed_at=now(),revision=revision+1
    where baseline_key=p_baseline_key and status='confirmed';
  end if;
  update public.commercial_calendar_events set status=p_decision,baseline_key=p_baseline_key,reviewed_by=actor,reviewed_at=now(),revision=revision+1
  where id=p_id returning * into saved;
  insert into public.commercial_calendar_audit(actor_id,action,entity_key,details)
  values(actor,'event_'||p_decision,p_id::text,jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(saved)));
  return to_jsonb(saved);
end $$;

create or replace function public.claim_commercial_calendar_sync()
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg public.commercial_calendar_settings; spent bigint; day date; run public.commercial_calendar_runs;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Servico necessario.' using errcode='42501'; end if;
  select * into strict cfg from public.commercial_calendar_settings where singleton for update;
  if not cfg.enabled or not cfg.pricing_approved then return jsonb_build_object('allowed',false,'reason','disabled'); end if;
  day:=(now() at time zone 'America/Sao_Paulo')::date;
  if exists(select 1 from public.commercial_calendar_runs where run_day=day) then return jsonb_build_object('allowed',false,'reason','already_attempted'); end if;
  select coalesce(sum(reserved_cents),0) into spent from public.commercial_calendar_runs
  where run_day>=date_trunc('month',day)::date and run_day<(date_trunc('month',day)+interval '1 month')::date;
  if spent+cfg.reserve_per_run_cents>cfg.monthly_budget_cents then return jsonb_build_object('allowed',false,'reason','budget_blocked'); end if;
  insert into public.commercial_calendar_runs(run_day,status,reserved_cents)
  values(day,'running',cfg.reserve_per_run_cents) returning * into run;
  return jsonb_build_object('allowed',true,'run_id',run.id,'run_day',day,'reserved_cents',run.reserved_cents,
    'domains',coalesce((select jsonb_agg(domain order by domain) from public.commercial_calendar_sources where enabled),'[]'::jsonb));
end $$;

create or replace function public.finish_commercial_calendar_sync(p_run_id uuid,p_events jsonb,p_error_code text default null,p_input_tokens integer default null,p_output_tokens integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare run public.commercial_calendar_runs; item jsonb; v_source_domain text; found_count integer:=0; start_day date; end_day date;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Servico necessario.' using errcode='42501'; end if;
  select * into run from public.commercial_calendar_runs where id=p_run_id for update;
  if run.id is null or run.status<>'running' then raise exception 'Execucao indisponivel.'; end if;
  if p_error_code is null then
    if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>20 then raise exception 'Resultado invalido.'; end if;
    for item in select value from jsonb_array_elements(p_events) loop
      v_source_domain:=lower(substring(item->>'source_url' from '^https://([^/?#:]+)'));
      if v_source_domain is null or not exists(select 1 from public.commercial_calendar_sources s where s.enabled and (v_source_domain=s.domain or right(v_source_domain,length(s.domain)+1)='.'||s.domain)) then raise exception 'Fonte nao autorizada.'; end if;
      if (item->>'source_url') ~ '^https://[^/]*[@\\]' then raise exception 'Fonte invalida.'; end if;
      start_day:=(item->>'start_date')::date; end_day:=(item->>'end_date')::date;
      if start_day<run.run_day or end_day<start_day or end_day>run.run_day+370 then raise exception 'Periodo da fonte invalido.'; end if;
      insert into public.commercial_calendar_events(fingerprint,title,start_date,end_date,channel,source_url,source_excerpt,source_published_at,run_id)
      values(item->>'fingerprint',btrim(item->>'title'),start_day,end_day,item->>'channel',item->>'source_url',item->>'source_excerpt',nullif(item->>'source_published_at','')::date,run.id)
      on conflict(fingerprint) do update set last_seen_at=now();
      found_count:=found_count+1;
    end loop;
  end if;
  update public.commercial_calendar_runs set status=case when p_error_code is null then 'completed' else 'failed' end,
    finished_at=now(),result_count=found_count,error_code=p_error_code,input_tokens=greatest(p_input_tokens,0),output_tokens=greatest(p_output_tokens,0)
  where id=p_run_id;
  return jsonb_build_object('status',case when p_error_code is null then 'completed' else 'failed' end,'result_count',found_count);
end $$;

revoke all on function public.commercial_calendar_require_admin() from public,anon,authenticated;
revoke all on function public.commercial_calendar_dashboard(date,date) from public,anon,authenticated;
revoke all on function public.save_commercial_campaign(jsonb) from public,anon,authenticated;
revoke all on function public.review_commercial_event(uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.claim_commercial_calendar_sync() from public,anon,authenticated;
revoke all on function public.finish_commercial_calendar_sync(uuid,jsonb,text,integer,integer) from public,anon,authenticated;
grant execute on function public.commercial_calendar_dashboard(date,date),public.save_commercial_campaign(jsonb),
  public.review_commercial_event(uuid,integer,text,text) to authenticated;
grant execute on function public.claim_commercial_calendar_sync(),public.finish_commercial_calendar_sync(uuid,jsonb,text,integer,integer) to service_role;
commit;
