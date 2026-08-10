import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const [sql,validation,js,css,index,worker,help,manual,technical,audit,pkg]=await Promise.all([
  readFile(new URL('supabase/migrations/20260810010000_production_inventory_box_gallery.sql',root),'utf8'),
  readFile(new URL('supabase/validation/20260810010000_production_inventory_box_gallery.sql',root),'utf8'),
  readFile(new URL('production-inventory.js',root),'utf8'),
  readFile(new URL('production-inventory.css',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('service-worker.js',root),'utf8'),
  readFile(new URL('help-center.js',root),'utf8'),
  readFile(new URL('docs/manual/MANUAL-DO-APLICATIVO.md',root),'utf8'),
  readFile(new URL('docs/technical/GALERIA-CAIXAS-CONTADOR-V25.60.md',root),'utf8'),
  readFile(new URL('docs/audit/RELATORIO-GALERIA-CAIXAS-V25.60.md',root),'utf8'),
  readFile(new URL('package.json',root),'utf8'),
]);

test('database exposes only available boxes and sorts newest box first',()=>{
  assert.match(sql,/create or replace function public\.list_available_production_inventory_boxes\(\)/i);
  assert.match(sql,/create or replace function public\.get_production_inventory_available_box_count\(\)/i);
  assert.match(sql,/where e\.current_quantity>0 and e\.transferred_at is null[\s\S]*order by e\.box_number desc/i);
  assert.match(sql,/where current_quantity>0 and transferred_at is null/i);
  assert.match(sql,/production_inventory_entries_available_boxes_idx/i);
  assert.match(validation,/v_counter<>v_expected or v_listed<>v_expected/i);
  assert.match(validation,/box_number>previous_box/i);
});

test('gallery keeps the existing admin and receiver security boundary',()=>{
  assert.match(sql,/private\.can_manage_production_inventory\(\)/g);
  assert.match(sql,/security definer/g);
  assert.match(sql,/revoke all on function public\.list_available_production_inventory_boxes\(\) from public,anon,authenticated/i);
  assert.match(sql,/grant execute on function public\.list_available_production_inventory_boxes\(\) to authenticated,service_role/i);
  assert.match(help,/id:'production-inventory',roles:\['receiver','admin'\]/);
  assert.doesNotMatch(help,/id:'production-inventory',roles:\[[^\]]*collaborator/);
});

test('live count represents available physical boxes and refreshes across devices',()=>{
  assert.match(js,/LIVE_COUNTER_INTERVAL=20000/);
  assert.match(js,/rpc\('get_production_inventory_available_box_count'/);
  assert.match(js,/rpc\('list_available_production_inventory_boxes'/);
  assert.match(js,/setInterval\(syncLiveCounter,LIVE_COUNTER_INTERVAL\)/);
  assert.match(js,/if\(PI\.tab==='boxes'&&count!==PI\.boxes\.length\)/);
  assert.match(js,/if\(source==='boxes'\)\{closeModal\(\);await render\(\)\}/);
  assert.match(js,/caixa disponível':'caixas disponíveis'/);
});

test('new models, colors and collaborators synchronize from the official catalogues',()=>{
  assert.match(js,/catalogSignature/);
  assert.match(js,/rpc\('list_finished_product_models'/);
  assert.match(js,/rpc\('list_finished_production_colors'/);
  assert.match(js,/rpc\('list_production_inventory_workers'/);
  assert.match(js,/refreshEntryCatalogOptions\(\)/);
  assert.match(js,/if\(!document\.querySelector\('\.production-inventory-page'\)\)PI\.loaded=false/);
  assert.match(manual,/Novos cadastros são sincronizados automaticamente/);
});

test('visual boxes use the original model photo and full-box transfer action',()=>{
  assert.match(js,/data-inventory-tab="boxes"/);
  assert.match(js,/imageUrl\(entry\.image_path\)/);
  assert.match(js,/data-inventory-box-transfer/);
  assert.match(js,/actionModal\(entry,'transfer',entry\.model_id,entry\.color_id,'boxes'\)/);
  assert.match(js,/Transferir caixa/);
  assert.match(js,/ÚLTIMA CADASTRADA/);
  assert.match(css,/\.production-inventory-crate-shell/);
  assert.match(css,/\.production-inventory-crate-transfer[^}]*background:linear-gradient\([^}]*#e45497,#c53677/i);
});

test('gallery and counter are responsive and accessible',()=>{
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:1100px\)[\s\S]*production-inventory-box-gallery\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:520px\)[\s\S]*production-inventory-box-gallery\{grid-template-columns:1fr/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*production-inventory-live-counter>i/);
  assert.match(js,/aria-label="Contador em tempo real de caixas disponíveis"/);
  assert.match(js,/aria-label="Transferir a caixa/);
});

test('release assets, help and audit documentation are complete',()=>{
  assert.match(index,/production-inventory\.css\?v=25\.60/);
  assert.match(index,/production-inventory\.js\?v=25\.60/);
  assert.match(worker,/production-inventory\.css\?v=25\.60/);
  assert.match(worker,/production-inventory\.js\?v=25\.60/);
  assert.match(worker,/harmony-store-v25-60/);
  assert.match(manual,/### Visualizar as caixas disponíveis/);
  assert.match(technical,/## Sincronização/);
  assert.match(audit,/## Riscos controlados/);
  assert.equal(JSON.parse(pkg).version,'25.60.0');
});
