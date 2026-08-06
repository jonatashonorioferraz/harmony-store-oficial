import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sql=await readFile(new URL('../supabase/migrations/20260806113000_reconcile_request_stock_on_delivery.sql',import.meta.url),'utf8');

test('delivery reconciles the reservation from other open requests instead of trusting a stale total',()=>{
  assert.match(sql,/create or replace function public\.admin_complete_request\(/i);
  assert.match(sql,/i\.request_id<>p_request_id/i);
  assert.match(sql,/r\.status in \('separating','scheduled'\)/i);
  assert.match(sql,/set physical_stock=physical_stock-v_item\.approved_quantity,[\s\S]*reserved_stock=v_other_reserved/i);
  assert.doesNotMatch(sql,/reserved_stock>=v_item\.approved_quantity/i);
});

test('delivery preserves inventory committed to other requests and remains atomic',()=>{
  assert.match(sql,/physical_stock-v_item\.approved_quantity<v_other_reserved/i);
  assert.match(sql,/Disponível para esta entrega/i);
  assert.match(sql,/order by p\.id[\s\S]*for update/i);
  assert.match(sql,/^begin;/mi);
  assert.match(sql,/commit;\s*$/i);
});

test('delivery reconciliation stays admin-only, audited and API-compatible',()=>{
  assert.match(sql,/private\.is_admin\(\)/i);
  assert.match(sql,/request\.completed/i);
  assert.match(sql,/stock_reservations_reconciled/i);
  assert.match(sql,/revoke all on function public\.admin_complete_request\(uuid,text,text\) from public,anon,authenticated/i);
  assert.match(sql,/grant execute on function public\.admin_complete_request\(uuid,text,text\) to authenticated,service_role/i);
  assert.match(sql,/notify pgrst, 'reload schema'/i);
});
