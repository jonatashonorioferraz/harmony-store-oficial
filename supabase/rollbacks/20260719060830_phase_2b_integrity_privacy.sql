-- Rollback operacional da Fase 2B.
-- Mantém RPCs e colunas aditivas para que o app v24 continue funcionando,
-- mas reabre temporariamente o modelo v23 de escrita/leitura direta.

begin;

drop trigger if exists block_audit_log_update_delete on public.audit_logs;
drop trigger if exists block_audit_log_truncate on public.audit_logs;

drop policy if exists "audit: authenticated insert self" on public.audit_logs;
create policy "audit: authenticated insert self"
on public.audit_logs for insert to authenticated
with check (actor_id = (select auth.uid()));

grant select, insert on table public.audit_logs to authenticated;
grant usage, select on sequence public.audit_logs_id_seq to authenticated;
grant all privileges on table public.audit_logs to service_role;

grant insert, update, delete on table public.products to authenticated;
grant insert, update, delete on table public.stock_movements to authenticated;

update storage.buckets set public = true where id = 'profile-images';

drop policy if exists "profile images: authenticated read" on storage.objects;
drop policy if exists "profile images: public read" on storage.objects;
create policy "profile images: public read"
on storage.objects for select to public
using (bucket_id = 'profile-images');

drop policy if exists "product images: public read" on storage.objects;
create policy "product images: public read"
on storage.objects for select to public
using (bucket_id = 'product-images');

notify pgrst, 'reload schema';

commit;
