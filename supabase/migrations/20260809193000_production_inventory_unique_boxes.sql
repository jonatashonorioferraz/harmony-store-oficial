-- Harmony Store Oficial — código único e permanente para cada caixa do inventário.
-- Cada entrada representa uma caixa física. O número nunca é duplicado, alterado ou reutilizado.

begin;

create sequence if not exists public.production_inventory_box_number_seq
  as bigint minvalue 1 start with 1 increment by 1 no cycle;

alter table public.production_inventory_entries
  add column if not exists box_number bigint;

-- Preserva caixas eventualmente criadas na versão anterior usando o protocolo já único.
update public.production_inventory_entries
set box_number=protocol
where box_number is null;

do $$
declare
  v_max bigint;
  v_last bigint;
  v_called boolean;
begin
  select coalesce(max(box_number),0) into v_max
  from public.production_inventory_entries;
  select last_value,is_called into v_last,v_called
  from public.production_inventory_box_number_seq;
  if greatest(v_max,v_last)=1 and v_max=0 and not v_called then
    perform setval('public.production_inventory_box_number_seq',1,false);
  else
    perform setval('public.production_inventory_box_number_seq',greatest(v_max,v_last),true);
  end if;
end
$$;

create or replace function private.next_available_production_inventory_box_number()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_number bigint;
begin
  loop
    v_number:=nextval('public.production_inventory_box_number_seq');
    exit when not exists(
      select 1 from public.production_inventory_entries e where e.box_number=v_number
    );
  end loop;
  return v_number;
end;
$$;

revoke all on function private.next_available_production_inventory_box_number() from public,anon,authenticated;
grant execute on function private.next_available_production_inventory_box_number() to service_role;
revoke all privileges on sequence public.production_inventory_box_number_seq from public,anon,authenticated;
grant usage,select on sequence public.production_inventory_box_number_seq to service_role;

alter table public.production_inventory_entries
  alter column box_number set default private.next_available_production_inventory_box_number(),
  alter column box_number set not null;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.production_inventory_entries'::regclass
      and conname='production_inventory_entries_box_number_positive'
  ) then
    alter table public.production_inventory_entries
      add constraint production_inventory_entries_box_number_positive check (box_number>0);
  end if;
end
$$;

create unique index if not exists production_inventory_entries_box_number_unique
  on public.production_inventory_entries(box_number);

comment on column public.production_inventory_entries.box_number is
  'Número único e permanente da caixa física. Exibido como CX-000001 e nunca reutilizado.';

create or replace function private.prevent_production_inventory_box_number_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.box_number is distinct from old.box_number then
    raise exception 'O código permanente da caixa não pode ser alterado.' using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_production_inventory_box_number_change() from public,anon,authenticated;

drop trigger if exists production_inventory_box_number_immutable on public.production_inventory_entries;
create trigger production_inventory_box_number_immutable
before update of box_number on public.production_inventory_entries
for each row execute function private.prevent_production_inventory_box_number_change();

create or replace function public.generate_production_inventory_box_number()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_number bigint;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  v_number:=(select private.next_available_production_inventory_box_number());
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(
    v_actor,'production_inventory.box_code_generated','production_inventory_box_code',
    'CX-'||lpad(v_number::text,6,'0'),
    jsonb_build_object('box_number',v_number,'status','generated')
  );
  return v_number;
end;
$$;

create or replace function public.create_production_inventory_entry_v2(
  p_model_id uuid,
  p_color_id uuid,
  p_worker_id uuid,
  p_quantity bigint,
  p_entry_on date,
  p_box_number bigint,
  p_box_reference text default null,
  p_notes text default null
) returns table(id uuid, protocol bigint, box_number bigint, box_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_protocol bigint;
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if coalesce(p_box_number,0)<=0 then
    raise exception 'Gere o código único da caixa antes de salvar.';
  end if;
  if exists(select 1 from public.production_inventory_entries e where e.box_number=p_box_number) then
    raise exception 'A caixa CX-% já está cadastrada. Abra o registro existente.',lpad(p_box_number::text,6,'0') using errcode='23505';
  end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Informe uma quantidade inteira maior que zero.'; end if;
  if p_entry_on is null or p_entry_on>current_date then raise exception 'Informe uma data de entrada válida.'; end if;
  if not exists(select 1 from public.finished_product_models m where m.id=p_model_id and m.active) then
    raise exception 'Modelo inválido ou inativo.';
  end if;
  if not exists(select 1 from public.finished_production_colors c where c.id=p_color_id and c.active) then
    raise exception 'Cor inválida ou inativa.';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_worker_id and p.status='active' and p.role='collaborator') then
    raise exception 'Selecione uma colaboradora de produção ativa.';
  end if;

  insert into public.production_inventory_entries(
    model_id,color_id,worker_id,entry_on,box_number,box_reference,notes,
    original_quantity,current_quantity,created_by
  ) values(
    p_model_id,p_color_id,p_worker_id,p_entry_on,p_box_number,
    nullif(trim(p_box_reference),''),nullif(trim(p_notes),''),
    p_quantity,p_quantity,v_actor
  ) returning production_inventory_entries.id,production_inventory_entries.protocol
    into v_id,v_protocol;

  insert into public.production_inventory_movements(
    entry_id,movement_type,quantity,balance_before,balance_after,occurred_on,reason,notes,created_by
  ) values(v_id,'entry',p_quantity,0,p_quantity,p_entry_on,'Entrada de produção',nullif(trim(p_notes),''),v_actor);

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'production_inventory.entry_created','production_inventory_entry',v_id::text,
    jsonb_build_object(
      'protocol',v_protocol,'box_number',p_box_number,
      'box_code','CX-'||lpad(p_box_number::text,6,'0'),
      'model_id',p_model_id,'color_id',p_color_id,'worker_id',p_worker_id,
      'quantity',p_quantity,'entry_on',p_entry_on,
      'storage_location',nullif(trim(p_box_reference),'')
    ));

  return query select v_id,v_protocol,p_box_number,'CX-'||lpad(p_box_number::text,6,'0');
