import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';

const API = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SECRET = String(process.env.SUPABASE_SECRET_KEY || '');
const output = resolve(process.env.BACKUP_DIR || join('backups', `harmony-${new Date().toISOString().replace(/[:.]/g, '-')}`));
const tables = [
  'profiles', 'categories', 'products', 'custom_field_definitions',
  'custom_field_values', 'requests', 'request_items', 'stock_movements',
  'audit_logs', 'push_subscriptions', 'suppliers', 'supplier_products',
  'purchase_orders', 'purchase_order_items', 'finished_product_models', 'finished_production_colors',
  'production_payment_schedules', 'production_weekly_closings', 'finished_production_receipts', 'production_orders', 'production_order_items',
  'improvement_ideas', 'improvement_idea_events',
  'app_notifications', 'app_notification_recipients',
  'internal_supply_requests', 'internal_supply_request_items',
  'internal_purchase_receipts', 'internal_purchase_receipt_items', 'internal_receipt_ai_runs',
];

if (!API || !SECRET) throw new Error('SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios.');
if (!SECRET.startsWith('sb_secret_')) throw new Error('Use uma chave secreta moderna e exclusiva para backup.');

const headers = { apikey: SECRET, Authorization: `Bearer ${SECRET}` };
const safeSegment = value => String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
const encodedPath = value => String(value).split('/').map(encodeURIComponent).join('/');
async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: HTTP ${response.status}`);
  return response;
}
async function pagedTable(table) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await request(`/rest/v1/${encodeURIComponent(table)}?select=*`, {
      headers: { Range: `${offset}-${offset + 999}`, Prefer: 'count=exact' },
    });
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
async function authUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const payload = await (await request(`/auth/v1/admin/users?page=${page}&per_page=1000`)).json();
    const batch = Array.isArray(payload) ? payload : payload.users || [];
    users.push(...batch);
    if (batch.length < 1000) return users;
  }
}
async function listObjects(bucket, prefix = '') {
  const objects = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await (await request(`/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })).json();
    objects.push(...page);
    if (page.length < 1000) return objects;
  }
}
async function backupBucket(bucket) {
  const queue = [''], files = [];
  while (queue.length) {
    const prefix = queue.shift();
    for (const item of await listObjects(bucket.id, prefix)) {
      const name = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) { queue.push(name); continue; }
      const bytes = new Uint8Array(await (await request(`/storage/v1/object/${encodeURIComponent(bucket.id)}/${encodedPath(name)}`)).arrayBuffer());
      const target = join(output, 'storage', safeSegment(bucket.id), ...name.split('/').map(safeSegment));
      await mkdir(resolve(target, '..'), { recursive: true });
      await writeFile(target, bytes);
      files.push({ name, size: bytes.byteLength, content_type: item.metadata?.mimetype || null });
    }
  }
  return { id: bucket.id, public: Boolean(bucket.public), objects: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0), files };
}
async function inventory(dir) {
  const found = [];
  async function walk(current) {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const path = join(current, item.name);
      if (item.isDirectory()) await walk(path);
      else if (item.name !== 'manifest.json') {
        const data = await readFile(path);
        found.push({ path: relative(dir, path).split(sep).join('/'), size: data.length, sha256: createHash('sha256').update(data).digest('hex') });
      }
    }
  }
  await walk(dir);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

await mkdir(join(output, 'tables'), { recursive: true });
const tableSummary = [];
for (const table of tables) {
  const rows = await pagedTable(table);
  await writeFile(join(output, 'tables', `${table}.json`), JSON.stringify(rows));
  tableSummary.push({ table, rows: rows.length });
}
const users = await authUsers();
await writeFile(join(output, 'auth-users.json'), JSON.stringify(users));
const buckets = await (await request('/storage/v1/bucket')).json();
const bucketSummary = [];
for (const bucket of buckets) bucketSummary.push(await backupBucket(bucket));

const migrationFiles = (await readdir(resolve('supabase', 'migrations'))).filter(name => name.endsWith('.sql')).sort();
const files = await inventory(output);
const manifest = {
  format: 'harmony-api-backup-v1', generated_at: new Date().toISOString(),
  project_host: new URL(API).host, app_version: 'v25',
  tables: tableSummary, auth_users: users.length, buckets: bucketSummary,
  migrations: migrationFiles, files,
};
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ backup_dir: output, tables: tableSummary.length, rows: tableSummary.reduce((sum, item) => sum + item.rows, 0), auth_users: users.length, objects: bucketSummary.reduce((sum, item) => sum + item.objects, 0), files: files.length }));
