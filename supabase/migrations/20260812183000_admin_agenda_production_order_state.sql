-- Harmony Store Oficial - conclusão administrativa de ordens somente na Agenda Harmony.
-- A ordem de produção original permanece intacta; este estado controla apenas a visão da Agenda.

begin;

create table if not exists public.admin_agenda_production_order_states (
  production_order_id uuid primary key references public.production_orders(id) on delete cascade,
  agenda_status text not null default 'open'
    check (agenda_status in ('open','completed')),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_agenda_order_completion_check check (
    agenda_status <> 'completed' or (completed_at is not null and completed_by is not null)
  )
);

create table if not exists public.admin_agenda_production_order_events (
  id bigint generated always as identity primary key,
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('completed','reopened')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_agenda_order_states_status_updated_idx
  on public.admin_agenda_production_order_states(agenda_status, updated_at desc);
create index if not exists admin_agenda_order_events_order_created_idx
  on public.admin_agenda_production_order_events(production_order_id, created_at desc);
create index if not exists admin_agenda_order_events_actor_created_idx
  on public.admin_agenda_production_order_events(actor_id, created_at desc);

drop trigger if exists admin_agenda_order_states_touch_updated_at
  on public.admin_agenda_production_order_states;
create trigger admin_agenda_order_states_touch_updated_at
before update on public.admin_agenda_production_order_states
for each row execute function public.touch_updated_at();

alter table public.admin_agenda_production_order_states enable row level security;
alter table public.admin_agenda_production_order_events enable row level security;

revoke all privileges on table public.admin_agenda_production_order_states
  from public, anon, authenticated;
revoke all privileges on table public.admin_agenda_production_order_events
  from public, anon, authenticated;

grant select, insert, update on table public.admin_agenda_production_order_states
  to authenticated;
grant select, insert on table public.admin_agenda_production_order_events
  to authenticated;
grant all privileges on table public.admin_agenda_production_order_states
  to service_role;
grant all privileges on table public.admin_agenda_production_order_events
  to service_role;
grant usage, select on sequence public.admin_agenda_production_order_events_id_seq
  to authenticated, service_role;

drop policy if exists "admin agenda order states: admin read"
  on public.admin_agenda_production_order_states;
create policy "admin agenda order states: admin read"
on public.admin_agenda_production_order_states for select to authenticated
using ((select private.is_admin()));

drop policy if exists "admin agenda order states: admin insert"
  on public.admin_agenda_production_order_states;
create policy "admin agenda order states: admin insert"
on public.admin_agenda_production_order_states for insert to authenticated
with check ((select private.is_admin()));

drop policy if exists "admin agenda order states: admin update"
  on public.admin_agenda_production_order_states;
create policy "admin agenda order states: admin update"
on public.admin_agenda_production_order_states for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "admin agenda order events: admin read"
  on public.admin_agenda_production_order_events;
create policy "admin agenda order events: admin read"
on public.admin_agenda_production_order_events for select to authenticated
using ((select private.is_admin()));

drop policy if exists "admin agenda order events: admin insert"
  on public.admin_agenda_production_order_events;
create policy "admin agenda order events: admin insert"
on public.admin_agenda_production_order_events for insert to authenticated
with check (
  (select private.is_admin())
  and actor_id = (select auth.uid())
);

create or replace function public.admin_set_agenda_production_order_state(
  p_order_id uuid,
  p_status text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_order public.production_orders%rowtype;
  v_previous text;
  v_action text;
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_status not in ('open','completed') then
    raise exception 'Situação da Agenda inválida.' using errcode='22023';
  end if;

  select * into v_order
  from public.production_orders
  where id = p_order_id;
  if not found then
    raise exception 'Ordem de produção não localizada.' using errcode='P0002';
  end if;
  if v_order.status not in ('sent','viewed','acknowledged') then
    raise exception 'Somente ordens ativas podem ser alteradas na Agenda.';
  end if;

  select agenda_status into v_previous
  from public.admin_agenda_production_order_states
  where production_order_id = p_order_id;
  v_previous := coalesce(v_previous,'open');
  if v_previous = p_status then return; end if;

  if p_status = 'completed' then
    insert into public.admin_agenda_production_order_states(
      production_order_id, agenda_status, completed_at, completed_by,
      reopened_at, reopened_by
    ) values (p_order_id,'completed',now(),v_actor,null,null)
    on conflict (production_order_id) do update set
      agenda_status='completed', completed_at=now(), completed_by=v_actor,
      reopened_at=null, reopened_by=null;
    v_action := 'completed';
  else
    insert into public.admin_agenda_production_order_states(
      production_order_id, agenda_status, reopened_at, reopened_by
    ) values (p_order_id,'open',now(),v_actor)
    on conflict (production_order_id) do update set
      agenda_status='open', completed_at=null, completed_by=null,
      reopened_at=now(), reopened_by=v_actor;
    v_action := 'reopened';
  end if;

  insert into public.admin_agenda_production_order_events(
    production_order_id, actor_id, action, details
  ) values (
    p_order_id, v_actor, v_action,
    jsonb_build_object(
      'previous_status',v_previous,
      'agenda_status',p_status,
      'production_order_status',v_order.status,
      'production_order_protocol',v_order.protocol
    )
  );
end;
$$;

revoke all on function public.admin_set_agenda_production_order_state(uuid,text)
  from public, anon, authenticated;
grant execute on function public.admin_set_agenda_production_order_state(uuid,text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
