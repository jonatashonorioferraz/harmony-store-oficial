-- Harmony Store Oficial - Central de Transferencias
-- Evolucao aditiva do fluxo de reservas do Inventario de Producao.

begin;

alter table public.shipping_inventory_requests
  add column if not exists source_type text,
  add column if not exists title text,
  add column if not exists purpose text,
  add column if not exists needed_on date,
  add column if not exists priority text,
  add column if not exists dispatched_by uuid references public.profiles(id) on delete restrict,
  add column if not exists dispatched_at timestamptz,
  add column if not exists received_by uuid references public.profiles(id) on delete restrict,
  add column if not exists received_at timestamptz,
  add column if not exists receipt_notes text;

update public.shipping_inventory_requests r
set source_type='shipping_plan',
    purpose='full_shipping',
    priority='normal',
    title=coalesce(nullif(trim(p.title),''),'Plano de envio #'||p.protocol::text),
    dispatched_by=case when r.status='transferred' then r.transferred_by else r.dispatched_by end,
    dispatched_at=case when r.status='transferred' then r.transferred_at else r.dispatched_at end,
    received_by=case when r.status='transferred' then r.transferred_by else r.received_by end,
    received_at=case when r.status='transferred' then r.transferred_at else r.received_at end
from public.shipping_plans p
where p.id=r.plan_id
  and (r.source_type is null or r.purpose is null or r.priority is null or r.title is null
       or (r.status='transferred' and r.received_at is null));

alter table public.shipping_inventory_requests
  alter column source_type set default 'shipping_plan',
  alter column source_type set not null,
  alter column purpose set default 'full_shipping',
  alter column purpose set not null,
  alter column priority set default 'normal',
  alter column priority set not null,
  alter column title set not null,
  alter column status set default 'requested',
  alter column plan_id drop not null,
  alter column plan_item_id drop not null;

alter table public.shipping_inventory_requests
  drop constraint if exists shipping_inventory_requests_status_check,
  drop constraint if exists shipping_inventory_requests_state_check,
  drop constraint if exists shipping_inventory_requests_source_type_check,
  drop constraint if exists shipping_inventory_requests_purpose_check,
  drop constraint if exists shipping_inventory_requests_priority_check,
  drop constraint if exists shipping_inventory_requests_title_check,
  drop constraint if exists shipping_inventory_requests_receipt_notes_check,
  drop constraint if exists shipping_inventory_requests_source_reference_check,
  drop constraint if exists shipping_inventory_requests_lifecycle_check,
  add constraint shipping_inventory_requests_status_check
    check (status in ('requested','partially_reserved','reserved','in_transit','received','transferred','cancelled')),
  add constraint shipping_inventory_requests_source_type_check
    check (source_type in ('shipping_plan','manual')),
  add constraint shipping_inventory_requests_purpose_check
    check (purpose in ('full_shipping','routine_restock','campaign','ad_hoc','shipping_plan')),
  add constraint shipping_inventory_requests_priority_check
    check (priority in ('low','normal','high','urgent')),
  add constraint shipping_inventory_requests_title_check
    check (char_length(trim(title)) between 2 and 140),
  add constraint shipping_inventory_requests_receipt_notes_check
    check (char_length(coalesce(receipt_notes,'')) <= 1200),
  add constraint shipping_inventory_requests_source_reference_check
    check ((source_type='shipping_plan' and plan_id is not null and plan_item_id is not null)
        or (source_type='manual' and plan_id is null and plan_item_id is null)),
  add constraint shipping_inventory_requests_lifecycle_check check (
    (status in ('requested','partially_reserved','reserved') and dispatched_at is null and received_at is null and cancelled_at is null)
    or (status='in_transit' and dispatched_at is not null and dispatched_by is not null and received_at is null and cancelled_at is null)
    or (status in ('received','transferred') and dispatched_at is not null and dispatched_by is not null and received_at is not null and received_by is not null and cancelled_at is null)
    or (status='cancelled' and cancelled_at is not null and cancelled_by is not null and dispatched_at is null and received_at is null)
  );

drop index if exists public.shipping_inventory_requests_active_item_uidx;
create unique index shipping_inventory_requests_active_item_uidx
  on public.shipping_inventory_requests(plan_item_id)
  where plan_item_id is not null and status in ('requested','partially_reserved','reserved','in_transit');
create index if not exists shipping_inventory_requests_needed_on_idx
  on public.shipping_inventory_requests(needed_on,status,priority);

