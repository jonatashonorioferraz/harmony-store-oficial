begin;

alter table public.products
  add column if not exists replenishment_mode text not null default 'purchase';

alter table public.products drop constraint if exists products_replenishment_mode_check;
alter table public.products add constraint products_replenishment_mode_check
  check (replenishment_mode in ('purchase','production'));

alter table public.requests
  add column if not exists separation_checkup_completed_at timestamptz;

create table if not exists public.separation_checkup_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  request_item_id uuid not null references public.request_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','separated','out_of_stock')),
  note text,
  checked_by uuid references public.profiles(id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, request_item_id)
);

create table if not exists public.stock_discrepancies (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  request_id uuid references public.requests(id) on delete set null,
  request_item_id uuid references public.request_items(id) on delete set null,
  discrepancy_type text not null check (discrepancy_type in ('count_difference','out_of_stock')),
  system_stock numeric(14,3) not null check (system_stock >= 0),
  counted_stock numeric(14,3) not null check (counted_stock >= 0),
  difference numeric(14,3) not null,
  reason text not null,
  status text not null default 'open' check (status in ('open','reviewed','adjusted')),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text
);

create table if not exists public.stock_replenishment_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  source_request_id uuid references public.requests(id) on delete set null,
  source_request_item_id uuid references public.request_items(id) on delete set null,
  replenishment_type text not null check (replenishment_type in ('purchase','production')),
  requested_quantity numeric(14,3) not null check (requested_quantity > 0),
  reason text not null,
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  completion_note text
);

create index if not exists separation_checkup_request_idx on public.separation_checkup_items(request_id,status);
create index if not exists stock_discrepancies_status_idx on public.stock_discrepancies(status,recorded_at desc);
create index if not exists stock_replenishment_status_idx on public.stock_replenishment_requests(status,created_at desc);
create unique index if not exists stock_replenishment_one_open_per_product_idx
  on public.stock_replenishment_requests(product_id) where status in ('open','in_progress');

alter table public.separation_checkup_items enable row level security;
alter table public.stock_discrepancies enable row level security;
alter table public.stock_replenishment_requests enable row level security;

drop policy if exists "separation checkup admin read" on public.separation_checkup_items;
create policy "separation checkup admin read" on public.separation_checkup_items
  for select to authenticated using ((select private.is_admin()));
drop policy if exists "stock discrepancies admin read" on public.stock_discrepancies;
create policy "stock discrepancies admin read" on public.stock_discrepancies
  for select to authenticated using ((select private.is_admin()));
drop policy if exists "stock replenishment admin read" on public.stock_replenishment_requests;
create policy "stock replenishment admin read" on public.stock_replenishment_requests
  for select to authenticated using ((select private.is_admin()));

revoke all on table public.separation_checkup_items from public,anon,authenticated;
revoke all on table public.stock_discrepancies from public,anon,authenticated;
revoke all on table public.stock_replenishment_requests from public,anon,authenticated;
grant select on table public.separation_checkup_items to authenticated;
grant select on table public.stock_discrepancies to authenticated;
grant select on table public.stock_replenishment_requests to authenticated;
grant all privileges on table public.separation_checkup_items to service_role;
grant all privileges on table public.stock_discrepancies to service_role;
grant all privileges on table public.stock_replenishment_requests to service_role;

create or replace function public.list_material_separation_checkup(p_request_id uuid)
returns table(request_item_id uuid,status text,note text,checked_at timestamptz,checked_by_name text)
language sql security definer set search_path = '' stable as $$
  select c.request_item_id,c.status,c.note,c.checked_at,p.full_name
  from public.separation_checkup_items c
  left join public.profiles p on p.id=c.checked_by
  where c.request_id=p_request_id and (select private.is_admin())
  order by c.created_at;
$$;

