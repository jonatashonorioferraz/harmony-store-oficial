import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260719053406_explicit_data_api_grants.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');
const rollback = await readFile(
  new URL('../supabase/rollbacks/20260719053406_explicit_data_api_grants.sql', import.meta.url),
  'utf8',
);
const phase2b = await readFile(
  new URL('../supabase/migrations/20260719060830_phase_2b_integrity_privacy.sql', import.meta.url),
  'utf8',
);
const phase2bEnforce = await readFile(
  new URL('../supabase/migrations/20260719062234_phase_2b_enforce_security.sql', import.meta.url),
  'utf8',
);
const systemHealth = await readFile(
  new URL('../supabase/migrations/20260719071000_system_health_and_backup_status.sql', import.meta.url),
  'utf8',
);
const adminNotifications = await readFile(
  new URL('../supabase/migrations/20260719193000_admin_notifications.sql', import.meta.url),
  'utf8',
);
const productVisibility = await readFile(
  new URL('../supabase/migrations/20260719203000_product_collaborator_visibility.sql', import.meta.url),
  'utf8',
);
const internalSupplies = await readFile(
  new URL('../supabase/migrations/20260719230000_internal_supplies_and_receipt_ai.sql', import.meta.url),
  'utf8',
);
const webDir = new URL('../web/', import.meta.url);
const webFiles = (await readdir(webDir)).filter(file => file.endsWith('.js'));
const webSources = await Promise.all(webFiles.map(file => readFile(new URL(file, webDir), 'utf8')));
const webSource = webSources.join('\n');

test('anonymous Data API access is closed before explicit grants', () => {
  assert.match(sql, /revoke usage on schema public from anon/i);
  assert.match(sql, /revoke all privileges on all tables in schema public from public, anon, authenticated/i);
  assert.match(sql, /revoke all privileges on all sequences in schema public from public, anon, authenticated/i);
  assert.match(sql, /revoke execute on all functions in schema public from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant\s+[^;]+\s+to\s+anon\b/i);
});

test('future postgres objects are opt-in for the Data API', () => {
  assert.match(sql, /alter default privileges for role postgres in schema public[\s\S]*revoke all privileges on tables from public, anon, authenticated, service_role/i);
  assert.match(sql, /alter default privileges for role postgres in schema public[\s\S]*revoke all privileges on sequences from public, anon, authenticated, service_role/i);
  assert.match(sql, /alter default privileges for role postgres in schema public[\s\S]*revoke execute on functions from public, anon, authenticated, service_role/i);
});

test('every statically named RPC used by the web app remains granted', () => {
  const rpcNames = new Set();
  for (const match of webSource.matchAll(/\brpc\('([^']+)'/g)) rpcNames.add(match[1]);
  for (const match of webSource.matchAll(/\bchangePurchase\('([^']+)'/g)) rpcNames.add(match[1]);

  assert.ok(rpcNames.size >= 20, `RPC inventory unexpectedly small: ${rpcNames.size}`);
  const effectiveGrants = `${sql}\n${phase2b}\n${phase2bEnforce}\n${systemHealth}\n${adminNotifications}\n${productVisibility}\n${internalSupplies}`;
  for (const rpcName of rpcNames) {
    assert.match(
      effectiveGrants,
      new RegExp(`grant execute on function public\\.${rpcName}\\(`, 'i'),
      `Missing authenticated grant for web RPC ${rpcName}`,
    );
  }
});

test('authenticated direct table privileges match current UI operations', () => {
  assert.match(sql, /grant select on table public\.profiles to authenticated/i);
  assert.match(sql, /grant insert, update, delete on table public\.products to authenticated/i);
  assert.match(sql, /grant select, insert on table public\.audit_logs to authenticated/i);
  assert.match(phase2bEnforce, /revoke insert, update, delete on table public\.products from authenticated/i);
  assert.match(phase2bEnforce, /revoke insert, update, delete, truncate on table public\.audit_logs from authenticated/i);
  assert.match(phase2b, /grant execute on function public\.admin_save_product/i);
  assert.match(phase2b, /grant execute on function public\.admin_list_audit_logs/i);
  assert.match(sql, /grant select on table public\.purchase_orders to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]+on table public\.push_subscriptions to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]+on table public\.production_weekly_closings to authenticated/i);
});

test('migration preserves trusted backend access and is transactional', () => {
  assert.match(sql, /grant all privileges on all tables in schema public to service_role/i);
  assert.match(sql, /grant execute on all functions in schema public to service_role/i);
  assert.match(sql, /^begin;/mi);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
  assert.match(sql, /commit;\s*$/i);
});

test('emergency rollback restores authenticated access without reopening anon', () => {
  assert.match(rollback, /grant all privileges on all tables in schema public to authenticated, service_role/i);
  assert.match(rollback, /revoke execute on function public\.create_profile_for_new_auth_user\(\) from authenticated/i);
  assert.doesNotMatch(rollback, /grant\s+[^;]+\s+to\s+anon\b/i);
  assert.match(rollback, /^begin;/mi);
  assert.match(rollback, /commit;\s*$/i);
});
