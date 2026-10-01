import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { businessDate, evaluateOperational, readSource, operationalHandler, SOURCE_FIELDS, SOURCE_LIMIT } from '../supabase/functions/operational-central/evaluator.mjs';

const NOW = '2026-10-02T02:59:59.000Z';
const id = number => '00000000-0000-4000-8000-' + String(number).padStart(12, '0');
const bill = (number, due, status = 'pending') => ({ id: id(number), protocol: number, status, due_date: due, updated_at: '2026-10-01T10:00:00+00:00' });
const request = (number, overrides = {}) => ({ id: id(number), protocol: number, status: 'pending', created_at: '2026-09-28T02:59:59Z', scheduled_for: null, updated_at: '2026-10-01T10:00:00Z', ...overrides });
const source = (name, rows) => ({ id: name, status: 'evaluated', complete: true, row_count: rows.length, fetched_at: NOW, error_code: null, rows });
const evaluate = (bills = [], requests = [], evaluatedAt = NOW) => evaluateOperational({ sources: [source('bills', bills), source('requests', requests)], evaluatedAt });
function fakeClient({ rows = {}, pageCap = 500, profile = { role: 'admin', status: 'active' }, authError = null, profileError = null, respond } = {}) {
  const calls = [], tokens = [];
  let profilesRead = 0;
  return {
    calls, tokens,
    auth: { async getUser(token) { tokens.push(token); return { data: { user: authError ? null : { id: id(999) } }, error: authError }; } },
    from(table) {
      const call = { table }, chain = {
        select(fields, options) { Object.assign(call, { fields, options }); return chain; },
        order(column, options) { Object.assign(call, { order: { column, options } }); return chain; },
        range(from, to) { Object.assign(call, { from, to }); return chain; },
        eq(column, value) { Object.assign(call, { eq: { column, value } }); return chain; },
        single() { call.single = true; return chain; },
        abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return chain; },
        then(resolve, reject) {
          calls.push(call);
          try {
            if (table === 'profiles') {
              profilesRead++;
              return Promise.resolve({ data: typeof profile === 'function' ? profile(profilesRead) : profile, error: profileError }).then(resolve, reject);
            }
            const override = respond?.(call, calls);
            if (override !== undefined) return Promise.resolve(override).then(resolve, reject);
            const values = rows[table] || [];
            return Promise.resolve({ data: call.options?.head ? null : values.slice(call.from, Math.min(call.to + 1, call.from + pageCap)), count: values.length, error: null }).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        },
      };
      return chain;
    },
  };
}
const post = (token = 'signed-user-jwt', body = {}) => new Request('https://local.invalid/operational-central', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: JSON.stringify(body) });
const handlerFor = client => operationalHandler({ clientForToken: token => { assert.equal(token, 'signed-user-jwt'); return client; }, now: () => new Date(NOW) });

