import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [edge, app] = await Promise.all([
  readFile(new URL('../supabase/functions/manage-user/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
]);

test('all restrictive profile history relationships are checked before deletion', () => {
  for (const reference of [
    '["requests", "requested_by"]',
    '["finished_production_receipts", "worker_id"]',
    '["finished_production_receipts", "received_by"]',
    '["production_weekly_closings", "worker_id"]',
    '["production_weekly_closings", "closed_by"]',
    '["purchase_orders", "created_by"]',
    '["stock_movements", "created_by"]',
  ]) assert.match(edge, new RegExp(reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(edge, /hasOperationalHistory\(admin, id\)/);
});

test('profiles with history are banned and deactivated instead of deleted', () => {
  assert.match(edge, /ban_duration:\s*status === "inactive" \? "876000h" : "none"/);
  assert.match(edge, /action:\s*"profile\.deactivated"/);
  assert.match(edge, /mode:\s*"deactivated"/);
  assert.match(edge, /mode:\s*"deleted"/);
});

test('status edits keep Auth and the profile status synchronized', () => {
  assert.match(edge, /authUpdate\.ban_duration\s*=\s*protectedStatus === "inactive" \? "876000h" : "none"/);
  assert.match(edge, /patch\.must_change_password\s*=\s*!isSelf/);
});

test('the admin interface explains preservation and reports the actual result', () => {
  assert.match(app, /Remover acesso/);
  assert.match(app, /Se houver histórico, a pessoa será desativada e os registros serão preservados/);
  assert.match(app, /result\.mode==='deactivated'/);
  assert.match(app, /Acesso desativado e histórico preservado/);
});
