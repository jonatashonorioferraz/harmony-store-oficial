-- Harmony Store Oficial — Fase 2B, estágio final de segurança.
-- Aplicar somente depois de publicar o app v24 e a Edge Function compatível.

begin;

alter table public.audit_logs alter column origin set default 'database';

drop policy if exists "audit: authenticated insert self" on public.audit_logs;
revoke insert, update, delete, truncate on table public.audit_logs from authenticated;
revoke usage, select on sequence public.audit_logs_id_seq from authenticated;

revoke all privileges on table public.audit_logs from service_role;
grant select, insert on table public.audit_logs to service_role;
grant usage, select on sequence public.audit_logs_id_seq to service_role;

revoke insert, update, delete on table public.products from authenticated;
revoke insert, update, delete on table public.stock_movements from authenticated;

-- Buckets públicos não precisam de política SELECT para servir uma URL conhecida.
-- A remoção bloqueia listagem geral sem quebrar as fotos do catálogo.
drop policy if exists "product images: public read" on storage.objects;
drop policy if exists "profile images: public read" on storage.objects;

-- Fotos pessoais exigem sessão e autorização por usuário/papel.
update storage.buckets set public = false where id = 'profile-images';

drop policy if exists "profile images: authenticated read" on storage.objects;
create policy "profile images: authenticated read"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-images'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists(
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'active'
        and p.role in ('admin','receiver')
    )
  )
);

notify pgrst, 'reload schema';

commit;
