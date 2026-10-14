import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {harness} from './shipping-labels-ui-harness.mjs';

const file = {name:'etiquetas-exemplo.zpl',size:12000};
const invoice = {name:'notas-exemplo.pdf',size:1000000};
const page = (number,kind='label') => ({kind,row:{invoice:{invoiceNumber:String(number)},shipmentId:String(10000000000+number)},sheet:1,totalSheets:1});

test('workspace counts selected files and bytes without storing or uploading documents', async () => {
  const h = await harness();
  h.set({labels:[file],invoices:[invoice]});
  assert.deepEqual(h.queryAll('dd').map(n=>n.textContent), ['1','1','1 MB']);
  assert.match(h.query('.workspace-file-inventory').textContent,/etiquetas-exemplo.zpl/);
  h.clickText('Adicionar etiquetas'); h.clickText('Adicionar notas');
  assert.equal(h.query('#files').clicks,1); assert.equal(h.query('#invoice-files').clicks,1);
  assert.equal(h.query('.workspace-finder').hidden,false);
});

test('search opens the exact PDF page for the NF and keeps the PDF unchanged', async () => {
  const h = await harness(); const sequence=[page(1),page(1,'picking'),page(2),page(2,'picking')];
  h.set({labels:[file],invoices:[invoice],sequence});
  h.input(h.query('#workspace-search'),'NF 2');
  assert.equal(h.query('.workspace-results').children.length,2);
  h.clickText('Ver p\u00e1gina 3');
  assert.deepEqual(Array.from(h.context.previewCalls),[2]);
  assert.equal(vm.runInContext('sequence.length',h.context),4);
  h.clickText('Fichas'); assert.equal(h.query('.workspace-results').children.length,1);
  assert.match(h.query('.workspace-results').textContent,/p\u00e1gina 4/);
});

test('page jumps reject non-integers, out-of-bounds indexes and unavailable sessions', async () => {
  const h = await harness(); h.set({labels:[file],sequence:[page(1),page(2)]});
  for(const value of ['0','3','1.5','']){h.input(h.query('#workspace-page-number'),value);h.clickText('Ir');}
  assert.equal(h.context.previewCalls.length,0); assert.equal(h.query('#workspace-page-number').validityReported,true);
  h.input(h.query('#workspace-page-number'),'2');h.clickText('Ir');
  assert.deepEqual(Array.from(h.context.previewCalls),[1]);
  for(const value of [0,3,1.5,'1',null])h.window.dispatchEvent(new h.Event('harmony-labels:preview-page',{detail:{page:value}}));
  assert.equal(h.context.previewCalls.length,1);
  vm.runInContext('authorized=false',h.context);
  h.window.dispatchEvent(new h.Event('harmony-labels:preview-page',{detail:{page:1}}));
  assert.equal(h.context.previewCalls.length,1);
});

test('partial PDF search retains pending documents without pretending they are PDF pages', async () => {
  const h = await harness(); const pending=h.query('#resolution-items');
  const card=h.add(pending,'article');h.add(card,'h3').textContent='NF 2 - envio pendente';h.add(card,'p').textContent='Adicione a nota faltante.';
  h.query('#resolution-panel').hidden=false;
  h.set({labels:[file],invoices:[invoice],sequence:[page(1),page(1,'picking')],partial:true});
  assert.match(h.query('.workspace-result-summary').textContent,/PDF parcial/);
  h.input(h.query('#workspace-search'),'NF 2');
  assert.equal(h.query('.workspace-results').children.length,1);
  h.clickText('Ver como resolver');assert.equal(card.scrolled,true);assert.equal(card.classList.contains('workspace-located'),true);
  assert.equal(h.context.previewCalls.length,0);assert.equal(pending.children.length,1);assert.equal(card.hidden,false);
});

test('pre-PDF search navigates to confirmed rows without generating or changing the batch', async () => {
  const h = await harness(); const row=h.add(h.query('#pairing-rows'),'tr');
  for(const text of ['10000000001','1 / 1','Sabonete','notas-exemplo.pdf'])h.add(row,'td').textContent=text;
  h.query('#pairing-report').hidden=false; h.set({labels:[file],invoices:[invoice]});
  h.clickText('Ver confer\u00eancia'); assert.equal(row.scrolled,true); assert.equal(h.context.previewCalls.length,0);
  assert.equal(h.query('.workspace-page-jump').hidden,true);
});

