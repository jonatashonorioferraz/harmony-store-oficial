begin;

drop policy if exists "field definition: admin insert" on public.custom_field_definitions;
drop policy if exists "field definition: admin update" on public.custom_field_definitions;
drop policy if exists "field definition: admin delete" on public.custom_field_definitions;
create policy "field definition: admin all" on public.custom_field_definitions
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "field value: admin insert" on public.custom_field_values;
drop policy if exists "field value: admin update" on public.custom_field_values;
drop policy if exists "field value: admin delete" on public.custom_field_values;
create policy "field value: admin all" on public.custom_field_values
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "movement: admin read" on public.stock_movements
  for select to authenticated using ((select private.is_admin()));

notify pgrst, 'reload schema';
commit;
