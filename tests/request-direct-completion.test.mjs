import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const [app,css,sql]=await Promise.all([
  readFile(new URL('../app.js',import.meta.url),'utf8'),
  readFile(new URL('../styles.css',import.meta.url),'utf8'),
  readFile(new URL('../supabase/migrations/20260720113000_complete_separating_request.sql',import.meta.url),'utf8'),
]);

test('an admin can complete an already delivered separating request directly',()=>{
  assert.match(app,/O material já foi entregue\?/);
  assert.match(app,/id="completeReqNow"/);
  assert.match(app,/admin_complete_request_now/);
  assert.match(app,/p_fulfillment_method:\$\('#method'\)\.value/);
  assert.match(app,/p_delivered_by_name:delivered,p_received_by_name:received/);
  assert.match(css,/\.request-complete-now/);
});

test('direct completion remains atomic, admin-only and audited',()=>{
  assert.match(sql,/^begin;/m);
  assert.match(sql,/^commit;/m);
  assert.match(sql,/if not \(select private\.is_admin\(\)\)/i);
  assert.match(sql,/where r\.id=p_request_id[\s\S]*for update/i);
  assert.match(sql,/v_status<>'separating'/i);
  assert.match(sql,/set status='scheduled'[\s\S]*scheduled_for=now\(\)/i);
  assert.match(sql,/perform public\.admin_complete_request\(/i);
  assert.match(sql,/request\.delivery_confirmed_directly/);
  assert.match(sql,/revoke all on function public\.admin_complete_request_now[^;]+from public,anon,authenticated/i);
  assert.match(sql,/grant execute on function public\.admin_complete_request_now[^;]+to authenticated,service_role/i);
});