test('Excel order search uses the exact long order ID without presenting it as a fiscal number',async()=>{
 const h=await harness(),row=h.add(h.query('#pairing-rows'),'tr');row.dataset.orderId='2000000000000001';
 for(const text of ['10000000001',row.dataset.orderId,'2 UNID Kit de teste','sales.xlsx'])h.add(row,'td').textContent=text;
 h.query('#pairing-report').hidden=false;h.set({labels:[file]});
 h.input(h.query('#workspace-search'),'Pedido 2000000000000001');assert.equal(h.query('.workspace-results').children.length,1);assert.match(h.query('.workspace-results').textContent,/Pedido 2000000000000001/);
 h.input(h.query('#workspace-search'),'NF 2000000000000001');assert.equal(h.query('.workspace-results').children.length,0);
 h.input(h.query('#workspace-search'),'2000000000000002');assert.equal(h.query('.workspace-results').children.length,0);
});

test('results are paginated and clearing a filter preserves all original inputs', async () => {
  const h = await harness(); h.set({labels:[file],sequence:Array.from({length:12},(_,i)=>page(i+1))});
  assert.equal(h.query('.workspace-results').children.length,8);
  h.clickText('Mostrar mais resultados');assert.equal(h.query('.workspace-results').children.length,12);
  h.input(h.query('#workspace-search'),'inexistente');assert.equal(h.query('.workspace-results').children.length,0);
  h.clickText('Limpar busca');assert.equal(h.query('.workspace-results').children.length,8);
  assert.equal(vm.runInContext('selected.length',h.context),1);
});

test('changing or clearing the batch removes old page controls and document names', async () => {
  const h = await harness();h.set({labels:[file],invoices:[invoice],sequence:[page(1)]});
  h.set({labels:[{name:'novo.zpl',size:10}]});
  assert.equal(h.query('.workspace-page-jump').hidden,true);
  assert.doesNotMatch(h.query('.workspace-file-inventory').textContent,/etiquetas-exemplo|notas-exemplo/);
  assert.equal(h.query('.workspace-results').children.length,0);
  h.set();assert.equal(h.query('.workspace-finder').hidden,true);assert.equal(h.query('.workspace-inventory').hidden,true);
});

test('busy batch disallows new selections and page navigation', async () => {
  const h = await harness(); h.set({labels:[file],sequence:[page(1)],busy:true});
  h.clickText('Adicionar etiquetas');h.clickText('Adicionar notas');
  assert.equal(h.query('#files').clicks,undefined);assert.equal(h.query('#invoice-files').clicks,undefined);
  h.window.dispatchEvent(new h.Event('harmony-labels:preview-page',{detail:{page:1}}));
  assert.equal(h.context.previewCalls.length,0);assert.equal(h.query('.workspace-page-jump').hidden,true);
});

test('zoom and expansion change only screen geometry, retain bounds and reset with the PDF', async () => {
  const h = await harness(); const canvas=h.add(h.stage,'canvas');canvas.width=400;canvas.height=600;
  h.query('#preview-caption').textContent='Ficha de separa\u00e7\u00e3o - NF 1';
  h.set({labels:[file],sequence:[page(1,'picking')]});
  assert.equal(h.query('.preview-tools').hidden,false);const width=parseFloat(canvas.style.width);
  h.clickText('+');assert.ok(parseFloat(canvas.style.width)>width);assert.equal(h.context.previewCalls.length,0);
  for(let i=0;i<15;i++)h.clickText('+');assert.match(h.query('.preview-tools-value').textContent,/300%/);
  h.clickText('Expandir pr\u00e9via');assert.equal(h.query('.layout').classList.contains('preview-expanded'),true);
  h.clickText('Ajustar \u00e0 tela');assert.equal(parseFloat(canvas.style.width),width);
  assert.equal(h.query('#preview-caption').dataset.documentKind,'picking');
  h.stage.replaceChildren();h.set({labels:[file]});assert.equal(h.query('.preview-tools').hidden,true);
  assert.equal(h.query('.layout').classList.contains('preview-expanded'),false);
});