create table if not exists public.shipping_inventory_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.shipping_inventory_requests(id) on delete cascade,
  plan_component_id uuid references public.shipping_plan_item_components(id) on delete restrict,
  model_id uuid not null references public.finished_product_models(id) on delete restrict,
  color_id uuid not null references public.finished_production_colors(id) on delete restrict,
  required_quantity bigint not null check (required_quantity>0),
  position smallint not null default 0 check (position>=0),
  notes text check (char_length(coalesce(notes,''))<=500),
  created_at timestamptz not null default now(),
  unique(request_id,model_id,color_id,position)
);

create index if not exists shipping_inventory_request_items_request_idx
  on public.shipping_inventory_request_items(request_id,position);
create index if not exists shipping_inventory_request_items_lookup_idx
  on public.shipping_inventory_request_items(model_id,color_id);

insert into public.shipping_inventory_request_items(
  request_id,plan_component_id,model_id,color_id,required_quantity,position
)
select r.id,pc.id,pc.model_id,pc.color_id,
       pc.units_per_volume::bigint*i.volume_quantity::bigint,pc.position
from public.shipping_inventory_requests r
join public.shipping_plan_items i on i.id=r.plan_item_id
join public.shipping_plan_item_components pc on pc.plan_item_id=i.id
where not exists(
  select 1 from public.shipping_inventory_request_items ri
  where ri.request_id=r.id and ri.plan_component_id=pc.id
)
on conflict do nothing;

alter table public.shipping_inventory_request_boxes
  add column if not exists request_item_id uuid references public.shipping_inventory_request_items(id) on delete restrict;

update public.shipping_inventory_request_boxes rb
set request_item_id=ri.id
from public.shipping_inventory_request_items ri
where rb.request_item_id is null
  and ri.request_id=rb.request_id
  and ri.plan_component_id=rb.component_id;

alter table public.shipping_inventory_request_boxes
  alter column request_item_id set not null,
  alter column component_id drop not null;

create index if not exists shipping_inventory_request_boxes_item_idx
  on public.shipping_inventory_request_boxes(request_item_id,created_at);

alter table public.shipping_inventory_request_items enable row level security;
drop policy if exists "shipping inventory request items: authorized" on public.shipping_inventory_request_items;
create policy "shipping inventory request items: authorized" on public.shipping_inventory_request_items
for select to authenticated
using ((select private.can_access_shipping_inventory_requests()));

revoke all privileges on table public.shipping_inventory_request_items from public,anon,authenticated;
grant all privileges on table public.shipping_inventory_request_items to service_role;

create or replace function public.list_transfer_center_catalog()
returns table(catalog jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (select private.can_access_shipping_inventory_requests()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query select jsonb_build_object(
    'models',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'name',m.name,'image_path',m.image_path
    ) order by lower(m.name)) from public.finished_product_models m where m.active),'[]'::jsonb),
    'colors',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'name',c.name,'hex_code',upper(c.hex_code)
    ) order by lower(c.name)) from public.finished_production_colors c where c.active),'[]'::jsonb)
  );
end;
$$;