create or replace function public.admin_set_product_replenishment_mode(p_product_id uuid,p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_mode not in ('purchase','production') then raise exception 'Tipo de reposição inválido.'; end if;
  update public.products set replenishment_mode=p_mode,updated_at=now() where id=p_product_id;
  if not found then raise exception 'Produto não localizado.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values((select auth.uid()),'product.replenishment_mode_changed','product',p_product_id::text,'database',jsonb_build_object('mode',p_mode));
end;
$$;

create or replace function public.admin_set_material_separation_item(
  p_request_id uuid,
  p_request_item_id uuid,
  p_status text,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_request_status text;
  v_item public.request_items;
  v_product public.products;
  v_existing text;
  v_own_reserved numeric(14,3) := 0;
  v_required numeric(14,3);
  v_replenishment_id uuid;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_status not in ('pending','separated','out_of_stock') then raise exception 'Situação de conferência inválida.'; end if;

  select status into v_request_status from public.requests where id=p_request_id for update;
  if v_request_status not in ('pending','separating') then raise exception 'O checklist só pode ser alterado antes do agendamento.'; end if;
  select * into v_item from public.request_items where id=p_request_item_id and request_id=p_request_id for update;
  if v_item.id is null then raise exception 'Item da solicitação não localizado.'; end if;
  select * into v_product from public.products where id=v_item.product_id for update;
  select status into v_existing from public.separation_checkup_items where request_id=p_request_id and request_item_id=p_request_item_id for update;
  if v_existing='out_of_stock' and p_status<>'out_of_stock' then
    raise exception 'O item já zerou o estoque. Corrija o estoque no cadastro antes de alterar esta marcação.';
  end if;

  if p_status='separated' then
    if v_request_status='separating' then v_own_reserved:=coalesce(v_item.approved_quantity,0); end if;
    v_required:=coalesce(v_item.approved_quantity,v_item.requested_quantity);
    if v_product.physical_stock-v_product.reserved_stock+v_own_reserved < v_required then
      raise exception 'Estoque insuficiente para %. Use Sem estoque ou registre uma divergência.',v_product.name;
    end if;
  elsif p_status='out_of_stock' then
    if nullif(trim(p_note),'') is null then raise exception 'Informe o motivo da falta de estoque.'; end if;
    if v_product.physical_stock>0 then
      insert into public.stock_movements(product_id,request_id,movement_type,quantity,reason,created_by)
      values(v_product.id,p_request_id,'adjustment',v_product.physical_stock,'Zerado durante o check-up de separação: '||trim(p_note),v_actor);
    end if;
    insert into public.stock_discrepancies(product_id,request_id,request_item_id,discrepancy_type,system_stock,counted_stock,difference,reason,recorded_by)
    values(v_product.id,p_request_id,v_item.id,'out_of_stock',v_product.physical_stock,0,-v_product.physical_stock,trim(p_note),v_actor);
    update public.products set physical_stock=0,reserved_stock=0,updated_at=now() where id=v_product.id;
    update public.request_items set approved_quantity=0,removed_by_admin=true,
      admin_note=concat_ws(E'\n',admin_note,'Sem estoque: '||trim(p_note)) where id=v_item.id;
    v_required:=greatest(v_item.requested_quantity,v_product.minimum_stock,1);
    select id into v_replenishment_id from public.stock_replenishment_requests
      where product_id=v_product.id and status in ('open','in_progress') for update;
    if v_replenishment_id is null then
      insert into public.stock_replenishment_requests(product_id,source_request_id,source_request_item_id,replenishment_type,requested_quantity,reason,created_by)
      values(v_product.id,p_request_id,v_item.id,v_product.replenishment_mode,v_required,'Estoque zerado durante a separação: '||trim(p_note),v_actor)
      returning id into v_replenishment_id;
    else
      update public.stock_replenishment_requests set requested_quantity=greatest(requested_quantity,v_required),
        source_request_id=p_request_id,source_request_item_id=v_item.id,
        reason=concat_ws(E'\n',reason,'Nova falta registrada: '||trim(p_note)),updated_at=now()
      where id=v_replenishment_id;
    end if;
  end if;

  insert into public.separation_checkup_items(request_id,request_item_id,product_id,status,note,checked_by,checked_at)
  values(p_request_id,v_item.id,v_product.id,p_status,nullif(trim(p_note),''),v_actor,case when p_status='pending' then null else now() end)
  on conflict(request_id,request_item_id) do update set status=excluded.status,note=excluded.note,
    checked_by=excluded.checked_by,checked_at=excluded.checked_at,updated_at=now();

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'request.separation_item_checked','request_item',v_item.id::text,'database',
    jsonb_build_object('request_id',p_request_id,'status',p_status,'replenishment_id',v_replenishment_id));
  return jsonb_build_object('status',p_status,'replenishment_id',v_replenishment_id);
end;
$$;

create or replace function public.admin_record_stock_discrepancy(
  p_request_id uuid,p_request_item_id uuid,p_counted_stock numeric,p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=(select auth.uid());v_item public.request_items;v_product public.products;v_id uuid;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_counted_stock<0 then raise exception 'A contagem encontrada não pode ser negativa.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Explique a divergência encontrada.'; end if;
  perform 1 from public.requests where id=p_request_id and status in ('pending','separating');
  if not found then raise exception 'Esta solicitação não aceita novas divergências.'; end if;
  select * into v_item from public.request_items where id=p_request_item_id and request_id=p_request_id;
  select * into v_product from public.products where id=v_item.product_id for update;
  if v_product.id is null then raise exception 'Produto não localizado.'; end if;
  if p_counted_stock=v_product.physical_stock then raise exception 'A contagem informada é igual ao estoque do sistema.'; end if;
  insert into public.stock_discrepancies(product_id,request_id,request_item_id,discrepancy_type,system_stock,counted_stock,difference,reason,recorded_by)
  values(v_product.id,p_request_id,v_item.id,'count_difference',v_product.physical_stock,p_counted_stock,p_counted_stock-v_product.physical_stock,trim(p_reason),v_actor)
  returning id into v_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'stock.discrepancy_recorded','stock_discrepancy',v_id::text,'database',jsonb_build_object('product_id',v_product.id,'difference',p_counted_stock-v_product.physical_stock));
  return v_id;
end;
$$;

create or replace function public.admin_finalize_material_separation(
  p_request_id uuid,p_items jsonb,p_admin_notes text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_missing integer;v_bad integer;v_request_status text;v_request_items integer;v_payload_items integer;
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select status into v_request_status from public.requests where id=p_request_id for update;
  if v_request_status is null then raise exception 'Solicitação não localizada.'; end if;
  if v_request_status not in ('pending','separating') then
    raise exception 'O check-up só pode ser finalizado antes do agendamento.';
  end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then
    raise exception 'A lista de itens da separação é inválida.';
  end if;
  select count(*) into v_request_items from public.request_items where request_id=p_request_id;
  select count(*) into v_payload_items
  from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(item_id uuid,approved_quantity numeric,removed boolean,admin_note text)
  join public.request_items i on i.id=x.item_id and i.request_id=p_request_id;
  if v_request_items=0 or v_payload_items<>v_request_items or v_payload_items<>jsonb_array_length(coalesce(p_items,'[]'::jsonb)) then
    raise exception 'A lista mudou durante a conferência. Feche, abra novamente e revise todos os itens.';
  end if;
  select count(*) into v_missing from public.request_items i
  left join public.separation_checkup_items c on c.request_id=i.request_id and c.request_item_id=i.id
  where i.request_id=p_request_id and coalesce(c.status,'pending') not in ('separated','out_of_stock');
  if v_missing>0 then raise exception 'Confira todos os itens antes de finalizar a separação.'; end if;
  select count(*) into v_bad from public.separation_checkup_items c
  join jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(item_id uuid,approved_quantity numeric,removed boolean,admin_note text)
    on x.item_id=c.request_item_id
  where c.request_id=p_request_id and c.status='out_of_stock'
    and (coalesce(x.approved_quantity,0)<>0 or not coalesce(x.removed,false));
  if v_bad>0 then raise exception 'Itens sem estoque devem permanecer zerados na separação.'; end if;
  perform public.admin_prepare_request(p_request_id,p_items,p_admin_notes);
  update public.requests set separation_checkup_completed_at=now() where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values((select auth.uid()),'request.separation_checkup_completed','request',p_request_id::text,'database',jsonb_build_object('items',jsonb_array_length(coalesce(p_items,'[]'::jsonb))));
end;
$$;

create or replace function public.admin_resolve_stock_discrepancy(p_discrepancy_id uuid,p_status text,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_status not in ('reviewed','adjusted') then raise exception 'Situação inválida.'; end if;
  if length(trim(coalesce(p_note,'')))<3 then raise exception 'Informe a conclusão da verificação.'; end if;
  update public.stock_discrepancies set status=p_status,reviewed_by=(select auth.uid()),reviewed_at=now(),review_note=trim(p_note)
    where id=p_discrepancy_id and status='open';
  if not found then raise exception 'Divergência não localizada ou já concluída.'; end if;
end;
$$;

create or replace function public.admin_update_replenishment_status(p_replenishment_id uuid,p_status text,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_status not in ('open','in_progress','completed','cancelled') then raise exception 'Situação inválida.'; end if;
  update public.stock_replenishment_requests set status=p_status,updated_at=now(),
    completed_by=case when p_status in ('completed','cancelled') then (select auth.uid()) else null end,
    completed_at=case when p_status in ('completed','cancelled') then now() else null end,
    completion_note=case when p_status in ('completed','cancelled') then nullif(trim(p_note),'') else completion_note end
  where id=p_replenishment_id;
  if not found then raise exception 'Reposição não localizada.'; end if;
end;
$$;

revoke all on function public.list_material_separation_checkup(uuid) from public,anon;
revoke all on function public.admin_set_product_replenishment_mode(uuid,text) from public,anon;
revoke all on function public.admin_set_material_separation_item(uuid,uuid,text,text) from public,anon;
revoke all on function public.admin_record_stock_discrepancy(uuid,uuid,numeric,text) from public,anon;
revoke all on function public.admin_finalize_material_separation(uuid,jsonb,text) from public,anon;
revoke all on function public.admin_resolve_stock_discrepancy(uuid,text,text) from public,anon;
revoke all on function public.admin_update_replenishment_status(uuid,text,text) from public,anon;
grant execute on function public.list_material_separation_checkup(uuid) to authenticated;
grant execute on function public.admin_set_product_replenishment_mode(uuid,text) to authenticated;
grant execute on function public.admin_set_material_separation_item(uuid,uuid,text,text) to authenticated;
grant execute on function public.admin_record_stock_discrepancy(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.admin_finalize_material_separation(uuid,jsonb,text) to authenticated;
grant execute on function public.admin_resolve_stock_discrepancy(uuid,text,text) to authenticated;
grant execute on function public.admin_update_replenishment_status(uuid,text,text) to authenticated;
grant execute on function public.list_material_separation_checkup(uuid) to service_role;
grant execute on function public.admin_set_product_replenishment_mode(uuid,text) to service_role;
grant execute on function public.admin_set_material_separation_item(uuid,uuid,text,text) to service_role;
grant execute on function public.admin_record_stock_discrepancy(uuid,uuid,numeric,text) to service_role;
grant execute on function public.admin_finalize_material_separation(uuid,jsonb,text) to service_role;
grant execute on function public.admin_resolve_stock_discrepancy(uuid,text,text) to service_role;
grant execute on function public.admin_update_replenishment_status(uuid,text,text) to service_role;

notify pgrst,'reload schema';
commit;
