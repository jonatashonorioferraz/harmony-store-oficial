import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('separation check-up is additive, admin-only and auditable',async()=>{
  const sql=await read('supabase/migrations/20260807113000_separation_checkup_and_replenishment.sql');
  assert.match(sql,/^begin;/i);
  assert.match(sql,/commit;\s*$/i);
  assert.match(sql,/create table if not exists public\.separation_checkup_items/i);
  assert.match(sql,/create table if not exists public\.stock_discrepancies/i);
  assert.match(sql,/create table if not exists public\.stock_replenishment_requests/i);
  assert.match(sql,/private\.is_admin\(\)/i);
  assert.match(sql,/request\.separation_item_checked/i);
  assert.match(sql,/request\.separation_checkup_completed/i);
  assert.match(sql,/revoke all on table public\.stock_discrepancies from public,anon,authenticated/i);
  assert.doesNotMatch(sql,/grant (insert|update|delete) on table public\.stock_discrepancies to authenticated/i);
  assert.match(sql,/grant all privileges on table public\.stock_discrepancies to service_role/i);
  assert.match(sql,/grant execute on function public\.admin_finalize_material_separation\(uuid,jsonb,text\) to service_role/i);
});

test('out-of-stock action is atomic, zeros stock and creates one replenishment need',async()=>{
  const sql=await read('supabase/migrations/20260807113000_separation_checkup_and_replenishment.sql');
  assert.match(sql,/where id=p_request_id for update/i);
  assert.match(sql,/where id=v_item\.product_id for update/i);
  assert.match(sql,/set physical_stock=0,reserved_stock=0/i);
  assert.match(sql,/discrepancy_type,system_stock,counted_stock,difference/i);
  assert.match(sql,/stock_replenishment_one_open_per_product_idx/i);
  assert.match(sql,/where product_id=v_product\.id and status in \('open','in_progress'\) for update/i);
  assert.match(sql,/requested_quantity=greatest\(requested_quantity,v_required\)/i);
  assert.match(sql,/v_product\.replenishment_mode/i);
});

test('final separation rejects forgotten items and preserves the official stock reservation flow',async()=>{
  const sql=await read('supabase/migrations/20260807113000_separation_checkup_and_replenishment.sql');
  assert.match(sql,/coalesce\(c\.status,'pending'\) not in \('separated','out_of_stock'\)/i);
  assert.match(sql,/Confira todos os itens antes de finalizar a separação/i);
  assert.match(sql,/v_payload_items<>v_request_items/i);
  assert.match(sql,/A lista mudou durante a conferência/i);
  assert.match(sql,/perform public\.admin_prepare_request\(p_request_id,p_items,p_admin_notes\)/i);
  assert.match(sql,/Itens sem estoque devem permanecer zerados/i);
});

test('responsive checklist highlights outcomes and exposes reports',async()=>{
  const [js,css,html,worker,webJs,webCss]=await Promise.all([
    read('separation-checkup.js'),read('separation-checkup.css'),read('index.html'),read('service-worker.js'),read('web/separation-checkup.js'),read('web/separation-checkup.css')
  ]);
  assert.equal(js,webJs);
  assert.equal(css,webCss);
  assert.match(js,/data-check-separated/);
  assert.match(js,/Sem estoque/);
  assert.match(js,/admin_finalize_material_separation/);
  assert.match(js,/admin_record_stock_discrepancy/);
  assert.match(js,/if\(checkbox\)checkbox\.disabled=true/);
  assert.match(js,/Exportar Excel/);
  assert.match(js,/Salvar em PDF/);
  assert.match(css,/check-separated/);
  assert.match(css,/check-out-of-stock/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(html,/separation-checkup\.js\?v=25\.52/);
  assert.match(html,/separation-checkup\.css\?v=25\.52/);
  assert.match(worker,/harmony-store-v25-52/);
  assert.match(worker,/separation-checkup\.js\?v=25\.52/);
});

test('product replenishment mode and continuity data are included',async()=>{
  const [app,backup,recovery,change,pkg,help,manual,technical]=await Promise.all([
    read('app.js'),read('scripts/create-api-backup.mjs'),read('scripts/execute-api-recovery.mjs'),read('CHANGELOG.md'),read('package.json'),read('help-center.js'),read('docs/manual/MANUAL-DO-APLICATIVO.md'),read('docs/technical/ARQUITETURA-E-OPERACAO.md')
  ]);
  assert.match(app,/name="replenishment_mode"/);
  assert.match(app,/admin_set_product_replenishment_mode/);
  assert.match(backup,/separation_checkup_items.*stock_discrepancies.*stock_replenishment_requests/s);
  assert.match(recovery,/separation_checkup_items.*stock_discrepancies.*stock_replenishment_requests/s);
  assert.match(change,/\[v25\.52\]/);
  assert.match(help,/Finalizar separação/);
  assert.match(manual,/Check-up da separação/);
  assert.match(technical,/Check-up transacional de separação e reposição/);
  assert.equal(JSON.parse(pkg).version,'25.52.0');
});
