-- Harmony Store Oficial — integração de fornecedores e privacidade dos valores em produção.
-- O vínculo produto/fornecedor já utiliza public.supplier_products, criado na atualização 008.
-- Esta atualização limita valores detalhados de recebimentos aos administradores.
-- Os fechamentos semanais continuam exibindo o total para a própria colaboradora em Meus Pagamentos.

begin;

drop function if exists public.list_finished_production_receipts(date,date,uuid);
create function public.list_finished_production_receipts(
  p_from date default null,
  p_to date default null,
  p_worker_id uuid default null
) returns table(
  id uuid, collection_id uuid, protocol bigint, worker_id uuid, worker_name text,
  model_id uuid, model_name text, color text, declared_quantity bigint, quantity bigint,
  quantity_difference bigint, box_reference text, received_on date, received_by uuid,
  receiver_name text, notes text, closing_id uuid, created_at timestamptz,
  rate_per_100 numeric, amount numeric
)
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_uid uuid := (select auth.uid());
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_uid and p.status = 'active';

  if v_role is null then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    r.id,
    r.collection_id,
    r.protocol,
    r.worker_id,
    w.full_name,
    r.model_id,
    m.name,
    r.color,
    r.declared_quantity,
    r.quantity,
    r.quantity_difference,
    r.box_reference,
    r.received_on,
    r.received_by,
    receiver.full_name,
    r.notes,
    r.closing_id,
    r.created_at,
    case when v_role = 'admin' then r.rate_per_100_snapshot else null::numeric end,
    case when v_role = 'admin'
      then round(r.quantity::numeric * r.rate_per_100_snapshot / 100, 4)
      else null::numeric
    end
  from public.finished_production_receipts r
  join public.profiles w on w.id = r.worker_id
  join public.profiles receiver on receiver.id = r.received_by
  join public.finished_product_models m on m.id = r.model_id
  where (v_role in ('admin','receiver') or r.worker_id = v_uid)
    and (p_from is null or r.received_on >= p_from)
    and (p_to is null or r.received_on <= p_to)
    and (p_worker_id is null or r.worker_id = p_worker_id)
  order by r.received_on desc, r.collection_id, r.protocol;
end;
$$;

revoke all on function public.list_finished_production_receipts(date,date,uuid) from public, anon;
grant execute on function public.list_finished_production_receipts(date,date,uuid) to authenticated;

-- Impede que um pedido de compra receba, por engano ou chamada direta da API,
-- uma matéria-prima que não esteja vinculada ao fornecedor do pedido.
create or replace function private.require_supplier_product_link()
returns trigger
language plpgsql
security invoker
set search_path = '' as $$
declare
  v_supplier_id uuid;
begin
  select po.supplier_id into v_supplier_id
  from public.purchase_orders po
  where po.id = new.purchase_order_id;

  if v_supplier_id is null then
    raise exception 'Pedido de compra inválido.';
  end if;

  if not exists(
    select 1
    from public.supplier_products sp
    where sp.supplier_id = v_supplier_id
      and sp.product_id = new.product_id
  ) then
    raise exception 'A matéria-prima não está vinculada ao fornecedor selecionado.';
  end if;

  return new;
end;
$$;

drop trigger if exists require_supplier_product_link on public.purchase_order_items;
create trigger require_supplier_product_link
before insert or update of purchase_order_id, product_id on public.purchase_order_items
for each row execute function private.require_supplier_product_link();

notify pgrst, 'reload schema';

commit;
