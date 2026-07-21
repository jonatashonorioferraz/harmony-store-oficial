import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] || process.env.BACKUP_DIR || '');
const API = String(process.env.RECOVERY_SUPABASE_URL || '').replace(/\/$/, '');
const SECRET = String(process.env.RECOVERY_SUPABASE_SECRET_KEY || '');
const PROJECT_REF = String(process.env.RECOVERY_PROJECT_REF || '');
const CONFIRM = String(process.env.RECOVERY_CONFIRM || '');
const PRODUCTION_REF = 'tyzfznwvjzmudxtcbbaf';
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
const generatedColumns = {
  requests: ['protocol'],
  audit_logs: ['id'],
  purchase_orders: ['protocol'],
  production_weekly_closings: ['protocol', 'week_end'],
  finished_production_receipts: ['protocol', 'quantity_difference'],
  production_orders: ['protocol'],
  improvement_ideas: ['protocol'],
  internal_supply_requests: ['protocol'],
  internal_purchase_receipts: ['protocol'],
  internal_receipt_ai_runs: ['id'],
};

if (!process.argv[2] && !process.env.BACKUP_DIR) throw new Error('Informe a pasta descriptografada do backup.');
if (!API || !SECRET || !PROJECT_REF) throw new Error('Configurações do projeto de recuperação são obrigatórias.');
if (!SECRET.startsWith('sb_secret_')) throw new Error('Use uma chave secreta moderna e exclusiva do projeto de recuperação.');
if (PROJECT_REF === PRODUCTION_REF || API.includes(PRODUCTION_REF)) throw new Error('BLOQUEADO: restauração nunca pode usar o projeto de produção.');
if (!new URL(API).hostname.startsWith(`${PROJECT_REF}.`)) throw new Error('URL e referência do projeto de recuperação não correspondem.');
if (CONFIRM !== 'RESTORE_ISOLATED_HARMONY') throw new Error('Confirmação explícita da restauração isolada ausente.');

const headers = { apikey: SECRET, Authorization: `Bearer ${SECRET}` };
const safeSegment = value => String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
const encodedPath = value => String(value).split('/').map(encodeURIComponent).join('/');
async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method || 'GET'} ${path}: HTTP ${response.status} (${body.slice(0, 160)})`);
  }
  return response;
}
async function countTable(table) {
  const response = await request(`/rest/v1/${encodeURIComponent(table)}?select=id&limit=1`, {
    method: 'HEAD', headers: { Prefer: 'count=exact' },
  });
  return Number((response.headers.get('content-range') || '*/0').split('/')[1] || 0);
}
async function authUsers() {
  const payload = await (await request('/auth/v1/admin/users?page=1&per_page=1000')).json();
  return Array.isArray(payload) ? payload : payload.users || [];
}
function remap(value, ids) {
  if (typeof value === 'string') return ids.get(value) || value;
  if (Array.isArray(value)) return value.map(item => remap(item, ids));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item, ids)]));
  return value;
}
function omitGenerated(table, row) {
  const copy = { ...row };
  for (const column of generatedColumns[table] || []) delete copy[column];
  return copy;
}
async function insertRows(table, rows) {
  for (let index = 0; index < rows.length; index += 250) {
    await request(`/rest/v1/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows.slice(index, index + 250)),
    });
  }
}

const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
if (manifest.format !== 'harmony-api-backup-v1') throw new Error('Formato de backup incompatível.');
if (manifest.project_host.startsWith(PROJECT_REF)) throw new Error('O backup deve vir do projeto oficial, não do destino de recuperação.');

const existingUsers = await authUsers();
const existingCounts = Object.fromEntries(await Promise.all(tables.map(async table => [table, await countTable(table)])));
const nonSeedRows = Object.entries(existingCounts).filter(([table, count]) => count > (table === 'categories' ? 5 : 0));
if (existingUsers.length || nonSeedRows.length) throw new Error('O destino isolado não está vazio; restauração interrompida sem alterar dados.');
if (existingCounts.categories) {
  await request('/rest/v1/categories?id=not.is.null', { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

const sourceUsers = JSON.parse(await readFile(join(dir, 'auth-users.json'), 'utf8'));
const sourceProfiles = JSON.parse(await readFile(join(dir, 'tables', 'profiles.json'), 'utf8'));
const profilesById = new Map(sourceProfiles.map(profile => [profile.id, profile]));
const idMap = new Map();
for (const source of sourceUsers) {
  const profile = profilesById.get(source.id) || {};
  const payload = {
    password: randomBytes(30).toString('base64url'),
    email_confirm: true,
    user_metadata: { ...(source.user_metadata || {}), username: profile.username, full_name: profile.full_name },
    app_metadata: source.app_metadata || {},
  };
  if (source.email) payload.email = source.email;
  if (source.phone) payload.phone = source.phone;
  const created = await (await request('/auth/v1/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })).json();
  if (!created.id) throw new Error('Usuário de recuperação não foi criado corretamente.');
  idMap.set(source.id, created.id);
}

for (const table of tables) {
  const sourceRows = JSON.parse(await readFile(join(dir, 'tables', `${table}.json`), 'utf8'));
  const rows = sourceRows.map(row => omitGenerated(table, remap(row, idMap)));
  if (table === 'profiles') {
    for (const row of rows) {
      await request('/rest/v1/profiles?on_conflict=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row),
      });
    }
  } else if (rows.length) await insertRows(table, rows);
}

for (const bucket of manifest.buckets || []) {
  const current = await request(`/storage/v1/bucket/${encodeURIComponent(bucket.id)}`).catch(() => null);
  if (!current) {
    await request('/storage/v1/bucket', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bucket.id, name: bucket.id, public: bucket.public }),
    });
  }
  for (const file of bucket.files || []) {
    const local = join(dir, 'storage', safeSegment(bucket.id), ...file.name.split('/').map(safeSegment));
    const bytes = await readFile(local);
    await request(`/storage/v1/object/${encodeURIComponent(bucket.id)}/${encodedPath(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': file.content_type || 'application/octet-stream', 'x-upsert': 'true' },
      body: bytes,
    });
  }
}

const restoredCounts = Object.fromEntries(await Promise.all(tables.map(async table => [table, await countTable(table)])));
for (const expected of manifest.tables) {
  if (restoredCounts[expected.table] !== expected.rows) throw new Error(`Contagem divergente em ${expected.table}.`);
}
const restoredUsers = await authUsers();
if (restoredUsers.length !== manifest.auth_users) throw new Error('Contagem divergente de usuários restaurados.');

console.log(JSON.stringify({
  restored: true,
  target: 'isolated-recovery-project',
  tables: manifest.tables.length,
  rows: manifest.tables.reduce((sum, item) => sum + item.rows, 0),
  auth_users: restoredUsers.length,
  objects: (manifest.buckets || []).reduce((sum, bucket) => sum + bucket.objects, 0),
}));
