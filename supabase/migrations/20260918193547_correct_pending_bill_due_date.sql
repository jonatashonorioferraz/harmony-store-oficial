-- Corrige exclusivamente o vencimento de um boleto pendente.
-- Preserva linha digitável, valor, beneficiário, documentos e histórico.
-- Versão alinhada ao registro aplicado no Supabase de produção.

begin;

create or replace function public.admin_correct_pending_bill_due_date(
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

  if v_bill.status <> 'pending' then
    raise exception 'Somente boletos pendentes podem ter o vencimento corrigido neste fluxo.';
  end if;

  if v_bill.due_date = p_due_date then
    raise exception 'Informe uma data diferente do vencimento atual.';
  end if;

  update public.bills
     set due_date = p_due_date,
         updated_by = v_actor
   where id = p_bill_id
     and status = 'pending';

  if not found then
    raise exception 'O boleto foi alterado por outra pessoa. Atualize a tela e confira novamente.';
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    v_actor,
    'bill.pending_due_date_corrected',
    'bill',
    p_bill_id::text,
    jsonb_build_object(
      'previous_due_date', v_bill.due_date,
      'new_due_date', p_due_date,
      'amount', v_bill.amount,
      'status', v_bill.status
    )
  );
end;
$$;

revoke all on function public.admin_correct_pending_bill_due_date(uuid, date) from public, anon, authenticated;
grant execute on function public.admin_correct_pending_bill_due_date(uuid, date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
