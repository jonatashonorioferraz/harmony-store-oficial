create table if not exists public.production_cost_catalog (
  id smallint primary key check (id = 1),
  revision bigint not null default 0 check (revision >= 0),
  catalog jsonb check (jsonb_typeof(catalog) = 'object' and octet_length(catalog::text) <= 1000000)
);
insert into public.production_cost_catalog(id) values (1) on conflict (id) do nothing;
alter table public.production_cost_catalog enable row level security;
revoke all on public.production_cost_catalog from public, anon, authenticated;
grant select, update (catalog, revision) on public.production_cost_catalog to authenticated;
drop policy if exists cost_catalog_read on public.production_cost_catalog;
create policy cost_catalog_read on public.production_cost_catalog for select to authenticated
using (exists (select 1 from public.profiles where id = (select auth.uid()) and status = 'active' and not coalesce(must_change_password,false)));
drop policy if exists cost_catalog_admin on public.production_cost_catalog;
create policy cost_catalog_admin on public.production_cost_catalog for update to authenticated
using (exists (select 1 from public.profiles where id = (select auth.uid()) and status = 'active' and role = 'admin' and not coalesce(must_change_password,false)))
with check (exists (select 1 from public.profiles where id = (select auth.uid()) and status = 'active' and role = 'admin' and not coalesce(must_change_password,false)));

