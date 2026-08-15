import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('timeline aggregates the official operational sources without duplicating business rules',async()=>{
  const source=await read('collaborator-timeline.js');
  assert.match(source,/restAll\(requestQuery\)/);
  assert.match(source,/requested_by=eq\./);
  assert.match(source,/created_at=gte\./);
  assert.match(source,/rpc\('list_production_orders'/);
  assert.match(source,/rpc\('list_finished_production_receipts'/);
  assert.match(source,/rpc\('list_production_payment_closings'/);
  assert.match(source,/requestEvents/);
  assert.match(source,/orderEvents/);
  assert.match(source,/receiptEvents/);
  assert.match(source,/paymentEvents/);
  assert.doesNotMatch(source,/method:\s*['"](?:POST|PATCH|DELETE)['"]/i);
});

test('timeline keeps every non-admin profile scoped to itself and protects financial details',async()=>{
  const source=await read('collaborator-timeline.js');
  assert.match(source,/const selected=isAdmin\(\)\?CT\.workerId:S\.profile\.id/);
  assert.match(source,/p_worker_id:selected/);
  assert.match(source,/orders\.filter\(item=>item\.worker_id===selected\)/);
  assert.match(source,/receipts\.filter\(item=>item\.worker_id===selected\)/);
  assert.match(source,/payments\.filter\(item=>item\.worker_id===selected\)/);
  assert.match(source,/CT\.ownerId!==S\.profile\.id/);
  assert.doesNotMatch(source,/total_amount|unit_rate|amount_due|R\$/);
});

test('timeline exposes accessible direct navigation to each responsible module',async()=>{
  const source=await read('collaborator-timeline.js');
  assert.match(source,/data-timeline-route/);
  assert.match(source,/tabindex="0" role="button"/);
  assert.match(source,/event\.key==='Enter'\|\|event\.key===' '/);
  assert.match(source,/requestModalV2\(request\)/);
  assert.match(source,/HarmonyProductionOrders\?\.open/);
  assert.match(source,/state\.tab='weeks'/);
  assert.match(source,/state\.tab='receipts'/);
});

test('timeline assets are mirrored, versioned, cached and responsive',async()=>{
  const [rootJs,webJs,rootCss,webCss,rootHtml,webHtml,rootWorker,webWorker,pkg]=await Promise.all([
    read('collaborator-timeline.js'),read('web/collaborator-timeline.js'),read('collaborator-timeline.css'),read('web/collaborator-timeline.css'),
    read('index.html'),read('web/index.html'),read('service-worker.js'),read('web/service-worker.js'),read('package.json')
  ]);
  assert.equal(rootJs.trim(),webJs.trim());
  assert.equal(rootCss.trim(),webCss.trim());
  for(const html of [rootHtml,webHtml]){
    assert.match(html,/collaborator-timeline\.css\?v=25\.50/);
    assert.match(html,/collaborator-timeline\.js\?v=25\.54/);
  }
  for(const worker of [rootWorker,webWorker]){
    assert.match(worker,/harmony-store-v25-87-r1/);
    assert.match(worker,/collaborator-timeline\.css\?v=25\.50/);
    assert.match(worker,/collaborator-timeline\.js\?v=25\.54/);
  }
  assert.match(rootCss,/@media\(max-width:820px\)/);
  assert.match(rootCss,/@media\(max-width:620px\)/);
  assert.equal(JSON.parse(pkg).version,'25.87.0');
});
