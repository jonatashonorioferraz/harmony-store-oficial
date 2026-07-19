import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const quality = await readFile(new URL('../.github/workflows/quality.yml', import.meta.url), 'utf8');
const backup = await readFile(new URL('../.github/workflows/backup.yml', import.meta.url), 'utf8');
const release = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const createBackup = await readFile(new URL('../scripts/create-api-backup.mjs', import.meta.url), 'utf8');
const verifyBackup = await readFile(new URL('../scripts/verify-api-backup.mjs', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260719071000_system_health_and_backup_status.sql', import.meta.url), 'utf8');
const healthEdge = await readFile(new URL('../supabase/functions/system-health/index.ts', import.meta.url), 'utf8');
const help = await readFile(new URL('../help-center.js', import.meta.url), 'utf8');
const health = await readFile(new URL('../system-health.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const performanceMigration = await readFile(new URL('../supabase/migrations/20260719073500_performance_policy_cleanup.sql', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const monitorWorkflow = await readFile(new URL('../.github/workflows/monitor.yml', import.meta.url), 'utf8');
const monitorScript = await readFile(new URL('../scripts/monitor-production.mjs', import.meta.url), 'utf8');

test('CI validates the complete build, test suite and synchronized official files', () => {
  assert.match(quality, /actions\/checkout@v7/);
  assert.match(quality, /actions\/setup-node@v7/);
  assert.match(quality, /npm ci --ignore-scripts/);
  assert.match(quality, /npm audit --omit=dev --audit-level=high/);
  assert.match(quality, /npm test/);
  assert.match(quality, /cmp app\.js web\/app\.js/);
  assert.match(quality, /Bloquear segredos conhecidos/);
});

test('daily backup exports data, Auth and Storage before encryption', () => {
  assert.match(backup, /cron: '17 3 \* \* \*'/);
  assert.match(backup, /actions\/checkout@v7/);
  assert.match(backup, /actions\/setup-node@v7/);
  assert.match(backup, /actions\/upload-artifact@v7/);
  assert.match(backup, /aes-256-cbc/);
  assert.match(backup, /openssl enc -d -aes-256-cbc/);
  assert.match(backup, /restore-api-backup\.mjs restore-drill\/current/);
  assert.ok(backup.indexOf('restore-api-backup.mjs restore-drill/current') < backup.indexOf('actions/upload-artifact@v7'));
  assert.match(backup, /retention-days: 30/);
  assert.match(backup, /record-backup-result\.mjs/);
  assert.match(backup, /if: failure\(\)/);
  assert.match(createBackup, /auth\/v1\/admin\/users/);
  assert.match(createBackup, /storage\/v1\/object\/list/);
  assert.match(verifyBackup, /Falha de integridade/);
});

test('version tags generate a validated automatic changelog release', () => {
  assert.match(release, /actions\/checkout@v7/);
  assert.match(release, /actions\/setup-node@v7/);
  assert.match(release, /tags: \['v\*'\]/);
  assert.match(release, /--generate-notes/);
  assert.match(release, /grep -F "\[\$VERSION\]" CHANGELOG\.md/);
});

test('health data is private, summarized and role protected', () => {
  assert.match(migration, /alter table public\.system_backup_runs enable row level security/i);
  assert.match(migration, /revoke all privileges on table public\.system_backup_runs, public\.system_events from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.service_record_backup_result[\s\S]*to service_role/i);
  assert.match(healthEdge, /caller\.role !== "admin"/);
  assert.match(healthEdge, /Aguardando primeiro backup/);
  assert.doesNotMatch(healthEdge, /error instanceof Error \? error\.message/);
  assert.match(health, /S\?\.profile\?\.role!=='admin'/);
});

test('external monitor checks the complete service chain and records sanitized status', () => {
  assert.match(monitorWorkflow, /cron: '27 \*\/6 \* \* \*'/);
  assert.match(monitorWorkflow, /SUPABASE_BACKUP_SECRET_KEY/);
  assert.match(monitorScript, /rest\/v1\/profiles\?select=id&limit=1/);
  assert.match(monitorScript, /auth\/v1\/health/);
  assert.match(monitorScript, /storage\/v1\/bucket/);
  assert.match(monitorScript, /availability_failed/);
  assert.doesNotMatch(monitorScript, /console\.log\([^\n]*(secretKey|SUPABASE_SECRET_KEY)/);
  assert.match(healthEdge, /external_monitor/);
  assert.match(healthEdge, /monitorAge > 12/);
});

test('help center offers contextual, module and technical documentation', () => {
  assert.match(help, /AJUDA RÁPIDA/);
  assert.match(help, /MANUAL HARMONY/);
  assert.match(help, /DOCUMENTAÇÃO TÉCNICA/);
  assert.match(help, /Histórico de versões/);
  assert.match(index, /help-center\.js/);
  assert.match(index, /system-health\.js/);
});

test('performance cleanup covers foreign keys without broadening RLS', () => {
  assert.match(performanceMigration, /system_events_actor_idx/);
  assert.match(performanceMigration, /request_items_product_idx/);
  assert.match(performanceMigration, /field definition: admin insert/);
  assert.match(performanceMigration, /field definition: admin update/);
  assert.match(performanceMigration, /field definition: admin delete/);
  assert.match(performanceMigration, /drop policy if exists "movement: admin read"/i);
  assert.doesNotMatch(performanceMigration, /to\s+(public|anon)\b/i);
});

test('official shell supports keyboard focus and screen-reader announcements', () => {
  assert.match(index, /class="skip-link"/);
  assert.match(index, /id="toast" role="status" aria-live="polite"/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
});