test('São Paulo midnight defines exclusive overdue/today/tomorrow groups, independently of machine timezone', () => {
  assert.equal(businessDate('2026-10-02T02:59:59Z'), '2026-10-01');
  assert.equal(businessDate('2026-10-02T03:00:00Z'), '2026-10-02');
  assert.equal(businessDate('2026-10-02T11:59:59+09:00'), '2026-10-01');
  const rows = [bill(1, '2026-09-30'), bill(2, '2026-10-01'), bill(3, '2026-10-02'), bill(4, '2026-10-03')];
  const before = evaluate(rows);
  assert.deepEqual(before.summary.counts, { overdue_bills: 1, due_today_bills: 1, due_tomorrow_bills: 1, open_requests: 0, past_scheduled_requests: 0 });
  assert.equal(new Set(before.conditions.map(item => item.entity_id)).size, before.conditions.length);
  const after = evaluate(rows, [], '2026-10-02T03:00:00Z');
  assert.equal(after.summary.counts.overdue_bills, 2);
  assert.equal(after.conditions.find(item => item.entity_id === id(2)).rule, 'FIN-01');
});
test('tomorrow handles month/year boundaries and paid/cancelled bills never produce conditions', () => {
  const result = evaluate([bill(1, '2026-12-31'), bill(2, '2027-01-01'), bill(3, '2026-09-01', 'paid'), bill(4, '2026-09-01', 'cancelled')], [], '2027-01-01T02:00:00Z');
  assert.equal(result.summary.counts.due_tomorrow_bills, 1);
  assert.equal(result.summary.counts.overdue_bills, 0);
  assert.equal(result.conditions.length, 2);
  assert.equal(result.conditions[1].facts.horizon, 'tomorrow');
});
test('request age measures elapsed hours/days and schedule compares instants, without inventing an SLA', () => {
  const result = evaluate([], [
    request(1, { status: 'scheduled', scheduled_for: '2026-10-01T23:59:58-03:00' }),
    request(2, { status: 'scheduled', scheduled_for: NOW }),
    request(3, { status: 'delivered' }), request(4, { status: 'cancelled' }),
  ]);
  assert.equal(result.summary.counts.open_requests, 2);
  assert.equal(result.summary.counts.past_scheduled_requests, 1);
  const age = result.conditions.find(item => item.rule === 'REQ-01');
  assert.equal(age.facts.age_days, 4);
  assert.equal(age.facts.age_hours, 96);
  assert.match(age.message, /não define prazo/);
  assert.equal(result.conditions.filter(item => item.rule === 'REQ-02').length, 1);
});
test('output is deterministic under reordered facts and priorities never repeat an entity', () => {
  const bills = [bill(2, '2026-10-01'), bill(1, '2026-09-30')];
  const requests = [request(6), request(5, { status: 'scheduled', scheduled_for: '2026-09-30T10:00:00Z' })];
  const first = evaluate(bills, requests), second = evaluate([...bills].reverse(), [...requests].reverse());
  assert.deepEqual(first, second);
  assert.equal(first.atomic_snapshot, false);
  assert.deepEqual(first.priorities.map(item => item.rule), ['FIN-01', 'REQ-02', 'FIN-02']);
  assert.equal(new Set(first.priorities.map(item => item.entity_type + ':' + item.entity_id)).size, first.priorities.length);
  assert.equal(first.conditions.filter(item => item.entity_id === id(5)).length, 2);
});
test('unavailable domain uses unknown counts and DAT while preserving the other source', () => {
  const result = evaluateOperational({
    sources: [{ id: 'bills', status: 'unavailable', complete: false, error_code: 'READ_FAILED' }, source('requests', [request(1)])], evaluatedAt: NOW,
  });
  assert.equal(result.summary.counts.overdue_bills, null);
  assert.equal(result.summary.counts.open_requests, 1);
  assert.equal(result.summary.evaluated_sources, 1);
  assert.equal(result.priorities[0].rule, 'DAT-01');
  assert.match(result.summary.text, /Boletos não avaliados/);
  assert.ok(!result.conditions.some(item => item.family === 'financial'));
});
test('quality failures reject entire domain, rather than calculating partial or zero facts', () => {
  for (const rows of [
    [bill(1, '2026-02-30')],
    [bill(1, '2026-09-30'), bill(1, '2026-10-01')],
    [{ ...bill(1, '2026-09-30'), protocol: Number.MAX_SAFE_INTEGER + 1 }],
    [{ ...bill(1, '2026-09-30'), updated_at: 'tomorrow' }],
    [{ ...bill(1, '2026-09-30'), status: 'unrecognized' }],
  ]) {
    const result = evaluate(rows);
    assert.equal(result.sources[0].complete, false);
    assert.equal(result.summary.counts.overdue_bills, null);
    assert.equal(result.conditions[0].rule, 'DAT-01');
  }
  for (const row of [request(1, { status: 'scheduled' }), request(1, { created_at: '2027-01-01T00:00:00Z' }), request(1, { created_at: '2026-02-30T00:00:00Z' })]) {
    assert.equal(evaluate([], [row]).summary.counts.open_requests, null);
  }
});
test('metadata projection does not expose names, amounts, notes, URLs or auth IDs', () => {
  const result = evaluate([{ ...bill(1, '2026-09-30'), amount: 9182.11, beneficiary_name: 'DO_NOT_EXPOSE', digit_line: 'SECRET_LINE' }],
    [request(2, { notes: 'PRIVATE_NOTES', requested_by: 'PRIVATE_PERSON' })]);
  const serialized = JSON.stringify(result);
  for (const value of ['9182.11', 'DO_NOT_EXPOSE', 'SECRET_LINE', 'PRIVATE_NOTES', 'PRIVATE_PERSON']) assert.ok(!serialized.includes(value));
  assert.equal(Object.hasOwn(result.sources[0], 'rows'), false);
  assert.deepEqual(Object.keys(result.conditions[0].facts).sort(), ['business_date', 'due_date', 'status']);
});
test('pagination reads beyond 1000 rows and server page caps using exact counts and stable ID order', async () => {
  const rows = Array.from({ length: 1251 }, (_, index) => bill(index + 1, '2026-10-01'));
  const client = fakeClient({ rows: { bills: rows }, pageCap: 400 });
  const result = await readSource(client, 'bills');
  assert.equal(result.complete, true);
  assert.equal(result.row_count, 1251);
  assert.deepEqual(client.calls.filter(call => !call.options?.head).map(call => call.from), [0, 400, 800, 1200]);
  assert.ok(client.calls.every(call => call.options.count === 'exact'));
  assert.ok(client.calls.filter(call => !call.options.head).every(call => call.fields === SOURCE_FIELDS.bills && call.order.column === 'id'));
  assert.equal(client.calls.at(-1).options.head, true);
});
test('explicit row limit, missing count, duplicate key, short capture and changed final count never become zero', async () => {
  const cases = [
    { response: { data: [], count: SOURCE_LIMIT + 1 }, code: 'ROW_LIMIT' },
    { response: { data: [], count: null }, code: 'COUNT_UNAVAILABLE' },
    { response: { data: [bill(1, '2026-10-01'), bill(1, '2026-10-01')], count: 2 }, code: 'DUPLICATE_KEY' },
    { response: { data: [], count: 1 }, code: 'PAGE_INCOMPLETE' },
  ];
  for (const item of cases) {
    const client = fakeClient({ respond: () => item.response });
    const result = await readSource(client, 'bills');
    assert.equal(result.error_code, item.code);
    assert.equal(result.row_count, null);
    assert.equal(result.complete, false);
  }
  const changed = fakeClient({ rows: { bills: [bill(1, '2026-10-01')] }, respond: call => call.options.head ? { count: 0, error: null } : undefined });
  assert.equal((await readSource(changed, 'bills')).error_code, 'COUNT_CHANGED');
});
test('independent source failure preserves valid conditions and never leaks raw database errors', async () => {
  const client = fakeClient({ rows: { requests: [request(1)] }, respond: call => call.table === 'bills' ? { error: { message: 'RAW_DB_SECRET' } } : undefined });
  const response = await handlerFor(client)(post());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.summary.counts.overdue_bills, null);
  assert.equal(result.summary.counts.open_requests, 1);
  assert.ok(!JSON.stringify(result).includes('RAW_DB_SECRET'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('missing or invalid JWT blocks all operational reads', async () => {
  const client = fakeClient({ authError: { status: 401 } });
  assert.equal((await handlerFor(client)(post(null))).status, 401);
  assert.equal(client.tokens.length, 0);
  assert.equal((await handlerFor(client)(post())).status, 401);
  assert.deepEqual(client.tokens, ['signed-user-jwt']);
  assert.equal(client.calls.length, 0);
});
test('only active admin is authorized; manager flag and primary-admin flag do not replace role', async () => {
  for (const profile of [
    { role: 'collaborator', status: 'active', is_ecommerce_manager: true },
    { role: 'receiver', status: 'active', is_primary_admin: true },
    { role: 'admin', status: 'inactive' },
  ]) {
    const client = fakeClient({ profile });
    assert.equal((await handlerFor(client)(post())).status, 403);
    assert.ok(client.calls.every(call => call.table === 'profiles'));
  }
  for (const is_primary_admin of [true, false]) {
    const client = fakeClient({ profile: { role: 'admin', status: 'active', is_primary_admin } });
    assert.equal((await handlerFor(client)(post())).status, 200);
    assert.equal(client.calls[0].eq.value, id(999));
  }
});
test('role revoked while collecting data fails closed after final profile recheck', async () => {
  const client = fakeClient({ rows: { bills: [bill(1, '2026-09-30')] }, profile: count => ({ role: count === 1 ? 'admin' : 'collaborator', status: 'active' }) });
  const response = await handlerFor(client)(post());
  assert.equal(response.status, 403);
  const result = await response.json();
  assert.equal(result.conditions, undefined);
  assert.equal(result.error.code, 'ACCESS_DENIED');
});
test('client body cannot set evaluation clock, sources or administrative scope', async () => {
  const client = fakeClient({ rows: { bills: [bill(1, '2026-10-01')] } });
  const response = await handlerFor(client)(post('signed-user-jwt', { evaluatedAt: '2100-01-01', role: 'admin', tables: ['profiles'], limit: 0 }));
  const result = await response.json();
  assert.equal(result.evaluated_at, NOW);
  assert.equal(result.business_date, '2026-10-01');
  assert.equal(result.summary.counts.due_today_bills, 1);
  assert.deepEqual(result.sources.map(item => item.id), ['bills', 'requests']);
});
test('unverifiable permission and configuration return unavailable; no wrong-domain fallback', async () => {
  const client = fakeClient({ profileError: { code: 'NETWORK' } });
  assert.equal((await handlerFor(client)(post())).status, 503);
  assert.ok(client.calls.every(call => call.table === 'profiles'));
  const broken = operationalHandler({ clientForToken: () => { throw new Error('private configuration'); } });
  const response = await broken(post());
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('private configuration'));
  assert.equal((await handlerFor(fakeClient())(new Request('https://local.invalid'))).status, 405);
});
test('Edge adapter forwards user token on public client; implementation contains no business writes or service-role fallback', async () => {
  const index = await readFile(new URL('../supabase/functions/operational-central/index.ts', import.meta.url), 'utf8');
  const evaluator = await readFile(new URL('../supabase/functions/operational-central/evaluator.mjs', import.meta.url), 'utf8');
  assert.match(index, /Authorization: "Bearer " \+ token/);
  assert.match(index, /SUPABASE_ANON_KEY/);
  assert.match(index, /SUPABASE_PUBLISHABLE_KEYS/);
  assert.doesNotMatch(index, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/);
  assert.doesNotMatch(index + evaluator, /\.(insert|update|upsert|delete|rpc|invoke)\(/);
  assert.ok(!SOURCE_FIELDS.bills.includes('*'));
  assert.ok(!SOURCE_FIELDS.requests.includes('*'));
});
