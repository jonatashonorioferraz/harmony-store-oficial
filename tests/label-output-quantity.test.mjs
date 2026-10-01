import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(process.env.LABEL_QUANTITY_SOURCE || new URL('../label-lots.js', import.meta.url), 'utf8');

function harness({ count = 1000, events = [], status = 'active', rejectOutput = false } = {}) {
  const lot = {
    id: 'isolated-lot', lot_number: 999, collaborator_id: 'isolated-worker',
    collaborator_name: 'Colaboradora de teste', collaborator_code: 'Z9',
    manufactured_on: '2026-09-30', expires_on: '2027-09-30',
    requested_label_count: count, status,
  };
  const history = events.map(event => ({ actor_name: 'Teste', created_at: '2026-09-30T12:00:00Z', ...event }));
  const calls = [], downloads = [], alerts = [], pdfOptions = [];
  const pageNodes = new Map(), detailNodes = new Map(), urls = new Map(), session = new Map();
  let pageHtml = '', detailHtml = '', buttons = [];
  const row = { dataset: { lotId: lot.id } };
  const page = {
    get innerHTML() { return pageHtml; },
    set innerHTML(html) {
      pageHtml = html;
      if (!html.includes('id="labelLotForm"')) return;
      pageNodes.clear();
      pageNodes.set('#labelLotForm', { elements: {
        collaborator: { value: '' }, manufactured: { value: '2026-09-30' }, count: { value: '100' },
      } });
      for (const id of ['#labelExpiry', '#labelCode', '#labelLotPreview', '#labelLotSearch']) {
        pageNodes.set(id, { textContent: '', innerHTML: '' });
      }
      pageNodes.set('#labelLotRows', { querySelectorAll: () => [row], innerHTML: '' });
    },
    querySelector: selector => pageNodes.get(selector) ?? null,
  };
  const detail = {
    get innerHTML() { return detailHtml; },
    set innerHTML(html) {
      detailHtml = html;
      detailNodes.clear();
      buttons = [];
      if (!html.includes('id="closeLabelLot"')) return;
      detailNodes.set('#closeLabelLot', {});
      const input = html.match(/<input id="labelOutputCount"[^>]*>/)?.[0];
      if (!input) return;
      detailNodes.set('#labelOutputCount', {
        value: input.match(/value="([^"]*)"/)[1], readOnly: input.includes('readonly'),
      });
      detailNodes.set('#labelOutputDpi', { value: '203' });
      if (html.includes('id="labelOutputReason"')) detailNodes.set('#labelOutputReason', { value: '' });
      buttons = ['pdf', 'zpl'].map(format => ({ dataset: { labelOutput: format }, disabled: false }));
    },
    querySelector: selector => detailNodes.get(selector) ?? null,
    querySelectorAll: selector => selector === '[data-label-output]' ? buttons : [],
    scrollIntoView() {},
  };
  const document = {
    querySelector: selector => selector === '#labelLotDetail' ? detail : selector === '#page' ? page : null,
    body: { appendChild() {} },
    createElement(tag) {
      if (tag === 'canvas') {
        const canvas = { width: 0, height: 0 };
        canvas.getContext = () => ({
          fillRect() {}, drawImage() {},
          getImageData: () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255) }),
        });
        return canvas;
      }
      assert.equal(tag, 'a');
      return {
        click() { downloads.push({ name: this.download, blob: urls.get(this.href) }); },
        remove() {},
      };
    },
  };
  const window = { HarmonyThermalPdf: {
    createPdfBlobFromCanvas: async (_canvas, options) => {
      pdfOptions.push({ widthMm: options.widthMm, heightMm: options.heightMm });
      return new Blob(['isolated-pdf'], { type: 'application/pdf' });
    },
  } };
  const context = {
    window, document, Blob, Uint8ClampedArray,
    Image: class { set src(_value) { queueMicrotask(() => this.onload()); } },
    URL: {
      createObjectURL(blob) { const id = 'blob:test-' + urls.size; urls.set(id, blob); return id; },
      revokeObjectURL() {},
    },
    setTimeout: () => 0,
    crypto: { randomUUID },
    sessionStorage: {
      getItem: key => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, value),
      removeItem: key => session.delete(key),
    },
    S: { view: 'label-lots', profile: { role: 'receiver' }, team: [
      { id: lot.collaborator_id, full_name: lot.collaborator_name, role: 'collaborator', status: 'active' },
    ] },
    esc: value => String(value ?? ''), head: () => '',
    rest: async path => {
      if (path.startsWith('collaborator_label_codes?')) return [{ collaborator_id: lot.collaborator_id, code: lot.collaborator_code }];
      if (path.startsWith('label_lots?')) return [lot];
      assert.ok(path.startsWith('label_lot_events?'));
      return history.map(event => ({ ...event }));
    },
    rpc: async (name, payload) => {
      assert.equal(name, 'record_label_output', 'No lot, stock or production mutations are allowed');
      calls.push({ name, payload: JSON.parse(JSON.stringify(payload)) });
      if (rejectOutput) throw Error('Falha simulada');
      history.push({
        event_type: history.some(event => ['generated', 'reprinted'].includes(event.event_type)) ? 'reprinted' : 'generated',
        label_count: payload.p_label_count, output_format: payload.p_output_format,
        reason: payload.p_reason, actor_name: 'Teste', created_at: '2026-09-30T12:00:00Z',
      });
      return {};
    },
    alert: message => alerts.push(message), toast() {},
    confirm: () => { throw Error('No real lot confirmation is permitted'); },
  };
  vm.runInNewContext(source, context);
  return {
    lot, detail, calls, downloads, alerts, pdfOptions,
    quantity: () => detailNodes.get('#labelOutputCount'),
    async open() { await window.HarmonyLabelLots.render(page); await row.onclick(); },
    async generate(format, { quantity, reason } = {}) {
      if (quantity !== undefined) detailNodes.get('#labelOutputCount').value = String(quantity);
      if (reason !== undefined) detailNodes.get('#labelOutputReason').value = reason;
      const button = buttons.find(item => item.dataset.labelOutput === format);
      assert.ok(button, 'Output action must be available');
      await button.onclick();
      return button;
    },
  };
}

