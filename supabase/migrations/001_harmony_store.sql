-- Harmony Store Oficial — estrutura inicial do sistema
-- Execute este arquivo no SQL Editor de um projeto Supabase novo.

create extension if not exists pgcrypto;

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'collaborator' check (role in ('admin', 'collaborator')),
  full_name text not null,
  username text not null,
  harmony_id text not null default ('HMY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  department text,
  phone text,
  cpf_hash text,
  cpf_last4 char(4),
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_primary_admin boolean not null default false,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (harmony_id),
  unique (cpf_hash)
);

create unique index if not exists profiles_username_lower_unique
on public.profiles (lower(username));

create or replace function public.create_profile_for_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Novo usuário'),
    lower(split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists create_profile_after_auth_user on auth.users;
create trigger create_profile_after_auth_user
after insert on auth.users
for each row execute function public.create_profile_for_new_auth_user();

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists categories_name_lower_unique
on public.categories (lower(name));

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references public.categories(id) on delete set null,
  color text,
  description text,
  unit text not null check (unit in ('unidade', 'quilo', 'cm', 'metro', 'rolo', 'garrafa', 'caixa')),
  physical_stock numeric(14,3) not null default 0 check (physical_stock >= 0),
  reserved_stock numeric(14,3) not null default 0 check (reserved_stock >= 0 and reserved_stock <= physical_stock),
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock >= 0),
  image_path text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('product', 'profile')),
  label text not null,
  field_key text not null,
  field_type text not null check (field_type in ('text', 'number', 'date', 'select', 'textarea', 'boolean')),
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (scope, field_key)
);

create table if not exists public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.custom_field_definitions(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((product_id is not null)::integer + (profile_id is not null)::integer = 1),
  unique nulls not distinct (definition_id, product_id, profile_id)
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'separating', 'scheduled', 'delivered', 'cancelled')),
  notes text,
  admin_notes text,
  fulfillment_method text check (fulfillment_method in ('delivery', 'pickup')),
  scheduled_for timestamptz,
  separated_by uuid references public.profiles(id) on delete set null,
  delivered_by_name text,
  received_by_name text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (protocol)
);

create table if not exists public.request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  requested_quantity numeric(14,3) not null check (requested_quantity > 0),
  approved_quantity numeric(14,3) check (approved_quantity >= 0 and approved_quantity <= requested_quantity),
  removed_by_admin boolean not null default false,
  admin_note text,
  created_at timestamptz not null default now(),
  unique (request_id, product_id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  request_id uuid references public.requests(id) on delete set null,
  movement_type text not null check (movement_type in ('entry', 'reserve', 'release', 'delivery', 'adjustment')),
  quantity numeric(14,3) not null check (quantity > 0),
  reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists requests_requested_by_idx on public.requests(requested_by);
create index if not exists requests_status_idx on public.requests(status);
create index if not exists request_items_request_idx on public.request_items(request_id);
create index if not exists stock_movements_product_idx on public.stock_movements(product_id);

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and status = 'active') $$;

create or replace function private.is_primary_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and status = 'active' and is_primary_admin) $$;

revoke all on function private.is_admin() from public;
revoke all on function private.is_primary_admin() from public;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_primary_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_values enable row level security;
alter table public.requests enable row level security;
alter table public.request_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profile: own or admin read" on public.profiles;
drop policy if exists "profile: primary admin update" on public.profiles;
drop policy if exists "profile: primary admin delete" on public.profiles;
drop policy if exists "category: authenticated read" on public.categories;
drop policy if exists "category: admin insert" on public.categories;
drop policy if exists "category: admin update" on public.categories;
drop policy if exists "category: admin delete" on public.categories;
drop policy if exists "product: authenticated read" on public.products;
drop policy if exists "product: admin insert" on public.products;
drop policy if exists "product: admin update" on public.products;
drop policy if exists "product: admin delete" on public.products;
drop policy if exists "field definition: authenticated read" on public.custom_field_definitions;
drop policy if exists "field definition: admin all" on public.custom_field_definitions;
drop policy if exists "field value: authenticated read" on public.custom_field_values;
drop policy if exists "field value: admin all" on public.custom_field_values;
drop policy if exists "request: own or admin read" on public.requests;
drop policy if exists "request: collaborator create own" on public.requests;
drop policy if exists "request: admin update" on public.requests;
drop policy if exists "request: admin delete" on public.requests;
drop policy if exists "request item: parent owner or admin read" on public.request_items;
drop policy if exists "request item: owner inserts pending" on public.request_items;
drop policy if exists "request item: admin update" on public.request_items;
drop policy if exists "request item: admin delete" on public.request_items;
drop policy if exists "movement: admin read" on public.stock_movements;
drop policy if exists "movement: admin write" on public.stock_movements;
drop policy if exists "audit: admin read" on public.audit_logs;
drop policy if exists "audit: authenticated insert self" on public.audit_logs;

