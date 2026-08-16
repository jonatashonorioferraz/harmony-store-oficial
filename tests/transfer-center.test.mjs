import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const [sql,indexes,foundation,ui,css,integration,icons,index,worker,backup,recovery,help,manual,technical,audit,pkg]=await Promise.all([
  readFile(new URL('supabase/migrations/20260816012000_transfer_center.sql',root),'utf8'),
  readFile(new URL('supabase/migrations/20260816014500_transfer_center_fk_indexes.sql',root),'utf8'),
  readFile(new URL('supabase/migrations/20260814170000_shipping_composite_kits_inventory_reservations.sql',root),'utf8'),
  readFile(new URL('transfer-center.js',root),'utf8'),
  readFile(new URL('transfer-center.css',root),'utf8'),
  readFile(new URL('shipping-inventory-integration.js',root),'utf8'),
  readFile(new URL('harmony-icons.js',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('service-worker.js',root),'utf8'),
  readFile(new URL('scripts/create-api-backup.mjs',root),'utf8'),
  readFile(new URL('scripts/execute-api-recovery.mjs',root),'utf8'),
  readFile(new URL('help-center.js',root),'utf8'),
  readFile(new URL('docs/manual/MANUAL-DO-APLICATIVO.md',root),'utf8'),
  readFile(new URL('docs/technical/CENTRAL-DE-TRANSFERENCIAS-V25.92.md',root),'utf8'),
  readFile(new URL('docs/audit/AUDITORIA-CENTRAL-DE-TRANSFERENCIAS-V25.92.md',root),'utf8'),
  readFile(new URL('package.json',root),'utf8'),
]);

test('central is versioned, available offline and included in static build',()=>{
  assert.equal(JSON.parse(pkg).version,'25.92.0');
  for(const asset of ['transfer-center.css','transfer-center.js']){
    assert.match(index,new RegExp(asset.replaceAll('.','\\.')));
    assert.match(worker,new RegExp(asset.replaceAll('.','\\.')));
  }
  assert.match(ui,/assets\/peugeot-expert-harmony\.png/);
  assert.match(worker,/assets\/peugeot-expert-harmony\.png/);
  assert.match(worker,/harmony-store-v25-92-r1/);
});

test('schema is additive, constrained and protected by row level security',()=>{
  assert.match(sql,/create table if not exists public\.shipping_inventory_request_items/);
  assert.match(sql,/alter table public\.shipping_inventory_request_items enable row level security/);
  assert.match(sql,/revoke all privileges on table public\.shipping_inventory_request_items from public,anon,authenticated/);
  assert.match(sql,/set search_path=''/g);
  assert.match(sql,/shipping_inventory_requests_source_reference_check/);
  assert.match(sql,/shipping_inventory_requests_lifecycle_check/);
  assert.match(sql,/status in \('requested','partially_reserved','reserved','in_transit'/);
  for(const name of ['shipping_inventory_request_items_color_idx','shipping_inventory_request_items_plan_component_idx','shipping_inventory_requests_dispatched_by_idx','shipping_inventory_requests_received_by_idx'])assert.match(indexes,new RegExp(name));
});

test('exact boxes are exclusive and oldest available boxes are suggested first',()=>{
  assert.match(foundation,/shipping_inventory_request_boxes_active_box_uidx/);
  assert.match(sql,/where rb\.inventory_entry_id=e\.id and rb\.released_at is null/);
  assert.match(sql,/order by e\.entry_on asc,e\.box_number asc/);
  assert.match(sql,/Uma caixa acabou de ser reservada por outra pessoa/);
  assert.match(sql,/partially_reserved/);
});

test('full plan and direct requests share the same engine and cached clients stay compatible',()=>{
  assert.match(sql,/create or replace function public\.create_transfer_center_request/);
  assert.match(sql,/create or replace function public\.reserve_transfer_center_boxes/);
  assert.match(sql,/create or replace function public\.reserve_shipping_inventory_boxes/);
  assert.match(sql,/public\.create_transfer_center_request\(/);
  assert.match(sql,/public\.reserve_transfer_center_boxes\(/);
  assert.match(integration,/HarmonyTransferCenter\.createFromPlan/);
  assert.doesNotMatch(integration,/confirm_shipping_inventory_request_transfer/);
});

test('dispatch removes complete boxes and receipt closes transport without a second stock write',()=>{
  assert.match(sql,/create or replace function public\.dispatch_transfer_center_request/);
  assert.match(sql,/transfer_production_inventory_box_to_ecommerce/);
  assert.match(sql,/create or replace function public\.receive_transfer_center_request/);
  assert.match(sql,/set status='received'/);
  assert.match(sql,/Somente uma transferencia em andamento pode ser recebida/);
});

test('roles remain separated and collaborators do not gain inventory access',()=>{
  assert.match(sql,/private\.can_manage_shipping_planning\(\)/);
  assert.match(sql,/private\.can_manage_production_inventory\(\)/);
  assert.match(ui,/is_ecommerce_manager\|\|S\?\.profile\?\.is_primary_admin/);
  assert.match(ui,/role==='admin'\|\|S\?\.profile\?\.role==='receiver'/);
  assert.match(icons,/'transfer-center':'transfer'/);
});

test('responsive interface keeps movements collapsed and exposes reports',()=>{
  assert.match(ui,/<details class="card transfer-movements">/);
  assert.match(ui,/Exportar CSV/);
  assert.match(css,/@media\(max-width:1100px\)/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media\(max-width:420px\)/);
  assert.match(css,/transfer-movement-window\{max-height:/);
});

test('backup, help, manual and technical continuity cover the new table and lifecycle',()=>{
  for(const source of [backup,recovery])assert.match(source,/'shipping_inventory_request_items'/);
  assert.match(help,/Central de Transferências/);
  assert.match(manual,/## Central de Transferências/);
  assert.match(technical,/Compatibilidade/);
  assert.match(audit,/Critérios de aceite/);
});