test('keyboard zoom preserves browser shortcuts and lifecycle releases metadata', async () => {
  const h = await harness();const canvas=h.add(h.stage,'canvas');canvas.width=400;canvas.height=600;
  h.set({labels:[file],sequence:[page(1)]});
  h.stage.dispatchEvent(new h.Event('keydown',{key:'+',ctrlKey:true}));assert.match(h.query('.preview-tools-value').textContent,/Ajustada/);
  h.stage.dispatchEvent(new h.Event('keydown',{key:'+'}));assert.match(h.query('.preview-tools-value').textContent,/125%/);
  h.window.dispatchEvent(new h.Event('pagehide'));assert.equal(h.query('.workspace-file-inventory').textContent,'');
  assert.equal(h.query('.workspace-results').textContent,'');
  h.clickText('Adicionar etiquetas');assert.equal(h.query('#files').clicks,undefined);
});

test('unauthorized standalone use creates neither workspace nor preview tools', async () => {
  const h = await harness({authorized:false});
  assert.equal(h.query('.workspace-overview'),null);assert.equal(h.query('.preview-tools'),null);
});


test('NF-prefixed search is exact, accepts leading zeros and ignores other identifiers', async () => {
  const h=await harness();
  h.set({labels:[file],sequence:[page(2),page(20),page(12),page(2,'picking')]});
  for(const query of ['NF 2','NF: 0002','nota fiscal 2','NF-e 2']) {
    h.input(h.query('#workspace-search'),query);
    assert.equal(h.query('.workspace-results').children.length,2,query);
    assert.doesNotMatch(h.query('.workspace-results').textContent,/NF 20|NF 12/);
  }
  h.input(h.query('#workspace-search'),'envio 10000000020');
  assert.equal(h.query('.workspace-results').children.length,1);
  assert.match(h.query('.workspace-results').textContent,/NF 20/);
});

test('numeric search never matches page, sheet, file or pending diagnostic numbers', async () => {
  const h=await harness();const card=h.add(h.query('#resolution-items'),'article');
  h.add(card,'h3').textContent='Etiqueta 2 - Envio BR111 - NF 1';
  h.add(card,'p').textContent='Arquivo notas-2.pdf, pagina 2, 2 problemas.';
  h.query('#resolution-panel').hidden=false;
  h.set({labels:[file],sequence:[page(1),{...page(1,'picking'),sheet:2,totalSheets:2}]});
  h.input(h.query('#workspace-search'),'2');
  assert.equal(h.query('.workspace-results').children.length,0);
  h.input(h.query('#workspace-search'),'NF 1');
  assert.equal(h.query('.workspace-results').children.length,3);
  h.input(h.query('#workspace-search'),'BR111');
  assert.equal(h.query('.workspace-results').children.length,1);
  h.clickText('Ver como resolver');assert.equal(card.scrolled,true);
});

test('pre-PDF identifier search excludes invoice series and source filenames', async () => {
  const h=await harness();const row=h.add(h.query('#pairing-rows'),'tr');
  for(const text of ['BR111','0001 / 2','Produto 2','arquivo-2.pdf'])h.add(row,'td').textContent=text;
  h.query('#pairing-report').hidden=false;h.set({labels:[file]});
  h.input(h.query('#workspace-search'),'2');assert.equal(h.query('.workspace-results').children.length,0);
  h.input(h.query('#workspace-search'),'NF 1');assert.equal(h.query('.workspace-results').children.length,1);
  h.input(h.query('#workspace-search'),'envio BR111');assert.equal(h.query('.workspace-results').children.length,1);
});

test('batch reset clears search, filters, page selection and expanded preview for the next lot',async()=>{
  const h=await harness();h.set({labels:[file],sequence:[page(1),page(1,'picking')]});
  h.input(h.query('#workspace-search'),'NF 1');h.clickText('Fichas');
  h.query('#workspace-page-number').setCustomValidity('Invalid page');
  h.set();h.window.dispatchEvent(new h.Event('harmony-labels:batch-reset'));h.flush();
  assert.equal(h.query('#workspace-search').value,'');assert.equal(h.query('#workspace-page-number').value,'');
  assert.equal(h.query('#workspace-page-number').validationMessage,'');
  h.set({labels:[file],sequence:[page(2),page(2,'picking')]});
  assert.equal(h.query('.workspace-results').children.length,2);
  assert.equal(h.query('.layout').classList.contains('preview-expanded'),false);
});
