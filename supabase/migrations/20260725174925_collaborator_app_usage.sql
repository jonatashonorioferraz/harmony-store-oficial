-- v25.34: uso aproximado do aplicativo por colaboradoras.
-- Privacidade: não registra páginas, conteúdo, IP, localização ou ações individuais.

begin;

create table public.app_usage_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  auth_session_id uuid not null,
  usage_date date not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_seconds integer not null default 0
    check (active_seconds between 0 and 86400),
  app_version text,
  constraint app_usage_sessions_user_session_day_key
    unique (user_id, auth_session_id, usage_date),
  constraint app_usage_sessions_time_order_check
    check (last_seen_at >= started_at)
);

comment on table public.app_usage_sessions is
  'Telemetria mínima de presença: um agregado diário por sessão Auth, sem navegação, conteúdo, IP ou localização.';
comment on column public.app_usage_sessions.active_seconds is
  'Tempo ativo aproximado calculado no servidor entre heartbeats visíveis, limitado a 90 segundos por pulso.';

create index app_usage_sessions_user_last_seen_idx
  on public.app_usage_sessions (user_id, last_seen_at desc);
create index app_usage_sessions_usage_date_idx
  on public.app_usage_sessions (usage_date);

alter table public.app_usage_sessions enable row level security;
revoke all privileges on table public.app_usage_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.app_usage_sessions to service_role;

create or replace function public.record_own_app_usage(p_app_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid;
  v_now timestamptz := clock_timestamp();
  v_usage_date date := timezone('America/Sao_Paulo', v_now)::date;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  begin
    v_session_id := nullif((select auth.jwt()->>'session_id'), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Sessão de autenticação inválida.' using errcode = '42501';
  end;

  if v_session_id is null then
    raise exception 'Sessão de autenticação ausente.' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.profiles
     where id = v_user_id
       and status = 'active'
       and role in ('collaborator', 'receiver')
  ) then
    return;
  end if;

  insert into public.app_usage_sessions (
    user_id, auth_session_id, usage_date, started_at, last_seen_at, app_version
  ) values (
    v_user_id, v_session_id, v_usage_date, v_now, v_now,
    nullif(left(trim(coalesce(p_app_version, '')), 24), '')
  )
  on conflict (user_id, auth_session_id, usage_date) do update
  set active_seconds = least(
        86400,
        app_usage_sessions.active_seconds
        + least(90, greatest(0, extract(epoch from (v_now - app_usage_sessions.last_seen_at))::integer))
      ),
      last_seen_at = v_now,
      app_version = coalesce(excluded.app_version, app_usage_sessions.app_version);

  delete from public.app_usage_sessions
   where usage_date < v_usage_date - 180;
end;
$$;

create or replace function public.admin_list_app_usage_summary()
returns table (
  profile_id uuid,
  full_name text,
  role text,
  profile_status text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  active_seconds_today bigint,
  active_seconds_7d bigint,
  active_days_30d bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  return query
  with local_day as (
    select timezone('America/Sao_Paulo', now())::date as today
  )
  select p.id,
         p.full_name::text,
         p.role::text,
         p.status::text,
         min(u.started_at),
         max(u.last_seen_at),
         coalesce(sum(u.active_seconds) filter (where u.usage_date = d.today), 0)::bigint,
         coalesce(sum(u.active_seconds) filter (where u.usage_date >= d.today - 6), 0)::bigint,
         count(distinct u.usage_date) filter (where u.usage_date >= d.today - 29)::bigint
    from public.profiles p
    cross join local_day d
    left join public.app_usage_sessions u
      on u.user_id = p.id
     and u.usage_date >= d.today - 179
   where p.role in ('collaborator', 'receiver')
   group by p.id, p.full_name, p.role, p.status
   order by (max(u.last_seen_at) is null), max(u.last_seen_at) desc, p.full_name;
end;
$$;

revoke all privileges on function public.record_own_app_usage(text) from public, anon;
revoke all privileges on function public.admin_list_app_usage_summary() from public, anon;
grant execute on function public.record_own_app_usage(text) to authenticated;
grant execute on function public.admin_list_app_usage_summary() to authenticated;

commit;
