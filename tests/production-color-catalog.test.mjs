import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const [ui,css,sql]=await Promise.all([
  readFile(new URL('../production-receipts.js',import.meta.url),'utf8'),
  readFile(new URL('../production-receipts.css',import.meta.url),'utf8'),
  readFile(new URL('../supabase/migrations/20260720004500_production_color_catalog.sql',import.meta.url),'utf8'),
]);

test('global color catalog is additive, audited and role protected',()=>{
  assert.match(sql,/^begin;/m);
  assert.match(sql,/^commit;/m);
  assert.doesNotMatch(sql,/drop\s+table/i);
  assert.match(sql,/create table if not exists public\.finished_production_colors/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all privileges on table public\.finished_production_colors from public, anon, authenticated/i);
  assert.match(sql,/private\.is_admin\(\)/i);
  assert.match(sql,/production\.color_created/);
  assert.match(sql,/production\.color_updated/);
  assert.match(sql,/production\.color_deleted/);
});

test('existing colors are preserved and every receipt is canonicalized',()=>{
  assert.match(sql,/unnest\(m\.colors\)/i);
  assert.match(sql,/from public\.finished_production_receipts r/i);
  assert.match(sql,/create trigger validate_finished_production_color/i);
  assert.match(sql,/new\.color:=v_canonical/i);
  assert.match(sql,/Selecione uma cor cadastrada no catálogo da produção/);
  assert.match(sql,/Esta cor já possui recebimentos/);
});

test('all current and future models share the active global palette',()=>{
  assert.match(ui,/rpc\('list_finished_production_colors'/);
  assert.match(ui,/Toda cor ativa aparece automaticamente em todos os modelos atuais e futuros/);
  assert.match(ui,/cores ativas serão adicionadas a este modelo/);
  assert.match(ui,/PR\.colors\.filter\(color=>color\.active/);
  assert.doesNotMatch(ui,/name="colors"/);
  assert.match(ui,/data-production-tab/);
  assert.match(ui,/\['colors','Cores'\]/);
});

test('receiver selects a color by name and visual swatch instead of free text',()=>{
  assert.match(ui,/production-color-select/);
  assert.match(ui,/type="color"/);
  assert.match(ui,/productionColorHex/);
  assert.match(ui,/name="color" required/);
  assert.doesNotMatch(ui,/placeholder="Informe a cor"/);
  assert.match(css,/\.production-color-select/);
  assert.match(css,/\.visual-color-pill/);
  assert.match(css,/@media\(max-width:700px\)/);
});
