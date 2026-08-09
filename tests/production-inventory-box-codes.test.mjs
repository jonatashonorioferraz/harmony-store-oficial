import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const [sql,js,css,manual,technical,audit,recovery]=await Promise.all([
  readFile(new URL('supabase/migrations/20260809193000_production_inventory_unique_boxes.sql',root),'utf8'),
  readFile(new URL('production-inventory.js',root),'utf8'),
  readFile(new URL('production-inventory.css',root),'utf8'),
  readFile(new URL('docs/manual/MANUAL-DO-APLICATIVO.md',root),'utf8'),
  readFile(new URL('docs/technical/CAIXAS-UNICAS-INVENTARIO-V25.58.md',root),'utf8'),
  readFile(new URL('docs/audit/RELATORIO-CAIXAS-UNICAS-INVENTARIO-V25.58.md',root),'utf8'),
  readFile(new URL('scripts/execute-api-recovery.mjs',root),'utf8'),
]);

test('database makes every physical box positive, unique and immutable',()=>{
  assert.match(sql,/create sequence if not exists public\.production_inventory_box_number_seq[\s\S]*no cycle/);
  assert.match(sql,/add column if not exists box_number bigint/);
  assert.match(sql,/check \(box_number>0\)/);
  assert.match(sql,/create unique index if not exists production_inventory_entries_box_number_unique/);
  assert.match(sql,/create trigger production_inventory_box_number_immutable/);
  assert.match(sql,/O código permanente da caixa não pode ser alterado/);
  assert.doesNotMatch(sql,/delete from public\.production_inventory_entries/);
});

test('generator never reuses a number and records an audit event',()=>{
  assert.match(sql,/nextval\('public\.production_inventory_box_number_seq'\)/);
  assert.match(sql,/where e\.box_number=v_number/);
  assert.match(sql,/production_inventory\.box_code_generated/);
  assert.match(sql,/production_inventory\.entry_created/);
  assert.match(sql,/A caixa CX-% já está cadastrada/);
});

test('box APIs are permissioned and keep older cached clients compatible',()=>{
  assert.match(sql,/private\.can_manage_production_inventory\(\)/g);
  assert.match(sql,/revoke all on function public\.generate_production_inventory_box_number\(\) from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public\.create_production_inventory_entry_v2[\s\S]*to authenticated,service_role/);
  assert.match(sql,/alter column box_number set default private\.next_available_production_inventory_box_number\(\)/);
});

test('new-box interface requires generation and shows the permanent code everywhere',()=>{
  assert.match(js,/Registrar nova caixa/);
  assert.match(js,/✨ Gerar código/);
  assert.match(js,/Clique em Gerar código antes de salvar a caixa/);
  assert.match(js,/CX-'\+String\(n\(value\)\)\.padStart\(6,'0'\)/);
  assert.match(js,/create_production_inventory_entry_v2/);
  assert.match(js,/list_production_inventory_entries_v2/);
  assert.match(js,/list_production_inventory_movements_v2/);
  assert.match(js,/CÓDIGO PERMANENTE/);
  assert.match(js,/Código da caixa/);
});

test('generator is responsive and clearly distinguishes code from physical location',()=>{
  assert.match(css,/production-inventory-box-generator/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*production-inventory-box-generator/);
  assert.match(js,/Localização física/);
  assert.match(manual,/código é exclusivo e permanente/i);
});

test('backup recovery preserves the explicit box number',()=>{
  assert.match(recovery,/production_inventory_entries: \['protocol'\]/);
  assert.doesNotMatch(recovery,/production_inventory_entries: \[[^\]]*box_number/);
  assert.match(technical,/restauração preserva `box_number`/);
  assert.match(audit,/Backup e restauração preservam `box_number`/);
});
