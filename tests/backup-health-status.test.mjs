import assert from 'node:assert/strict';
import test from 'node:test';
import { backupHealthItem } from '../supabase/functions/system-health/backup-status.mjs';
const now = Date.parse('2026-10-01T12:00:00Z');
const current = stats => ({ completed_at: '2026-10-01T11:00:00Z', stats });
test('legacy success does not certify coverage or recovery', () => {
  const item = backupHealthItem({ backup: current({tables:73}), now });
  assert.equal(item.status, 'yellow');
  assert.match(item.detail, /cobertura.*verificada/);
  assert.doesNotMatch(item.detail, /pronta para recuperação/);
});
test('complete export remains attention until isolated restore is proved', () => {
  const item = backupHealthItem({ backup: current({coverage:{complete_for_current_catalog:true},recovery_ready:false}), now });
  assert.equal(item.status, 'yellow');
  assert.match(item.detail, /ainda não foi comprovada/);
});
test('recovery flag alone cannot bypass missing coverage', () => {
  const item = backupHealthItem({ backup: current({recovery_ready:true}), now });
  assert.equal(item.status, 'yellow');
});
test('fresh coverage and recorded recovery can be green', () => {
  const item = backupHealthItem({ backup: current({coverage:{complete_for_current_catalog:true},recovery_ready:true,recovery_verified:true}), now });
  assert.equal(item.status, 'green');
  assert.match(item.detail, /ensaio de recuperação registrados/);
});
test('old copy stays red even after the last attempt failed', () => {
  const item = backupHealthItem({ backup:{...current({}),completed_at:'2026-09-28T00:00:00Z'},attempt:{status:'failed'},now });
  assert.equal(item.status, 'red');
});
test('query failure, missing copy and invalid dates never become green', () => {
  for (const input of [{queryError:true}, {}, {backup:{completed_at:'invalid'}}, {backup:{completed_at:'2027-01-01T00:00:00Z'}}]) {
    assert.equal(backupHealthItem({...input,now}).status,'red');
  }
});
test('new failure and aging verified copy require attention', () => {
  const backup=current({coverage:{complete_for_current_catalog:true},recovery_ready:true,recovery_verified:true});
  assert.equal(backupHealthItem({backup,attempt:{status:'failed'},now}).status,'yellow');
  assert.equal(backupHealthItem({backup:{...backup,completed_at:'2026-09-30T04:00:00Z'},now}).status,'yellow');
});

test('coverage and readiness without verified recovery stay yellow', () => {
  const item = backupHealthItem({ backup: current({coverage:{complete_for_current_catalog:true},recovery_ready:true,recovery_verified:false}), now });
  assert.equal(item.status, 'yellow');
});
