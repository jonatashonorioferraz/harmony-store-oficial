import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('individual stock migration is additive, isolated and protected by RLS',async()=>{
  const sql=await read('supabase/migrations/20260810150000_individual_collaborator_product_stock.sql');
  assert.match(sql,/^begin;/mi);
  assert.match(sql,/commit;\s*$/i);
  assert.match(sql,/add column if not exists stock_control_mode text not null default 'shared'/i);
  assert.match(sql,/create table if not exists public\.product_collaborator_stocks/i);
  assert.match(sql,/unique \(product_id, collaborator_id\)/i);
  assert.match(sql,/reserved_stock numeric\(14,3\)[^;]+reserved_stock <= physical_stock/is);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/collaborator_id=\(select auth\.uid\(\)\) or \(select private\.is_admin\(\)\)/i);
  assert.match(sql,/revoke all on table public\.product_collaborator_stocks from public,anon,authenticated/i);
  assert.doesNotMatch(sql,/grant (insert|update|delete)[^;]+product_collaborator_stocks[^;]+authenticated/i);
});

test('request ownership is derived by the database and cannot be chosen by the client',async()=>{
  const sql=await read('supabase/migrations/20260810150000_individual_collaborator_product_stock.sql');
  assert.match(sql,/add column if not exists stock_owner_id uuid references public\.profiles/i);
  assert.match(sql,/create or replace function private\.assign_request_item_stock_owner/i);
  assert.match(sql,/new\.stock_owner_id:=v_owner/i);
  assert.match(sql,/before insert or update of request_id,product_id,stock_owner_id/i);
  assert.match(sql,/requests request[\s\S]+item\.request_id=request\.id and item\.product_id=p_product_id/i);
});

test('all material stock lifecycles use the isolated owner balance',async()=>{
  const sql=await read('supabase/migrations/20260810150000_individual_collaborator_product_stock.sql');
  for(const name of ['adjust_material_reservation','complete_material_delivery_stock','adjust_delivered_material_stock']){
    assert.match(sql,new RegExp(`private\\.${name}`,'i'));
  }
  assert.match(sql,/admin_prepare_request[\s\S]+adjust_material_reservation/i);
  assert.match(sql,/admin_complete_request[\s\S]+complete_material_delivery_stock/i);
  assert.match(sql,/admin_cancel_request[\s\S]+adjust_material_reservation/i);
  assert.match(sql,/admin_delete_request[\s\S]+adjust_material_reservation/i);
  assert.match(sql,/primary_admin_update_request[\s\S]+adjust_delivered_material_stock/i);
  assert.match(sql,/stock_owner_id is not distinct from/i);
});

test('out-of-stock and replenishment affect only the request owner',async()=>{
  const sql=await read('supabase/migrations/20260810150000_individual_collaborator_product_stock.sql');
  assert.match(sql,/update public\.product_collaborator_stocks set physical_stock=0,reserved_stock=0/i);
  assert.match(sql,/stock_owner_id is not distinct from v_item\.stock_owner_id/i);
  assert.match(sql,/stock_replenishment_one_open_owner_product_idx/i);
  assert.match(sql,/product_id,stock_owner_id,source_request_id/i);
  assert.match(sql,/admin_record_stock_discrepancy[\s\S]+v_item\.stock_owner_id/i);
});

test('admin UI manages physical stock while reserved stock stays system controlled',async()=>{
  const [js,css,html,worker]=await Promise.all([
    read('individual-product-stock.js'),read('individual-product-stock.css'),read('index.html'),read('service-worker.js')
  ]);
  assert.match(js,/Individual por colaboradora/);
  assert.match(js,/Gerenciar estoques/);
  assert.match(js,/name="physical_stock"/);
  assert.doesNotMatch(js,/name="reserved_stock" type="number"/);
  assert.match(js,/admin_save_product_collaborator_stocks/);
  assert.match(js,/Sem estoque para você/);
  assert.match(js,/Exclusivo para você/);
  assert.match(css,/@media\(max-width:980px\)/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/@media\(max-width:430px\)/);
  assert.match(html,/individual-product-stock\.js\?v=25\.63/);
  assert.match(html,/individual-product-stock\.css\?v=25\.63/);
  assert.match(worker,/harmony-store-v25-63/);
  assert.match(worker,/SHELL\.push\('\.\/individual-product-stock\.css\?v=25\.63','\.\/individual-product-stock\.js\?v=25\.63'\)/);
});

test('backup, recovery, help and technical documentation cover individualized balances',async()=>{
  const [backup,recovery,change,manual,technical,help,pkg]=await Promise.all([
    read('scripts/create-api-backup.mjs'),read('scripts/execute-api-recovery.mjs'),read('CHANGELOG.md'),
    read('docs/manual/MANUAL-DO-APLICATIVO.md'),read('docs/technical/ARQUITETURA-E-OPERACAO.md'),
    read('help-center.js'),read('package.json')
  ]);
  assert.match(backup,/products'.*'product_collaborator_stocks'.*'custom_field_definitions'/s);
  assert.match(recovery,/products'.*'product_collaborator_stocks'.*'custom_field_definitions'/s);
  assert.match(change,/\[v25\.63\]/);
  assert.match(manual,/Estoque individual por colaboradora/);
  assert.match(technical,/product_collaborator_stocks/);
  assert.match(help,/Cada mulher terá saldo próprio/);
  assert.equal(JSON.parse(pkg).version,'25.63.0');
});

test('individual stock assets are mirrored in the official deployable folder',async()=>{
  const [rootJs,webJs,rootCss,webCss]=await Promise.all([
    read('individual-product-stock.js'),read('web/individual-product-stock.js'),
    read('individual-product-stock.css'),read('web/individual-product-stock.css')
  ]);
  assert.equal(webJs,rootJs);
  assert.equal(webCss,rootCss);
});

test('the existing personalized label product starts isolated without inventing stock',async()=>{
  const sql=await read('supabase/migrations/20260810153000_enable_individual_stock_for_personalized_labels.sql');
  assert.match(sql,/lower\(trim\(name\)\)=lower\('Etiquetas de validade e lote 40x60 cm'\)/);
  assert.match(sql,/min\(id::text\)::uuid/);
  assert.doesNotMatch(sql,/min\(id\)/);
  assert.match(sql,/if v_match_count<>1 then/);
  assert.match(sql,/if v_physical<>0 or v_reserved<>0 then/);
  assert.match(sql,/set stock_control_mode='collaborator'/);
  assert.match(sql,/where p\.role='collaborator'/);
  assert.match(sql,/request\.status in \('pending','separating','scheduled'\)/);
  assert.doesNotMatch(sql,/physical_stock\s*=\s*[1-9]/);
});
