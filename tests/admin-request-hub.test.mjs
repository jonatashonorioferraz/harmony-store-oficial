import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('admin home request hub integrates the three request sources',async()=>{
  const source=await read('request-hub.js');
  assert.match(source,/Matéria-prima/);
  assert.match(source,/Material do e-commerce/);
  assert.match(source,/Suprimento do e-commerce/);
  assert.match(source,/HarmonyInternalSupplies/);
  assert.match(source,/request_items\?/);
  assert.match(source,/S\.profile\?\.role!=='admin'/);
});

test('hub links open the original request flows and only lists open statuses',async()=>{
  const [hub,internal]=await Promise.all([read('request-hub.js'),read('internal-supplies.js')]);
  assert.match(hub,/new Set\(\['pending','separating','scheduled'\]\)/);
  assert.match(hub,/requestModalV2\(request\)/);
  assert.match(hub,/HarmonyInternalSupplies\.openRequest\(id\)/);
  assert.match(internal,/openRequestFromHub/);
  assert.match(internal,/openRequest:openRequestFromHub/);
});

test('hub assets are versioned, cached and responsive',async()=>{
  const [html,worker,css,pkg]=await Promise.all([read('index.html'),read('service-worker.js'),read('request-hub.css'),read('package.json')]);
  assert.match(html,/request-hub\.css\?v=25\.24/);
  assert.match(html,/request-hub\.js\?v=25\.24/);
  assert.match(worker,/request-hub\.js\?v=25\.24/);
  assert.match(worker,/request-hub\.css\?v=25\.24/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.equal(JSON.parse(pkg).version,'25.24.0');
});
