-- Harmony Store Oficial - indices das chaves estrangeiras da Central.
begin;

create index if not exists shipping_inventory_request_items_color_idx
  on public.shipping_inventory_request_items(color_id);
create index if not exists shipping_inventory_request_items_plan_component_idx
  on public.shipping_inventory_request_items(plan_component_id)
  where plan_component_id is not null;
create index if not exists shipping_inventory_requests_dispatched_by_idx
  on public.shipping_inventory_requests(dispatched_by)
  where dispatched_by is not null;
create index if not exists shipping_inventory_requests_received_by_idx
  on public.shipping_inventory_requests(received_by)
  where received_by is not null;

notify pgrst,'reload schema';
commit;
