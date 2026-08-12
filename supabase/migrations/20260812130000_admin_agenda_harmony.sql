-- Harmony Store Oficial — Agenda Harmony administrativa.
-- Estrutura aditiva: tarefas manuais e análises de IA não substituem nem alteram
-- boletos, solicitações, ordens de produção, inventário ou notificações existentes.

begin;

create table if not exists public.admin_agenda_tasks (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text check (description is null or char_length(description) <= 3000),
  task_kind text not null default 'task'
    check (task_kind in ('task','appointment','follow_up')),
  status text not null default 'pending'
    check (status in ('pending','in_progress','completed','cancelled')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  starts_at timestamptz not null,
  due_at timestamptz,
  all_day boolean not null default false,
  reminder_at timestamptz,
  source_type text not null default 'manual'
    check (source_type in ('manual','request','bill','internal_supply','production_order','inventory')),
  source_key text check (source_key is null or char_length(source_key) <= 120),
  source_label text check (source_label is null or char_length(source_label) <= 240),
  checklist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checklist) = 'array'),
  ai_organized boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  completed_by uuid references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_agenda_task_period_check check (due_at is null or due_at >= starts_at),
  constraint admin_agenda_task_completion_check check (
    (status = 'completed' and completed_at is not null and completed_by is not null)
    or (status <> 'completed' and completed_at is null and completed_by is null)
  ),
  constraint admin_agenda_task_cancellation_check check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  )
);

