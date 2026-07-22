import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const [app,styles,receiptCss,index,worker]=await Promise.all([
  readFile(new URL('app.js',root),'utf8'),
  readFile(new URL('styles.css',root),'utf8'),
  readFile(new URL('production-receipts.css',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('service-worker.js',root),'utf8'),
]);

test('every requester and administrator receives the visual list action',()=>{
  assert.match(app,/viewListButton\.innerHTML='🖼️ Ver lista'/);
  assert.match(app,/openRequestListViewer\(r,items,requester\)/);
  assert.doesNotMatch(app,/if\(a\).*viewListButton/);
  assert.match(app,/document\.body\.appendChild\(viewer\)/);
});

test('visual list contains only requested product information with photos and quantities',()=>{
  assert.match(app,/activeItems=items\.filter\(item=>Number\(item\.requested_quantity\)>0\)/);
  assert.match(app,/request-list-product/);
  assert.match(app,/product-images/);
  assert.match(app,/item\.requested_quantity\)\.toLocaleString\('pt-BR'\)/);
  assert.match(app,/product\?\.unit/);
  assert.match(app,/Lista visual dos produtos e quantidades solicitadas/);
  assert.doesNotMatch(app,/request-list-product[\s\S]{0,500}approved_quantity/);
});

test('viewer is responsive and its A4 print mode is isolated from existing reports',()=>{
  assert.match(styles,/\.request-list-viewer/);
  assert.match(styles,/@media\(max-width:720px\)[^{]*\{\.request-list-view-trigger/);
  assert.match(styles,/\.request-list-products\{grid-template-columns:1fr\}/);
  assert.match(styles,/\.request-list-products\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(app,/max-width:\s*900px/);
  assert.match(app,/iPad/);
  assert.match(styles,/html\.request-list-printing body \*\{visibility:visible!important\}/);
  assert.match(styles,/html\.request-list-printing body>#modal\{display:none!important/);
  assert.match(receiptCss,/html:not\(\.request-list-printing\) body>\*:not\(#productionPrint\):not\(#modal\)/);
  assert.match(app,/@page\{size:A4 portrait;margin:9mm\}/);
  assert.match(app,/break-inside:avoid/);
});

test('mobile PDF stays in the current page and desktop retains a separate print window',()=>{
  assert.match(app,/const requestListMobilePrint=/);
  assert.match(app,/if\(requestListMobilePrint\(\)\)/);
  assert.match(app,/window\.addEventListener\('afterprint',cleanup/);
  assert.match(app,/window\.print\(\);return/);
  assert.match(app,/window\.open\('about:blank','_blank'\)/);
  assert.match(index,/app\.js\?v=25\.29/);
  assert.match(worker,/harmony-store-v25-29/);
  assert.match(worker,/app\.js\?v=25\.29/);
});
