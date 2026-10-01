import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CAPTURE_TABLES, TABLE_CATALOG, EXCLUDED_TABLES, CATALOG_VERSION, MIGRATIONS_SHA256, recoveryOrder } from '../scripts/backup-catalog.mjs';
import { inspectBackup, requireCurrentCoverage, recoveryPlan, sourceMigrations, migrationDigest, assertCatalogMatchesMigrations, sha256, storageBackupPath } from '../scripts/backup-contract.mjs';
import { createBackup } from '../scripts/create-api-backup.mjs';
import { validateRecoveryTarget } from '../scripts/execute-api-recovery.mjs';

const migrations = await sourceMigrations();
const project = fileURLToPath(new URL('../', import.meta.url));
const fakeEnv = { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_synthetic_fixture' };
async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'harmony-backup-fixture-'));
  t.after(async () => {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(root.split(/[\\/]/).at(-1).startsWith('harmony-backup-fixture-'));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
function rowFor(name, data) {
  const spec = TABLE_CATALOG.find(table => table.name === name);
  return Object.assign(Object.fromEntries(spec.foreignKeys.flatMap(fk => fk.columns).map(key => [key, null])), data);
}
async function fixture(t, { legacy = false, missing = [], rows = {}, users = [], objects = [] } = {}) {
  const root = await temporary(t), dir = join(root, 'current');
  await mkdir(dir);
  const files = [];
  async function save(name, value) {
    const bytes = typeof value === 'string' ? value : JSON.stringify(value);
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), bytes);
    files.push({ path: name, size: Buffer.byteLength(bytes), sha256: sha256(bytes) });
  }
  const tables = [];
  for (const table of CAPTURE_TABLES.filter(table => !missing.includes(table.name))) {
    const values = rows[table.name] || [];
    await save('tables/' + table.name + '.json', values);
    tables.push({ table: table.name, rows: values.length });
  }
  await save('auth-users.json', users);
  if (!legacy) for (const migration of migrations) await save('migrations/' + migration.name, migration.content);
  const buckets = [];
  if (objects.length) {
    const bucket = { id: 'synthetic-fixture', public: false, objects: objects.length, bytes: 0, files: [] };
    for (const object of objects) {
      const name = object.name;
      const path = storageBackupPath(bucket.id, name);
      await save(path, object.content);
      const size = Buffer.byteLength(object.content);
      bucket.bytes += size;
      bucket.files.push({ name, size, backup_path: path });
    }
    buckets.push(bucket);
  }
  const manifest = {
    format: 'harmony-api-backup-v' + (legacy ? '1' : '2'),
    generated_at: '2026-10-01T00:00:00Z',
    capture_window: { started_at: '2026-10-01T00:00:00Z', finished_at: '2026-10-01T00:00:01Z' },
    consistency: { mode: 'non-transactional', transactionally_consistent: false },
    coverage: {
      catalog_version: CATALOG_VERSION, migrations_sha256: MIGRATIONS_SHA256,
      excluded_tables: EXCLUDED_TABLES.map(table => ({ table: table.name, reason: table.retention })),
    },
    tables, auth_users: users.length, buckets, migrations: migrations.map(file => file.name), files,
  };
  const saveManifest = () => writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
  await saveManifest();
  return { root, dir, manifest, saveManifest };
}
function run(script, args, env = {}) {
  return spawnSync(process.execPath, [join(project, 'scripts', script), ...args], {
    cwd: tmpdir(), encoding: 'utf8', env: { SystemRoot: process.env.SystemRoot || '', ...env },
  });
}