create or replace function public.create_transfer_center_request(
  p_plan_item_id uuid default null,
  p_title text default null,
  p_purpose text default 'ad_hoc',
  p_needed_on date default null,
  p_priority text default 'normal',
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_request_id uuid;
  v_plan_id uuid;
  v_plan_title text;
  v_item jsonb;
  v_model_id uuid;
  v_color_id uuid;
  v_quantity bigint;
  v_position integer:=0;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito a gerente de e-commerce ou ADM principal.' using errcode='42501';
  end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'Prioridade invalida.'; end if;
  if p_purpose not in ('full_shipping','routine_restock','campaign','ad_hoc','shipping_plan') then raise exception 'Finalidade invalida.'; end if;
  if char_length(coalesce(p_notes,''))>1200 then raise exception 'Observacao muito longa.'; end if;
  if p_needed_on is not null and p_needed_on<current_date then raise exception 'A data necessaria nao pode estar no passado.'; end if;

  if p_plan_item_id is not null then
    select p.id,coalesce(nullif(trim(p.title),''),'Plano de envio #'||p.protocol::text)
      into v_plan_id,v_plan_title
    from public.shipping_plan_items i
    join public.shipping_plans p on p.id=i.plan_id
    where i.id=p_plan_item_id and p.is_full and p.status not in ('archived','cancelled')
    for update of i,p;
    if v_plan_id is null then raise exception 'O item precisa pertencer a um plano FULL ativo.' using errcode='23514'; end if;
    select r.id into v_request_id
    from public.shipping_inventory_requests r
    where r.plan_item_id=p_plan_item_id and r.status in ('requested','partially_reserved','reserved','in_transit')
    limit 1;
    if v_request_id is not null then return v_request_id; end if;
    insert into public.shipping_inventory_requests(
      plan_id,plan_item_id,source_type,title,purpose,needed_on,priority,notes,requested_by,status
    ) values(
      v_plan_id,p_plan_item_id,'shipping_plan',v_plan_title,'full_shipping',p_needed_on,p_priority,
      nullif(trim(coalesce(p_notes,'')),''),v_actor,'requested'
    ) returning id into v_request_id;
    insert into public.shipping_inventory_request_items(
      request_id,plan_component_id,model_id,color_id,required_quantity,position
    )
    select v_request_id,pc.id,pc.model_id,pc.color_id,
           pc.units_per_volume::bigint*i.volume_quantity::bigint,pc.position
    from public.shipping_plan_item_components pc
    join public.shipping_plan_items i on i.id=pc.plan_item_id
    where pc.plan_item_id=p_plan_item_id;
    if not found then raise exception 'Este item nao possui modelos e cores vinculados ao Inventario.' using errcode='23514'; end if;
  else
    if char_length(trim(coalesce(p_title,''))) not between 2 and 140 then raise exception 'Informe um titulo para a solicitacao.'; end if;
    if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione pelo menos um produto.'; end if;
    insert into public.shipping_inventory_requests(
      source_type,title,purpose,needed_on,priority,notes,requested_by,status
    ) values(
      'manual',trim(p_title),p_purpose,p_needed_on,p_priority,
      nullif(trim(coalesce(p_notes,'')),''),v_actor,'requested'
    ) returning id into v_request_id;
    for v_item in select value from jsonb_array_elements(p_items)
    loop
      v_model_id=nullif(v_item->>'model_id','')::uuid;
      v_color_id=nullif(v_item->>'color_id','')::uuid;
      v_quantity=coalesce(nullif(v_item->>'required_quantity','')::bigint,0);
      if v_quantity<=0 or not exists(select 1 from public.finished_product_models where id=v_model_id and active)
        or not exists(select 1 from public.finished_production_colors where id=v_color_id and active) then
        raise exception 'Um item possui modelo, cor ou quantidade invalida.';
      end if;
      insert into public.shipping_inventory_request_items(
        request_id,model_id,color_id,required_quantity,position,notes
      ) values(
        v_request_id,v_model_id,v_color_id,v_quantity,v_position,
        nullif(trim(coalesce(v_item->>'notes','')),'')
      );
      v_position:=v_position+1;
    end loop;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'transfer_center.request_created','shipping_inventory_request',v_request_id::text,'database',
    jsonb_build_object('source_type',case when p_plan_item_id is null then 'manual' else 'shipping_plan' end,
                       'plan_item_id',p_plan_item_id,'purpose',p_purpose,'needed_on',p_needed_on));
  return v_request_id;
exception when unique_violation then
  select r.id into v_request_id from public.shipping_inventory_requests r
  where r.plan_item_id=p_plan_item_id and r.status in ('requested','partially_reserved','reserved','in_transit') limit 1;
  if v_request_id is not null then return v_request_id; end if;
  raise;
end;
$$;

create or replace function public.list_transfer_center_options(p_request_id uuid)
returns table(item jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (select private.can_access_shipping_inventory_requests()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if not exists(select 1 from public.shipping_inventory_requests r where r.id=p_request_id and r.status in ('requested','partially_reserved','reserved')) then
    raise exception 'Solicitacao indisponivel para reserva.' using errcode='23514';
  end if;
  return query
  select jsonb_build_object(
    'id',ri.id,'model_id',ri.model_id,'model_name',m.name,'image_path',m.image_path,
    'color_id',ri.color_id,'color_name',c.name,'color_hex',upper(c.hex_code),
    'required_quantity',ri.required_quantity,
    'selected_quantity',coalesce((select sum(rb.box_quantity) from public.shipping_inventory_request_boxes rb where rb.request_item_id=ri.id and rb.released_at is null),0),
    'boxes',coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'box_number',e.box_number,'box_code','CX-'||lpad(e.box_number::text,6,'0'),
      'quantity',e.current_quantity,'entry_on',e.entry_on,'location',e.box_reference
    ) order by e.entry_on asc,e.box_number asc) filter(where e.id is not null),'[]'::jsonb)
  )
  from public.shipping_inventory_request_items ri
  join public.finished_product_models m on m.id=ri.model_id
  join public.finished_production_colors c on c.id=ri.color_id
  left join public.production_inventory_entries e
    on e.model_id=ri.model_id and e.color_id=ri.color_id
    and e.label_status='applied' and e.current_quantity>0 and e.transferred_at is null
    and not exists(select 1 from public.shipping_inventory_request_boxes rb where rb.inventory_entry_id=e.id and rb.released_at is null)
  where ri.request_id=p_request_id
  group by ri.id,m.id,c.id
  order by ri.position;
