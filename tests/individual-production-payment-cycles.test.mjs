import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('individual payment schedules are additive, constrained and protected',async()=>{
  const [sql,indexSql]=await Promise.all([read('supabase/migrations/20260721195736_individual_production_payment_cycles.sql'),read('supabase/migrations/20260721211500_index_payment_schedule_configurator.sql')]);
  assert.match(sql,/create table if not exists public\.production_payment_schedules/i);
  assert.match(sql,/payment_weekday smallint[^;]+between 1 and 7/is);
  assert.match(sql,/cutoff_weekday smallint[^;]+between 1 and 7/is);
  assert.match(sql,/alter table public\.production_payment_schedules enable row level security/i);
  assert.match(sql,/revoke all on table public\.production_payment_schedules from public, anon, authenticated/i);
  assert.doesNotMatch(sql,/drop table/i);
  assert.match(sql,/finished_receipts_open_payment_idx/i);
  assert.match(indexSql,/production_payment_schedules_configured_by_idx/i);
});

test('receipt scheduling and closing use official quantity with transactional locks',async()=>{
  const sql=await read('supabase/migrations/20260721195736_individual_production_payment_cycles.sql');
  assert.match(sql,/planned_payment_on date/i);
  assert.match(sql,/private\.next_open_production_payment_due/i);
  assert.match(sql,/admin_close_production_payment/i);
  assert.match(sql,/planned_payment_on\s*<=\s*p_payment_due_on/i);
  assert.match(sql,/order by id for update/i);
  assert.match(sql,/sum\(quantity::numeric\*rate_per_100_snapshot\/100\)/i);
  assert.match(sql,/production\.payment_closed/i);
  assert.match(sql,/production\.collection_payment_moved/i);
});

test('UI supports individual schedules, previews, manual moves and mobile layout',async()=>{
  const [app,production,css]=await Promise.all([read('app.js'),read('production-receipts.js'),read('production-receipts.css')]);
  assert.match(app,/Agenda individual de pagamento/);
  assert.match(app,/admin_save_production_payment_schedule/);
  assert.match(production,/list_production_payment_overview/);
  assert.match(production,/admin_preview_production_payment/);
  assert.match(production,/admin_move_production_collection_payment/);
  assert.match(production,/admin_close_production_payment/);
  assert.match(production,/admin_production_payment_statement/);
  assert.match(css,/payment-overview-grid/);
  assert.match(css,/@media\(max-width:600px\)/);
});

test('receiver privacy and collaborator closed-payment privacy remain enforced',async()=>{
  const sql=await read('supabase/migrations/20260721195736_individual_production_payment_cycles.sql');
  assert.match(sql,/case when v_role='admin' then r\.rate_per_100_snapshot else null::numeric end/i);
  assert.match(sql,/case when v_role='admin' or \(v_role='collaborator' and c\.worker_id=v_uid\) then c\.total_amount else null::numeric end/i);
});

test('backup and recovery include individualized schedules',async()=>{
  const [backup,recovery]=await Promise.all([read('scripts/create-api-backup.mjs'),read('scripts/execute-api-recovery.mjs')]);
  assert.match(backup,/production_payment_schedules/);
  assert.match(recovery,/production_payment_schedules/);
});
