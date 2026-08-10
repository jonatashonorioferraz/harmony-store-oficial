import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260810170000_preserve_reserved_stock_on_out_of_stock.sql',import.meta.url),'utf8');

test('sem estoque preserva reservas de outras solicitações',()=>{
  assert.match(sql,/i\.id<>v_item\.id/);
  assert.match(sql,/r\.status in \('separating','scheduled'\)/);
  assert.match(sql,/set physical_stock=v_other_reserved,reserved_stock=v_other_reserved/);
  assert.doesNotMatch(sql,/set physical_stock=0,reserved_stock=0/);
});

test('ajuste registra apenas o saldo livre e mantém auditoria',()=>{
  assert.match(sql,/v_free_stock:=greatest\(v_physical-v_reserved,0\)/);
  assert.match(sql,/preserved_reserved_stock/);
  assert.match(sql,/free_stock_created',0/);
});

test('reparo exige solicitação ativa e checklist separado',()=>{
  assert.match(sql,/r\.status in \('separating','scheduled'\)/);
  assert.match(sql,/c\.status='separated'/);
  assert.match(sql,/s\.physical_stock<e\.reserved_quantity/);
});
