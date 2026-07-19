-- Harmony Store Oficial — Fases 3 e 5: continuidade e saúde resumida.
begin;

create table if not exists public.system_backup_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('success','failed')),
  source text not null default 'github-actions',
  artifact_sha256 text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  stats jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.system_events (
  id bigint generated always as identity primary key,
  source text not null check (source in ('client','notification','edge','backup','system')),
  level text not null check (level in ('info','warning','error')),
  code text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.system_backup_runs enable row level security;
alter table public.system_events enable row level security;

create index if not exists system_backup_runs_completed_idx on public.system_backup_runs(completed_at desc);
create index if not exists system_backup_runs_status_completed_idx on public.system_backup_runs(status, completed_at desc);
create index if not exists system_events_source_created_idx on public.system_events(source, created_at desc);
create index if not exists system_events_level_created_idx on public.system_events(level, created_at desc);

revoke all privileges on table public.system_backup_runs, public.system_events from public, anon, authenticated;
revoke all privileges on sequence public.system_events_id_seq from public, anon, authenticated;
grant select, insert on table public.system_backup_runs, public.system_events to service_role;
grant usage, select on sequence public.system_events_id_seq to service_role;

create or replace function public.service_record_backup_result(
  p_status text,
  p_artifact_sha256 text default null,
  p_byte_size bigint default null,
  p_stats jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_started_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = '' as $$
declare v_id uuid;
begin
  if p_status not in ('success','failed') then
    raise exception 'Status de backup inválido.' using errcode='22023';
  end if;
  insert into public.system_backup_runs(status,artifact_sha256,byte_size,stats,error_code,started_at)
  values (p_status,nullif(p_artifact_sha256,''),p_byte_size,coalesce(p_stats,'{}'::jsonb),nullif(p_error_code,''),p_started_at)
  returning id into v_id;
  insert into public.system_events(source,level,code,details)
  values ('backup',case when p_status='success' then 'info' else 'error' end,
          case when p_status='success' then 'backup_completed' else 'backup_failed' end,
          jsonb_build_object('backup_id',v_id,'status',p_status));
  return v_id;
end;
$$;

revoke all on function public.service_record_backup_result(text,text,bigint,jsonb,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.service_record_backup_result(text,text,bigint,jsonb,text,timestamptz)
  to service_role;

create or replace function public.record_client_error(p_code text, p_context jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not exists(select 1 from public.profiles where id=v_actor and status='active') then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if exists(select 1 from public.system_events where actor_id=v_actor and source='client' and created_at>now()-interval '1 minute') then
    return;
  end if;
  insert into public.system_events(source,level,code,actor_id,details)
  values ('client','error',left(regexp_replace(coalesce(p_code,'client_error'),'[^a-zA-Z0-9_.-]','','g'),80),v_actor,
          jsonb_build_object('view',left(coalesce(p_context->>'view','unknown'),40),'version',left(coalesce(p_context->>'version','unknown'),20)));
end;
$$;

revoke all on function public.record_client_error(text,jsonb) from public, anon;
grant execute on function public.record_client_error(text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

