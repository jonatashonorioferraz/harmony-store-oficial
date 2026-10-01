import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTURE_TABLES, EXCLUDED_TABLES, TABLE_CATALOG, CATALOG_VERSION, MIGRATIONS_SHA256 } from './backup-catalog.mjs';
import { assertCatalogMatchesMigrations, inspectBackup, requireCurrentCoverage, sha256, sourceMigrations, storageBackupPath } from './backup-contract.mjs';

const encodedPath = value => String(value).split('/').map(encodeURIComponent).join('/');
export async function createBackup({ env = process.env, fetchImpl = fetch } = {}) {
  const api = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const secret = String(env.SUPABASE_SECRET_KEY || '');
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(api) || !secret.startsWith('sb_secret_')) {
    throw new Error('Use SUPABASE_URL e uma chave secreta moderna exclusiva para backup.');
  }
  // A new migration must update the audited contract before any remote reads.
  const migrations = await sourceMigrations();
  assertCatalogMatchesMigrations(migrations);
  if (CAPTURE_TABLES.some(table => !table.serviceSelect || !table.primaryKey.length)) {
    throw new Error('Contrato sem SELECT ou chave primária: revise os metadados.');
  }
  const output = resolve(env.BACKUP_DIR || join('backups', 'harmony-' + new Date().toISOString().replace(/[:.]/g, '-')));
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output); // Never mix a new capture with files from a previous run.
  await mkdir(join(output, 'tables'));
  await mkdir(join(output, 'migrations'));
  const startedAt = new Date().toISOString();
  const headers = { apikey: secret, Authorization: 'Bearer ' + secret };
  async function request(path, options = {}) {
    const response = await fetchImpl(api + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    // Paths may contain personal Storage names; only status is logged.
    if (!response.ok) throw new Error('Falha na leitura de backup: HTTP ' + response.status);
    return response;
  }
  async function json(response) {
    // JSON numbers cannot preserve larger integer identities without loss.
    return JSON.parse(await response.text(), (_, value) => {
      if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
        throw new Error('Inteiro fora da precisão JSON: captura SQL necessária.');
      }
      return value;
    });
  }
  async function pagedTable(table) {
    const rows = [];
    let total;
    for (;;) {
      const order = table.primaryKey.map(column => column + '.asc').join(',');
      const response = await request('/rest/v1/' + table.name + '?select=*&order=' + encodeURIComponent(order), {
        headers: { Range: rows.length + '-' + (rows.length + 999), 'Range-Unit': 'items', Prefer: 'count=exact' },
      });
      const match = response.headers.get('content-range')?.match(/\/(\d+)$/);
      if (!match) throw new Error('Contagem exata indisponível: ' + table.name);
      const count = Number(match[1]);
      if (!Number.isSafeInteger(count) || (total !== undefined && total !== count)) throw new Error('Tabela mudou durante a captura: ' + table.name);
      total = count;
      const page = await json(response);
      if (!Array.isArray(page) || (!page.length && rows.length < total) || rows.length + page.length > total) {
        throw new Error('Paginação incompleta: ' + table.name);
      }
      rows.push(...page);
      if (rows.length === total) return rows;
    }
  }
  async function authUsers() {
    const users = [];
    for (let page = 1; ; page++) {
      const payload = await json(await request('/auth/v1/admin/users?page=' + page + '&per_page=1000'));
      const batch = Array.isArray(payload) ? payload : payload.users;
      if (!Array.isArray(batch)) throw new Error('Inventário Auth inválido.');
      users.push(...batch);
      if (batch.length < 1000) return users;
    }
  }
  async function listObjects(bucket, prefix) {
    const objects = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await json(await request('/storage/v1/object/list/' + encodeURIComponent(bucket), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
      }));
      if (!Array.isArray(page)) throw new Error('Inventário Storage inválido.');
      objects.push(...page);
      if (page.length < 1000) return objects;
    }
  }
  async function backupBucket(bucket) {
    const queue = [''], prefixes = new Set(), paths = new Set(), files = [];
    while (queue.length) {
      const prefix = queue.shift();
      if (prefixes.has(prefix)) throw new Error('Pasta Storage duplicada.');
      prefixes.add(prefix);
      for (const item of await listObjects(bucket.id, prefix)) {
        if (typeof item.name !== 'string' || !item.name) throw new Error('Nome Storage inválido.');
        const name = prefix ? prefix + '/' + item.name : item.name;
        if (!item.id) { queue.push(name); continue; }
        const backupPath = storageBackupPath(bucket.id, name);
        if (paths.has(backupPath)) throw new Error('Objeto Storage duplicado ou colisão.');
        paths.add(backupPath);
        const bytes = new Uint8Array(await (await request('/storage/v1/object/' + encodeURIComponent(bucket.id) + '/' + encodedPath(name))).arrayBuffer());
        const target = join(output, ...backupPath.split('/'));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes, { flag: 'wx' });
        files.push({ name, backup_path: backupPath, size: bytes.byteLength, content_type: item.metadata?.mimetype || null });
      }
    }
    return { id: bucket.id, public: Boolean(bucket.public), objects: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0), files };
  }
  const tableSummary = [];
  for (const table of CAPTURE_TABLES) {
    const tableStartedAt = new Date().toISOString();
    const rows = await pagedTable(table);
    await writeFile(join(output, 'tables', table.name + '.json'), JSON.stringify(rows));
    tableSummary.push({ table: table.name, rows: rows.length, started_at: tableStartedAt, finished_at: new Date().toISOString() });
  }
  const users = await authUsers();
  await writeFile(join(output, 'auth-users.json'), JSON.stringify(users));
  const buckets = await json(await request('/storage/v1/bucket'));
  if (!Array.isArray(buckets)) throw new Error('Inventário de buckets inválido.');
  const bucketSummary = [];
  for (const bucket of buckets) bucketSummary.push(await backupBucket(bucket));
  for (const migration of migrations) await writeFile(join(output, 'migrations', migration.name), migration.content);
  const files = [];
  async function inventory(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) await inventory(path);
      else {
        const data = await readFile(path);
        files.push({ path: relative(output, path).split(sep).join('/'), size: data.length, sha256: sha256(data) });
      }
    }
  }
  await inventory(output);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const manifest = {
    format: 'harmony-api-backup-v2', generated_at: new Date().toISOString(),
    project_host: new URL(api).host, app_version: pkg.version,
    capture_window: { started_at: startedAt, finished_at: new Date().toISOString() },
    consistency: { mode: 'non-transactional', transactionally_consistent: false },
    coverage: {
      catalog_version: CATALOG_VERSION, migrations_sha256: MIGRATIONS_SHA256,
      catalog_tables: TABLE_CATALOG.length,
      excluded_tables: EXCLUDED_TABLES.map(table => ({ table: table.name, reason: table.retention })),
      retention: TABLE_CATALOG.filter(table => table.classification !== 'business').map(table => ({ table: table.name, policy: table.retention })),
    },
    tables: tableSummary, auth_users: users.length, buckets: bucketSummary,
    migrations: migrations.map(file => file.name), files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const inspection = await inspectBackup(output);
  requireCurrentCoverage(inspection);
  return { backup_dir: output, ...inspection.report };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  createBackup().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
