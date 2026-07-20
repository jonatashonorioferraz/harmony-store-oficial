-- Harmony Store Oficial — catálogo global e visual de cores da produção.
-- Todas as cores ativas ficam automaticamente disponíveis para todos os modelos.

begin;

create table if not exists public.finished_production_colors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  hex_code text not null check (hex_code ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finished_production_colors_name_unique
  on public.finished_production_colors(lower(name));
create index if not exists finished_production_colors_active_sort_idx
  on public.finished_production_colors(active, sort_order, name);

drop trigger if exists finished_production_colors_touch_updated_at on public.finished_production_colors;
create trigger finished_production_colors_touch_updated_at
before update on public.finished_production_colors
for each row execute function public.touch_updated_at();

alter table public.finished_production_colors enable row level security;
revoke all privileges on table public.finished_production_colors from public, anon, authenticated;
grant all privileges on table public.finished_production_colors to service_role;

-- Preserva e padroniza as cores que já existiam em modelos ou recebimentos.
with extracted as (
  select trim(r.color) as name from public.finished_production_receipts r
  union all
  select trim(c.color) as name
  from public.finished_product_models m
  cross join lateral unnest(m.colors) as c(color)
), deduplicated as (
  select min(name) as name
  from extracted
  where nullif(trim(name),'') is not null
  group by lower(trim(name))
)
insert into public.finished_production_colors(name, hex_code, sort_order)
select name,
  case
    when lower(name) like 'branc%' then '#FFFFFF'
    when lower(name) like 'perol%' then '#F3EEE7'
    when lower(name) like 'azul%' then '#6797E9'
    when lower(name) like 'rosa%' then '#EE8FBB'
    when lower(name) like 'lil%' or lower(name) like 'rox%' then '#B58ADD'
    when lower(name) like 'verde%' then '#79B98A'
    when lower(name) like 'amarel%' then '#F1CF58'
    when lower(name) like 'vermelh%' then '#D95D68'
    when lower(name) like 'pret%' then '#2C272B'
    when lower(name) like 'marrom%' then '#8B5E4B'
    when lower(name) like 'laranj%' then '#F2A65A'
    when lower(name) like 'cinza%' then '#AAA4A8'
    when lower(name) like 'bege%' then '#DCC7A1'
    else '#D9A3BE'
  end,
  row_number() over(order by lower(name))::integer * 10
from deduplicated
on conflict do nothing;

create or replace function public.list_finished_production_colors()
returns table(id uuid, name text, hex_code text, active boolean, sort_order integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id=(select auth.uid()) and p.status='active';
  if v_role is null then raise exception 'Acesso negado.' using errcode='42501'; end if;

  return query
  select c.id,c.name,upper(c.hex_code),c.active,c.sort_order
  from public.finished_production_colors c
  where c.active or v_role in ('admin','receiver')
  order by c.active desc,c.sort_order,c.name;
end;
$$;

create or replace function public.admin_save_finished_production_color(
  p_color_id uuid,
  p_name text,
  p_hex_code text,
  p_active boolean default true,
  p_sort_order integer default 0
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if nullif(trim(p_name),'') is null or length(trim(p_name))>60 then raise exception 'Informe um nome de cor válido.'; end if;
  if upper(trim(coalesce(p_hex_code,''))) !~ '^#[0-9A-F]{6}$' then raise exception 'Informe uma tonalidade hexadecimal válida.'; end if;
  if coalesce(p_sort_order,0) not between 0 and 9999 then raise exception 'A ordem deve ficar entre 0 e 9999.'; end if;

  if p_color_id is null then
    insert into public.finished_production_colors(name,hex_code,active,sort_order,created_by)
    values(trim(p_name),upper(trim(p_hex_code)),coalesce(p_active,true),coalesce(p_sort_order,0),v_actor)
    returning id into v_id;
  else
    select to_jsonb(c) into v_before from public.finished_production_colors c where c.id=p_color_id for update;
    if v_before is null then raise exception 'Cor não localizada.' using errcode='P0002'; end if;
    update public.finished_production_colors
    set name=trim(p_name),hex_code=upper(trim(p_hex_code)),active=coalesce(p_active,true),sort_order=coalesce(p_sort_order,0)
    where id=p_color_id returning id into v_id;
  end if;

  select to_jsonb(c) into v_after from public.finished_production_colors c where c.id=v_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,case when p_color_id is null then 'production.color_created' else 'production.color_updated' end,
    'finished_production_color',v_id::text,jsonb_build_object('before',v_before,'after',v_after));
  return v_id;
exception when unique_violation then
  raise exception 'Já existe uma cor com este nome.';
end;
$$;

create or replace function public.admin_delete_finished_production_color(p_color_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_color public.finished_production_colors%rowtype;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select * into v_color from public.finished_production_colors where id=p_color_id for update;
  if not found then raise exception 'Cor não localizada.' using errcode='P0002'; end if;
  if exists(select 1 from public.finished_production_receipts r where lower(trim(r.color))=lower(trim(v_color.name))) then
    raise exception 'Esta cor já possui recebimentos. Deixe-a inativa para preservar o histórico.';
  end if;
  delete from public.finished_production_colors where id=p_color_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'production.color_deleted','finished_production_color',p_color_id::text,to_jsonb(v_color));
end;
$$;

create or replace function private.validate_finished_production_color()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canonical text;
begin
  select c.name into v_canonical
  from public.finished_production_colors c
  where lower(trim(c.name))=lower(trim(new.color));
  if v_canonical is null then
    raise exception 'Selecione uma cor cadastrada no catálogo da produção.';
  end if;
  new.color:=v_canonical;
  return new;
end;
$$;

drop trigger if exists validate_finished_production_color on public.finished_production_receipts;
create trigger validate_finished_production_color
before insert or update of color on public.finished_production_receipts
for each row execute function private.validate_finished_production_color();

revoke all on function public.list_finished_production_colors() from public,anon,authenticated;
revoke all on function public.admin_save_finished_production_color(uuid,text,text,boolean,integer) from public,anon,authenticated;
revoke all on function public.admin_delete_finished_production_color(uuid) from public,anon,authenticated;
revoke all on function private.validate_finished_production_color() from public,anon,authenticated;
grant execute on function public.list_finished_production_colors() to authenticated,service_role;
grant execute on function public.admin_save_finished_production_color(uuid,text,text,boolean,integer) to authenticated,service_role;
grant execute on function public.admin_delete_finished_production_color(uuid) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