exception
  when unique_violation then
    raise exception 'A caixa CX-% já está cadastrada. Abra o registro existente.',lpad(p_box_number::text,6,'0') using errcode='23505';
end;
$$;

create or replace function public.list_production_inventory_entries_v2(
  p_model_id uuid,
  p_color_id uuid,
  p_include_depleted boolean default true
) returns table(
  id uuid, protocol bigint, box_number bigint, box_code text,
  model_id uuid, model_name text, image_path text,
  color_id uuid, color_name text, color_hex text, worker_id uuid, worker_name text,
  entry_on date, box_reference text, notes text, original_quantity bigint,
  current_quantity bigint, source_type text, source_receipt_id uuid,
  created_by uuid, created_by_name text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select e.id,e.protocol,e.box_number,'CX-'||lpad(e.box_number::text,6,'0'),
    e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    e.worker_id,w.full_name,e.entry_on,e.box_reference,e.notes,e.original_quantity,
    e.current_quantity,e.source_type,e.source_receipt_id,e.created_by,creator.full_name,
    e.created_at,e.updated_at
  from public.production_inventory_entries e
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  join public.profiles w on w.id=e.worker_id
  join public.profiles creator on creator.id=e.created_by
  where e.model_id=p_model_id and e.color_id=p_color_id
    and (coalesce(p_include_depleted,true) or e.current_quantity>0)
  order by (e.current_quantity>0) desc,e.entry_on,e.box_number;
end;
$$;

create or replace function public.list_production_inventory_movements_v2(
  p_from date default null,
  p_to date default null,
  p_worker_id uuid default null,
  p_model_id uuid default null,
  p_color_id uuid default null
) returns table(
  id uuid, protocol bigint, entry_id uuid, entry_protocol bigint,
  box_number bigint, box_code text,
  movement_type text, quantity bigint, balance_before bigint, balance_after bigint,
  occurred_on date, reason text, notes text, model_id uuid, model_name text,
  image_path text, color_id uuid, color_name text, color_hex text,
  worker_id uuid, worker_name text, box_reference text, created_by_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_production_inventory()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  return query
  select mv.id,mv.protocol,mv.entry_id,e.protocol,e.box_number,
    'CX-'||lpad(e.box_number::text,6,'0'),mv.movement_type,mv.quantity,
    mv.balance_before,mv.balance_after,mv.occurred_on,mv.reason,mv.notes,
    e.model_id,m.name,m.image_path,e.color_id,c.name,upper(c.hex_code),
    e.worker_id,w.full_name,e.box_reference,actor.full_name,mv.created_at
  from public.production_inventory_movements mv
  join public.production_inventory_entries e on e.id=mv.entry_id
  join public.finished_product_models m on m.id=e.model_id
  join public.finished_production_colors c on c.id=e.color_id
  join public.profiles w on w.id=e.worker_id
  join public.profiles actor on actor.id=mv.created_by
  where (p_from is null or mv.occurred_on>=p_from)
    and (p_to is null or mv.occurred_on<=p_to)
    and (p_worker_id is null or e.worker_id=p_worker_id)
    and (p_model_id is null or e.model_id=p_model_id)
    and (p_color_id is null or e.color_id=p_color_id)
  order by mv.occurred_on desc,mv.created_at desc,mv.protocol desc;
end;
$$;

revoke all on function public.generate_production_inventory_box_number() from public,anon,authenticated;
revoke all on function public.create_production_inventory_entry_v2(uuid,uuid,uuid,bigint,date,bigint,text,text) from public,anon,authenticated;
revoke all on function public.list_production_inventory_entries_v2(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.list_production_inventory_movements_v2(date,date,uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function public.generate_production_inventory_box_number() to authenticated,service_role;
grant execute on function public.create_production_inventory_entry_v2(uuid,uuid,uuid,bigint,date,bigint,text,text) to authenticated,service_role;
grant execute on function public.list_production_inventory_entries_v2(uuid,uuid,boolean) to authenticated,service_role;
grant execute on function public.list_production_inventory_movements_v2(date,date,uuid,uuid,uuid) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