end;
$$;

create or replace function public.reserve_transfer_center_boxes(
  p_request_id uuid,
  p_selections jsonb,
  p_notes text default null
) returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_request public.shipping_inventory_requests%rowtype;
  v_selection jsonb;
  v_item public.shipping_inventory_request_items%rowtype;
  v_box_id uuid;
  v_entry public.production_inventory_entries%rowtype;
  v_added integer:=0;
  v_any boolean;
  v_complete boolean;
  v_status text;
begin
  if not (select private.can_manage_shipping_planning()) then raise exception 'A reserva exige gerente de e-commerce ou ADM principal.' using errcode='42501'; end if;
  if jsonb_typeof(p_selections)<>'array' then raise exception 'Selecao de caixas invalida.'; end if;
  select * into v_request from public.shipping_inventory_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitacao nao localizada.' using errcode='P0002'; end if;
  if v_request.status not in ('requested','partially_reserved','reserved') then raise exception 'Esta solicitacao nao aceita novas reservas.' using errcode='23514'; end if;

  for v_selection in select value from jsonb_array_elements(p_selections)
  loop
    select * into v_item from public.shipping_inventory_request_items
    where id=nullif(v_selection->>'item_id','')::uuid and request_id=p_request_id;
    if not found then raise exception 'Um item selecionado nao pertence a esta solicitacao.'; end if;
    if jsonb_typeof(v_selection->'box_ids')<>'array' then raise exception 'Selecao de caixas invalida.'; end if;
    for v_box_id in select value::uuid from jsonb_array_elements_text(v_selection->'box_ids') selected(value)
    loop
      select * into v_entry from public.production_inventory_entries where id=v_box_id for update;
      if not found or v_entry.model_id<>v_item.model_id or v_entry.color_id<>v_item.color_id then
        raise exception 'Uma caixa nao corresponde ao modelo e a cor solicitados.' using errcode='23514';
      end if;
      if v_entry.label_status<>'applied' or v_entry.current_quantity<=0 or v_entry.transferred_at is not null then
        raise exception 'Uma caixa selecionada nao esta disponivel.' using errcode='23514';
      end if;
      if exists(select 1 from public.shipping_inventory_request_boxes where inventory_entry_id=v_box_id and released_at is null) then
        raise exception 'A caixa % ja esta reservada para outra solicitacao. Atualize a lista.', 'CX-'||lpad(v_entry.box_number::text,6,'0') using errcode='23505';
      end if;
      insert into public.shipping_inventory_request_boxes(
        request_id,request_item_id,component_id,inventory_entry_id,box_quantity,created_by
      ) values(p_request_id,v_item.id,v_item.plan_component_id,v_box_id,v_entry.current_quantity,v_actor);
      v_added:=v_added+1;
    end loop;
  end loop;
  if v_added=0 then raise exception 'Selecione pelo menos uma caixa nova.'; end if;
  select
    bool_or(selected_quantity>0),
    bool_and(selected_quantity>=required_quantity)
  into v_any,v_complete
  from(
    select ri.id,ri.required_quantity,coalesce(sum(rb.box_quantity) filter(where rb.released_at is null),0) selected_quantity
    from public.shipping_inventory_request_items ri
    left join public.shipping_inventory_request_boxes rb on rb.request_item_id=ri.id
    where ri.request_id=p_request_id
    group by ri.id
  ) coverage;
  v_status:=case when v_complete then 'reserved' when v_any then 'partially_reserved' else 'requested' end;
  update public.shipping_inventory_requests
  set status=v_status,notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes)
  where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'transfer_center.boxes_reserved','shipping_inventory_request',p_request_id::text,'database',
    jsonb_build_object('box_count',v_added,'status',v_status));
  return v_status;
