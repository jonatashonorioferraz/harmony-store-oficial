-- Harmony Store Oficial — Fase 2B: integridade, auditoria e privacidade.
-- Compatível com o aplicativo v23 durante a implantação; o app v24 passa a usar
-- exclusivamente as RPCs transacionais criadas neste arquivo.

begin;

-- ---------------------------------------------------------------------------
-- Auditoria confiável e preparada para paginação.
-- ---------------------------------------------------------------------------

alter table public.audit_logs add column if not exists origin text;
alter table public.audit_logs add column if not exists correlation_id uuid;

update public.audit_logs set origin = 'legacy' where origin is null;
update public.audit_logs set correlation_id = gen_random_uuid() where correlation_id is null;

-- Durante a janela de compatibilidade, escritas do app v23 ficam marcadas como
-- legado. O segundo estágio troca o padrão para "database" após publicar v24.
alter table public.audit_logs alter column origin set default 'legacy';
alter table public.audit_logs alter column origin set not null;
alter table public.audit_logs alter column correlation_id set default gen_random_uuid();
alter table public.audit_logs alter column correlation_id set not null;

do $$ begin
  alter table public.audit_logs add constraint audit_logs_origin_check
    check (origin in ('database','edge','system','legacy'));
exception when duplicate_object then null; end $$;

create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_action_created_idx on public.audit_logs(action, created_at desc);
create unique index if not exists audit_logs_correlation_unique on public.audit_logs(correlation_id);

