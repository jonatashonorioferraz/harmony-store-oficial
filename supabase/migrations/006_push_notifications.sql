-- Harmony Store Oficial — inscrições seguras para notificações push.
-- Execute este arquivo uma vez no SQL Editor do Supabase.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subscriptions: own read" on public.push_subscriptions;
create policy "push subscriptions: own read"
on public.push_subscriptions for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.save_own_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  result uuid;
begin
  if user_id is null then raise exception 'Sessão inválida.'; end if;
  if nullif(trim(p_endpoint), '') is null or nullif(trim(p_p256dh), '') is null or nullif(trim(p_auth), '') is null then
    raise exception 'Inscrição de notificação inválida.';
  end if;

  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
  values (user_id, trim(p_endpoint), trim(p_p256dh), trim(p_auth), nullif(trim(p_user_agent), ''))
  on conflict (endpoint) do update
     set user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         updated_at = now()
  returning id into result;

  return result;
end;
$$;

create or replace function public.remove_own_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
   where user_id = (select auth.uid())
     and endpoint = p_endpoint;
$$;

revoke all on function public.save_own_push_subscription(text,text,text,text) from public;
revoke all on function public.remove_own_push_subscription(text) from public;
grant execute on function public.save_own_push_subscription(text,text,text,text) to authenticated;
grant execute on function public.remove_own_push_subscription(text) to authenticated;

