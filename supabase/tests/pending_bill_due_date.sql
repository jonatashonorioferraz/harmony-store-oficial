-- Executar como administrador do banco, após a migração.
-- Somente registros fictícios: todas as alterações são desfeitas por ROLLBACK.
-- O protocolo negativo não consome a sequência dos boletos. A sequência da
-- auditoria pode avançar (comportamento normal de sequências em rollback).
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';
set local plpgsql.check_asserts = on;

do $$
declare
  v_admin uuid;
  v_worker uuid;
  v_id uuid := gen_random_uuid();
  v_before jsonb;
  v_after jsonb;
  v_line text := lpad(floor(random() * 1e15)::bigint::text, 44, '0');
  v_status text;
begin
  select id into v_admin from public.profiles
   where role = 'admin' and status = 'active' order by id limit 1;
  select id into v_worker from public.profiles
   where role <> 'admin' and status = 'active' order by id limit 1;
  assert v_admin is not null and v_worker is not null, 'Perfis necessários para o teste ausentes';
  assert not has_function_privilege('anon', 'public.admin_correct_pending_bill_due_date(uuid,date)', 'execute'), 'Anon não deve executar';
  assert has_function_privilege('authenticated', 'public.admin_correct_pending_bill_due_date(uuid,date)', 'execute'), 'RPC deve estar acessível a sessões autenticadas';

  insert into public.bills(id, protocol, beneficiary_name, amount, due_date, digit_line, created_by, updated_by)
  overriding system value
  values (v_id, -(floor(random() * 1e15)::bigint + 1), '__TEST_ROLLBACK_PENDING_DUE_DATE__', 12.34,
          current_date - 365, v_line, v_admin, v_admin);
  select to_jsonb(b) into v_before from public.bills b where id = v_id;

  -- Usuário autenticado sem perfil ADM não pode usar a RPC.
  perform set_config('request.jwt.claim.sub', v_worker::text, true);
  execute 'set local role authenticated';
  begin
    perform public.admin_correct_pending_bill_due_date(v_id, current_date + 10);
    raise exception 'TEST_FAILED: colaboradora conseguiu corrigir';
  exception when insufficient_privilege then null;
  end;

  -- Identidade ausente também deve falhar, mesmo com role authenticated.
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.admin_correct_pending_bill_due_date(v_id, current_date + 10);
    raise exception 'TEST_FAILED: identidade ausente conseguiu corrigir';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  -- O schema private não é exposto ao papel authenticated. A autorização é
  -- exercitada pela RPC pública, e o ator é confirmado na auditoria abaixo.
  perform public.admin_correct_pending_bill_due_date(v_id, current_date + 10);
  execute 'reset role';

  select to_jsonb(b) into v_after from public.bills b where id = v_id;
  assert (v_after->>'due_date')::date = current_date + 10, 'Vencimento não corrigido';
  assert (v_after - array['due_date','updated_by','updated_at']) =
         (v_before - array['due_date','updated_by','updated_at']), 'Outro dado financeiro foi alterado';
  assert (select count(*) = 1 from public.audit_logs
           where entity_id = v_id::text and action = 'bill.pending_due_date_corrected'
             and actor_id = v_admin
             and (details->>'previous_due_date')::date = current_date - 365
             and (details->>'new_due_date')::date = current_date + 10), 'Auditoria incompleta';

  execute 'set local role authenticated';
  begin
    perform public.admin_correct_pending_bill_due_date(v_id, null);
    raise exception 'TEST_FAILED: aceitou data nula';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'Informe o vencimento correto.' then raise; end if;
  end;
  begin
    perform public.admin_correct_pending_bill_due_date(v_id, current_date + 10);
    raise exception 'TEST_FAILED: aceitou data repetida';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'Informe uma data diferente do vencimento atual.' then raise; end if;
  end;
  begin
    perform public.admin_correct_pending_bill_due_date(gen_random_uuid(), current_date + 10);
    raise exception 'TEST_FAILED: aceitou boleto inexistente';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'Boleto não localizado.' then raise; end if;
  end;
  execute 'reset role';

  foreach v_status in array array['paid','cancelled'] loop
    update public.bills set status = v_status, paid_at = now(), paid_by = v_admin where id = v_id;
    execute 'set local role authenticated';
    begin
      perform public.admin_correct_pending_bill_due_date(v_id, current_date + 11);
      raise exception 'TEST_FAILED: aceitou status %', v_status;
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'Somente boletos pendentes podem ter o vencimento corrigido neste fluxo.' then raise; end if;
    end;
    execute 'reset role';
    assert (select due_date = current_date + 10 from public.bills where id = v_id), 'Data de pago/cancelado foi alterada';
  end loop;
  assert (select count(*) = 1 from public.audit_logs where entity_id = v_id::text), 'Tentativa rejeitada deixou auditoria de sucesso';

  begin
    insert into public.bills(protocol, beneficiary_name, amount, due_date, digit_line, created_by, updated_by)
    overriding system value
    values (-(floor(random() * 1e15)::bigint + 1), '__TEST_ROLLBACK_PENDING_DUE_DATE__', 12.34,
            current_date, v_line, v_admin, v_admin);
    raise exception 'TEST_FAILED: aceitou boleto duplicado';
  exception when unique_violation then null;
  end;
end;
$$;
rollback;

select 'correcao_validada_com_rollback' as result,
       (select count(*) from public.bills where beneficiary_name = '__TEST_ROLLBACK_PENDING_DUE_DATE__') as test_records_remaining;
