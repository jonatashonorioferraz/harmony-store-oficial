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

function multiItemInvoice(count) {
  const note=invoice(1),colors=['AZUL','ROSA','BRANCO','VERDE'];
  note.pages[0].products=Array.from({length:count},(_,i)=>({
    code:'MESMO-SKU', quantity:String(i+1), unit:'UN',
    description:'Kit 50 Mini Sabonetes Coracao + 50 Letra Cubo + 50 Mini Rosa - COR: '+colors[i%4],
    variation:colors[i%4],
  }));
  return note;
}

test('compact picking groups up to four distinct variations per page without merging same-SKU items', async () => {
  for(const count of [1,2,4,5,7,10,11]){
    const note=multiItemInvoice(count),before=clone(note);
    const layout=await LocalPicking.plan([note],await PDFLib.PDFDocument.create());
    const sheets=layout.layouts.get(note.key).sheets;
    assert.equal(sheets.length,Math.ceil(count/4));
    assert.deepEqual(clone(sheets.map(s=>s.length)),Array.from({length:Math.ceil(count/4)},(_,i)=>Math.min(4,count-i*4)));
    const cards=sheets.flat();
    assert.deepEqual(clone(cards.map(c=>c.index)),Array.from({length:count},(_,i)=>i));
    assert.deepEqual(clone(cards.map(c=>c.product.quantity)),before.pages[0].products.map(p=>p.quantity));
    assert.deepEqual(clone(cards.map(c=>c.product.variation)),before.pages[0].products.map(p=>p.variation));
    assert.deepEqual(clone(note),before);
    for(const card of cards){
      assert.ok(card.size>=10);
      assert.equal(card.description.join(' '),'Kit 50 Mini Sabonetes Coracao + 50 Letra Cubo + 50 Mini Rosa');
      assert.ok(card.variant.join(' ').endsWith(card.product.variation));
    }
  }
});

test('a ten-item order stays together before the next shipping label and page report uses the compact count', async () => {
  const first=multiItemInvoice(10),second=invoice(2);
  // Products across original DANFE pages belong to one order and one packing plan.
  first.pages.push({...first.pages[0],pageIndex:1,products:first.pages[0].products.splice(6)});
  const result=await LocalInvoices.createPairedPdf([label(1),label(2)],{invoices:[second,first]},[],203,()=>{},'picking');
  assert.deepEqual(clone(result.sequence.map(p=>p.kind)),['label','picking','picking','picking','label','picking']);
  assert.deepEqual(clone(result.rows.map(r=>[r.labelPage,r.invoiceStart,r.invoiceEnd])),[[1,2,4],[5,6,6]]);
  assert.deepEqual(clone(result.sequence.slice(1,4).map(p=>[p.sheet,p.totalSheets])),[[1,3],[2,3],[3,3]]);
  assert.equal((await PDFLib.PDFDocument.load(result.bytes)).getPageCount(),6);
});

test('moving the variation preserves whether it is color, fragrance or size', async () => {
  for(const suffix of ['COR: AZUL','AROMA: LAVANDA','TAMANHO: GRANDE','CORES E AROMAS PADRAO: BRANCO - DOVE']){
    const note=invoice(1),product=note.pages[0].products[0];
    product.description='Sabonete personalizado - '+suffix;
    product.variation=LocalPicking.variation(product.description);
    const layout=await LocalPicking.plan([note],await PDFLib.PDFDocument.create());
    const card=layout.layouts.get(note.key).sheets[0][0];
    assert.equal(card.description.join(' '),'Sabonete personalizado');
    assert.equal(card.variant.join(' '),suffix);
  }
});

test('long descriptions use fewer items instead of tiny type, clipped text or a split item', async () => {
  const note=multiItemInvoice(4);
  note.pages[0].products[0].description=('Descrição completa com detalhes do produto. ').repeat(22).trim();
  note.pages[0].products[0].variation=null;
  note.pages[0].products[1].code='CODIGO_SEM_ESPACOS_'.repeat(12);
  note.pages[0].products[2].variation='AZUL CLARO - PERFUME SUAVE - EMBALAGEM INDIVIDUAL';
  const layout=await LocalPicking.plan([note],await PDFLib.PDFDocument.create());
  const sheets=layout.layouts.get(note.key).sheets;
  assert.ok(sheets.length>1);
  assert.equal(sheets.flat().length,4);
  assert.equal(sheets[0][0].description.join(' '),note.pages[0].products[0].description);
  const pages=[];
  LocalPicking.draw({addPage(size){
    const calls=[];pages.push({size,calls});
    return {drawText(text,options){calls.push({text,...options});},drawLine(){},drawRectangle(){}};
  }},{invoice:note,shipmentId:'10000000001'},layout);
  for(const page of pages)for(const t of page.calls){
    assert.ok(t.x>=12-0.001 && t.x+t.font.widthOfTextAtSize(t.text,t.size)<=page.size[0]-12+0.001,t.text);
    assert.ok(t.y>=10 && t.y+t.font.heightAtSize(t.size,{descender:false})<page.size[1],t.text);
  }
  note.pages[0].products[0].description='Texto '.repeat(2000);
  await assert.rejects(LocalPicking.plan([note],await PDFLib.PDFDocument.create()),/longa demais/);
});

test('standalone MCY does not consume a label or mask damaged formats', async()=>{
 const a='^XA^FO0,0^GFA,8,8,1,FFFFFFFFFFFFFFFF^FS^XZ';
 const b=a.replace('FFFFFFFFFFFFFFFF','0000000000000000');
 const progress=[];
 const pages=await LocalZpl.parseZpl(a+'^XA\n^MCY\n^XZ'+b,{onProgress:(n,total)=>progress.push([n,total])});
 assert.equal(pages.length,2);assert.equal(pages[0].raw[0],255);assert.equal(pages[1].raw[0],0);
 assert.deepEqual(progress,[[1,3],[2,3],[3,3]]);
 await assert.rejects(LocalZpl.parseZpl('^XA^MCY^XZ'),/Nenhuma etiqueta/);
 await assert.rejects(LocalZpl.parseZpl(a+'^XA^MCY^FO0,0^GFA,8,8,1,FF^FS^XZ'));
});
test('NF and Nota fiscal labels retain ambiguity instead of guessing',()=>{
 assert.equal(LocalZpl.labelMetadata('^FDNota fiscal #24169^FS').invoiceNumber,'24169');
 assert.equal(LocalZpl.labelMetadata('^FDNF: 24.169^FS').invoiceNumber,'24169');
 assert.equal(LocalZpl.labelMetadata('^FDNota fiscal #24169^FS^FDNF: 24170^FS').invoiceNumber,null);
});
