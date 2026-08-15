-- Harmony Store Oficial - compatibilidade segura entre a API-base de planos
-- e a constraint de tipos adicionada aos itens de envio.

begin;

create or replace function private.normalize_shipping_plan_item_kind_on_insert()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.item_kind:=case
    when new.kit_template_id is not null then 'kit'
    when new.model_id is null then 'exclusive'
    else 'catalog'
  end;
  return new;
end;
$$;

drop trigger if exists normalize_shipping_plan_item_kind_on_insert
  on public.shipping_plan_items;
create trigger normalize_shipping_plan_item_kind_on_insert
before insert on public.shipping_plan_items
for each row execute function private.normalize_shipping_plan_item_kind_on_insert();

commit;
