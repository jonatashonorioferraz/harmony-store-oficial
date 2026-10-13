import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({
  Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, Blob, Response,
  CompressionStream, DecompressionStream, setTimeout, atob, btoa,
  fetch() { throw Error('Network access forbidden during conversion'); },
});
for (const file of ['vendor/pdf-lib.js','vendor/code128.js','engine.js','picking.js','invoices.js']) {
  vm.runInContext(await readFile(new URL('../shipping-labels/' + file, import.meta.url), 'utf8'), context);
}
const {LocalZpl, LocalInvoices, LocalPicking, PDFLib} = context;
const clone = value => JSON.parse(JSON.stringify(value));
function key(number, series = 1) {
  const prefix = '3526100000000000010055' + String(series).padStart(3,'0') +
    String(number).padStart(9,'0') + '1' + '12345678';
  let sum = 0, weight = 2;
  for (let i = 42; i >= 0; i--) { sum += Number(prefix[i]) * weight; weight = weight === 9 ? 2 : weight + 1; }
  const remainder = sum % 11;
  return prefix + (remainder < 2 ? 0 : 11 - remainder);
}
function invoice(number, series = 1) {
  return {key: key(number, series), invoiceNumber: String(number), series: String(series),
    postcode: '01234567', issuer: '00000000000100',
    pages: [{source: 'synthetic.pdf', pageIndex: 0, sheet: 1,
      products: [{code:'TESTE', description:'Kit com 200 itens - COR: AZUL', variation:'AZUL', quantity:'1', unit:'UN'}]}]};
}
const label = number => ({width:8, height:8, raw:new Uint8Array(8).fill(255),
  metadata:{invoiceNumber:String(number), postcode:'01234567', shipmentId:String(10000000000 + number)}});

test('bitmap ZPL becomes a printable PDF with exact thermal dimensions', async () => {
  const pages = await LocalZpl.parseZpl('^XA^FO0,0^GFA,8,8,1,FFFFFFFFFFFFFFFF^FS^XZ');
  assert.equal(pages.length, 1);
  const pdf = await LocalZpl.createPdf(pages, 203, '100x150');
  const doc = await PDFLib.PDFDocument.load(await pdf.arrayBuffer());
  const page = doc.getPage(0);
  assert.ok(Math.abs(page.getWidth() - 100 / 25.4 * 72) < 0.00001);
  assert.ok(Math.abs(page.getHeight() - 150 / 25.4 * 72) < 0.00001);
  await assert.rejects(LocalZpl.unzip(new Uint8Array(40)), /ZIP inválido/);
  await assert.rejects(LocalZpl.parseZpl('^XA^FO0,0^GFA,8,8,1,FF^FS^XZ'), /incompleto/);
});

test('NF-e check digit and recipient cell identify the invoice without customer names', () => {
  const item = (str, x, y) => ({str, transform:[1,0,0,1,x,y]});
  const items = [item(key(123),10,700), item('DESTINATARIO / REMETENTE',10,600),
    item('CEP',400,580), item('01234-567',400,567),
    item('CEP',400,790), item('98765-432',400,779), item('1 de 1',200,660)];
  const info = LocalInvoices.pageInfo(items);
  assert.equal(info.invoiceNumber, '123'); assert.equal(info.postcode, '01234567');
  assert.equal(LocalInvoices.validKey(key(123)), true);
  assert.equal(LocalInvoices.validKey(key(123).slice(0,43) + ((Number(key(123)[43])+1)%10)), false);
  assert.throws(() => LocalInvoices.pageInfo([]), /sem texto pesquisável/);
});

test('matching is independent of PDF order and refuses missing, extra, duplicated or ambiguous notes', () => {
  const labels = [label(1), label(2)], invoices = [invoice(2), invoice(1)];
  const rows = LocalInvoices.pair(labels, invoices);
  assert.deepEqual(clone(rows.map(r => r.invoice.invoiceNumber)), ['1','2']);
  for (const [batch, notes, reason] of [
    [labels, [invoice(1)], 'não encontrada'],
    [[label(1)], invoices, 'sem etiqueta'],
    [[label(1), label(1)], [invoice(1)], 'repetido'],
    [[label(1)], [invoice(1), invoice(1,2)], 'mais de uma nota'],
    [[{...label(1), metadata:{...label(1).metadata, postcode:'99999999'}}], [invoice(1)], 'diferente'],
    [[{...label(1), metadata:{}}], [invoice(1)], 'ausente'],
  ]) {
    assert.throws(() => LocalInvoices.pair(batch, notes), error => error.issues.some(i => i.includes(reason)));
  }
});

test('100 orders produce 200 alternating label/product pages and preserve the quantity of kits', async () => {
  const labels = Array.from({length:100}, (_, i) => label(i+1));
  const invoices = Array.from({length:100}, (_, i) => invoice(100-i));
  const result = await LocalInvoices.createPairedPdf(labels, {invoices}, [], 203, () => {}, 'picking');
  const doc = await PDFLib.PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 200);
  assert.equal(result.sequence.length, 200);
  for (let i = 0; i < 100; i++) {
    assert.equal(result.sequence[i*2].kind, 'label');
    assert.equal(result.sequence[i*2+1].kind, 'picking');
    assert.equal(result.sequence[i*2+1].row.invoice.invoiceNumber, String(i+1));
    assert.equal(result.sequence[i*2+1].row.invoice.pages[0].products[0].quantity, '1');
  }
  for (const page of doc.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 100/25.4*72) < 0.00001);
    assert.ok(Math.abs(page.getHeight() - 150/25.4*72) < 0.00001);
  }
  assert.equal(LocalPicking.variation('Kit de rosas'), null);
  assert.equal(LocalPicking.variation('Kit - COR: AZUL'), 'AZUL');
});

test('unrecognized product tables cannot silently yield empty picking sheets', async () => {
  const note = invoice(1); note.pages[0].productError = 'Tabela não reconhecida';
  await assert.rejects(
    LocalInvoices.createPairedPdf([label(1)], {invoices:[note]}, [], 203, () => {}, 'picking'),
    /Tabela não reconhecida/,
  );
});
