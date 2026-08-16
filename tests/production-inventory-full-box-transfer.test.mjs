import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const [sql,js,css,manual,technical,audit,pkg]=await Promise.all([
  readFile(new URL('supabase/migrations/20260809223000_full_box_transfer_to_ecommerce.sql',root),'utf8'),
  readFile(new URL('production-inventory.js',root),'utf8'),
  readFile(new URL('production-inventory.css',root),'utf8'),
  readFile(new URL('docs/manual/MANUAL-DO-APLICATIVO.md',root),'utf8'),
  readFile(new URL('docs/technical/TRANSFERENCIA-INTEGRAL-CAIXAS-V25.59.md',root),'utf8'),
  readFile(new URL('docs/audit/RELATORIO-TRANSFERENCIA-INTEGRAL-CAIXAS-V25.59.md',root),'utf8'),
  readFile(new URL('package.json',root),'utf8'),
]);

test('transfer state is complete, constrained and tied to the responsible profile',()=>{
  assert.match(sql,/add column if not exists transfer_destination text/);
  assert.match(sql,/add column if not exists transferred_on date/);
  assert.match(sql,/add column if not exists transferred_at timestamptz/);
  assert.match(sql,/transferred_by uuid references public\.profiles\(id\)/);
  assert.match(sql,/production_inventory_transfer_state_check/);
  assert.match(sql,/transfer_destination='ecommerce'[\s\S]*current_quantity=0/);
});

test('database rejects partial and repeated withdrawals while preserving cached clients',()=>{
  assert.match(sql,/coalesce\(p_quantity,0\)<>v_entry\.current_quantity/);
  assert.match(sql,/A retirada parcial foi bloqueada/);
  assert.match(sql,/Esta caixa já foi transferida/);
  assert.match(sql,/create or replace function public\.withdraw_production_inventory_entry/);
  assert.match(sql,/for update/);
});

test('valid transfer moves the exact box balance to zero and audits the ecommerce destination',()=>{
  assert.match(sql,/set current_quantity=0,[\s\S]*transfer_destination='ecommerce'/);
  assert.match(sql,/p_entry_id,'exit',v_entry\.current_quantity,v_entry\.current_quantity,0/);
  assert.match(sql,/production_inventory\.box_transferred_to_ecommerce/);
  assert.match(sql,/'destination','ecommerce'/);
  assert.match(sql,/transfer_production_inventory_box_to_ecommerce/);
});

test('transferred boxes cannot be adjusted but remain listed with their history',()=>{
  assert.match(sql,/A caixa já foi transferida\. O histórico não pode ser alterado/);
  assert.match(sql,/list_production_inventory_entries_v3/);
  assert.match(sql,/transferred_by_name text/);
  assert.match(js,/Transferida ao e-commerce/);
  assert.match(js,/transferred_by_name/);
  assert.match(js,/list_production_inventory_entries_v4/);
});

test('UI transfers the complete box without accepting a withdrawal quantity',()=>{
  assert.match(js,/Transferir caixa completa/);
  assert.match(js,/Todo o saldo desta caixa será retirado/);
  assert.match(js,/Estoque do e-commerce/);
  assert.match(js,/transfer_production_inventory_box_to_ecommerce/);
  assert.doesNotMatch(js,/Quantidade retirada/);
  assert.doesNotMatch(js,/data-inventory-exit/);
  assert.match(js,/confirm\(`Transferir a caixa/);
});

test('transfer presentation is responsive and included in PDFs and help',()=>{
  assert.match(css,/production-inventory-transfer-summary/);
  assert.match(css,/@media\(max-width:430px\)[\s\S]*production-inventory-transfer-summary/);
  assert.match(js,/Transferida ao e-commerce em/);
  assert.match(manual,/não é necessário digitar quantidade/i);
  assert.match(technical,/Esta versão não cria um segundo saldo/);
  assert.match(audit,/zero dados artificiais/);
  assert.equal(JSON.parse(pkg).version,'25.91.0');
});

test('transfer APIs remain limited to authenticated managers and isolated from other stocks',()=>{
  assert.match(sql,/private\.can_manage_production_inventory\(\)/g);
  assert.match(sql,/revoke all on function public\.transfer_production_inventory_box_to_ecommerce[\s\S]*from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public\.transfer_production_inventory_box_to_ecommerce[\s\S]*to authenticated,service_role/);
  assert.doesNotMatch(sql,/update public\.products|insert into public\.stock_movements|production_weekly_closings/);
});
