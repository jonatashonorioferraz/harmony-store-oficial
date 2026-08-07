import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('Meu dia personalizes existing tasks without changing authorization',async()=>{
  const source=await read('my-day.js');
  assert.match(source,/role\(\)==='admin'\?adminTasks\(\):workerTasks\(\)/);
  assert.match(source,/HarmonyNotifications\?\.load/);
  assert.match(source,/HarmonyProductionOrders\?\.load/);
  assert.match(source,/HarmonyInternalSupplies\?\.load/);
  assert.match(source,/HarmonyBills\?\.load/);
  assert.match(source,/openRequestStatuses/);
  assert.match(source,/activeOrderStatuses/);
  assert.match(source,/const button=event\.currentTarget;button\.disabled=true/);
  assert.match(source,/harmony-my-day-expanded/);
  assert.match(source,/localStorage\.setItem/);
  assert.match(source,/aria-expanded/);
  assert.match(source,/tasks\.filter\(item=>item\.action!=='requests'\)/);
  assert.match(source,/data-toggle-my-day/);
  assert.doesNotMatch(source,/service_role|auth\/v1|storage\/v1|rest\(|rpc\(/i);
});

test('Meu dia routes every action to an existing official flow',async()=>{
  const [source,orders]=await Promise.all([read('my-day.js'),read('production-orders.js')]);
  assert.match(source,/requestModalV2\(request\)/);
  assert.match(source,/HarmonyProductionOrders\?\.open/);
  assert.match(source,/S\.view=action/);
  assert.match(orders,/window\.HarmonyProductionOrders=Object\.freeze\(\{state:PO,load,reset,open:/);
});

test('Meu dia assets are mirrored, versioned, cached and responsive',async()=>{
  const [rootJs,webJs,rootCss,webCss,html,worker,pkg]=await Promise.all([
    read('my-day.js'),read('web/my-day.js'),read('my-day.css'),read('web/my-day.css'),
    read('index.html'),read('service-worker.js'),read('package.json')
  ]);
  assert.equal(rootJs,webJs);
  assert.equal(rootCss,webCss);
  assert.match(html,/my-day\.css\?v=25\.39/);
  assert.match(html,/my-day\.js\?v=25\.39/);
  assert.match(worker,/my-day\.js\?v=25\.39/);
  assert.match(worker,/harmony-store-v25-52/);
  assert.match(rootCss,/@media\(max-width:720px\)/);
  assert.equal(JSON.parse(pkg).version,'25.52.0');
});