create policy "profile: own or admin read" on public.profiles for select to authenticated
using ((select auth.uid()) = id or (select private.is_admin()));
create policy "profile: primary admin update" on public.profiles for update to authenticated
using ((select private.is_primary_admin())) with check ((select private.is_primary_admin()));
create policy "profile: primary admin delete" on public.profiles for delete to authenticated
using ((select private.is_primary_admin()) and not is_primary_admin);

create policy "category: authenticated read" on public.categories for select to authenticated using (true);
create policy "category: admin insert" on public.categories for insert to authenticated with check ((select private.is_admin()));
create policy "category: admin update" on public.categories for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "category: admin delete" on public.categories for delete to authenticated using ((select private.is_admin()));

create policy "product: authenticated read" on public.products for select to authenticated using (active or (select private.is_admin()));
create policy "product: admin insert" on public.products for insert to authenticated with check ((select private.is_admin()));
create policy "product: admin update" on public.products for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "product: admin delete" on public.products for delete to authenticated using ((select private.is_admin()));

create policy "field definition: authenticated read" on public.custom_field_definitions for select to authenticated using (active or (select private.is_admin()));
create policy "field definition: admin all" on public.custom_field_definitions for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "field value: authenticated read" on public.custom_field_values for select to authenticated
using ((product_id is not null) or profile_id = (select auth.uid()) or (select private.is_admin()));
create policy "field value: admin all" on public.custom_field_values for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "request: own or admin read" on public.requests for select to authenticated
using (requested_by = (select auth.uid()) or (select private.is_admin()));
create policy "request: collaborator create own" on public.requests for insert to authenticated
with check (requested_by = (select auth.uid()) and status = 'pending');
create policy "request: admin update" on public.requests for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "request: admin delete" on public.requests for delete to authenticated using ((select private.is_admin()));

create policy "request item: parent owner or admin read" on public.request_items for select to authenticated
using (exists(select 1 from public.requests r where r.id = request_id and (r.requested_by = (select auth.uid()) or (select private.is_admin()))));
create policy "request item: owner inserts pending" on public.request_items for insert to authenticated
with check (exists(select 1 from public.requests r where r.id = request_id and r.requested_by = (select auth.uid()) and r.status = 'pending'));
create policy "request item: admin update" on public.request_items for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "request item: admin delete" on public.request_items for delete to authenticated using ((select private.is_admin()));

create policy "movement: admin read" on public.stock_movements for select to authenticated using ((select private.is_admin()));
create policy "movement: admin write" on public.stock_movements for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "audit: admin read" on public.audit_logs for select to authenticated using ((select private.is_admin()));
create policy "audit: authenticated insert self" on public.audit_logs for insert to authenticated with check (actor_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product images: public read" on storage.objects;
drop policy if exists "product images: admin insert" on storage.objects;
drop policy if exists "product images: admin update" on storage.objects;
drop policy if exists "product images: admin delete" on storage.objects;

create policy "product images: public read" on storage.objects for select to public using (bucket_id = 'product-images');
create policy "product images: admin insert" on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and (select private.is_admin()));
create policy "product images: admin update" on storage.objects for update to authenticated
using (bucket_id = 'product-images' and (select private.is_admin())) with check (bucket_id = 'product-images' and (select private.is_admin()));
create policy "product images: admin delete" on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and (select private.is_admin()));

insert into public.categories(name) values ('Essências'), ('Embalagens'), ('Bases'), ('Corantes'), ('Acessórios')
on conflict do nothing;
