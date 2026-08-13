begin;

-- Uma alteração operacional invalida a conferência anterior do item.
create or replace function private.reopen_shipping_plan_item_on_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.model_id is distinct from new.model_id
    or old.exclusive_name is distinct from new.exclusive_name
    or old.exclusive_image_path is distinct from new.exclusive_image_path
    or old.color_id is distinct from new.color_id
    or old.listing_units is distinct from new.listing_units
    or old.volume_quantity is distinct from new.volume_quantity
    or old.volume_type is distinct from new.volume_type
    or old.notes is distinct from new.notes
  then
    new.completed := false;
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists shipping_plan_item_reopen_on_edit on public.shipping_plan_items;
create trigger shipping_plan_item_reopen_on_edit
before update on public.shipping_plan_items
for each row execute function private.reopen_shipping_plan_item_on_edit();

-- Um item novo ou reaberto devolve automaticamente um plano pronto para conferência.
create or replace function private.reopen_ready_shipping_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.completed then
    update public.shipping_plans
    set status='checking', updated_by=coalesce((select auth.uid()),updated_by)
    where id=new.plan_id and status='ready';
  end if;
  return new;
end;
$$;

drop trigger if exists shipping_plan_reopen_ready_after_item on public.shipping_plan_items;
create trigger shipping_plan_reopen_ready_after_item
after insert or update on public.shipping_plan_items
for each row execute function private.reopen_ready_shipping_plan();

revoke all on function private.reopen_shipping_plan_item_on_edit() from public, anon, authenticated;
revoke all on function private.reopen_ready_shipping_plan() from public, anon, authenticated;
grant execute on function private.reopen_shipping_plan_item_on_edit() to service_role;
grant execute on function private.reopen_ready_shipping_plan() to service_role;

notify pgrst, 'reload schema';
commit;
