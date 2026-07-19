-- Harmony Store Oficial — fotos de perfil individuais.
-- Execute este arquivo uma vez no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile images: public read" on storage.objects;
drop policy if exists "profile images: owner insert" on storage.objects;
drop policy if exists "profile images: owner update" on storage.objects;
drop policy if exists "profile images: owner delete" on storage.objects;

create policy "profile images: public read"
on storage.objects for select to public
using (bucket_id = 'profile-images');

create policy "profile images: owner insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "profile images: owner update"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "profile images: owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.update_own_avatar(p_avatar_path text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
begin
  if user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  if p_avatar_path is not null
     and split_part(p_avatar_path, '/', 1) <> user_id::text then
    raise exception 'Caminho da foto inválido.';
  end if;

  update public.profiles
     set avatar_path = nullif(trim(p_avatar_path), '')
   where id = user_id;

  if not found then
    raise exception 'Perfil não localizado.';
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (user_id, 'profile.avatar_update', 'profile', user_id::text,
          jsonb_build_object('has_photo', p_avatar_path is not null));

  return p_avatar_path;
end;
$$;

revoke all on function public.update_own_avatar(text) from public;
grant execute on function public.update_own_avatar(text) to authenticated;
