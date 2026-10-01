import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fixtureConfiguration, psqlInvocation, assertFreshDatabase, FIXTURE_IMAGE, SCENARIOS } from '../scripts/recovery-sql/run.mjs';

const env = { RECOVERY_SQL_FIXTURE: 'synthetic-only-v1', RECOVERY_FIXTURE_PORT: '55432' };
const fresh = { database: 'harmony_recovery_fixture', user: 'harmony_fixture', version_num: '160015', relations: 0, schemas: ['public'] };
test('fixture requires explicit confirmation and refuses arbitrary files/URLs/destinations', () => {
  assert.throws(() => fixtureConfiguration({}), /confirmation/);
  assert.throws(() => fixtureConfiguration(env, ['backups/current']), /no file/);
  assert.throws(() => fixtureConfiguration(env, ['postgresql://production.invalid']), /no file/);
  for (const port of ['', '5432 --host=remote', '0', '70000', 'postgresql://remote:5432']) {
    assert.throws(() => fixtureConfiguration({ ...env, RECOVERY_FIXTURE_PORT: port }), /port/);
  }
  assert.deepEqual(fixtureConfiguration(env), { port: '55432' });
});
test('psql invocation fixes loopback, role and database and drops inherited connection settings/secrets', () => {
  const inherited = {
    PATH: '/usr/bin', PGHOST: 'production.invalid', PGSERVICE: 'production',
    PGPASSFILE: '/private/file', PGPASSWORD: 'DO_NOT_COPY', PGOPTIONS: 'unsafe',
    DATABASE_URL: 'postgresql://production.invalid', SUPABASE_SERVICE_ROLE_KEY: 'DO_NOT_COPY',
  };
  const call = psqlInvocation(fixtureConfiguration(env), fresh.database, inherited);
  assert.equal(call.command, 'psql');
  assert.ok(call.args.includes('--host=127.0.0.1'));
  assert.ok(call.args.includes('--username=harmony_fixture'));
  assert.ok(call.args.includes('--dbname=harmony_recovery_fixture'));
  assert.ok(call.args.includes('-X'));
  assert.ok(call.args.includes('ON_ERROR_STOP=1'));
  assert.ok(call.args.includes('VERBOSITY=sqlstate'));
  assert.equal(call.env.PGPASSWORD, 'harmony_synthetic_only');
  for (const key of ['PGHOST', 'PGSERVICE', 'PGPASSFILE', 'DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) assert.equal(call.env[key], undefined);
  assert.ok(!JSON.stringify(call).includes('DO_NOT_COPY'));
  assert.throws(() => psqlInvocation(fixtureConfiguration(env), 'postgres'), /Only declared/);
  assert.throws(() => psqlInvocation(fixtureConfiguration(env), 'harmony_recovery_fixture; DROP DATABASE postgres'), /Only declared/);
});
test('destination preflight rejects wrong role, database, version and any pre-existing objects', () => {
  assert.doesNotThrow(() => assertFreshDatabase(fresh, fresh.database));
  for (const mutation of [{ user: 'postgres' }, { database: 'postgres' }, { version_num: '170001' }, { relations: 1 }, { schemas: ['public', 'auth'] }]) {
    assert.throws(() => assertFreshDatabase({ ...fresh, ...mutation }, fresh.database));
  }
  for (const scenario of SCENARIOS) {
    const database = fresh.database + '_' + scenario;
    assert.doesNotThrow(() => assertFreshDatabase({ ...fresh, database }, database));
  }
});
test('workflow is an ordinary PR job with pinned service/actions and no production environment or secrets', async () => {
  const text = await readFile(new URL('../.github/workflows/recovery-sql-fixtures.yml', import.meta.url), 'utf8');
  assert.match(text, /pull_request:/);
  assert.doesNotMatch(text, /pull_request_target|secrets\.|environment:\s*recovery|SUPABASE_|BACKUP_DIR|execute-api-recovery/);
  assert.ok(text.includes(FIXTURE_IMAGE));
  assert.match(text, /127\.0\.0\.1:55432:5432/);
  assert.match(text, /persist-credentials: false/);
  for (const match of text.matchAll(/uses: ([^\s]+)/g)) assert.match(match[1], /@[a-f0-9]{40}$/);
  assert.match(text, /path: outputs\/recovery-sql-fixtures\/report\.json/);
});
test('restore recipe keeps FK enforcement and only pauses the reviewed replay trigger', async () => {
  const prepare = await readFile(new URL('../scripts/recovery-sql/prepare.sql', import.meta.url), 'utf8');
  const finish = await readFile(new URL('../scripts/recovery-sql/finish.sql', import.meta.url), 'utf8');
  const load = await readFile(new URL('../scripts/recovery-sql/load.sql', import.meta.url), 'utf8');
  assert.match(prepare, /assert_empty_destination/);
  assert.match(prepare, /DISABLE TRIGGER record_parent/);
  assert.match(finish, /ENABLE TRIGGER record_parent/);
  assert.doesNotMatch(prepare + finish, /session_replication_role|DISABLE TRIGGER (ALL|USER)|DROP (CONSTRAINT|TRIGGER)/i);
  assert.match(load, /OVERRIDING SYSTEM VALUE/);
  assert.match(load, /9007199254740993\.1234/);
  assert.doesNotMatch(load, /ON CONFLICT|INSERT INTO fixture\.items\([^)]*total/i);
});
