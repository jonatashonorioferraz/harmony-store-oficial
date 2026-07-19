-- Harmony Store Oficial — Central de Notificações
-- Avisos internos persistentes, individuais ou globais, enviados somente pelo ADM principal.

begin;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 100),
  body text not null check (char_length(trim(body)) between 10 and 1200),
  priority text not null default 'important'
    check (priority in ('normal', 'important', 'urgent')),
  audience text not null check (audience in ('global', 'individual')),
  target_profile_id uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint app_notifications_target_check check (
    (audience = 'global' and target_profile_id is null)
    or (audience = 'individual' and target_profile_id is not null)
  )
);

create table if not exists public.app_notification_recipients (
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (notification_id, recipient_id)
);

create index if not exists app_notifications_created_idx
  on public.app_notifications(created_at desc);
create index if not exists app_notifications_target_created_idx
  on public.app_notifications(target_profile_id, created_at desc)
  where target_profile_id is not null;
create index if not exists app_notification_recipients_user_unread_idx
  on public.app_notification_recipients(recipient_id, created_at desc)
  where read_at is null;

alter table public.app_notifications enable row level security;
alter table public.app_notification_recipients enable row level security;

drop policy if exists "app notifications: recipient or primary admin read" on public.app_notifications;
create policy "app notifications: recipient or primary admin read"
on public.app_notifications for select to authenticated
using (
  (select private.is_primary_admin())
  or exists (
    select 1 from public.app_notification_recipients r
    where r.notification_id = id and r.recipient_id = (select auth.uid())
  )
);

drop policy if exists "app notification recipients: own or primary admin read" on public.app_notification_recipients;
create policy "app notification recipients: own or primary admin read"
on public.app_notification_recipients for select to authenticated
using (
  recipient_id = (select auth.uid())
  or (select private.is_primary_admin())
);

revoke all on table public.app_notifications from anon, authenticated;
revoke all on table public.app_notification_recipients from anon, authenticated;
grant select on table public.app_notifications to authenticated;
grant select on table public.app_notification_recipients to authenticated;

create or replace function public.primary_admin_send_notification(
  p_title text,
  p_body text,
  p_priority text default 'important',
  p_audience text default 'global',
  p_recipient_id uuid default null,
  p_due_at timestamptz default null
) returns table(notification_id uuid, recipient_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_notification_id uuid;
  v_count bigint;
begin
  if not (select private.is_primary_admin()) then
    raise exception 'Somente o ADM principal pode enviar notificações.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 3 and 100 then
    raise exception 'O título deve ter entre 3 e 100 caracteres.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 10 and 1200 then
    raise exception 'A mensagem deve ter entre 10 e 1200 caracteres.' using errcode = '22023';
  end if;
  if p_priority not in ('normal', 'important', 'urgent') then
    raise exception 'Prioridade inválida.' using errcode = '22023';
  end if;
  if p_audience not in ('global', 'individual') then
    raise exception 'Destinatário inválido.' using errcode = '22023';
  end if;
  if p_audience = 'individual' and not exists (
    select 1 from public.profiles
    where id = p_recipient_id and status = 'active' and role in ('collaborator', 'receiver')
  ) then
    raise exception 'Colaboradora não localizada ou inativa.' using errcode = '22023';
  end if;

  insert into public.app_notifications(
    title, body, priority, audience, target_profile_id, due_at, created_by
  ) values (
    trim(p_title), trim(p_body), p_priority, p_audience,
    case when p_audience = 'individual' then p_recipient_id else null end,
    p_due_at, v_actor
  ) returning id into v_notification_id;

  if p_audience = 'global' then
    insert into public.app_notification_recipients(notification_id, recipient_id)
    select v_notification_id, id
    from public.profiles
    where status = 'active' and role in ('collaborator', 'receiver');
  else
    insert into public.app_notification_recipients(notification_id, recipient_id)
    values (v_notification_id, p_recipient_id);
  end if;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Nenhuma colaboradora ativa encontrada.' using errcode = '22023';
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, origin, details)
  values (
    v_actor, 'app_notification.sent', 'app_notification', v_notification_id::text,
    'database', jsonb_build_object(
      'audience', p_audience, 'recipient_id', p_recipient_id,
      'priority', p_priority, 'recipient_count', v_count, 'due_at', p_due_at
    )
  );

  return query select v_notification_id, v_count;
end;
$$;

create or replace function public.list_app_notifications(p_limit integer default 100)
returns table(
  id uuid,
  title text,
  body text,
  priority text,
  audience text,
  target_profile_id uuid,
  target_name text,
  sender_name text,
  due_at timestamptz,
  created_at timestamptz,
  read_at timestamptz,
  recipient_count bigint,
  read_count bigint
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user uuid := (select auth.uid());
  v_is_primary boolean := (select private.is_primary_admin());
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 250);
begin
  if v_user is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if v_is_primary then
    return query
    select n.id, n.title, n.body, n.priority, n.audience,
      n.target_profile_id, target.full_name, sender.full_name,
      n.due_at, n.created_at, null::timestamptz,
      count(r.recipient_id)::bigint,
      count(r.read_at)::bigint
    from public.app_notifications n
    join public.profiles sender on sender.id = n.created_by
    left join public.profiles target on target.id = n.target_profile_id
    left join public.app_notification_recipients r on r.notification_id = n.id
    group by n.id, target.full_name, sender.full_name
    order by n.created_at desc
    limit v_limit;
  else
    return query
    select n.id, n.title, n.body, n.priority, n.audience,
      n.target_profile_id, target.full_name, sender.full_name,
      n.due_at, n.created_at, r.read_at,
      1::bigint, case when r.read_at is null then 0 else 1 end::bigint
    from public.app_notification_recipients r
    join public.app_notifications n on n.id = r.notification_id
    join public.profiles sender on sender.id = n.created_by
    left join public.profiles target on target.id = n.target_profile_id
    where r.recipient_id = v_user
    order by n.created_at desc
    limit v_limit;
  end if;
end;
$$;

create or replace function public.mark_app_notification_read(p_notification_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_read_at timestamptz;
begin
  update public.app_notification_recipients
  set read_at = coalesce(read_at, now())
  where notification_id = p_notification_id
    and recipient_id = (select auth.uid())
  returning read_at into v_read_at;
  if v_read_at is null then
    raise exception 'Notificação não localizada.' using errcode = 'P0002';
  end if;
  return v_read_at;
end;
$$;

create or replace function public.mark_all_app_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.app_notification_recipients
  set read_at = now()
  where recipient_id = (select auth.uid()) and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.primary_admin_send_notification(text,text,text,text,uuid,timestamptz)
  from public, anon;
revoke all on function public.list_app_notifications(integer) from public, anon;
revoke all on function public.mark_app_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_app_notifications_read() from public, anon;
grant execute on function public.primary_admin_send_notification(text,text,text,text,uuid,timestamptz)
  to authenticated;
grant execute on function public.list_app_notifications(integer) to authenticated;
grant execute on function public.mark_app_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_app_notifications_read() to authenticated;

notify pgrst, 'reload schema';

commit;
