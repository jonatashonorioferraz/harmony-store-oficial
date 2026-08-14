-- Harmony Store Oficial - disponibilidade em tempo real descontando reservas de envios.
begin;

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
      select 1
      from public.shipping_inventory_request_boxes rb
      join public.shipping_inventory_requests r on r.id=rb.request_id
      where rb.inventory_entry_id=e.id and rb.released_at is null and r.status='reserved'
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
      select 1
      from public.shipping_inventory_request_boxes rb
      join public.shipping_inventory_requests r on r.id=rb.request_id
      where rb.inventory_entry_id=e.id and rb.released_at is null and r.status='reserved'
    )
  order by e.box_number desc;
end;
$$;

revoke all on function public.get_production_inventory_available_box_count() from public,anon,authenticated;
revoke all on function public.list_available_production_inventory_boxes() from public,anon,authenticated;
grant execute on function public.get_production_inventory_available_box_count() to authenticated,service_role;
grant execute on function public.list_available_production_inventory_boxes() to authenticated,service_role;

notify pgrst,'reload schema';
commit;
