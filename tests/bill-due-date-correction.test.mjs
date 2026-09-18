import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../bills.js', import.meta.url), 'utf8');
const example = Object.freeze({
  id: 'test-bill', protocol: 2, status: 'pending', due_date: '2025-09-18',
  amount: 100, beneficiary_name: 'Fornecedor de teste', digit_line: '123',
  document_path: 'test/document.pdf',
});

// Lightweight DOM adapter: executes the real module and its handlers, without
// network calls or production data. This does not replace browser/SQL testing.
function harness(item = example, { rpc = async () => {} } = {}) {
  const alerts = [], calls = [], toasts = [], reloads = [], dayRefreshes = [];
  const element = () => ({ disabled: false, addEventListener(type, fn) { this['on' + type] = fn; } });
  function root() {
    const nodes = new Map();
    let html = '';
    return {
      nodes,
      get innerHTML() { return html; },
      set innerHTML(value) {
        html = value;
        nodes.clear();
        for (const [, id] of value.matchAll(/\bid="([^"]+)"/g)) nodes.set('#' + id, element());
        if (value.includes('data-close')) nodes.set('[data-close]', element());
        if (value.includes('bill-detail')) {
          nodes.set('.bill-detail .form-actions', {
            insertBefore(button) { nodes.set('#' + button.id, button); },
          });
        }
      },
      querySelector(selector) { return nodes.get(selector) || null; },
      querySelectorAll(selector) { const node = nodes.get(selector); return node ? [node] : []; },
    };
  }
  const modal = root(), page = root();
  const document = {
    createElement: element,
    querySelector(selector) {
      if (selector === '#modal') return modal;
      if (selector === '#page') return page;
      return modal.querySelector(selector) || page.querySelector(selector);
    },
    querySelectorAll(selector) { return [...modal.querySelectorAll(selector), ...page.querySelectorAll(selector)]; },
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-09-18T15:00:00Z'])); }
    static now() { return new Date('2026-09-18T15:00:00Z').getTime(); }
  }
  const context = {
    document, Date: FixedDate, S: { profile: { role: 'admin' }, view: 'home' },
    renderApp() {}, renderPage() {}, setTimeout(fn) { fn(); },
    esc: value => String(value ?? ''), head: (_label, _title, _description, actions) => actions || '',
    FormData: class { constructor(form) { this.form = form; } get() { return this.form.dueDate; } },
    alert: message => alerts.push(message), toast: message => toasts.push(message),
    rpc: async (name, params) => { calls.push({ name, params: { ...params } }); await rpc(name, params); },
    restAll: async query => { reloads.push(query); return [{ ...item, due_date: calls.at(-1)?.params.p_due_date || item.due_date }]; },
    HarmonyMyDay: { mount: force => dayRefreshes.push(force) },
  };
  context.window = context;
  vm.runInNewContext(source, context);
  context.HarmonyBills.state.items = [item];
  context.HarmonyBills.open(item.id);
  return {
    context, modal, alerts, calls, toasts, reloads, dayRefreshes,
    node: selector => document.querySelector(selector),
    edit() { document.querySelector('#correctPendingBillDueDate').onclick(); },
    submit(date) {
      const form = document.querySelector('#pendingBillDueDateCorrectionForm');
      form.dueDate = date;
      // No submitter covers keyboard/programmatic submission as well.
      return form.onsubmit({ preventDefault() {}, currentTarget: form, submitter: null });
    },
  };
}

test('a bill entered one year overdue exposes correction without losing payment actions', () => {
  const h = harness();
  assert.equal(h.context.HarmonyBills.dueState(example), 'overdue');
  assert.match(h.modal.innerHTML, /Atrasado/);
  assert.equal(h.node('#correctPendingBillDueDate').textContent, 'Corrigir vencimento');
  assert.ok(h.node('#markBillPaid'));
  assert.ok(h.node('#cancelBill'));
  assert.ok(h.node('#openBillDocument'));
  h.edit();
  assert.match(h.modal.innerHTML, /value="2025-09-18"/);
  assert.doesNotMatch(h.modal.innerHTML, /\bmin="/);
});

test('future pending bills are editable, but paid and cancelled bills keep their separate flows', () => {
  assert.ok(harness({ ...example, due_date: '2027-09-18' }).node('#correctPendingBillDueDate'));
  for (const status of ['paid', 'cancelled']) {
    const h = harness({ ...example, status });
    assert.equal(h.node('#correctPendingBillDueDate'), null);
    assert.equal(h.node('#markBillPaid'), null);
    assert.equal(Boolean(h.node('#correctAndReactivateBill')), status === 'cancelled');
  }
});

test('saving sends only bill ID and due date, then reloads bills and home alerts', async () => {
  const h = harness();
  h.edit();
  await h.submit('2026-10-18');
  assert.deepEqual(h.calls, [{ name: 'admin_correct_pending_bill_due_date', params: { p_bill_id: 'test-bill', p_due_date: '2026-10-18' } }]);
  assert.equal(example.due_date, '2025-09-18', 'the client must not mutate its original financial record');
  assert.equal(h.reloads.length, 1);
  assert.deepEqual(h.dayRefreshes, [true]);
  assert.equal(h.context.HarmonyBills.dueState(h.context.HarmonyBills.state.items[0]), 'pending');
  assert.equal(h.modal.innerHTML, '');
  assert.equal(h.toasts.length, 1);
  assert.deepEqual(h.alerts, []);
});

test('missing or unchanged dates do not call the backend or disable saving', async () => {
  const h = harness();
  h.edit();
  await h.submit('');
  await h.submit(example.due_date);
  assert.equal(h.calls.length, 0);
  assert.equal(h.alerts.length, 2);
  assert.equal(h.node('#savePendingBillDueDate').disabled, false);
});

test('a failed correction retains the form and allows retry without claiming success', async () => {
  const h = harness(example, { rpc: async () => { throw Error('Acesso negado.'); } });
  h.edit();
  await h.submit('2026-10-18');
  assert.deepEqual(h.alerts, ['Acesso negado.']);
  assert.ok(h.node('#pendingBillDueDateCorrectionForm'));
  assert.equal(h.node('#savePendingBillDueDate').disabled, false);
  assert.equal(h.toasts.length, 0);
  assert.equal(h.reloads.length, 0);
});

test('repeated submission during saving does not send a duplicate correction', async () => {
  let release;
  const h = harness(example, { rpc: () => new Promise(resolve => { release = resolve; }) });
  h.edit();
  const saving = h.submit('2026-10-18');
  assert.equal(h.node('#savePendingBillDueDate').disabled, true);
  await h.submit('2026-10-18');
  assert.equal(h.calls.length, 1);
  release();
  await saving;
});

test('a corrected date may still be overdue and returning to details does not save', async () => {
  const h = harness();
  h.edit();
  h.node('[data-close]').onclick();
  assert.equal(h.calls.length, 0);
  assert.ok(h.node('#correctPendingBillDueDate'));
  h.edit();
  await h.submit('2026-09-17');
  assert.equal(h.calls.length, 1);
  assert.equal(h.context.HarmonyBills.dueState(h.context.HarmonyBills.state.items[0]), 'overdue');
});
