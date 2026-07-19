-- Harmony Store Oficial — Ideias e Evolução
-- Central administrativa de melhorias, histórico automático e anexos privados.

begin;

create table if not exists public.improvement_ideas (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 10 and 5000),
  problem text check (problem is null or char_length(problem) <= 3000),
  area text not null default 'geral' check (area in (
    'geral','solicitacoes','produtos','producao','pagamentos',
    'relatorios','usuarios','inteligencia','outro'
  )),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'new' check (status in (
    'new','analysis','approved','development','completed','discarded'
  )),
  review_notes text check (review_notes is null or char_length(review_notes) <= 3000),
  attachment_path text check (attachment_path is null or char_length(attachment_path) <= 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.improvement_idea_events (
  id bigint generated always as identity primary key,
  idea_id uuid not null references public.improvement_ideas(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('created','updated','status_changed')),
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists improvement_ideas_status_created_idx
  on public.improvement_ideas(status, created_at desc);
create index if not exists improvement_ideas_created_by_idx
  on public.improvement_ideas(created_by);
create index if not exists improvement_idea_events_idea_created_idx
  on public.improvement_idea_events(idea_id, created_at desc);
create index if not exists improvement_idea_events_actor_idx
  on public.improvement_idea_events(actor_id);

create or replace function private.protect_improvement_idea_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'O autor da ideia não pode ser alterado.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.record_improvement_idea_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'created';
    insert into public.improvement_idea_events(
      idea_id, actor_id, event_type, to_status, note
    ) values (
      new.id, (select auth.uid()), v_event, new.status, new.review_notes
    );
  else
    v_event := case
      when old.status is distinct from new.status then 'status_changed'
      else 'updated'
    end;
    insert into public.improvement_idea_events(
      idea_id, actor_id, event_type, from_status, to_status, note
    ) values (
      new.id, (select auth.uid()), v_event, old.status, new.status,
      case when old.review_notes is distinct from new.review_notes then new.review_notes else null end
    );
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    (select auth.uid()), 'improvement_idea.' || v_event, 'improvement_idea', new.id::text,
    jsonb_build_object('protocol', new.protocol, 'status', new.status, 'area', new.area)
  );
  return new;
end;
$$;

drop trigger if exists protect_improvement_idea_owner on public.improvement_ideas;
create trigger protect_improvement_idea_owner
before update on public.improvement_ideas
for each row execute function private.protect_improvement_idea_owner();

drop trigger if exists touch_improvement_ideas_updated_at on public.improvement_ideas;
create trigger touch_improvement_ideas_updated_at
before update on public.improvement_ideas
for each row execute function public.touch_updated_at();

drop trigger if exists record_improvement_idea_event on public.improvement_ideas;
create trigger record_improvement_idea_event
after insert or update on public.improvement_ideas
for each row execute function private.record_improvement_idea_event();

alter table public.improvement_ideas enable row level security;
alter table public.improvement_idea_events enable row level security;

drop policy if exists "improvement idea: admin read" on public.improvement_ideas;
drop policy if exists "improvement idea: admin insert" on public.improvement_ideas;
drop policy if exists "improvement idea: admin update" on public.improvement_ideas;
drop policy if exists "improvement idea event: admin read" on public.improvement_idea_events;

create policy "improvement idea: admin read"
on public.improvement_ideas for select to authenticated
using ((select private.is_admin()));

create policy "improvement idea: admin insert"
on public.improvement_ideas for insert to authenticated
with check ((select private.is_admin()) and created_by = (select auth.uid()));

create policy "improvement idea: admin update"
on public.improvement_ideas for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "improvement idea event: admin read"
on public.improvement_idea_events for select to authenticated
using ((select private.is_admin()));

revoke all on table public.improvement_ideas from anon, authenticated;
revoke all on table public.improvement_idea_events from anon, authenticated;
grant select, insert, update on table public.improvement_ideas to authenticated;
grant select on table public.improvement_idea_events to authenticated;

revoke all on function private.protect_improvement_idea_owner() from public, anon, authenticated;
revoke all on function private.record_improvement_idea_event() from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'idea-attachments','idea-attachments',false,3145728,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "idea attachments: admin read" on storage.objects;
drop policy if exists "idea attachments: admin insert" on storage.objects;
drop policy if exists "idea attachments: admin update" on storage.objects;
drop policy if exists "idea attachments: admin delete" on storage.objects;

create policy "idea attachments: admin read"
on storage.objects for select to authenticated
using (bucket_id = 'idea-attachments' and (select private.is_admin()));

create policy "idea attachments: admin insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'idea-attachments'
  and (select private.is_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "idea attachments: admin update"
on storage.objects for update to authenticated
using (bucket_id = 'idea-attachments' and (select private.is_admin()))
with check (
  bucket_id = 'idea-attachments'
  and (select private.is_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "idea attachments: admin delete"
on storage.objects for delete to authenticated
using (bucket_id = 'idea-attachments' and (select private.is_admin()));

notify pgrst, 'reload schema';

commit;