create or replace function private.block_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  if session_user = 'postgres'
     and current_setting('harmony.audit_maintenance', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'TRUNCATE' then return null; end if;
    return new;
  end if;
  raise exception 'O histórico de auditoria é imutável.' using errcode = '42501';
end;
$$;

revoke all on function private.block_audit_log_mutation() from public, anon, authenticated;

drop trigger if exists block_audit_log_update_delete on public.audit_logs;
create trigger block_audit_log_update_delete
before update or delete on public.audit_logs
for each row execute function private.block_audit_log_mutation();

drop trigger if exists block_audit_log_truncate on public.audit_logs;
create trigger block_audit_log_truncate
before truncate on public.audit_logs
for each statement execute function private.block_audit_log_mutation();

create or replace function public.admin_list_audit_logs(
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
) returns table(
  id bigint,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id text,
  details jsonb,
  origin text,
  correlation_id uuid,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = '' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.actor_id,
    coalesce(p.full_name, 'Sistema'),
    a.action,
    a.entity_type,
    a.entity_id,
    a.details,
    a.origin,
    a.correlation_id,
    a.created_at,
    count(*) over()
  from public.audit_logs a
  left join public.profiles p on p.id = a.actor_id
  where (p_from is null or a.created_at >= p_from)
    and (p_to is null or a.created_at <= p_to)
    and (
      v_search is null
      or a.action ilike '%' || v_search || '%'
      or a.entity_type ilike '%' || v_search || '%'
      or coalesce(a.entity_id, '') ilike '%' || v_search || '%'
      or coalesce(p.full_name, '') ilike '%' || v_search || '%'
    )
  order by a.created_at desc, a.id desc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.admin_list_audit_logs(integer,integer,text,timestamptz,timestamptz)
  from public, anon;
grant execute on function public.admin_list_audit_logs(integer,integer,text,timestamptz,timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Produto, estoque, campos personalizados e fornecedor em uma transação.
-- ---------------------------------------------------------------------------

create or replace function public.admin_save_product(
  p_product_id uuid,
  p_product jsonb,
  p_supplier_id uuid default null,
  p_custom_values jsonb default '[]'::jsonb,
  p_manage_supplier boolean default true
) returns uuid
language plpgsql
security definer
set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_old public.products%rowtype;
  v_new public.products%rowtype;
  v_old_supplier uuid;
  v_custom jsonb;
  v_category uuid := nullif(p_product->>'category_id', '')::uuid;
  v_physical numeric(14,3) := coalesce((p_product->>'physical_stock')::numeric, 0);
  v_reserved numeric(14,3) := coalesce((p_product->>'reserved_stock')::numeric, 0);
  v_minimum numeric(14,3) := coalesce((p_product->>'minimum_stock')::numeric, 0);
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if nullif(trim(p_product->>'name'), '') is null then
    raise exception 'Informe o nome do produto.' using errcode = '22023';
  end if;
  if (p_product->>'unit') not in ('unidade','quilo','cm','metro','rolo','garrafa','caixa') then
    raise exception 'Unidade inválida.' using errcode = '22023';
  end if;
  if v_physical < 0 or v_reserved < 0 or v_minimum < 0 or v_reserved > v_physical then
    raise exception 'Quantidades de estoque inválidas.' using errcode = '22023';
  end if;
  if v_category is not null and not exists(select 1 from public.categories where id = v_category) then
    raise exception 'Categoria inválida.' using errcode = '22023';
  end if;
  if p_manage_supplier and p_supplier_id is not null and not exists(
    select 1 from public.suppliers where id = p_supplier_id and active
  ) then
    raise exception 'Fornecedor inválido ou inativo.' using errcode = '22023';
  end if;

  if p_product_id is null then
    insert into public.products(
      name, category_id, unit, color, description, physical_stock,
      reserved_stock, minimum_stock, image_path, active, created_by
    ) values (
      trim(p_product->>'name'), v_category, p_product->>'unit',
      nullif(trim(p_product->>'color'), ''), nullif(trim(p_product->>'description'), ''),
      v_physical, v_reserved, v_minimum, nullif(p_product->>'image_path', ''),
      coalesce((p_product->>'active')::boolean, true), v_actor
    ) returning * into v_new;
    v_id := v_new.id;
  else
    select * into v_old from public.products where id = p_product_id for update;
    if not found then raise exception 'Produto não localizado.' using errcode = 'P0002'; end if;
    v_id := p_product_id;
    select sp.supplier_id into v_old_supplier
    from public.supplier_products sp
    where sp.product_id = v_id and sp.is_preferred
    order by sp.updated_at desc limit 1;

    update public.products set
      name = trim(p_product->>'name'),
      category_id = v_category,
      unit = p_product->>'unit',
      color = nullif(trim(p_product->>'color'), ''),
      description = nullif(trim(p_product->>'description'), ''),
      physical_stock = v_physical,
      reserved_stock = v_reserved,
      minimum_stock = v_minimum,
      image_path = case when p_product ? 'image_path'
        then nullif(p_product->>'image_path', '') else image_path end,
      active = coalesce((p_product->>'active')::boolean, active)
    where id = v_id
    returning * into v_new;

    if v_old.physical_stock is distinct from v_new.physical_stock then
      insert into public.stock_movements(
        product_id, movement_type, quantity, reason, created_by
      ) values (
        v_id, 'adjustment', abs(v_new.physical_stock - v_old.physical_stock),
        case when v_new.physical_stock > v_old.physical_stock
          then 'Ajuste manual de estoque: entrada'
          else 'Ajuste manual de estoque: saída' end,
        v_actor
      );
    end if;
  end if;

  if p_manage_supplier then
    update public.supplier_products set is_preferred = false
    where product_id = v_id and is_preferred;

    if p_supplier_id is not null then
      insert into public.supplier_products(supplier_id, product_id, is_preferred)
      values (p_supplier_id, v_id, true)
      on conflict(supplier_id, product_id) do update
        set is_preferred = true, updated_at = now();
    end if;
  end if;

  for v_custom in
    select value from jsonb_array_elements(coalesce(p_custom_values, '[]'::jsonb))
  loop
    if not exists(
      select 1 from public.custom_field_definitions d
      where d.id = (v_custom->>'definition_id')::uuid
        and d.scope = 'product' and d.active
    ) then
      raise exception 'Campo personalizado inválido.' using errcode = '22023';
    end if;
    insert into public.custom_field_values(definition_id, product_id, value)
    values ((v_custom->>'definition_id')::uuid, v_id, v_custom->'value')
    on conflict(definition_id, product_id, profile_id) do update
      set value = excluded.value, updated_at = now();
  end loop;

  if p_product_id is null then
    select * into v_new from public.products where id = v_id;
  end if;

  insert into public.audit_logs(
    actor_id, action, entity_type, entity_id, origin, details
  ) values (
    v_actor,
    case when p_product_id is null then 'product.created' else 'product.updated' end,
    'product', v_id::text, 'database',
    jsonb_build_object(
      'before', case when p_product_id is null then null else to_jsonb(v_old) end,
      'after', to_jsonb(v_new),
      'supplier_before', v_old_supplier,
      'supplier_after', case when p_manage_supplier then p_supplier_id else v_old_supplier end
    )
  );

  return v_id;
end;
$$;

create or replace function public.admin_delete_product(p_product_id uuid)
returns text
language plpgsql
security definer
set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_old public.products%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into v_old from public.products where id = p_product_id for update;
  if not found then raise exception 'Produto não localizado.' using errcode = 'P0002'; end if;

  delete from public.products where id = p_product_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, origin, details)
  values (v_actor, 'product.deleted', 'product', p_product_id::text, 'database',
          jsonb_build_object('before', to_jsonb(v_old)));
  return v_old.image_path;
end;
$$;

create or replace function public.admin_update_product_planning(
  p_product_id uuid,
  p_safety_stock numeric,
  p_lead_time_days integer,
  p_unit_cost numeric
) returns void
language plpgsql
security definer
set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_before jsonb;
  v_after jsonb;
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_safety_stock < 0 or p_lead_time_days not between 1 and 365 or p_unit_cost < 0 then
    raise exception 'Parâmetros de planejamento inválidos.' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'safety_stock', safety_stock, 'lead_time_days', lead_time_days, 'unit_cost', unit_cost
  ) into v_before from public.products where id = p_product_id for update;
  if not found then raise exception 'Produto não localizado.' using errcode = 'P0002'; end if;

  update public.products set
    safety_stock = p_safety_stock,
    lead_time_days = p_lead_time_days,
    unit_cost = p_unit_cost
  where id = p_product_id;

  v_after := jsonb_build_object(
    'safety_stock', p_safety_stock, 'lead_time_days', p_lead_time_days, 'unit_cost', p_unit_cost
  );
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, origin, details)
  values (v_actor, 'product.planning_updated', 'product', p_product_id::text, 'database',
          jsonb_build_object('before', v_before, 'after', v_after));
end;
$$;

revoke all on function public.admin_save_product(uuid,jsonb,uuid,jsonb,boolean) from public, anon;
revoke all on function public.admin_delete_product(uuid) from public, anon;
revoke all on function public.admin_update_product_planning(uuid,numeric,integer,numeric) from public, anon;
grant execute on function public.admin_save_product(uuid,jsonb,uuid,jsonb,boolean) to authenticated;
grant execute on function public.admin_delete_product(uuid) to authenticated;
grant execute on function public.admin_update_product_planning(uuid,numeric,integer,numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Versão do hash de CPF. O segredo HMAC vive somente na Edge Function.
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists cpf_hash_version text;
update public.profiles set cpf_hash_version = 'sha256-v1'
where cpf_hash is not null and cpf_hash_version is null;

notify pgrst, 'reload schema';

commit;
