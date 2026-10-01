import assert from 'node:assert/strict';
import { CAPTURE_TABLES, recoveryOrder } from '../scripts/backup-catalog.mjs';

export function assertCapturedAndPlannedTables(names) {
  const capture = new Set(CAPTURE_TABLES.map(table => table.name));
  const planned = new Set(recoveryOrder().map(table => table.name));
  for (const name of names) {
    assert.ok(capture.has(name), name + ' must be exported');
    assert.ok(planned.has(name), name + ' must participate in the isolated SQL plan');
  }
}
export function assertPreservedIdentity(tableName, column) {
  assertCapturedAndPlannedTables([tableName]);
  const table = CAPTURE_TABLES.find(item => item.name === tableName);
  assert.ok(table.generated.some(item => item.column === column && item.identity), tableName + '.' + column + ' must retain its original identity');
}
