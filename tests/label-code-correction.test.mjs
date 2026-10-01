import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../label-lots.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260930210000_correct_unused_label_codes.sql', import.meta.url), 'utf8');

function harness({ role = 'admin', confirmed = true, rejected = false } = {}) {
  const calls = [], messages = [], alerts = [], confirmations = [];
  const nodes = new Map();
  let html = '';
  const page = {
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      if (!value.includes('id="labelLotForm"')) return;
      nodes.clear();
      nodes.set('#labelLotForm', { elements: {
        collaborator: { value: '' }, manufactured: { value: '2026-09-30' }, count: { value: '100' },
      } });
      if (value.includes('id="labelCodeForm"')) nodes.set('#labelCodeForm', { elements: {
        collaborator: { value: '' }, code: { value: '' },
      } });
      for (const id of ['#labelExpiry', '#labelCode', '#labelLotPreview', '#labelCodeHelp', '#labelLotSearch']) {
        nodes.set(id, { textContent: '', innerHTML: '' });
      }
      nodes.set('#labelLotRows', { querySelectorAll: () => [], innerHTML: '' });
    },
    querySelector(selector) { return nodes.get(selector) ?? null; },
  };
  const window = {};
  const context = {
    window,
    S: { view: 'label-lots', profile: { role }, team: [
      { id: 'worker-1', full_name: 'Colaboradora A', role: 'collaborator', status: 'active' },
      { id: 'worker-2', full_name: 'Colaboradora B', role: 'collaborator', status: 'active' },
    ] },
    esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    head: () => '',
    rest: async path => path.startsWith('collaborator_label_codes')
      ? [{ collaborator_id: 'worker-1', code: 'P1' }] : [],
    rpc: async (name, payload) => {
      calls.push({ name, payload: JSON.parse(JSON.stringify(payload)) });
      if (rejected) throw new Error('Este código já foi usado em um lote.');
      return payload.p_code;
    },
    confirm: text => { confirmations.push(text); return confirmed; },
    toast: text => messages.push(text),
    alert: text => alerts.push(text),
  };
  vm.runInNewContext(source, context);
  const render = () => window.HarmonyLabelLots.render(page);
  const correction = (next = 'D1') => {
    const form = page.querySelector('#labelCodeForm');
    form.elements.collaborator.value = 'worker-1';
    form.elements.collaborator.onchange();
    form.elements.code.value = next;
    const button = { disabled: false };
    return { button, submit: () => form.onsubmit({ preventDefault() {}, submitter: button }) };
  };
  return { page, render, correction, calls, messages, alerts, confirmations };
}

test('admin can select an already registered collaborator and enter D1', async () => {
  const h = harness();
  await h.render();
  assert.match(h.page.innerHTML, /Cadastrar ou corrigir código/);
  assert.match(h.page.innerHTML, /pattern="\[A-Z\]\[1-9\]\[0-9\]\*"/);
  const form = h.page.querySelector('#labelCodeForm');
  form.elements.collaborator.value = 'worker-1';
  form.elements.collaborator.onchange();
  assert.equal(form.elements.code.value, 'P1');
  form.elements.code.value = 'd1';
  form.elements.code.oninput();
  assert.equal(form.elements.code.value, 'D1');
});

test('P1 to D1 sends the expected old code, preserves the draft and never creates a lot', async () => {
  const h = harness();
  await h.render();
  const draft = h.page.querySelector('#labelLotForm').elements;
  draft.collaborator.value = 'worker-1';
  draft.manufactured.value = '2026-09-12';
  draft.count.value = '230';
  await h.correction().submit();
  assert.deepEqual(h.calls, [{ name: 'assign_collaborator_label_code', payload: {
    p_collaborator_id: 'worker-1', p_code: 'D1', p_expected_code: 'P1',
  } }]);
  assert.match(h.confirmations[0], /P1 para D1/);
  const restored = h.page.querySelector('#labelLotForm').elements;
  assert.equal(restored.collaborator.value, 'worker-1');
  assert.equal(restored.manufactured.value, '2026-09-12');
  assert.equal(restored.count.value, '230');
  assert.equal(h.page.querySelector('#labelCode').textContent, 'D1');
  assert.match(h.page.querySelector('#labelLotPreview').innerHTML, />D1</);
});

test('cancelling the correction does not call the database', async () => {
  const h = harness({ confirmed: false });
  await h.render();
  await h.correction().submit();
  assert.equal(h.calls.length, 0);
});

test('a server rejection preserves the current code and re-enables saving', async () => {
  const h = harness({ rejected: true });
  await h.render();
  const request = h.correction();
  await request.submit();
  assert.equal(request.button.disabled, false);
  assert.match(h.alerts[0], /já foi usado/);
  assert.equal(h.messages.length, 0);
  assert.match(h.page.innerHTML, /Colaboradora A · P1/);
});

test('unchanged codes and invalid formats do not mutate data', async () => {
  for (const code of ['P1', 'D0', 'D-1', '1D']) {
    const h = harness();
    await h.render();
    await h.correction(code).submit();
    assert.equal(h.calls.length, 0, code);
  }
});

test('receivers can view labels but do not get the correction form', async () => {
  const h = harness({ role: 'receiver' });
  await h.render();
  assert.equal(h.page.querySelector('#labelCodeForm'), null);
});

test('database correction checks all lots including cancelled ones and records an audit trail', () => {
  assert.match(migration, /before update or delete on public\.collaborator_label_codes/i);
  assert.match(migration, /l\.collaborator_id = old\.collaborator_id or l\.collaborator_code = old\.code/);
  assert.doesNotMatch(migration.split('create or replace function private.audit_')[0], /limit 60|l\.status\s*=/i);
  assert.match(migration, /insert into public\.collaborator_label_code_events/);
  assert.match(migration, /v_previous is distinct from upper\(trim\(p_expected_code\)\)/);
});

test('lot creation and correction take conflicting row locks and retain explicit RPC grants', () => {
  assert.match(migration, /where c\.collaborator_id = p_collaborator_id for update/);
  assert.match(migration, /for share of c/);
  assert.match(migration, /revoke all on function public\.assign_collaborator_label_code\(uuid, text, text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.assign_collaborator_label_code\(uuid, text, text\) to authenticated, service_role/);
  assert.match(migration, /p\.id = v_actor and p\.status = 'active' and p\.role = 'admin'/);
});

test('the official module copies remain identical', async () => {
  assert.equal(source, await readFile(new URL('../web/label-lots.js', import.meta.url), 'utf8'));
});
