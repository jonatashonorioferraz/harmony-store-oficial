begin;

create table if not exists public.internal_supply_request_item_fulfillments (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid not null unique
    references public.internal_supply_request_items(id) on delete cascade,
  receipt_item_id uuid not null unique
    references public.internal_purchase_receipt_items(id) on delete cascade,
  note text not null check (char_length(trim(note)) between 3 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists internal_supply_fulfillments_request_item_idx
  on public.internal_supply_request_item_fulfillments(request_item_id);
create index if not exists internal_supply_fulfillments_receipt_item_idx
  on public.internal_supply_request_item_fulfillments(receipt_item_id);

drop trigger if exists touch_updated_at on public.internal_supply_request_item_fulfillments;
create trigger touch_updated_at
before update on public.internal_supply_request_item_fulfillments
for each row execute function public.touch_updated_at();

alter table public.internal_supply_request_item_fulfillments enable row level security;

drop policy if exists "internal fulfillment: admin read" on public.internal_supply_request_item_fulfillments;
create policy "internal fulfillment: admin read"
on public.internal_supply_request_item_fulfillments
for select to authenticated
using ((select private.is_admin()));

revoke all on table public.internal_supply_request_item_fulfillments from public, anon, authenticated;
grant select on table public.internal_supply_request_item_fulfillments to authenticated;
grant select on table public.internal_supply_request_item_fulfillments to service_role;

create or replace function private.refresh_internal_supply_request_purchase_status(p_request_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_status text;
  v_next_status text;
  v_has_items boolean;
  v_has_confirmed_receipt boolean;
  v_complete boolean;
begin
  select r.status
  into v_current_status
  from public.internal_supply_requests r
  where r.id=p_request_id
  for update;

  if not found then raise exception 'Solicitação interna não localizada.'; end if;
  if v_current_status='cancelled' then return v_current_status; end if;

  select exists(
    select 1
    from public.internal_supply_request_items wanted
    where wanted.request_id=p_request_id
  ) into v_has_items;

  select exists(
    select 1
    from public.internal_purchase_receipts receipt
    where receipt.request_id=p_request_id
      and receipt.status='confirmed'
  ) into v_has_confirmed_receipt;

  select v_has_items and not exists(
    select 1
    from public.internal_supply_request_items wanted
    where wanted.request_id=p_request_id
      and not (
        exists(
          select 1
          from public.internal_purchase_receipts receipt
          join public.internal_purchase_receipt_items bought
            on bought.receipt_id=receipt.id
          where receipt.request_id=p_request_id
            and receipt.status='confirmed'
            and bought.product_id=wanted.product_id
        )
        or exists(
          select 1
          from public.internal_supply_request_item_fulfillments fulfillment
          join public.internal_purchase_receipt_items bought
            on bought.id=fulfillment.receipt_item_id
          join public.internal_purchase_receipts receipt
            on receipt.id=bought.receipt_id
          where fulfillment.request_item_id=wanted.id
            and receipt.request_id=p_request_id
            and receipt.status='confirmed'
        )
      )
  ) into v_complete;

  v_next_status:=case
    when v_complete then 'delivered'
    when v_has_confirmed_receipt then 'separating'
    else 'pending'
  end;

  update public.internal_supply_requests
  set status=v_next_status,
      closed_at=case
        when v_next_status='delivered' then coalesce(closed_at,now())
        else null
      end
  where id=p_request_id;

  return v_next_status;
end;
$$;

revoke all on function private.refresh_internal_supply_request_purchase_status(uuid)
from public, anon, authenticated;

create or replace function public.admin_link_internal_receipt_item(
  p_request_item_id uuid,
  p_receipt_item_id uuid,
  p_note text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_request_id uuid;
  v_request_status text;
  v_requested_product_id uuid;
  v_receipt_id uuid;
  v_receipt_request_id uuid;
  v_receipt_product_id uuid;
  v_receipt_protocol bigint;
  v_raw_description text;
  v_next_status text;
begin
  if not (select private.is_admin()) then
    raise exception 'Somente administradores podem confirmar correspondências do cupom.' using errcode='42501';
  end if;
  if nullif(trim(p_note),'') is null then
    raise exception 'Informe por que o item comprado corresponde ao solicitado.';
  end if;

  select wanted.request_id,wanted.product_id,request.status
  into v_request_id,v_requested_product_id,v_request_status
  from public.internal_supply_request_items wanted
  join public.internal_supply_requests request on request.id=wanted.request_id
  where wanted.id=p_request_item_id
  for update of wanted,request;

  if not found then raise exception 'Item solicitado não localizado.'; end if;
  if v_request_status='cancelled' then raise exception 'Não é possível alterar uma solicitação cancelada.'; end if;

  select bought.receipt_id,receipt.request_id,bought.product_id,receipt.protocol,bought.raw_description
  into v_receipt_id,v_receipt_request_id,v_receipt_product_id,v_receipt_protocol,v_raw_description
  from public.internal_purchase_receipt_items bought
  join public.internal_purchase_receipts receipt on receipt.id=bought.receipt_id
  where bought.id=p_receipt_item_id
    and receipt.status='confirmed'
  for update of bought,receipt;

  if not found then raise exception 'Item de cupom não localizado ou compra cancelada.'; end if;
  if v_receipt_request_id is distinct from v_request_id then
    raise exception 'Escolha um item de um cupom vinculado a esta solicitação.';
  end if;
  if v_receipt_product_id=v_requested_product_id then
    raise exception 'Este item do cupom já corresponde automaticamente ao produto solicitado.';
  end if;
  if exists(
    select 1
    from public.internal_supply_request_items other_item
    where other_item.request_id=v_request_id
      and other_item.id<>p_request_item_id
      and other_item.product_id=v_receipt_product_id
  ) then
    raise exception 'Este item do cupom já corresponde a outro produto da mesma solicitação.';
  end if;
  if exists(
    select 1
    from public.internal_supply_request_item_fulfillments fulfillment
    where fulfillment.receipt_item_id=p_receipt_item_id
      and fulfillment.request_item_id<>p_request_item_id
  ) then
    raise exception 'Este item do cupom já foi usado para confirmar outro produto.';
  end if;

  insert into public.internal_supply_request_item_fulfillments(
    request_item_id,receipt_item_id,note,created_by
  ) values(
    p_request_item_id,p_receipt_item_id,trim(p_note),v_actor
  )
  on conflict(request_item_id) do update
  set receipt_item_id=excluded.receipt_item_id,
      note=excluded.note,
      created_by=excluded.created_by,
      updated_at=now();

  v_next_status:=private.refresh_internal_supply_request_purchase_status(v_request_id);

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(
    v_actor,
    'internal_supply.receipt_item_linked',
    'internal_supply_request_item',
    p_request_item_id::text,
    jsonb_build_object(
      'request_id',v_request_id,
      'requested_product_id',v_requested_product_id,
      'receipt_id',v_receipt_id,
      'receipt_protocol',v_receipt_protocol,
      'receipt_item_id',p_receipt_item_id,
      'receipt_product_id',v_receipt_product_id,
      'raw_description',v_raw_description,
      'reason',trim(p_note),
      'resulting_status',v_next_status
    )
  );

  return v_next_status;
end;
$$;

create or replace function public.admin_unlink_internal_receipt_item(
  p_request_item_id uuid,
  p_note text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_request_id uuid;
  v_receipt_item_id uuid;
  v_previous_note text;
  v_next_status text;
begin
  if not (select private.is_admin()) then
    raise exception 'Somente administradores podem remover correspondências do cupom.' using errcode='42501';
  end if;
  if nullif(trim(p_note),'') is null then
    raise exception 'Informe o motivo da correção.';
  end if;

  select wanted.request_id,fulfillment.receipt_item_id,fulfillment.note
  into v_request_id,v_receipt_item_id,v_previous_note
  from public.internal_supply_request_item_fulfillments fulfillment
  join public.internal_supply_request_items wanted on wanted.id=fulfillment.request_item_id
  join public.internal_supply_requests request on request.id=wanted.request_id
  where fulfillment.request_item_id=p_request_item_id
    and request.status<>'cancelled'
  for update of fulfillment,wanted,request;

  if not found then raise exception 'Não existe uma correspondência manual para este item.'; end if;

  delete from public.internal_supply_request_item_fulfillments
  where request_item_id=p_request_item_id;

  v_next_status:=private.refresh_internal_supply_request_purchase_status(v_request_id);

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(
    v_actor,
    'internal_supply.receipt_item_unlinked',
    'internal_supply_request_item',
    p_request_item_id::text,
    jsonb_build_object(
      'request_id',v_request_id,
      'receipt_item_id',v_receipt_item_id,
      'previous_reason',v_previous_note,
      'reason',trim(p_note),
      'resulting_status',v_next_status
    )
  );

  return v_next_status;
end;
$$;

revoke all on function public.admin_link_internal_receipt_item(uuid,uuid,text)
from public, anon;
revoke all on function public.admin_unlink_internal_receipt_item(uuid,text)
from public, anon;
grant execute on function public.admin_link_internal_receipt_item(uuid,uuid,text)
to authenticated, service_role;
grant execute on function public.admin_unlink_internal_receipt_item(uuid,text)
to authenticated, service_role;

comment on table public.internal_supply_request_item_fulfillments is
  'Correspondência auditável entre um item solicitado e uma descrição alternativa de um cupom confirmado.';
comment on function public.admin_link_internal_receipt_item(uuid,uuid,text) is
  'Confirma que uma linha de cupom com descrição diferente atende a um item da solicitação interna.';

notify pgrst, 'reload schema';
commit;