exception when unique_violation then
  raise exception 'Uma caixa acabou de ser reservada por outra pessoa. Atualize a lista e tente novamente.' using errcode='23505';
end;
$$;

-- Compatibilidade com PWAs ainda em cache: o contrato antigo continua aceito,
-- mas passa a utilizar a mesma Central de Transferencias e as mesmas travas.
create or replace function public.list_shipping_inventory_options(p_plan_item_id uuid)
returns table(component jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  perform 1
  from public.shipping_plan_items i
  join public.shipping_plans p on p.id=i.plan_id
  where i.id=p_plan_item_id and p.is_full and p.status not in ('archived','cancelled');
  if not found then
    raise exception 'A solicitacao ao Inventario exige um plano FULL ativo.' using errcode='23514';
  end if;

  return query
  select jsonb_build_object(
    'id',pc.id,'model_id',pc.model_id,'model_name',m.name,'image_path',m.image_path,
    'color_id',pc.color_id,'color_name',c.name,'color_hex',upper(c.hex_code),
    'units_per_volume',pc.units_per_volume,
    'required_quantity',(pc.units_per_volume::bigint*i.volume_quantity::bigint),
    'boxes',coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'box_number',e.box_number,'box_code','CX-'||lpad(e.box_number::text,6,'0'),
      'quantity',e.current_quantity,'entry_on',e.entry_on,'location',e.box_reference
    ) order by e.entry_on asc,e.box_number asc) filter(where e.id is not null),'[]'::jsonb)
  )
  from public.shipping_plan_item_components pc
  join public.shipping_plan_items i on i.id=pc.plan_item_id
  join public.finished_product_models m on m.id=pc.model_id
  join public.finished_production_colors c on c.id=pc.color_id
  left join public.production_inventory_entries e
    on e.model_id=pc.model_id and e.color_id=pc.color_id
    and e.label_status='applied' and e.current_quantity>0 and e.transferred_at is null
    and not exists(
      select 1 from public.shipping_inventory_request_boxes rb
      where rb.inventory_entry_id=e.id and rb.released_at is null
    )
  where pc.plan_item_id=p_plan_item_id
  group by pc.id,m.id,c.id,i.volume_quantity
  order by pc.position;
end;
$$;

