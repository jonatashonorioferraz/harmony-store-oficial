import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('ADM and receiver can correct any unpaid production collection',async()=>{
  const sql=await read('supabase/migrations/20260719220000_reopen_production_collections.sql');
  assert.match(sql,/private\.is_admin\(\).*private\.is_production_receiver\(\)/is);
  assert.doesNotMatch(sql,/v_record\.received_by\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(sql,/v_closing_status\s*=\s*'paid'/i);
  assert.match(sql,/pagamento já foi realizado/i);
  assert.match(sql,/p_worker_id is distinct from v_record\.worker_id/i);
  assert.match(sql,/p_received_on is distinct from v_record\.received_on/i);
});

test('closed totals are recalculated atomically from official quantities',async()=>{
  const sql=await read('supabase/migrations/20260719221500_fix_reopen_collection_closing_lookup.sql');
  assert.match(sql,/begin;[\s\S]*commit;/i);
  assert.match(sql,/quantity::numeric \* rate_per_100_snapshot \/ 100/i);
  assert.match(sql,/set total_quantity = v_new_quantity,[\s\S]*total_amount = v_new_amount/i);
  assert.match(sql,/where id = v_closing_id and status = 'closed'/i);
  assert.match(sql,/production\.collection_reopened_updated/i);
  assert.match(sql,/closed_totals_recalculated/i);
  assert.match(sql,/v_closing_id := v_record\.closing_id/i);
  assert.doesNotMatch(sql,/max\(closing_id\)/i);
  assert.match(sql,/revoke all on function public\.update_finished_production_collection.*from public, anon/is);
});

test('responsive interface exposes reopen flow without revealing receiver values',async()=>{
  const [js,css,worker]=await Promise.all([read('production-receipts.js'),read('production-receipts.css'),read('service-worker.js')]);
  assert.match(js,/Reabrir e editar/);
  assert.match(js,/Reabrir e complementar recebimento/);
  assert.match(js,/Salvar correção da coleta/);
  assert.match(js,/canSeeReceiptValues=\(\)=>isAdmin\(\)/);
  assert.match(js,/Pagamento protegido/);
  assert.match(css,/production-reopen-note/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(worker,/harmony-store-v25-18/);
});
