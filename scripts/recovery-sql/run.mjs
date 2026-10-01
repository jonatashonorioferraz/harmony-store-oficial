// Only versioned synthetic input and the local CI service; never a backup importer.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const FIXTURE_IMAGE = 'postgres:16.15-bookworm@sha256:efedf3595f1d6f415c08568ba171029bf54052e754cc9f030e3f2412b21f3d67';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SQL_ROOT = fileURLToPath(new URL('./', import.meta.url));
const BASE_DB = 'harmony_recovery_fixture';
export const SCENARIOS = Object.freeze([
  'normal_trigger', 'success', 'identity_rejected', 'generated_rejected',
  'orphan_rejected', 'order_rejected', 'catalog_rejected', 'check_rollback',
  'seed_rejected', 'trigger_rejected', 'evidence_rejected', 'context_rejected', 'sequence_ahead',
]);
const DATABASES = new Set([BASE_DB, ...SCENARIOS.map(name => BASE_DB + '_' + name)]);
const UUID = '11111111-1111-4111-8111-111111111111';
const SEQUENCE_CAPTURE = { protocol: '9007199254741999', event: '9007199254742999', box: '7777' };

export function fixtureConfiguration(env = process.env, args = []) {
  if (args.length) throw new Error('This runner accepts no file, URL, database or recovery arguments.');
  if (env.RECOVERY_SQL_FIXTURE !== 'synthetic-only-v1') throw new Error('Synthetic fixture confirmation required.');
  const port = String(env.RECOVERY_FIXTURE_PORT || '');
  if (!/^[1-9][0-9]{3,4}$/.test(port) || Number(port) > 65535) throw new Error('A dedicated local fixture port is required.');
  return Object.freeze({ port });
}
export function psqlInvocation(config, database, env = process.env) {
  if (!DATABASES.has(database)) throw new Error('Only declared synthetic fixture databases are permitted.');
  if (!/^[1-9][0-9]{3,4}$/.test(config.port) || Number(config.port) > 65535) throw new Error('Invalid fixture port.');
  return {
    command: 'psql',
    args: ['-X', '--no-password', '--host=127.0.0.1', '--port=' + config.port, '--username=harmony_fixture',
      '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-qAt'],
    env: {
      PATH: env.PATH || env.Path || '', ...(env.SystemRoot ? { SystemRoot: env.SystemRoot } : {}),
      LC_ALL: 'C', PGPASSWORD: 'harmony_synthetic_only', PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable',
      PGAPPNAME: 'harmony-synthetic-recovery', PGOPTIONS: '-c statement_timeout=10000 -c lock_timeout=3000 -c timezone=UTC',
    },
  };
}
export function assertFreshDatabase(observed, database) {
  assert.ok(DATABASES.has(database), 'Unapproved synthetic database.');
  assert.equal(observed.database, database, 'Unexpected destination database.');
  assert.equal(observed.user, 'harmony_fixture', 'Unexpected destination role.');
  assert.equal(Math.floor(Number(observed.version_num) / 10000), 16, 'This fixture is pinned to PostgreSQL 16.');
  assert.equal(observed.relations, 0, 'Refusing a database with existing user relations.');
  assert.deepEqual(observed.schemas, ['public'], 'Refusing pre-existing custom schemas.');
}
const guardQuery = [
  "SELECT json_build_object('database',current_database(),'user',current_user,",
  "'version_num',current_setting('server_version_num'),'version',current_setting('server_version'),",
  "'relations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace",
  "WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'),",
  "'schemas',(SELECT json_agg(nspname ORDER BY nspname) FROM pg_namespace",
  "WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%'));",
].join('\n');
function withoutSequences(observed) {
  const copy = structuredClone(observed);
  delete copy.sequences;
  return copy;
}
function requireConstraints(observed) {
  assert.equal(observed.disabled_internal_triggers, 0, 'FK triggers must remain active.');
  assert.equal(observed.foreign_keys.length, 3);
  assert.ok(observed.foreign_keys.every(fk => fk.validated && !fk.deferrable));
}
function verifyLoaded(observed) {
  assert.deepEqual(observed.parents, [{
    id: UUID, protocol: '9007199254741001', catalog_code: 'fixture-product',
    amount: '9007199254740993.1234', due_date: '2026-10-01', happened_at: '2026-10-01T03:30:00Z',
  }]);
  assert.deepEqual(observed.items, [{ parent_id: UUID, line_no: 1, quantity: 3, unit_price: '1.2345', total: '3.7035' }]);
  assert.deepEqual(observed.events, [{ id: '9007199254742001', parent_id: UUID, kind: 'original-history' }]);
  assert.deepEqual(observed.boxes, [{ box_number: '400', parent_id: UUID }]);
  assert.deepEqual(observed.settings, [{ singleton: true, policy: 'baseline-v1' }]);
  assert.deepEqual(observed.triggers, [{ name: 'record_parent', enabled: 'O' }, { name: 'require_catalog', enabled: 'O' }]);
  assert.equal(observed.source_box_visible_max, '400');
  assert.equal(observed.source_box_high_watermark, '7777');
  requireConstraints(observed);
}
export async function runFixtureSuite({ env = process.env, args = process.argv.slice(2) } = {}) {
  const started = Date.now();
  const report = {
    format: 'harmony-sql-mechanism-fixtures-v1', status: 'running', synthetic_only: true,
    recovery_ready: false, recovery_verified: false, schema_scope: 'reduced-synthetic-fixture',
    excluded: ['Harmony 85-table restore', 'Supabase Auth', 'Storage', 'RLS equivalence', 'production triggers', 'RTO/RPO'],
    commit: /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ? env.GITHUB_SHA : null,
    image: FIXTURE_IMAGE, current_scenario: 'preflight', scenarios: [],
  };
  try {
    const config = fixtureConfiguration(env, args);
    const filenames = ['schema.sql', 'prepare.sql', 'load.sql', 'finish.sql', 'observe.sql'];
    const files = Object.fromEntries(await Promise.all(filenames.map(async name => [name, await readFile(join(SQL_ROOT, name), 'utf8')])));
    report.fixture_sha256 = createHash('sha256').update(filenames.map(name => name + '\0' + files[name].replace(/\r\n/g, '\n')).join('\n')).digest('hex');
    const psql = (database, sql, expectedState = null) => {
      const invocation = psqlInvocation(config, database, env);
      const result = spawnSync(invocation.command, invocation.args, {
        input: sql, encoding: 'utf8', env: invocation.env, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true,
      });
      if (result.error) throw new Error('psql unavailable or timed out; a local PostgreSQL client is required.');
      if (expectedState) {
        assert.equal(result.status, 3, 'Expected psql SQL failure, not connection/startup failure.');
        assert.ok(new RegExp('\\b' + expectedState + '\\b').test(result.stderr), 'Expected SQLSTATE ' + expectedState + ' was not returned.');
      } else if (result.status !== 0) {
        const state = result.stderr.match(/(?:ERROR|FATAL|PANIC):\s+([0-9A-Z]{5})\b/)?.[1] || 'unknown';
        report.sqlstate = state;
        throw new Error('Synthetic SQL failed (state ' + state + ').');
      }
      return result.stdout.trim();
    };
    const inspect = database => JSON.parse(psql(database, files['observe.sql']));
    const initialize = name => {
      report.current_scenario = name;
      const database = BASE_DB + '_' + name;
      psql(BASE_DB, 'CREATE DATABASE ' + database + ' TEMPLATE template0;');
      assertFreshDatabase(JSON.parse(psql(database, guardQuery)), database);
      psql(database, files['schema.sql']);
      return database;
    };
    const fresh = JSON.parse(psql(BASE_DB, guardQuery));
    assertFreshDatabase(fresh, BASE_DB);
    report.server_version = fresh.version;
    const version = spawnSync('psql', ['--version'], { env: psqlInvocation(config, BASE_DB, env).env, encoding: 'utf8', windowsHide: true });
    report.psql_version = version.status === 0 ? version.stdout.trim() : 'unavailable';
    const restore = files['prepare.sql'] + '\n' + files['load.sql'] + '\n' + files['finish.sql'];
    const record = (name, assertion, expected, observed) => {
      report.scenarios.push({ name, status: 'passed', assertion, expected, observed });
      console.log('PASS ' + name);
    };

    const normal = initialize('normal_trigger');
    psql(normal, "INSERT INTO fixture.parents(id,catalog_code,amount,due_date,happened_at) VALUES ('11111111-1111-4111-8111-111111111111','fixture-product',1.23,'2026-10-01','2026-10-01T00:00:00Z');");
    const normalObserved = inspect(normal);
    assert.equal(normalObserved.events.length, 1);
    assert.equal(normalObserved.events[0].kind, 'normal-insert');
    requireConstraints(normalObserved);
    record('normal_trigger', 'Ordinary inserts generate a business event.', { events: 1 }, { events: normalObserved.events.length });

    const success = initialize('success');
    psql(success, restore);
    const loaded = inspect(success);
    verifyLoaded(loaded);
    assert.deepEqual(loaded.sequences, SEQUENCE_CAPTURE);
    record('success', 'Original identities, exact values, singleton/composite keys and history are preserved without trigger replay.',
      { parents: 1, items: 1, events: 1, boxes: 1, sequences: SEQUENCE_CAPTURE }, loaded);
    const beforeRepeat = inspect(success);
    report.current_scenario = 'repeat_rejected';
    psql(success, restore, 'HF003');
    assert.deepEqual(inspect(success), beforeRepeat);
    record('repeat_rejected', 'A loaded destination cannot be silently replayed.', { sqlstate: 'HF003' }, { sqlstate: 'HF003', unchanged: true });
    report.current_scenario = 'sequence_next';
    const next = JSON.parse(psql(success, "SELECT json_build_object('protocol',nextval('fixture.parents_protocol_seq')::text,'event',nextval('fixture.events_id_seq')::text,'box',nextval('fixture.box_numbers')::text);"));
    for (const name of ['protocol', 'event', 'box']) assert.equal(BigInt(next[name]), BigInt(SEQUENCE_CAPTURE[name]) + 1n);
    record('sequence_next', 'The next values exceed captured consumed numbers, including a deleted box.', SEQUENCE_CAPTURE, next);

    const negative = [
      { name: 'identity_rejected', state: '428C9', load: files['load.sql'].replace('OVERRIDING SYSTEM VALUE', '') },
      { name: 'generated_rejected', state: '428C9', load: files['load.sql'] +
        "INSERT INTO fixture.items(parent_id,line_no,quantity,unit_price,total) VALUES ('11111111-1111-4111-8111-111111111111',2,1,1,99);" },
      { name: 'orphan_rejected', state: '23503', load:
        "INSERT INTO fixture.items(parent_id,line_no,quantity,unit_price) VALUES ('99999999-9999-4999-8999-999999999999',1,1,1);" },
      { name: 'order_rejected', state: '23503', load:
        "INSERT INTO fixture.events(id,parent_id,kind) OVERRIDING SYSTEM VALUE VALUES (55,'11111111-1111-4111-8111-111111111111','original-history');" + files['load.sql'] },
      { name: 'catalog_rejected', state: '23514', load: files['load.sql'].replace("'fixture-product'", "'missing-catalog'") },
      { name: 'check_rollback', state: '23514', load: files['load.sql'] +
        "SELECT nextval('fixture.box_numbers'); SELECT setval('fixture.box_numbers',9000,true);" +
        "INSERT INTO fixture.items(parent_id,line_no,quantity,unit_price) VALUES ('11111111-1111-4111-8111-111111111111',2,-1,1);", sequenceAdvanced: true },
      { name: 'seed_rejected', state: 'HF002', setup: "UPDATE fixture.settings SET policy='unexpected-seed';" },
      { name: 'trigger_rejected', state: 'HF004', setup: 'ALTER TABLE fixture.parents DISABLE TRIGGER record_parent;' },
      { name: 'evidence_rejected', state: 'HF005', setup: "DELETE FROM captured.sequence_state WHERE target_name='fixture.box_numbers';" },
      { name: 'context_rejected', state: 'HF001', setup: "UPDATE fixture.marker SET purpose='unapproved';" },
    ];
    for (const scenario of negative) {
      const database = initialize(scenario.name);
      if (scenario.setup) psql(database, scenario.setup);
      const before = inspect(database);
      psql(database, files['prepare.sql'] + (scenario.load || files['load.sql']) + files['finish.sql'], scenario.state);
      const after = inspect(database); // A new process/connection independently verifies rollback.
      assert.deepEqual(withoutSequences(after), withoutSequences(before));
      requireConstraints(after);
      if (scenario.sequenceAdvanced) {
        assert.equal(after.sequences.box, '9000');
        assert.equal(psql(database, "SELECT nextval('fixture.box_numbers');"), '9001');
        assert.notDeepEqual(after.sequences, before.sequences);
      } else assert.deepEqual(after.sequences, before.sequences);
      record(scenario.name, scenario.sequenceAdvanced ?
        'Rows, events and trigger configuration roll back; sequence advancement survives and is not reused.' :
        'Expected SQL failure leaves target rows, events and trigger configuration unchanged.',
      { sqlstate: scenario.state }, { sqlstate: scenario.state, parents: after.parents.length, events: after.events.length, triggers: after.triggers, sequences: after.sequences });
    }
    const ahead = initialize('sequence_ahead');
    psql(ahead, "SELECT setval('fixture.box_numbers',9500,true);");
    psql(ahead, restore);
    const observedAhead = inspect(ahead);
    verifyLoaded(observedAhead);
    assert.equal(observedAhead.sequences.box, '9500');
    assert.equal(psql(ahead, "SELECT nextval('fixture.box_numbers');"), '9501');
    record('sequence_ahead', 'Restoration never rewinds a sequence already ahead of source evidence.',
      { box_last: '9500', box_next: '9501' }, { box_last: observedAhead.sequences.box, box_next: '9501' });
    report.status = 'passed';
    report.current_scenario = null;
  } catch (error) {
    report.status = 'failed';
    // Never emit subprocess stderr, DSNs, environment or arbitrary exception content.
    report.failure = error instanceof assert.AssertionError ? 'A synthetic invariant failed; review current_scenario and completed observations.' :
      ['This runner accepts no file, URL, database or recovery arguments.', 'Synthetic fixture confirmation required.',
        'A dedicated local fixture port is required.', 'psql unavailable or timed out; a local PostgreSQL client is required.'].includes(error.message) ?
        error.message : 'The synthetic fixture could not complete.';
    process.exitCode = 1;
  } finally {
    report.duration_ms = Date.now() - started;
    const destination = join(ROOT, 'outputs', 'recovery-sql-fixtures', 'report.json');
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ status: report.status, scenarios: report.scenarios.length, recovery_ready: false, report: 'outputs/recovery-sql-fixtures/report.json' }));
  return report;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await runFixtureSuite();