create or replace function public.reserve_shipping_inventory_boxes(
  p_plan_item_id uuid,
  p_selections jsonb,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request_id uuid;
  v_selection jsonb;
  v_item_id uuid;
  v_normalized jsonb:='[]'::jsonb;
begin
  if jsonb_typeof(p_selections)<>'array' then
    raise exception 'Selecao de caixas invalida.';
  end if;
  v_request_id:=public.create_transfer_center_request(
    p_plan_item_id,null,'full_shipping',null,'normal',p_notes,'[]'::jsonb
  );
  for v_selection in select value from jsonb_array_elements(p_selections)
  loop
    select ri.id into v_item_id
    from public.shipping_inventory_request_items ri
    where ri.request_id=v_request_id
      and ri.plan_component_id=nullif(v_selection->>'component_id','')::uuid;
    if v_item_id is null then
      raise exception 'Um componente selecionado nao pertence a este item.' using errcode='23514';
    end if;
    v_normalized:=v_normalized||jsonb_build_array(jsonb_build_object(
      'item_id',v_item_id,'box_ids',coalesce(v_selection->'box_ids','[]'::jsonb)
    ));
  end loop;
  perform public.reserve_transfer_center_boxes(v_request_id,v_normalized,p_notes);
  return v_request_id;
end;
$$;

-- O contador e a galeria antigos tambem respeitam reservas parciais e completas.
create or replace function public.get_production_inventory_available_box_count()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare v_count bigint;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  select count(*)::bigint into v_count
  from public.production_inventory_entries e
  where e.label_status='applied' and e.current_quantity>0 and e.transferred_at is null
    and not exists(
      select 1 from public.shipping_inventory_request_boxes rb
      where rb.inventory_entry_id=e.id and rb.released_at is null
    );
  return coalesce(v_count,0);
end;
$$;

create or replace function public.list_available_production_inventory_boxes()
returns table(
  id uuid,protocol bigint,box_number bigint,box_code text,
  model_id uuid,model_name text,image_path text,color_id uuid,color_name text,color_hex text,
  worker_id uuid,worker_name text,entry_on date,box_reference text,notes text,
  original_quantity bigint,current_quantity bigint,created_by uuid,created_by_name text,
  created_at timestamptz,updated_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select e.id,e.protocol,e.box_number,'CX-'||lpad(e.box_number::text,6,'0'),
    e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    e.worker_id,w.full_name,e.entry_on,e.box_reference,e.notes,
    e.original_quantity,e.current_quantity,e.created_by,creator.full_name,
    e.created_at,e.updated_at
  from public.production_inventory_entries e
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  join public.profiles w on w.id=e.worker_id
  join public.profiles creator on creator.id=e.created_by
  where e.label_status='applied' and e.current_quantity>0 and e.transferred_at is null
    and not exists(
      select 1 from public.shipping_inventory_request_boxes rb
      where rb.inventory_entry_id=e.id and rb.released_at is null
    )
  order by e.box_number desc;
end;
$$;

create or replace function public.list_shipping_inventory_requests(p_status text default null)
returns table(request jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (select private.can_access_shipping_inventory_requests()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('requested','partially_reserved','reserved','in_transit','received','transferred','cancelled') then raise exception 'Filtro invalido.'; end if;
  return query
  select jsonb_build_object(
    'id',r.id,'protocol',r.protocol,'status',r.status,'source_type',r.source_type,
    'title',r.title,'purpose',r.purpose,'needed_on',r.needed_on,'priority',r.priority,'notes',r.notes,
    'plan_id',r.plan_id,'plan_protocol',p.protocol,'plan_title',p.title,'plan_item_id',r.plan_item_id,
    'item_name',case when i.item_kind='kit' then k.name else coalesce(m.name,i.exclusive_name,r.title) end,
    'item_kind',i.item_kind,'platform',p.platform,'is_full',p.is_full,
    'requested_by_name',requester.full_name,'requested_at',r.requested_at,
    'dispatched_by_name',dispatcher.full_name,'dispatched_at',r.dispatched_at,
    'received_by_name',receiver.full_name,'received_at',r.received_at,'receipt_notes',r.receipt_notes,
    'transferred_by_name',coalesce(dispatcher.full_name,transferred.full_name),'transferred_at',coalesce(r.dispatched_at,r.transferred_at),
    'cancelled_by_name',cancelled.full_name,'cancelled_at',r.cancelled_at,'cancel_reason',r.cancel_reason,
    'box_count',coalesce((select count(*) from public.shipping_inventory_request_boxes rb where rb.request_id=r.id and rb.released_at is null),0),
    'selected_quantity',coalesce((select sum(rb.box_quantity) from public.shipping_inventory_request_boxes rb where rb.request_id=r.id and rb.released_at is null),0),
    'components',coalesce((select jsonb_agg(jsonb_build_object(
      'id',ri.id,'model_id',ri.model_id,'model_name',fm.name,'image_path',fm.image_path,
      'color_id',ri.color_id,'color_name',fc.name,'color_hex',upper(fc.hex_code),
      'required_quantity',ri.required_quantity,
      'selected_quantity',coalesce((select sum(rb.box_quantity) from public.shipping_inventory_request_boxes rb where rb.request_item_id=ri.id and rb.released_at is null),0),
      'boxes',coalesce((select jsonb_agg(jsonb_build_object(
        'id',e.id,'box_code','CX-'||lpad(e.box_number::text,6,'0'),'quantity',rb.box_quantity,
        'location',e.box_reference,'entry_on',e.entry_on,'transferred_at',rb.transferred_at
      ) order by e.entry_on,e.box_number) from public.shipping_inventory_request_boxes rb
      join public.production_inventory_entries e on e.id=rb.inventory_entry_id
      where rb.request_item_id=ri.id and rb.released_at is null),'[]'::jsonb)
    ) order by ri.position) from public.shipping_inventory_request_items ri
      join public.finished_product_models fm on fm.id=ri.model_id
      join public.finished_production_colors fc on fc.id=ri.color_id
      where ri.request_id=r.id),'[]'::jsonb)
  )
  from public.shipping_inventory_requests r
  left join public.shipping_plans p on p.id=r.plan_id
  left join public.shipping_plan_items i on i.id=r.plan_item_id
  left join public.shipping_kit_templates k on k.id=i.kit_template_id
  left join public.finished_product_models m on m.id=i.model_id
  join public.profiles requester on requester.id=r.requested_by
  left join public.profiles dispatcher on dispatcher.id=r.dispatched_by
  left join public.profiles receiver on receiver.id=r.received_by
  left join public.profiles transferred on transferred.id=r.transferred_by
  left join public.profiles cancelled on cancelled.id=r.cancelled_by
  where p_status is null or r.status=p_status
  order by case r.status when 'requested' then 1 when 'partially_reserved' then 2 when 'reserved' then 3 when 'in_transit' then 4 else 5 end,
           r.requested_at desc;
end;
$$;

create or replace function public.cancel_shipping_inventory_request(p_request_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_status text;
begin
  if not (select private.can_access_shipping_inventory_requests()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Informe o motivo do cancelamento.'; end if;
  select status into v_status from public.shipping_inventory_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitacao nao localizada.' using errcode='P0002'; end if;
  if v_status not in ('requested','partially_reserved','reserved') then raise exception 'Somente solicitacoes ainda nao despachadas podem ser canceladas.' using errcode='23514'; end if;
  update public.shipping_inventory_request_boxes set released_at=now(),released_by=v_actor,release_reason=trim(p_reason)
  where request_id=p_request_id and released_at is null;
  update public.shipping_inventory_requests
  set status='cancelled',cancelled_at=now(),cancelled_by=v_actor,cancel_reason=trim(p_reason)
  where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'transfer_center.request_cancelled','shipping_inventory_request',p_request_id::text,'database',jsonb_build_object('reason',trim(p_reason)));
end;
$$;

create or replace function public.dispatch_transfer_center_request(
  p_request_id uuid,p_occurred_on date,p_notes text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_request public.shipping_inventory_requests%rowtype;v_box record;
begin
  if not (select private.can_manage_production_inventory()) then raise exception 'A expedicao exige perfil ADM ou Recebimento.' using errcode='42501'; end if;
  if p_occurred_on is null or p_occurred_on>current_date then raise exception 'Informe uma data valida.'; end if;
  select * into v_request from public.shipping_inventory_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitacao nao localizada.' using errcode='P0002'; end if;
  if v_request.status<>'reserved' then raise exception 'Todos os itens precisam estar cobertos por caixas antes da expedicao.' using errcode='23514'; end if;
  perform set_config('app.shipping_inventory_request_id',p_request_id::text,true);
  for v_box in select rb.id reservation_box_id,rb.inventory_entry_id
    from public.shipping_inventory_request_boxes rb
    where rb.request_id=p_request_id and rb.released_at is null
    order by rb.created_at for update
  loop
    perform public.transfer_production_inventory_box_to_ecommerce(
      v_box.inventory_entry_id,p_occurred_on,concat('Central de Transferencias #',v_request.protocol,'. ',coalesce(p_notes,''))
    );
    update public.shipping_inventory_request_boxes set transferred_at=now(),transferred_by=v_actor where id=v_box.reservation_box_id;
  end loop;
  perform set_config('app.shipping_inventory_request_id','',true);
  update public.shipping_inventory_requests
  set status='in_transit',dispatched_at=now(),dispatched_by=v_actor,transferred_at=now(),transferred_by=v_actor
  where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'transfer_center.request_dispatched','shipping_inventory_request',p_request_id::text,'database',
    jsonb_build_object('occurred_on',p_occurred_on,'notes',p_notes));
end;
$$;

create or replace function public.receive_transfer_center_request(p_request_id uuid,p_notes text default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_status text;
begin
  if not (select private.can_access_shipping_inventory_requests()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if char_length(coalesce(p_notes,''))>1200 then raise exception 'Observacao muito longa.'; end if;
  select status into v_status from public.shipping_inventory_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitacao nao localizada.' using errcode='P0002'; end if;
  if v_status<>'in_transit' then raise exception 'Somente uma transferencia em andamento pode ser recebida.' using errcode='23514'; end if;
  update public.shipping_inventory_requests
  set status='received',received_at=now(),received_by=v_actor,receipt_notes=nullif(trim(coalesce(p_notes,'')),'')
  where id=p_request_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'transfer_center.request_received','shipping_inventory_request',p_request_id::text,'database',jsonb_build_object('notes',p_notes));
end;
$$;

-- Compatibilidade com versoes antigas do PWA: a funcao anterior conclui as duas etapas.
create or replace function public.confirm_shipping_inventory_request_transfer(
  p_request_id uuid,p_occurred_on date,p_notes text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.dispatch_transfer_center_request(p_request_id,p_occurred_on,p_notes);
  perform public.receive_transfer_center_request(p_request_id,'Recebimento confirmado pelo fluxo compativel.');
end;
$$;

create or replace function private.protect_reserved_inventory_box()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_request_id uuid;v_context text;
begin
  if new.current_quantity is distinct from old.current_quantity then
    select rb.request_id into v_request_id
    from public.shipping_inventory_request_boxes rb
    join public.shipping_inventory_requests r on r.id=rb.request_id
    where rb.inventory_entry_id=old.id and rb.released_at is null
      and r.status in ('partially_reserved','reserved','in_transit')
    limit 1;
    if v_request_id is not null then
      v_context:=nullif(current_setting('app.shipping_inventory_request_id',true),'');
      if v_context is null or v_context::uuid<>v_request_id then
        raise exception 'Caixa reservada na Central de Transferencias. Cancele ou despache a solicitacao antes de movimenta-la.' using errcode='23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.release_shipping_reservations_on_plan_cancel()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=coalesce((select auth.uid()),new.updated_by);
begin
  if new.status='cancelled' and old.status is distinct from new.status then
    if exists(select 1 from public.shipping_inventory_requests where plan_id=new.id and status='in_transit') then
      raise exception 'Existe uma transferencia em andamento. Confirme o recebimento antes de cancelar o plano.' using errcode='23514';
    end if;
    update public.shipping_inventory_request_boxes rb
    set released_at=now(),released_by=v_actor,release_reason='Plano de envio cancelado'
    from public.shipping_inventory_requests r
    where r.plan_id=new.id and r.status in ('requested','partially_reserved','reserved')
      and rb.request_id=r.id and rb.released_at is null;
    update public.shipping_inventory_requests
    set status='cancelled',cancelled_at=now(),cancelled_by=v_actor,cancel_reason=coalesce(new.cancel_reason,'Plano de envio cancelado')
    where plan_id=new.id and status in ('requested','partially_reserved','reserved');
  elsif new.status='archived' and exists(
    select 1 from public.shipping_inventory_requests where plan_id=new.id and status in ('requested','partially_reserved','reserved','in_transit')
  ) then
    raise exception 'Conclua ou cancele a transferencia antes de arquivar o plano.' using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function public.list_transfer_center_catalog() from public,anon,authenticated;
revoke all on function public.create_transfer_center_request(uuid,text,text,date,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.list_transfer_center_options(uuid) from public,anon,authenticated;
revoke all on function public.reserve_transfer_center_boxes(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.list_shipping_inventory_options(uuid) from public,anon,authenticated;
revoke all on function public.reserve_shipping_inventory_boxes(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.get_production_inventory_available_box_count() from public,anon,authenticated;
revoke all on function public.list_available_production_inventory_boxes() from public,anon,authenticated;
revoke all on function public.dispatch_transfer_center_request(uuid,date,text) from public,anon,authenticated;
revoke all on function public.receive_transfer_center_request(uuid,text) from public,anon,authenticated;
revoke all on function public.list_shipping_inventory_requests(text) from public,anon,authenticated;
revoke all on function public.cancel_shipping_inventory_request(uuid,text) from public,anon,authenticated;
revoke all on function public.confirm_shipping_inventory_request_transfer(uuid,date,text) from public,anon,authenticated;

grant execute on function public.list_transfer_center_catalog() to authenticated,service_role;
grant execute on function public.create_transfer_center_request(uuid,text,text,date,text,text,jsonb) to authenticated,service_role;
grant execute on function public.list_transfer_center_options(uuid) to authenticated,service_role;
grant execute on function public.reserve_transfer_center_boxes(uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.list_shipping_inventory_options(uuid) to authenticated,service_role;
grant execute on function public.reserve_shipping_inventory_boxes(uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.get_production_inventory_available_box_count() to authenticated,service_role;
grant execute on function public.list_available_production_inventory_boxes() to authenticated,service_role;
grant execute on function public.dispatch_transfer_center_request(uuid,date,text) to authenticated,service_role;
grant execute on function public.receive_transfer_center_request(uuid,text) to authenticated,service_role;
grant execute on function public.list_shipping_inventory_requests(text) to authenticated,service_role;
grant execute on function public.cancel_shipping_inventory_request(uuid,text) to authenticated,service_role;
grant execute on function public.confirm_shipping_inventory_request_transfer(uuid,date,text) to authenticated,service_role;

grant select,insert,update,delete on table public.shipping_inventory_request_items to service_role;
grant select,insert,update,delete on table public.shipping_inventory_requests to service_role;
grant select,insert,update,delete on table public.shipping_inventory_request_boxes to service_role;

notify pgrst,'reload schema';
commit;