create table if not exists public.admin_agenda_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.admin_agenda_tasks(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('created','updated','started','completed','reopened','cancelled')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_agenda_reminder_deliveries (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.admin_agenda_tasks(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  last_error text check (last_error is null or char_length(last_error) <= 160),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, recipient_id, scheduled_for),
  check ((status='sent' and sent_at is not null) or (status<>'sent' and sent_at is null))
);

create table if not exists public.admin_agenda_ai_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  model text not null default 'gpt-5.6-luna'
    check (model ~ '^gpt-[a-zA-Z0-9._-]{1,80}$'),
  monthly_budget_usd numeric(10,4) not null default 2
    check (monthly_budget_usd between 0 and 1000),
  manual_cooldown_minutes integer not null default 10
    check (manual_cooldown_minutes between 1 and 1440),
  daily_analysis_limit integer not null default 4
    check (daily_analysis_limit between 0 and 24),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.admin_agenda_ai_settings(id)
values (1)
on conflict (id) do nothing;

create table if not exists public.admin_agenda_ai_runs (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('organize_task','daily_briefing')),
  status text not null default 'processing'
    check (status in ('processing','completed','failed','budget_blocked')),
  model text not null,
  snapshot_fingerprint text check (
    snapshot_fingerprint is null or snapshot_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text check (error_code is null or char_length(error_code) <= 120),
  created_at timestamptz not null default now(),
  constraint admin_agenda_ai_completion_check check (
    (status = 'processing' and completed_at is null)
    or (status <> 'processing' and completed_at is not null)
  )
);

create index if not exists admin_agenda_tasks_status_starts_idx
  on public.admin_agenda_tasks(status, starts_at);
create index if not exists admin_agenda_tasks_due_open_idx
  on public.admin_agenda_tasks(due_at, priority)
  where status in ('pending','in_progress');
create index if not exists admin_agenda_tasks_source_idx
  on public.admin_agenda_tasks(source_type, source_key)
  where source_key is not null;
create index if not exists admin_agenda_task_events_task_idx
  on public.admin_agenda_task_events(task_id, created_at desc);
create index if not exists admin_agenda_reminders_pending_idx
  on public.admin_agenda_reminder_deliveries(status, scheduled_for, updated_at)
  where status <> 'sent' and attempts < 5;
create index if not exists admin_agenda_ai_runs_completed_idx
  on public.admin_agenda_ai_runs(completed_at desc)
  where status = 'completed';
create index if not exists admin_agenda_ai_runs_month_cost_idx
  on public.admin_agenda_ai_runs(created_at desc, estimated_cost_usd)
  where status = 'completed';

drop trigger if exists admin_agenda_tasks_touch_updated_at on public.admin_agenda_tasks;
create trigger admin_agenda_tasks_touch_updated_at
before update on public.admin_agenda_tasks
for each row execute function public.touch_updated_at();

drop trigger if exists admin_agenda_ai_settings_touch_updated_at on public.admin_agenda_ai_settings;
create trigger admin_agenda_ai_settings_touch_updated_at
before update on public.admin_agenda_ai_settings
for each row execute function public.touch_updated_at();

drop trigger if exists admin_agenda_reminder_deliveries_touch_updated_at on public.admin_agenda_reminder_deliveries;
create trigger admin_agenda_reminder_deliveries_touch_updated_at
before update on public.admin_agenda_reminder_deliveries
for each row execute function public.touch_updated_at();

alter table public.admin_agenda_tasks enable row level security;
alter table public.admin_agenda_task_events enable row level security;
alter table public.admin_agenda_reminder_deliveries enable row level security;
alter table public.admin_agenda_ai_settings enable row level security;
alter table public.admin_agenda_ai_runs enable row level security;

revoke all privileges on table public.admin_agenda_tasks from public, anon, authenticated;
revoke all privileges on table public.admin_agenda_task_events from public, anon, authenticated;
revoke all privileges on table public.admin_agenda_reminder_deliveries from public, anon, authenticated;
revoke all privileges on table public.admin_agenda_ai_settings from public, anon, authenticated;
revoke all privileges on table public.admin_agenda_ai_runs from public, anon, authenticated;
grant select on table public.admin_agenda_tasks to authenticated;
grant select on table public.admin_agenda_task_events to authenticated;
grant select on table public.admin_agenda_reminder_deliveries to authenticated;
grant select on table public.admin_agenda_ai_settings to authenticated;
grant select on table public.admin_agenda_ai_runs to authenticated;
grant all privileges on table public.admin_agenda_tasks to service_role;
grant all privileges on table public.admin_agenda_task_events to service_role;
grant all privileges on table public.admin_agenda_reminder_deliveries to service_role;
grant all privileges on table public.admin_agenda_ai_settings to service_role;
grant all privileges on table public.admin_agenda_ai_runs to service_role;
grant usage, select on sequence public.admin_agenda_tasks_protocol_seq to service_role;
grant usage, select on sequence public.admin_agenda_task_events_id_seq to service_role;
grant usage, select on sequence public.admin_agenda_reminder_deliveries_id_seq to service_role;

drop policy if exists "admin agenda tasks: admin read" on public.admin_agenda_tasks;
create policy "admin agenda tasks: admin read"
on public.admin_agenda_tasks for select to authenticated
using ((select private.is_admin()));

drop policy if exists "admin agenda events: admin read" on public.admin_agenda_task_events;
create policy "admin agenda events: admin read"
on public.admin_agenda_task_events for select to authenticated
using ((select private.is_admin()));

drop policy if exists "admin agenda reminders: admin read" on public.admin_agenda_reminder_deliveries;
create policy "admin agenda reminders: admin read"
on public.admin_agenda_reminder_deliveries for select to authenticated
using ((select private.is_admin()));

drop policy if exists "admin agenda ai settings: admin read" on public.admin_agenda_ai_settings;
create policy "admin agenda ai settings: admin read"
on public.admin_agenda_ai_settings for select to authenticated
using ((select private.is_admin()));

drop policy if exists "admin agenda ai runs: admin read" on public.admin_agenda_ai_runs;
create policy "admin agenda ai runs: admin read"
on public.admin_agenda_ai_runs for select to authenticated
using ((select private.is_admin()));

create or replace function public.admin_create_agenda_task(p_task jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_title text := trim(coalesce(p_task->>'title',''));
  v_starts_at timestamptz := nullif(p_task->>'starts_at','')::timestamptz;
  v_due_at timestamptz := nullif(p_task->>'due_at','')::timestamptz;
  v_reminder_at timestamptz := nullif(p_task->>'reminder_at','')::timestamptz;
  v_checklist jsonb := coalesce(p_task->'checklist','[]'::jsonb);
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if char_length(v_title) not between 3 and 160 then
    raise exception 'O título deve ter entre 3 e 160 caracteres.';
  end if;
  if v_starts_at is null then raise exception 'Informe a data da tarefa.'; end if;
  if v_due_at is not null and v_due_at < v_starts_at then
    raise exception 'O prazo final não pode ser anterior ao início.';
  end if;
  if jsonb_typeof(v_checklist) <> 'array' or jsonb_array_length(v_checklist) > 20 then
    raise exception 'A lista de verificação é inválida.';
  end if;

  insert into public.admin_agenda_tasks(
    title, description, task_kind, priority, starts_at, due_at, all_day,
    reminder_at, source_type, source_key, source_label, checklist,
    ai_organized, created_by, updated_by
  ) values (
    v_title, nullif(trim(p_task->>'description'),''),
    coalesce(nullif(p_task->>'task_kind',''),'task'),
    coalesce(nullif(p_task->>'priority',''),'normal'),
    v_starts_at, v_due_at, coalesce((p_task->>'all_day')::boolean,false),
    v_reminder_at, coalesce(nullif(p_task->>'source_type',''),'manual'),
    nullif(trim(p_task->>'source_key'),''), nullif(trim(p_task->>'source_label'),''),
    v_checklist, coalesce((p_task->>'ai_organized')::boolean,false), v_actor, v_actor
  ) returning id into v_id;

  insert into public.admin_agenda_task_events(task_id, actor_id, action, details)
  values(v_id, v_actor, 'created', jsonb_build_object(
    'starts_at',v_starts_at,'due_at',v_due_at,'priority',coalesce(nullif(p_task->>'priority',''),'normal'),
    'source_type',coalesce(nullif(p_task->>'source_type',''),'manual'),'ai_organized',coalesce((p_task->>'ai_organized')::boolean,false)
  ));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'agenda.task_created','admin_agenda_task',v_id::text,
    jsonb_build_object('starts_at',v_starts_at,'priority',coalesce(nullif(p_task->>'priority',''),'normal')));
  return v_id;
end;
$$;

create or replace function public.admin_update_agenda_task(p_task_id uuid, p_task jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_title text := trim(coalesce(p_task->>'title',''));
  v_starts_at timestamptz := nullif(p_task->>'starts_at','')::timestamptz;
  v_due_at timestamptz := nullif(p_task->>'due_at','')::timestamptz;
  v_checklist jsonb := coalesce(p_task->'checklist','[]'::jsonb);
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if char_length(v_title) not between 3 and 160 then raise exception 'O título deve ter entre 3 e 160 caracteres.'; end if;
  if v_starts_at is null then raise exception 'Informe a data da tarefa.'; end if;
  if v_due_at is not null and v_due_at < v_starts_at then raise exception 'O prazo final não pode ser anterior ao início.'; end if;
  if jsonb_typeof(v_checklist) <> 'array' or jsonb_array_length(v_checklist) > 20 then raise exception 'A lista de verificação é inválida.'; end if;

  update public.admin_agenda_tasks set
    title=v_title, description=nullif(trim(p_task->>'description'),''),
    task_kind=coalesce(nullif(p_task->>'task_kind',''),'task'),
    priority=coalesce(nullif(p_task->>'priority',''),'normal'),
    starts_at=v_starts_at, due_at=v_due_at,
    all_day=coalesce((p_task->>'all_day')::boolean,false),
    reminder_at=nullif(p_task->>'reminder_at','')::timestamptz,
    source_type=coalesce(nullif(p_task->>'source_type',''),'manual'),
    source_key=nullif(trim(p_task->>'source_key'),''),
    source_label=nullif(trim(p_task->>'source_label'),''),
    checklist=v_checklist,
    ai_organized=coalesce((p_task->>'ai_organized')::boolean,false),
    updated_by=v_actor
  where id=p_task_id and status not in ('completed','cancelled');
  if not found then raise exception 'Somente tarefas abertas podem ser editadas.'; end if;

  insert into public.admin_agenda_task_events(task_id,actor_id,action,details)
  values(p_task_id,v_actor,'updated',jsonb_build_object('starts_at',v_starts_at,'due_at',v_due_at));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values(v_actor,'agenda.task_updated','admin_agenda_task',p_task_id::text);
end;
$$;

create or replace function public.admin_set_agenda_task_status(p_task_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_action text;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_status not in ('pending','in_progress','completed','cancelled') then raise exception 'Situação inválida.'; end if;
  v_action := case p_status when 'pending' then 'reopened' when 'in_progress' then 'started' when 'completed' then 'completed' else 'cancelled' end;
  update public.admin_agenda_tasks set
    status=p_status,
    completed_at=case when p_status='completed' then now() else null end,
    completed_by=case when p_status='completed' then v_actor else null end,
    cancelled_at=case when p_status='cancelled' then now() else null end,
    updated_by=v_actor
  where id=p_task_id;
  if not found then raise exception 'Tarefa não localizada.' using errcode='P0002'; end if;
  insert into public.admin_agenda_task_events(task_id,actor_id,action,details)
  values(p_task_id,v_actor,v_action,jsonb_build_object('status',p_status));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'agenda.task_status_changed','admin_agenda_task',p_task_id::text,jsonb_build_object('status',p_status));
end;
$$;

create or replace function public.admin_get_agenda_ai_usage()
returns table(
  enabled boolean, model text, monthly_budget_usd numeric,
  manual_cooldown_minutes integer, daily_analysis_limit integer,
  month_cost_usd numeric, month_run_count bigint, remaining_budget_usd numeric,
  last_completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return query
  select s.enabled,s.model,s.monthly_budget_usd,s.manual_cooldown_minutes,s.daily_analysis_limit,
    coalesce(sum(r.estimated_cost_usd) filter(where r.status='completed' and r.created_at>=date_trunc('month',now())),0)::numeric,
    count(r.id) filter(where r.status='completed' and r.created_at>=date_trunc('month',now()))::bigint,
    greatest(0,s.monthly_budget_usd-coalesce(sum(r.estimated_cost_usd) filter(where r.status='completed' and r.created_at>=date_trunc('month',now())),0))::numeric,
    max(r.completed_at) filter(where r.status='completed')
  from public.admin_agenda_ai_settings s
  left join public.admin_agenda_ai_runs r on true
  where s.id=1
  group by s.id,s.enabled,s.model,s.monthly_budget_usd,s.manual_cooldown_minutes,s.daily_analysis_limit;
end;
$$;

create or replace function public.primary_admin_update_agenda_ai_settings(
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
    raise exception 'Somente o ADM principal pode alterar o orçamento da Agenda.' using errcode='42501';
  end if;
  if p_monthly_budget_usd is null or p_monthly_budget_usd<0 or p_monthly_budget_usd>1000 then
    raise exception 'Informe um orçamento entre US$ 0 e US$ 1.000.';
  end if;
  if p_manual_cooldown_minutes is null or p_manual_cooldown_minutes not between 1 and 1440 then
    raise exception 'O intervalo deve ficar entre 1 e 1.440 minutos.';
  end if;
  update public.admin_agenda_ai_settings
  set enabled=coalesce(p_enabled,false),monthly_budget_usd=p_monthly_budget_usd,
    manual_cooldown_minutes=p_manual_cooldown_minutes,updated_by=v_actor
  where id=1;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'agenda.ai_settings_updated','admin_agenda_ai_settings','1',jsonb_build_object(
    'enabled',coalesce(p_enabled,false),'monthly_budget_usd',p_monthly_budget_usd,
    'manual_cooldown_minutes',p_manual_cooldown_minutes
  ));
end;
$$;

revoke all on function public.admin_create_agenda_task(jsonb) from public,anon,authenticated;
revoke all on function public.admin_update_agenda_task(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.admin_set_agenda_task_status(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_get_agenda_ai_usage() from public,anon,authenticated;
revoke all on function public.primary_admin_update_agenda_ai_settings(boolean,numeric,integer) from public,anon,authenticated;
grant execute on function public.admin_create_agenda_task(jsonb) to authenticated;
grant execute on function public.admin_update_agenda_task(uuid,jsonb) to authenticated;
grant execute on function public.admin_set_agenda_task_status(uuid,text) to authenticated;
grant execute on function public.admin_get_agenda_ai_usage() to authenticated;
grant execute on function public.primary_admin_update_agenda_ai_settings(boolean,numeric,integer) to authenticated;

commit;