test('catalog covers actual schema and new business tables, with one explicit ephemeral exclusion', () => {
  assertCatalogMatchesMigrations(migrations);
  assert.equal(TABLE_CATALOG.length, 86);
  assert.equal(CAPTURE_TABLES.length, 85);
  assert.deepEqual(EXCLUDED_TABLES.map(table => table.name), ['commercial_calendar_validation_authorizations']);
  for (const name of ['label_lots', 'label_lot_events', 'collaborator_label_codes', 'collaborator_label_code_events', 'commercial_calendar_events', 'commercial_calendar_plans', 'commercial_calendar_runs', 'commercial_calendar_audit', 'shipping_inventory_request_items', 'internal_supply_request_item_fulfillments', 'system_events', 'system_backup_runs']) {
    assert.ok(CAPTURE_TABLES.some(table => table.name === name), name);
  }
  assert.ok(CAPTURE_TABLES.every(table => table.serviceSelect && table.primaryKey.length));
  assert.match(TABLE_CATALOG.find(table => table.name === 'app_usage_sessions').retention, /180/);
  assert.ok(TABLE_CATALOG.filter(table => table.classification === 'telemetry').every(table => table.capture));
});
test('new or changed migrations block capture until metadata and policy are reviewed', () => {
  assert.equal(migrationDigest(migrations), MIGRATIONS_SHA256);
  assert.throws(() => assertCatalogMatchesMigrations([...migrations, { name: '20990101000000_new.sql', content: 'create table public.new_business (id uuid);' }]), /Migrations mudaram/);
  assert.throws(() => assertCatalogMatchesMigrations(migrations.slice(0, -1)), /Migrations mudaram/);
});
test('restore plan derives every FK dependency including fulfillment ledger, without claiming replay safety', async t => {
  const ordered = recoveryOrder(), positions = new Map(ordered.map((table, index) => [table.name, index]));
  assert.equal(positions.size, CAPTURE_TABLES.length);
  for (const table of ordered) for (const fk of table.foreignKeys.filter(fk => fk.schema === 'public')) {
    assert.ok(positions.has(fk.table), table.name + ' depends on excluded table ' + fk.table);
    assert.ok(positions.get(fk.table) < positions.get(table.name), table.name + ' -> ' + fk.table);
  }
  const { dir } = await fixture(t);
  const plan = recoveryPlan(await inspectBackup(dir));
  assert.equal(plan.recovery_ready, false);
  assert.ok(plan.blockers.some(item => item.code === 'SEQUENCE_STATE_NOT_CAPTURED'));
  assert.ok(plan.preserve_identity_columns.some(item => item.table === 'bills' && item.columns.includes('protocol')));
});
test('composite and singleton keys, new lot/calendar rows and Auth/FKs validate offline', async t => {
  const rows = {
    profiles: [rowFor('profiles', { id: 'user-fixture' })],
    label_lots: [rowFor('label_lots', { id: 'lot-fixture', collaborator_id: 'user-fixture' })],
    label_lot_events: [rowFor('label_lot_events', { id: 1, lot_id: 'lot-fixture' })],
    commercial_calendar_events: [rowFor('commercial_calendar_events', { id: 'event-fixture' })],
    commercial_calendar_settings: [rowFor('commercial_calendar_settings', { singleton: true })],
    shopee_import_days: [rowFor('shopee_import_days', { report_type: 'sales', metric_date: '2026-10-01' })],
  };
  const { dir } = await fixture(t, { rows, users: [{ id: 'user-fixture' }] });
  const inspected = await inspectBackup(dir);
  assert.doesNotThrow(() => requireCurrentCoverage(inspected));
  assert.equal(inspected.report.coverage.complete_for_current_catalog, true);
  assert.equal(inspected.report.integrity_valid, true);
  assert.equal(inspected.report.recovery_ready, false);
  assert.equal(inspected.report.consistency.transactionally_consistent, false);
  assert.ok(inspected.report.references.checked_rows >= 3);
});
test('legacy rollback package remains inspectable but cannot claim current restore coverage', async t => {
  const missing = ['label_lots', 'label_lot_events', 'commercial_calendar_events', 'internal_supply_request_item_fulfillments'];
  const { dir } = await fixture(t, { legacy: true, missing });
  const inspected = await inspectBackup(dir);
  assert.equal(inspected.report.integrity_valid, true);
  assert.equal(inspected.report.coverage.legacy, true);
  assert.deepEqual(inspected.report.coverage.missing_tables.sort(), missing.sort());
  assert.throws(() => requireCurrentCoverage(inspected), /Cobertura incompleta/);
  assert.equal(recoveryPlan(inspected).recovery_ready, false);
});
test('missing new table blocks current coverage even with valid hashes and row counts', async t => {
  const { dir } = await fixture(t, { missing: ['internal_supply_request_item_fulfillments'] });
  const inspected = await inspectBackup(dir);
  assert.throws(() => requireCurrentCoverage(inspected), /internal_supply_request_item_fulfillments/);
});
test('missing migration source and changed SQL cannot pass v2 verification', async t => {
  const sample = await fixture(t);
  sample.manifest.files = sample.manifest.files.filter(file => file.path !== 'migrations/' + migrations[0].name);
  await sample.saveManifest();
  await assert.rejects(inspectBackup(sample.dir), /Fonte de migration ausente/);
});
test('file hash and declared row counts are independently verified', async t => {
  const sample = await fixture(t);
  sample.manifest.tables[0].rows = 1;
  await sample.saveManifest();
  await assert.rejects(inspectBackup(sample.dir), /Contagem ou conteúdo inválido/);
  sample.manifest.tables[0].rows = 0;
  await sample.saveManifest();
  await writeFile(join(sample.dir, sample.manifest.files[0].path), '[{}]');
  await assert.rejects(inspectBackup(sample.dir), /Falha de integridade/);
});
test('duplicate composite PK or Auth IDs cannot hide a truncated capture', async t => {
  const row = rowFor('shopee_import_days', { report_type: 'sales', metric_date: '2026-10-01' });
  const sample = await fixture(t, { rows: { shopee_import_days: [row, { ...row }] } });
  await assert.rejects(inspectBackup(sample.dir), /Chave primária duplicada/);
  const auth = await fixture(t, { users: [{ id: 'synthetic' }, { id: 'synthetic' }] });
  await assert.rejects(inspectBackup(auth.dir), /Usuário Auth inválido ou duplicado/);
});
test('orphan FK and missing profile Auth reference fail without revealing IDs', async t => {
  const sample = await fixture(t, { rows: { label_lot_events: [rowFor('label_lot_events', { id: 1, lot_id: 'private-fixture-id' })] } });
  await assert.rejects(inspectBackup(sample.dir), error => {
    assert.match(error.message, /Referências órfãs.*label_lot_events/);
    assert.ok(!error.message.includes('private-fixture-id'));
    return true;
  });
  const auth = await fixture(t, { rows: { profiles: [rowFor('profiles', { id: 'private-fixture-id' })] } });
  await assert.rejects(inspectBackup(auth.dir), /profiles -> auth.users/);
});
test('unsafe or duplicate inventory paths fail before opening files outside the package', async t => {
  const sample = await fixture(t);
  sample.manifest.files.push({ ...sample.manifest.files[0], path: '../outside.json' });
  await sample.saveManifest();
  await assert.rejects(inspectBackup(sample.dir), /Caminho inseguro/);
  sample.manifest.files.pop();
  sample.manifest.files.push(sample.manifest.files[0]);
  await sample.saveManifest();
  await assert.rejects(inspectBackup(sample.dir), /duplicada/);
});
test('Storage names that previously collided retain separate bytes; forged mapping is rejected', async t => {
  const sample = await fixture(t, { objects: [{ name: 'nota?.pdf', content: 'one' }, { name: 'nota*.pdf', content: 'two' }] });
  const paths = sample.manifest.buckets[0].files.map(file => file.backup_path);
  assert.notEqual(paths[0], paths[1]);
  assert.equal((await inspectBackup(sample.dir)).report.objects, 2);
  sample.manifest.buckets[0].files[0].backup_path = 'auth-users.json';
  await sample.saveManifest();
  await assert.rejects(inspectBackup(sample.dir), /Mapeamento de objeto Storage inválido/);
});
test('missing Storage object is rejected independently of the remaining file inventory', async t => {
  const sample = await fixture(t, { objects: [{ name: 'nota.pdf', content: 'one' }] });
  sample.manifest.files = sample.manifest.files.filter(file => !file.path.startsWith('storage/'));
  await sample.saveManifest();
  await assert.rejects(inspectBackup(sample.dir), /Objeto Storage ausente/);
});
test('read-only dry-run is executable from unrelated cwd without credentials or network', async t => {
  const sample = await fixture(t);
  const guard = join(sample.root, 'no-network.mjs');
  const marker = join(sample.root, 'network-attempted');
  await writeFile(guard, 'import {writeFileSync} from "node:fs";globalThis.fetch=()=>{writeFileSync(' + JSON.stringify(marker) + ',"called");throw Error("network forbidden");};');
  const env = { NODE_OPTIONS: '--import=' + new URL('file:///' + guard.replace(/\\/g, '/').replace(/^\//, '')).href };
  const result = run('restore-api-backup.mjs', [sample.dir, '--require-current'], env);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'read-only-plan');
  assert.equal(report.coverage_complete, true);
  assert.equal(report.recovery_ready, false);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});
test('real importer fails closed before any external write, including valid full fixtures', async t => {
  const sample = await fixture(t);
  const guard = join(sample.root, 'no-network.mjs');
  const marker = join(sample.root, 'network-attempted');
  await writeFile(guard, 'import {writeFileSync} from "node:fs";globalThis.fetch=()=>{writeFileSync(' + JSON.stringify(marker) + ',"called");throw Error("network forbidden");};');
  const env = {
    RECOVERY_PROJECT_REF: 'abcdefghijklmnopqrst', RECOVERY_SUPABASE_URL: fakeEnv.SUPABASE_URL,
    RECOVERY_CONFIRM: 'RESTORE_ISOLATED_HARMONY', NODE_OPTIONS: '--import=' + new URL('file:///' + guard.replace(/\\/g, '/').replace(/^\//, '')).href,
  };
  const preflight = run('execute-api-recovery.mjs', ['--preflight-config'], env);
  assert.equal(preflight.status, 1);
  assert.match(preflight.stderr, /Restauração REST desativada/);
  const result = run('execute-api-recovery.mjs', [sample.dir], env);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).writes_performed, 0);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});
test('production, former unconfirmed destination and mismatched URL are rejected', () => {
  for (const ref of ['tyzfznwvjzmudxtcbbaf', 'jwluqaycxoeyraxsleri']) {
    assert.throws(() => validateRecoveryTarget({ RECOVERY_PROJECT_REF: ref, RECOVERY_SUPABASE_URL: 'https://' + ref + '.supabase.co' }));
  }
  assert.throws(() => validateRecoveryTarget({ RECOVERY_PROJECT_REF: 'abcdefghijklmnopqrst', RECOVERY_SUPABASE_URL: fakeEnv.SUPABASE_URL + '.invalid', RECOVERY_CONFIRM: 'RESTORE_ISOLATED_HARMONY' }), /não correspondem/);
});
test('exporter consumes one catalog and paginates through server limits with deterministic PK order', async t => {
  const root = await temporary(t), requests = [];
  const sourceRows = [rowFor('system_backup_runs', { id: 1 }), rowFor('system_backup_runs', { id: 2 })];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    requests.push({ path: parsed.pathname, order: parsed.searchParams.get('order'), range: options.headers.Range });
    if (parsed.pathname.startsWith('/rest/v1/')) {
      const table = parsed.pathname.split('/').at(-1);
      const rows = table === 'system_backup_runs' ? sourceRows : [];
      const start = Number(options.headers.Range.split('-')[0]);
      return new Response(JSON.stringify(rows.slice(start, start + 1)), { headers: { 'content-range': (rows.length ? start + '-' + start : '*') + '/' + rows.length } });
    }
    if (parsed.pathname === '/auth/v1/admin/users') return new Response('{"users":[]}');
    if (parsed.pathname === '/storage/v1/bucket') return new Response('[]');
    throw new Error('Unexpected mock request');
  };
  const result = await createBackup({ env: { ...fakeEnv, BACKUP_DIR: join(root, 'capture') }, fetchImpl });
  assert.equal(result.coverage.complete_for_current_catalog, true);
  assert.equal(result.rows, 2);
  assert.equal(result.recovery_ready, false);
  assert.ok(!requests.some(item => item.path.includes('validation_authorizations')));
  assert.equal(new Set(requests.filter(item => item.path.startsWith('/rest/v1/')).map(item => item.path)).size, 85);
  assert.deepEqual(requests.filter(item => item.path.endsWith('/system_backup_runs')).map(item => item.range), ['0-999', '1-1000']);
  for (const table of CAPTURE_TABLES) assert.equal(requests.find(item => item.path === '/rest/v1/' + table.name).order, table.primaryKey.map(key => key + '.asc').join(','));
  let calls = 0;
  await assert.rejects(createBackup({ env: { ...fakeEnv, BACKUP_DIR: join(root, 'capture') }, fetchImpl: () => { calls++; } }), { code: 'EEXIST' });
  assert.equal(calls, 0);
});
test('exporter rejects changing counts rather than silently accepting a short page', async t => {
  const root = await temporary(t);
  let calls = 0;
  await assert.rejects(createBackup({ env: { ...fakeEnv, BACKUP_DIR: join(root, 'capture') }, fetchImpl: async () => {
    calls++;
    return new Response('[{"id":"synthetic"}]', { headers: { 'content-range': '0-0/' + (calls === 1 ? 2 : 3) } });
  } }), /Tabela mudou durante a captura/);
  assert.equal(calls, 2);
});
