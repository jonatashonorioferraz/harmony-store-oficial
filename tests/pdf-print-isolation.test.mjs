import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const [app,orders,receipts,intelligence,supplies,inventory,inventoryCss,orderCss,receiptCss,intelligenceCss,supplyCss,isolationCss,index,worker]=await Promise.all([
  readFile(new URL('app.js',root),'utf8'),
  readFile(new URL('production-orders.js',root),'utf8'),
  readFile(new URL('production-receipts.js',root),'utf8'),
  readFile(new URL('intelligence.js',root),'utf8'),
  readFile(new URL('internal-supplies.js',root),'utf8'),
  readFile(new URL('production-inventory.js',root),'utf8'),
  readFile(new URL('production-inventory.css',root),'utf8'),
  readFile(new URL('production-orders.css',root),'utf8'),
  readFile(new URL('production-receipts.css',root),'utf8'),
  readFile(new URL('intelligence.css',root),'utf8'),
  readFile(new URL('internal-supplies.css',root),'utf8'),
  readFile(new URL('pdf-print-isolation.css',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('service-worker.js',root),'utf8'),
]);

test('every PDF flow activates an exclusive print mode',()=>{
  for(const mode of ['request-list-printing','production-order-printing','production-receipt-printing','intelligence-printing','internal-supplies-printing','production-inventory-printing']){
    assert.match(app,new RegExp(`'${mode}'`));
  }
  assert.match(app,/printCurrentDocument\('request-list-printing'/);
  assert.match(orders,/printCurrentDocument\('production-order-printing'\)/);
  assert.match(receipts,/printCurrentDocument\('production-receipt-printing'/);
  assert.match(intelligence,/printCurrentDocument\('intelligence-printing'\)/);
  assert.match(supplies,/printCurrentDocument\('internal-supplies-printing'\)/);
  assert.match(inventory,/printCurrentDocument\('production-inventory-printing'/);
});

test('print mode is applied before printing and removed after the dialog closes',()=>{
  assert.match(app,/root\.classList\.add\(mode\)/);
  assert.match(app,/window\.addEventListener\('afterprint',finish/);
  assert.match(app,/root\.classList\.remove\(mode\)/);
  assert.match(app,/requestAnimationFrame\(\(\)=>requestAnimationFrame/);
  assert.match(app,/window\.print\(\)/);
});

test('the active mode remains visible during print and is cleaned afterwards',async()=>{
  const snippet=app.match(/const harmonyPrintModes=[\s\S]*?window\.HarmonyPrint=Object\.freeze\(\{printCurrentDocument,modes:\[\.\.\.harmonyPrintModes\]\}\);/)?.[0];
  assert.ok(snippet);
  const active=new Set(),seen=[];
  let afterPrint;
  const context={
    document:{documentElement:{classList:{add:value=>active.add(value),remove:value=>active.delete(value)}}},
    requestAnimationFrame:callback=>callback(),
    setTimeout:()=>1,
    clearTimeout(){},
    window:{
      addEventListener:(name,callback)=>{if(name==='afterprint')afterPrint=callback},
      removeEventListener(){},
      print(){seen.push([...active]);afterPrint?.()},
    },
  };
  vm.runInNewContext(snippet,context);
  await context.window.HarmonyPrint.printCurrentDocument('intelligence-printing');
  assert.deepEqual(seen,[['intelligence-printing']]);
  assert.equal(active.size,0);
});

test('module print styles cannot hide another PDF document',()=>{
  assert.match(receiptCss,/html\.production-receipt-printing body>\*:not\(#productionPrint\)/);
  assert.doesNotMatch(receiptCss,/html:not\(\.request-list-printing\)/);
  assert.match(intelligenceCss,/html\.intelligence-printing \.intel-tabs/);
  assert.match(supplyCss,/html\.internal-supplies-printing \.supply-tabs/);
  assert.match(orderCss,/body \*\{visibility:hidden!important\}/);
  assert.match(isolationCss,/html:not\(\.production-order-printing\) body \*/);
  assert.match(isolationCss,/visibility: visible !important/);
  assert.match(isolationCss,/body > \*:not\(#requestListPrintRoot\)/);
  assert.match(isolationCss,/body > #requestListPrintRoot/);
  assert.match(isolationCss,/display: block !important/);
  assert.match(inventoryCss,/body>\*:not\(#productionInventoryPrintRoot\)/);
  assert.match(inventoryCss,/#productionInventoryPrintRoot/);
});

test('the isolation stylesheet loads last and remains available offline',()=>{
  assert.match(index,/pdf-print-isolation\.css\?v=25\.49/);
  assert.ok(index.lastIndexOf('pdf-print-isolation.css')>index.lastIndexOf('internal-supplies.css'));
  assert.match(worker,/pdf-print-isolation\.css\?v=25\.49/);
  assert.match(worker,/harmony-store-v25-67/);
});