async function assertZpl(h, count) {
  assert.equal(h.alerts.length, 0, h.alerts.join('; '));
  const file = h.downloads.at(-1);
  assert.equal(file.name, 'lote-999-Z9-' + count + '-etiquetas.zpl');
  const zpl = await file.blob.text();
  assert.match(zpl, /^\^XA\n\^PW480\n\^LL320\n/);
  assert.match(zpl, new RegExp('\\n\\^PQ' + count + '\\n\\^XZ$'));
  assert.equal(h.calls.at(-1).payload.p_label_count, count);
}

test('first ZPL uses the quantity registered for the lot', async () => {
  const h = harness();
  await h.open();
  assert.equal(h.quantity().value, '1000');
  assert.equal(h.quantity().readOnly, true);
  await h.generate('zpl');
  await assertZpl(h, 1000);
});

test('PDF followed by ZPL preserves all 1000 requested labels', async () => {
  const h = harness();
  await h.open();
  await h.generate('pdf');
  assert.equal(h.downloads[0].name, 'lote-999-Z9.pdf');
  assert.deepEqual(h.pdfOptions, [{ widthMm: 60, heightMm: 40 }]);
  assert.equal(h.quantity().value, '1000');
  await h.generate('zpl', { reason: 'Exportar o mesmo lote em ZPL' });
  await assertZpl(h, 1000);
  assert.deepEqual(h.calls.map(call => call.payload.p_label_count), [1000, 1000]);
});

test('an old 50-label export does not replace the lot quantity on reopening', async () => {
  const h = harness({ events: [{ event_type: 'reprinted', output_format: 'zpl', label_count: 50 }] });
  await h.open();
  assert.equal(h.quantity().value, '1000');
  await h.generate('zpl', { reason: 'Corrigir quantidade do arquivo anterior' });
  await assertZpl(h, 1000);
});

test('defaults follow each lot rather than a fixed 50 or 1000', async () => {
  for (const count of [1, 230, 2500, 100000]) {
    const h = harness({ count, events: [{ event_type: 'generated', output_format: 'pdf', label_count: count }] });
    await h.open();
    assert.equal(h.quantity().value, String(count));
    await h.generate('zpl', { reason: 'Exportar formato alternativo' });
    await assertZpl(h, count);
  }
});

test('an explicitly chosen reprint quantity is honored without changing the lot', async () => {
  const h = harness({ events: [{ event_type: 'generated', output_format: 'pdf', label_count: 1000 }] });
  await h.open();
  await h.generate('zpl', { quantity: 20, reason: 'Reposicao de etiquetas danificadas' });
  await assertZpl(h, 20);
  assert.equal(h.lot.requested_label_count, 1000);
  assert.equal(h.quantity().value, '1000');
});

test('reprint reason remains mandatory and invalid quantities cannot download', async () => {
  const h = harness({ events: [{ event_type: 'generated', output_format: 'pdf', label_count: 1000 }] });
  await h.open();
  await h.generate('zpl');
  assert.equal(h.alerts.length, 1);
  for (const quantity of [0, 1.5, 100001]) await h.generate('zpl', { quantity, reason: 'Teste isolado' });
  assert.equal(h.alerts.length, 4);
  assert.equal(h.calls.length, 0);
  assert.equal(h.downloads.length, 0);
});

test('cancelled lots have no export action', async () => {
  const h = harness({ status: 'cancelled' });
  await h.open();
  assert.equal(h.detail.querySelectorAll('[data-label-output]').length, 0);
  assert.equal(h.calls.length, 0);
});

test('a rejected output record never downloads a file', async () => {
  const h = harness({ rejectOutput: true });
  await h.open();
  const button = await h.generate('zpl');
  assert.equal(h.downloads.length, 0);
  assert.equal(h.alerts[0], 'Falha simulada');
  assert.equal(button.disabled, false);
});

test('module and release asset mirrors remain synchronized', async () => {
  for (const path of ['label-lots.js', 'index.html', 'service-worker.js']) {
    const canonical = await readFile(new URL('../' + path, import.meta.url), 'utf8');
    const mirror = await readFile(new URL('../web/' + path, import.meta.url), 'utf8');
    assert.equal(canonical, mirror, path);
  }
});
