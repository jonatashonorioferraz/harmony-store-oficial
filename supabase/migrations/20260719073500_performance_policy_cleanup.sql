-- Harmony Store Oficial — Fase 6: índices de FKs e políticas equivalentes sem duplicidade.
begin;

create index if not exists custom_field_values_product_idx on public.custom_field_values(product_id);
create index if not exists custom_field_values_profile_idx on public.custom_field_values(profile_id);
create index if not exists finished_product_models_created_by_idx on public.finished_product_models(created_by);
create index if not exists finished_receipts_received_by_idx on public.finished_production_receipts(received_by);
create index if not exists production_closings_closed_by_idx on public.production_weekly_closings(closed_by);
create index if not exists production_closings_paid_by_idx on public.production_weekly_closings(paid_by);
create index if not exists products_created_by_idx on public.products(created_by);
create index if not exists purchase_order_items_product_idx on public.purchase_order_items(product_id);
create index if not exists purchase_orders_created_by_idx on public.purchase_orders(created_by);
create index if not exists request_items_product_idx on public.request_items(product_id);
create index if not exists requests_separated_by_idx on public.requests(separated_by);
create index if not exists stock_movements_created_by_idx on public.stock_movements(created_by);
create index if not exists stock_movements_request_idx on public.stock_movements(request_id);
create index if not exists suppliers_created_by_idx on public.suppliers(created_by);
create index if not exists system_events_actor_idx on public.system_events(actor_id);

-- A política ALL também valia para SELECT e duplicava a política de leitura.
-- Separamos somente as escritas, preservando exatamente a autorização anterior.
drop policy if exists "field definition: admin all" on public.custom_field_definitions;
create policy "field definition: admin insert" on public.custom_field_definitions
  for insert to authenticated with check ((select private.is_admin()));
create policy "field definition: admin update" on public.custom_field_definitions
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "field definition: admin delete" on public.custom_field_definitions
  for delete to authenticated using ((select private.is_admin()));

drop policy if exists "field value: admin all" on public.custom_field_values;
create policy "field value: admin insert" on public.custom_field_values
  for insert to authenticated with check ((select private.is_admin()));
create policy "field value: admin update" on public.custom_field_values
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "field value: admin delete" on public.custom_field_values
  for delete to authenticated using ((select private.is_admin()));

-- A política de escrita ALL já cobre a leitura administrativa.
drop policy if exists "movement: admin read" on public.stock_movements;

notify pgrst, 'reload schema';
commit;
