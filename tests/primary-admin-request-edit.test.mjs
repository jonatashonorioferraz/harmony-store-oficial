import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const [app,css,sql,help]=await Promise.all([
  readFile(new URL('../app.js',import.meta.url),'utf8'),
  readFile(new URL('../styles.css',import.meta.url),'utf8'),
  readFile(new URL('../supabase/migrations/20260720124500_primary_admin_full_request_edit.sql',import.meta.url),'utf8'),
  readFile(new URL('../help-center.js',import.meta.url),'utf8'),
]);

test('full request editor is exclusive to the primary admin and supports all active phases',()=>{
  assert.match(app,/S\.profile\?\.is_primary_admin/);
  assert.match(app,/request\.status==='cancelled'/);
  assert.match(app,/Editar solicitação completa/);
  assert.match(app,/Buscar produto/);
  assert.match(app,/requested_quantity:item\.requested_quantity/);
  assert.match(app,/approved_quantity:pending\?null:item\.approved_quantity/);
  assert.match(app,/primary_admin_update_request/);
  assert.match(help,/ADM principal pode usar Editar solicitação completa/);
});

test('database correction is transactional, locked, audited and primary-admin only',()=>{
  assert.match(sql,/^begin;/m);
  assert.match(sql,/^commit;/m);
  assert.match(sql,/private\.is_primary_admin\(\)/i);
  assert.match(sql,/where r\.id=p_request_id[\s\S]*for update/i);
  assert.match(sql,/order by p\.id[\s\S]*for update/i);
  assert.match(sql,/v_status not in \('pending','separating','scheduled','delivered'\)/i);
  assert.match(sql,/v_status='cancelled'/i);
  assert.match(sql,/request\.primary_admin_full_update/);
  assert.match(sql,/jsonb_build_object\('status',v_status,'reason',trim\(p_reason\),'before',v_before,'after',v_after\)/i);
  assert.match(sql,/revoke all on function public\.primary_admin_update_request[^;]+from public,anon,authenticated/i);
});

test('stock effects match the request phase without changing its status',()=>{
  assert.match(sql,/v_status in \('separating','scheduled'\) and v_delta<>0/i);
  assert.match(sql,/set reserved_stock=reserved_stock\+v_delta/i);
  assert.match(sql,/v_status='delivered' and v_delta<>0/i);
  assert.match(sql,/set physical_stock=physical_stock-v_delta/i);
  assert.match(sql,/Correção de entrega: saída adicional/);
  assert.match(sql,/Correção de entrega: devolução ao estoque/);
  assert.doesNotMatch(sql,/update public\.requests set status=/i);
});

test('editor remains usable on tablet and mobile',()=>{
  assert.match(css,/\.primary-request-editor/);
  assert.match(css,/@media\(max-width:900px\)[\s\S]*\.primary-request-item/);
  assert.match(css,/@media\(max-width:600px\)[\s\S]*\.primary-product-picker/);
  assert.match(css,/\.request-stock-impact\.out/);
  assert.match(css,/\.request-stock-impact\.in/);
});
