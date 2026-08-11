import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const [baseSql,boxSql,transferSql,js,css,index,worker,app,help,manual,technical,backup,recovery,pkg]=await Promise.all([
  readFile(new URL('supabase/migrations/20260809103000_production_inventory.sql',root),'utf8'),
  readFile(new URL('supabase/migrations/20260809193000_production_inventory_unique_boxes.sql',root),'utf8'),
  readFile(new URL('supabase/migrations/20260809223000_full_box_transfer_to_ecommerce.sql',root),'utf8'),
  readFile(new URL('production-inventory.js',root),'utf8'),readFile(new URL('production-inventory.css',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),readFile(new URL('service-worker.js',root),'utf8'),readFile(new URL('app.js',root),'utf8'),
  readFile(new URL('help-center.js',root),'utf8'),readFile(new URL('docs/manual/MANUAL-DO-APLICATIVO.md',root),'utf8'),
  readFile(new URL('docs/technical/INVENTARIO-DE-PRODUCAO-V25.57.md',root),'utf8'),readFile(new URL('scripts/create-api-backup.mjs',root),'utf8'),
  readFile(new URL('scripts/execute-api-recovery.mjs',root),'utf8'),readFile(new URL('package.json',root),'utf8'),
]);
const sql=`${baseSql}\n${boxSql}\n${transferSql}`;

test('inventory reuses the official finished-model, color and collaborator catalogs',()=>{
  assert.match(sql,/references public\.finished_product_models\(id\)/);assert.match(sql,/references public\.finished_production_colors\(id\)/);assert.match(sql,/p\.role='collaborator'/);
  assert.match(js,/list_finished_product_models/);assert.match(js,/list_finished_production_colors/);assert.match(js,/image_path/);
  assert.doesNotMatch(sql,/create table if not exists public\.production_inventory_(models|colors)/);
});

test('database and UI access are limited to active admin and receiver profiles',()=>{
  assert.match(sql,/p\.role in \('admin','receiver'\)/);assert.match(sql,/p\.status='active'/);
  assert.match(sql,/revoke all privileges on table public\.production_inventory_entries from public,anon,authenticated/);
  assert.match(sql,/revoke all privileges on table public\.production_inventory_movements from public,anon,authenticated/);
  assert.match(sql,/if not \(select private\.can_manage_production_inventory\(\)\)/g);assert.match(js,/\['admin','receiver'\]\.includes/);
  assert.match(help,/id:'production-inventory',roles:\['receiver','admin'\]/);assert.doesNotMatch(help,/id:'production-inventory',roles:\[[^\]]*collaborator/);
});

test('box movements preserve provenance and block partial withdrawals',()=>{
  assert.match(sql,/original_quantity bigint not null/);assert.match(sql,/current_quantity bigint not null/);assert.match(sql,/for update/);
  assert.match(sql,/coalesce\(p_quantity,0\)<>v_entry\.current_quantity/);assert.match(sql,/balance_before,balance_after/);
  assert.match(sql,/movement_type in \('entry','exit','adjustment_in','adjustment_out'\)/);
  assert.match(sql,/production_inventory\.entry_created/);assert.match(sql,/production_inventory\.box_transferred_to_ecommerce/);assert.match(sql,/production_inventory\.stock_adjusted/);
  assert.doesNotMatch(sql,/delete from public\.production_inventory_(entries|movements)/);
});

test('inventory remains isolated from payment and raw-material stock rules',()=>{
  const mutations=sql.slice(sql.indexOf('create or replace function public.create_production_inventory_entry'));
  assert.doesNotMatch(mutations,/update public\.products/);assert.doesNotMatch(mutations,/insert into public\.stock_movements/);assert.doesNotMatch(mutations,/production_weekly_closings/);
  assert.doesNotMatch(js,/rate_per_100|total_amount/);assert.match(manual,/não calcula pagamentos/);assert.match(technical,/não consulta nem altera `production_weekly_closings`/);
});

test('balance is alphabetical and detail exposes collaborator, date, box and full-box transfer',()=>{
  assert.match(sql,/order by lower\(m\.name\),c\.sort_order,lower\(c\.name\)/);assert.match(js,/Quantidade identificada por colaboradora/);
  assert.match(js,/Produzido por/);assert.match(js,/box_reference/);assert.match(js,/entry_on/);assert.match(js,/Transferir caixa completa/);assert.match(js,/Saldo da caixa/);
});

test('home shortcuts keep the compact inventory action and add protected AI actions',()=>{
  assert.match(js,/productionInventoryShortcut/);assert.match(js,/>Inventário de Produção</);assert.match(js,/Registrar compra direta com IA/);assert.match(js,/Cadastrar boleto com IA/);assert.doesNotMatch(js,/Pendências de hoje/);
  assert.match(css,/production-inventory-home-shortcut/);assert.match(css,/@keyframes inventoryShortcutShine/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('PDF is isolated on mobile and uses a dedicated desktop print document',()=>{
  assert.match(app,/'production-inventory-printing'/);assert.match(js,/productionInventoryPrintRoot/);assert.match(js,/printCurrentDocument\('production-inventory-printing'/);
  assert.match(js,/window\.open\('about:blank','_blank'\)/);assert.match(css,/body>\*:not\(#productionInventoryPrintRoot\)/);assert.match(css,/@media print/);
});

test('layout covers desktop, tablet and mobile breakpoints',()=>{
  assert.match(css,/@media\(max-width:1100px\)/);assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/@media\(max-width:430px\)/);
  assert.match(css,/production-inventory-row/);assert.match(css,/production-inventory-workers/);
});

test('assets, offline cache, backup, recovery and documentation are complete',()=>{
  assert.match(index,/production-inventory\.css\?v=25\.72/);assert.match(index,/production-inventory\.js\?v=25\.72/);
  assert.match(worker,/production-inventory\.css\?v=25\.72/);assert.match(worker,/production-inventory\.js\?v=25\.72/);assert.match(worker,/harmony-store-v25-72/);
  for(const source of [backup,recovery]){assert.match(source,/'production_inventory_entries'/);assert.match(source,/'production_inventory_movements'/)}
  assert.match(manual,/## Inventário de Produção/);assert.match(technical,/## Modelo de dados/);assert.equal(JSON.parse(pkg).version,'25.72.0');
});
