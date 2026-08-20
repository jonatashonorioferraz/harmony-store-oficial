begin;

create or replace function public.admin_correct_bill_due_date_and_reactivate(
  p_bill_id uuid,
  p_due_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_bill public.bills%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if p_due_date is null then
    raise exception 'Informe o vencimento correto.';
  end if;

  select *
    into v_bill
    from public.bills
   where id = p_bill_id
   for update;

  if not found then
    raise exception 'Boleto não localizado.';
  end if;

  if v_bill.status <> 'cancelled' then
    raise exception 'Somente boletos cancelados podem ter o vencimento corrigido neste fluxo.';
  end if;

  update public.bills
     set due_date = p_due_date,
         status = 'pending',
         cancelled_at = null,
         updated_by = v_actor
   where id = p_bill_id
     and status = 'cancelled';

  if not found then
    raise exception 'O boleto foi alterado por outra pessoa. Atualize a tela e confira novamente.';
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    v_actor,
    'bill.due_date_corrected_and_reactivated',
    'bill',
    p_bill_id::text,
    jsonb_build_object(
      'previous_status', v_bill.status,
      'previous_due_date', v_bill.due_date,
      'new_due_date', p_due_date,
      'amount', v_bill.amount
    )
  );
end;
$$;

revoke all on function public.admin_correct_bill_due_date_and_reactivate(uuid, date) from public, anon, authenticated;
grant execute on function public.admin_correct_bill_due_date_and_reactivate(uuid, date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
