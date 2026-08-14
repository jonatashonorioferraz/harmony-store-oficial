-- Harmony Store Oficial - indices de apoio para kits e reservas de caixas.
begin;

create index if not exists shipping_kit_templates_created_by_idx
  on public.shipping_kit_templates(created_by);
create index if not exists shipping_kit_templates_updated_by_idx
  on public.shipping_kit_templates(updated_by);
create index if not exists shipping_kit_template_components_model_idx
  on public.shipping_kit_template_components(model_id);
create index if not exists shipping_kit_template_components_color_idx
  on public.shipping_kit_template_components(color_id);

create index if not exists shipping_plan_item_components_model_idx
  on public.shipping_plan_item_components(model_id);
create index if not exists shipping_plan_item_components_color_idx
  on public.shipping_plan_item_components(color_id);

create index if not exists shipping_inventory_requests_plan_idx
  on public.shipping_inventory_requests(plan_id);
create index if not exists shipping_inventory_requests_requested_by_idx
  on public.shipping_inventory_requests(requested_by);
create index if not exists shipping_inventory_requests_transferred_by_idx
  on public.shipping_inventory_requests(transferred_by)
  where transferred_by is not null;
create index if not exists shipping_inventory_requests_cancelled_by_idx
  on public.shipping_inventory_requests(cancelled_by)
  where cancelled_by is not null;

create index if not exists shipping_inventory_request_boxes_component_idx
  on public.shipping_inventory_request_boxes(component_id);
create index if not exists shipping_inventory_request_boxes_created_by_idx
  on public.shipping_inventory_request_boxes(created_by);
create index if not exists shipping_inventory_request_boxes_released_by_idx
  on public.shipping_inventory_request_boxes(released_by)
  where released_by is not null;
create index if not exists shipping_inventory_request_boxes_transferred_by_idx
  on public.shipping_inventory_request_boxes(transferred_by)
  where transferred_by is not null;

commit;
