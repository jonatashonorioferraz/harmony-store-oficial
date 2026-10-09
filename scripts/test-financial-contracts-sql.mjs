// In-memory PostgreSQL tests only. Never connect to Supabase or production.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { TABLE_CATALOG } from './backup-catalog.mjs';

if (!process.env.PGLITE_ROOT) throw new Error('PGLITE_ROOT required; remote fallback is forbidden.');
const require = createRequire(join(process.env.PGLITE_ROOT, 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/20261008200451_financial_contracts_foundation.sql', import.meta.url), 'utf8');
const ids = Array.from({ length: 8 }, () => randomUUID());
const [primary, writer, reader, worker, receiver, inactive, manager, otherWriter] = ids;
const entity = randomUUID(), otherEntity = randomUUID();
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.result;
async function identity(role, uid = '') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await db.exec('set role ' + role);
}
const detail = id => scalar('select public.financial_contract_detail($1) result', [id]);
const create = input => scalar('select public.create_financial_contract($1::jsonb) result', [JSON.stringify(input)]);
const pay = (id, revision, input) => scalar('select public.record_contract_payment($1,$2,$3::jsonb) result', [id, revision, JSON.stringify(input)]);
const permission = (id, who, access) => scalar('select public.set_financial_permission($1,$2,$3) result', [id, who, access]);
const reverse = (id, revision, key, reason = 'Registro corrigido apos conferencia manual') =>
  scalar('select public.reverse_contract_payment($1,$2,$3,$4) result', [id, revision, key, reason]);
const tables = [
  'financial_entities', 'financial_permissions', 'financial_contracts', 'contract_schedule_versions',
  'contract_installments', 'contract_payments', 'contract_payment_allocations',
  'contract_payment_reversals', 'contract_audit_events',
];
const input = (owner = entity, creditor = 'Credor ficticio A') => ({
  entity_id: owner, idempotency_key: randomUUID(), title: 'Contrato sintetico', creditor_name: creditor,
  contract_date: '2020-01-01',
  installments: [
    { due_date: '2020-01-31', amount: '100.01', kind: 'down_payment' },
    { due_date: '2020-02-29', amount: '80.10' },
    { due_date: '2020-03-31', amount: '20.09', kind: 'balloon' },
  ],
});
let contract, otherContract, duplicateContract, originalInput, installmentIds, paymentInput, firstPayment;
try {
  await db.exec(String.raw`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create table public.profiles (
      id uuid primary key,role text not null,status text not null,
      is_primary_admin boolean not null default false,is_ecommerce_manager boolean not null default false
    );
    create function private.is_primary_admin() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active' and is_primary_admin)
    $$;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
  `);
  for (let i = 0; i < ids.length; i++) {
    await db.query('insert into public.profiles values($1,$2,$3,$4,$5)', [
      ids[i], i === 3 ? 'collaborator' : i === 4 || i === 6 ? 'receiver' : 'admin',
      i === 5 ? 'inactive' : 'active', i === 0, i === 6,
    ]);
  }
  await check('migration is additive and creates no business records', async () => {
    await db.exec(migration);
    for (const table of tables) assert.equal(await scalar('select count(*)::int result from public.' + table), 0);
    assert.equal(await scalar('select count(*)::int result from public.profiles'), ids.length);
  });
  await check('RLS enabled and inherited write grants removed for every financial table', async () => {
    for (const table of tables) {
      assert.equal(await scalar("select relrowsecurity result from pg_class where oid=$1::regclass", ['public.' + table]), true);
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await scalar("select has_table_privilege($1,$2,'SELECT') result", [role, 'public.' + table]), role !== 'anon');
        for (const op of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
          assert.equal(await scalar('select has_table_privilege($1,$2,$3) result', [role, 'public.' + table, op]), false);
      }
    }
  });
  await check('RPC execution is not inherited by anonymous or service identities', async () => {
    const functions = await db.query("select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'");
    for (const f of functions.rows) {
      assert.equal(await scalar("select has_function_privilege('anon',$1,'EXECUTE') result", [f.signature]), false);
      assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE') result", [f.signature]), false);
      assert.equal(await scalar("select has_function_privilege('authenticated',$1,'EXECUTE') result", [f.signature]), true);
    }
  });
  await check('anonymous cannot enter; operational profiles have no automatic financial access', async () => {
    await identity('anon');
    await assert.rejects(() => scalar('select public.financial_access() result'), /permission denied/);
    for (const id of [writer, reader, worker, receiver, inactive, manager]) {
      await identity('authenticated', id);
      assert.deepEqual(await scalar('select public.financial_access() result'), []);
      await assert.rejects(() => scalar('select public.create_financial_entity($1,$2) result', [entity, 'Teste']), /principal necessario/);
    }
  });
  await check('primary creates separate entities idempotently and audits creation once', async () => {
    await identity('authenticated', primary);
    const a = await scalar('select public.create_financial_entity($1,$2) result', [entity, 'Empresa ficticia A']);
    assert.equal(a.created_by, primary);
    await scalar('select public.create_financial_entity($1,$2) result', [entity, 'Empresa ficticia A']);
    await assert.rejects(() => scalar('select public.create_financial_entity($1,$2) result', [entity, 'Nome diferente']), /Identificador/);
    await scalar('select public.create_financial_entity($1,$2) result', [otherEntity, 'Empresa ficticia B']);
    assert.equal(await scalar("select count(*)::int result from public.contract_audit_events where action='entity.created'"), 2);
  });
  await check('only active administrators can receive delegated financial permissions', async () => {
    await permission(entity, writer, 'write');
    await permission(entity, reader, 'read');
    await permission(otherEntity, otherWriter, 'write');
    for (const id of [worker, receiver, inactive, manager])
      await assert.rejects(() => permission(entity, id, 'write'), /Administrador elegivel/);
    await identity('authenticated', writer);
    await assert.rejects(() => permission(entity, reader, 'write'), /principal necessario/);
    const access = await scalar('select public.financial_access() result');
    assert.equal(access.length, 1); assert.equal(access[0].id, entity); assert.equal(access[0].can_write, true);
  });
  await check('contract total is authoritative; down payment is a schedule item, not an automatic payment', async () => {
    originalInput = input(); contract = await create(originalInput);
    const d = await detail(contract.id); installmentIds = d.installments.map(x => x.id);
    assert.equal(d.contract.total_amount, 200.2);
    assert.equal(Number(d.totals.scheduled_amount), 200.2);
    assert.equal(Number(d.totals.paid_amount), 0);
    assert.equal(Number(d.totals.remaining_amount), 200.2);
    assert.equal(d.installments[0].kind, 'down_payment');
    assert.equal(d.payments.length, 0); assert.equal(d.audit[0].action, 'contract.created');
  });
  await check('contract retries do not create a second contract and cannot replace the original request', async () => {
    const replay = await create(originalInput);
    assert.equal(replay.id, contract.id); assert.equal(replay.replayed, true);
    await assert.rejects(() => create({ ...originalInput, title: 'Outra coisa' }), /repeticao com dados diferentes/);
    await assert.rejects(() => create({ ...input(), total_amount: '1.00' }), /Campo financeiro nao permitido/);
    await assert.rejects(() => create({ ...input(), installments: [] }), /1 a 600/);
  });
  await check('company isolation applies to both RLS reads and guarded RPCs', async () => {
    await identity('authenticated', otherWriter);
    otherContract = await create(input(otherEntity, 'Outro credor'));
    await assert.rejects(() => detail(contract.id), /Acesso financeiro negado/);
    assert.equal(await scalar('select count(*)::int result from public.financial_contracts'), 1);
    await identity('authenticated', writer);
    assert.equal(await scalar('select count(*)::int result from public.financial_contracts'), 1);
    await assert.rejects(() => detail(otherContract.id), /Acesso financeiro negado/);
    await assert.rejects(() => create(input(otherEntity)), /Acesso financeiro negado/);
  });
  await check('read-only delegate can consult but cannot create, pay or grant permissions', async () => {
    await identity('authenticated', reader);
    assert.equal((await detail(contract.id)).can_write, false);
    await assert.rejects(() => create(input()), /Acesso financeiro negado/);
    await assert.rejects(() => pay(contract.id, 1, {}), /Acesso financeiro negado/);
    await assert.rejects(() => permission(entity, reader, 'write'), /principal necessario/);
    await identity('authenticated', writer);
  });
  paymentInput = {
    idempotency_key: randomUUID(), amount: '60.01', effective_date: '2020-01-02', kind: 'historical',
    transaction_reference: ' pix-test-001 ', notes: 'Historico informado manualmente, sem comprovante anexado',
    allocations: [{ installment_id: installmentIds[0], amount: '60.01' }],
  };
  await check('partial payment preserves cents, effective date and distinct registration timestamp', async () => {
    firstPayment = await pay(contract.id, 1, paymentInput);
    const d = await detail(contract.id);
    assert.equal(firstPayment.revision, 2);
    assert.equal(Number(d.totals.paid_amount), 60.01); assert.equal(Number(d.totals.remaining_amount), 140.19);
    assert.equal(d.installments[0].remaining, 40); assert.equal(d.totals.settled_installments, 0);
    assert.equal(d.payments[0].effective_date, '2020-01-02');
    assert.notEqual(d.payments[0].created_at.slice(0, 10), d.payments[0].effective_date);
    assert.equal(d.payments[0].created_by, writer);
    assert.equal(d.payments[0].transaction_reference, 'PIX-TEST-001');
  });
  await check('idempotent payment retry accepts the old revision without another ledger entry', async () => {
    const result = await pay(contract.id, 1, paymentInput);
    assert.equal(result.replayed, true); assert.equal(result.id, firstPayment.id);
    assert.equal((await detail(contract.id)).payment_count, 1);
    await assert.rejects(() => pay(contract.id, 2, { ...paymentInput, amount: '60.02' }), /repeticao com dados diferentes/);
  });
  const candidate = overrides => ({
    ...paymentInput, idempotency_key: randomUUID(), amount: '10.00', transaction_reference: null,
    allocations: [{ installment_id: installmentIds[0], amount: '10.00' }], ...overrides,
  });
  await check('stale or missing revision blocks concurrent administrator decisions', async () => {
    await assert.rejects(() => pay(contract.id, 1, candidate()), /Contrato mudou/);
    await assert.rejects(() => pay(contract.id, null, candidate()), /Contrato mudou/);
  });
  await check('same bank transaction reference is blocked even with a different amount and date', async () => {
    await assert.rejects(() => pay(contract.id, 2, candidate({ transaction_reference: 'PIX-test-001', effective_date: '2020-01-03' })), /Transacao ja registrada/);
  });
  await check('date, precision, non-finite values and future transfers cannot be confirmed', async () => {
    for (const amount of ['NaN', 'Infinity', '-1', '0', '1.001', '1000000000000'])
      await assert.rejects(() => pay(contract.id, 2, candidate({ amount })), /Valor monetario/);
    await assert.rejects(() => pay(contract.id, 2, candidate({ effective_date: '2025-02-29' })), /date|Data|range/i);
    const tomorrow = await scalar("select (((now() at time zone 'America/Sao_Paulo')::date)+1)::text result");
    await assert.rejects(() => pay(contract.id, 2, candidate({ effective_date: tomorrow })), /Pagamento futuro/);
  });
  await check('allocations must belong to the contract, be unique, and exactly total the payment', async () => {
    await assert.rejects(() => pay(contract.id, 2, candidate({ allocations: [] })), /Distribuicao invalida/);
    await assert.rejects(() => pay(contract.id, 2, candidate({ allocations: [{ installment_id: installmentIds[0], amount: '9.99' }] })), /somar exatamente/);
    await assert.rejects(() => pay(contract.id, 2, candidate({ allocations: [
      { installment_id: installmentIds[0], amount: '5.00' }, { installment_id: installmentIds[0], amount: '5.00' },
    ] })), /repetida/);
    await assert.rejects(() => pay(contract.id, 2, candidate({ allocations: [{ installment_id: randomUUID(), amount: '10.00' }] })), /nao pertence/);
    await identity('authenticated', otherWriter);
    const foreignId = (await detail(otherContract.id)).installments[0].id;
    await identity('authenticated', writer);
    await assert.rejects(() => pay(contract.id, 2, candidate({ allocations: [{ installment_id: foreignId, amount: '10.00' }] })), /nao pertence/);
  });
  await check('overpayment and invalid record types fail atomically without leaving partial entries', async () => {
    await assert.rejects(() => pay(contract.id, 2, candidate({ amount: '40.01', allocations: [{ installment_id: installmentIds[0], amount: '40.01' }] })), /ultrapassa/);
    await assert.rejects(() => pay(contract.id, 2, candidate({ kind: 'scheduled_transfer' })), /check constraint/);
    await assert.rejects(() => pay(contract.id, 2, candidate({ created_by: primary })), /Campo financeiro nao permitido/);
    assert.equal((await detail(contract.id)).payment_count, 1);
    assert.equal((await detail(contract.id)).contract.revision, 2);
  });
  await check('duplicate amount/date/creditor is detected across contracts in the same entity', async () => {
    duplicateContract = await create(input());
    const target = (await detail(duplicateContract.id)).installments[0].id;
    const duplicate = { ...paymentInput, idempotency_key: randomUUID(), transaction_reference: null, allocations: [{ installment_id: target, amount: '60.01' }] };
    await assert.rejects(() => pay(duplicateContract.id, 1, duplicate), /Possivel duplicidade/);
    const confirmed = await pay(duplicateContract.id, 1, { ...duplicate, duplicate_reason: 'Dois pagamentos distintos conferidos manualmente' });
    assert.equal(confirmed.replayed, false);
    assert.equal((await detail(duplicateContract.id)).payments[0].duplicate_reason, 'Dois pagamentos distintos conferidos manualmente');
    await assert.rejects(() => pay(duplicateContract.id, 2, paymentInput), /repeticao com dados diferentes/);
  });
  await check('reversal requires current revision and a reason, preserves original, and restores balances', async () => {
    const key = randomUUID();
    await assert.rejects(() => reverse(firstPayment.id, 1, key), /Contrato mudou/);
    await assert.rejects(() => reverse(firstPayment.id, 2, key, 'curto'), /check constraint/);
    const r = await reverse(firstPayment.id, 2, key);
    assert.equal(r.revision, 3);
    const d = await detail(contract.id);
    assert.equal(Number(d.totals.paid_amount), 0); assert.equal(Number(d.totals.remaining_amount), 200.2);
    assert.equal(d.payment_count, 1); assert.equal(d.payments[0].amount, 60.01);
    assert.equal(d.payments[0].allocations.length, 1); assert.equal(d.payments[0].reversal.id, r.id);
    assert.equal((await reverse(firstPayment.id, 2, key)).replayed, true);
    await assert.rejects(() => reverse(firstPayment.id, 3, key, 'Motivo diferente para a mesma chave'), /repeticao com dados diferentes/);
    await assert.rejects(() => reverse(firstPayment.id, 3, randomUUID()), /ja estornado/);
    const replay = await pay(contract.id, 1, paymentInput);
    assert.equal(replay.replayed, true); assert.equal(replay.reversed, true);
    assert.equal(Number((await detail(contract.id)).totals.paid_amount), 0);
  });
  await check('one payment can settle multiple installments with exact decimal totals', async () => {
    const p = candidate({
      amount: '200.20', effective_date: '2020-01-03', kind: 'extra',
      transaction_reference: 'PIX-test-001',
      allocations: installmentIds.map((id, i) => ({ installment_id: id, amount: ['100.01', '80.10', '20.09'][i] })),
    });
    const result = await pay(contract.id, 3, p); assert.equal(result.revision, 4);
    const d = await detail(contract.id);
    assert.equal(Number(d.totals.paid_amount), 200.2); assert.equal(Number(d.totals.remaining_amount), 0);
    assert.equal(d.totals.settled_installments, 3);
    assert.equal(d.totals.balance_type, 'scheduled_balance_not_creditor_settlement_quote');
  });
  await check('all ledger writes have actor, timestamp and before/after totals in restricted audit', async () => {
    const d = await detail(contract.id);
    assert.equal(d.audit_count, 4);
    for (const row of d.audit) {
      assert.equal(row.actor_id, writer); assert.ok(row.created_at);
      if (row.action !== 'contract.created') assert.ok(row.before_data.remaining_amount);
    }
    await identity('authenticated', otherWriter);
    assert.equal(await scalar('select count(*)::int result from public.contract_audit_events where contract_id=$1', [contract.id]), 0);
    await identity('authenticated', writer);
  });
  await check('direct table mutations cannot bypass guarded RPCs', async () => {
    for (const table of tables) {
      await assert.rejects(() => db.query('delete from public.' + table), /permission denied/);
      await assert.rejects(() => db.query('insert into public.' + table + ' default values'), /permission denied/);
    }
    await assert.rejects(() => db.query("update public.financial_contracts set total_amount=1"), /permission denied/);
    await assert.rejects(() => scalar('select private.financial_contract_totals($1) result', [contract.id]), /permission denied/);
  });
  await check('database-level history mutation guards protect privileged accidental edits too', async () => {
    await identity('postgres');
    for (const table of tables.filter(t => t.startsWith('contract_'))) {
      await assert.rejects(() => db.query('update public.' + table + ' set id=id'), /Historico financeiro imutavel/);
    }
    await assert.rejects(() => db.query('truncate public.contract_audit_events'), /Historico financeiro imutavel/);
  });
  await check('monthly anchor handles February, leap years, month 31 and seven-year schedules', async () => {
    const month = (day, offset) => scalar('select private.financial_month_date($1::date,$2)::text result', [day, offset]);
    assert.equal(await month('2027-01-31', 1), '2027-02-28');
    assert.equal(await month('2027-01-31', 2), '2027-03-31');
    assert.equal(await month('2028-01-31', 1), '2028-02-29');
    assert.equal(await month('2028-02-29', 12), '2029-02-28');
    assert.equal(await month('2028-01-31', 83), '2034-12-31');
    const installments = [];
    for (let i = 0; i < 84; i++) installments.push({ due_date: await month('2028-01-31', i), amount: '100.03' });
    await identity('authenticated', writer);
    const c = await create({ ...input(), title: 'Cronograma de sete anos', installments });
    const d = await detail(c.id);
    assert.equal(d.installments.length, 84); assert.equal(Number(d.totals.scheduled_amount), 8402.52);
    assert.equal(d.installments[83].due_date, '2034-12-31');
  });
  await check('pagination is bounded and summaries do not confuse a page with total count', async () => {
    const page = await scalar('select public.financial_contracts_list($1,1,0) result', [entity]);
    assert.equal(page.items.length, 1); assert.equal(page.count, 3);
    const next = await scalar('select public.financial_contracts_list($1,1,1) result', [entity]);
    assert.notEqual(page.items[0].id, next.items[0].id);
    await assert.rejects(() => scalar('select public.financial_contracts_list($1,101,0) result', [entity]), /Paginacao invalida/);
    await assert.rejects(() => scalar('select public.financial_contract_detail($1,-1,0) result', [contract.id]), /Paginacao invalida/);
    const end = await scalar('select public.financial_contract_detail($1,1000,1000) result', [contract.id]);
    assert.deepEqual(end.payments, []); assert.deepEqual(end.audit, []); assert.equal(end.payment_count, 2);
  });
  await check('revocation and inactive profile immediately remove previously delegated access', async () => {
    await identity('authenticated', primary);
    await permission(entity, reader, 'revoked');
    await identity('authenticated', reader);
    await assert.rejects(() => detail(contract.id), /Acesso financeiro negado/);
    assert.deepEqual(await scalar('select public.financial_access() result'), []);
    await identity('postgres');
    await db.query("update public.profiles set status='inactive' where id=$1", [writer]);
    await identity('authenticated', writer);
    await assert.rejects(() => detail(contract.id), /Acesso financeiro negado/);
    await assert.rejects(() => pay(contract.id, 4, candidate()), /Acesso financeiro negado/);
    await identity('postgres');
    await db.query("update public.profiles set status='active' where id=$1", [writer]);
  });
  await check('catalog includes new tables, exact PK/FK metadata, immutable triggers and backup-only service grants', async () => {
    for (const table of tables) {
      const catalog = TABLE_CATALOG.find(t => t.name === table);
      assert.ok(catalog); assert.equal(catalog.capture, true);
      assert.equal(catalog.serviceSelect, true); assert.equal(catalog.serviceInsert, false);
      const pk = await scalar("select array_agg(a.attname order by k.ord) result from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum where c.conrelid=$1::regclass and c.contype='p'", ['public.' + table]);
      assert.deepEqual(catalog.primaryKey, pk);
      const fks = (await db.query(String.raw`
        select jsonb_build_object(
          'columns',(select jsonb_agg(a.attname order by k.ord) from unnest(c.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num),
          'schema',n.nspname,'table',t.relname,'deferrable',c.condeferrable,
          'targetColumns',(select jsonb_agg(a.attname order by k.ord) from unnest(c.confkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num)
        ) value
        from pg_constraint c join pg_class t on t.oid=c.confrelid join pg_namespace n on n.oid=t.relnamespace
        where c.contype='f' and c.conrelid=$1::regclass
      `, ['public.' + table])).rows.map(r => r.value);
      const key = fk => [fk.columns.join(','), fk.schema, fk.table, fk.targetColumns.join(','), fk.deferrable].join('|');
      assert.deepEqual(catalog.foreignKeys.map(key).sort(), fks.map(key).sort());
      const triggers = (await db.query('select tgname from pg_trigger where tgrelid=$1::regclass and not tgisinternal order by tgname', ['public.' + table])).rows.map(r => r.tgname);
      assert.deepEqual([...catalog.triggers].sort(), triggers);
    }
    await identity('service_role');
    assert.equal(await scalar('select count(*)::int result from public.financial_contracts'), 4);
    await assert.rejects(() => db.query('insert into public.contract_payments default values'), /permission denied/);
  });
  console.log('Financial SQL isolated: ' + passed + ' scenarios passed; no remote connections or real records.');
} finally {
  await db.close();
}
