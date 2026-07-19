import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(new URL('../supabase/migrations/20260719060830_phase_2b_integrity_privacy.sql', import.meta.url), 'utf8');
const enforce = await readFile(new URL('../supabase/migrations/20260719062234_phase_2b_enforce_security.sql', import.meta.url), 'utf8');
const securitySql = `${sql}\n${enforce}`;
const rollback = await readFile(new URL('../supabase/rollbacks/20260719060830_phase_2b_integrity_privacy.sql', import.meta.url), 'utf8');
const app = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
const intelligence = await readFile(new URL('../web/intelligence.js', import.meta.url), 'utf8');
const edge = await readFile(new URL('../supabase/functions/manage-user/index.ts', import.meta.url), 'utf8');
const worker = await readFile(new URL('../web/service-worker.js', import.meta.url), 'utf8');

test('audit history is append-only and browser inserts are revoked', () => {
  assert.match(sql, /block_audit_log_update_delete/i);
  assert.match(sql, /block_audit_log_truncate/i);
  assert.match(securitySql, /drop policy if exists "audit: authenticated insert self"/i);
  assert.match(securitySql, /revoke insert, update, delete, truncate on table public\.audit_logs from authenticated/i);
  assert.match(securitySql, /grant select, insert on table public\.audit_logs to service_role/i);
  assert.doesNotMatch(app, /rest\(['"]audit_logs/);
});

test('audit history uses a paginated admin-only RPC', () => {
  assert.match(sql, /create or replace function public\.admin_list_audit_logs/i);
  assert.match(sql, /if not \(select private\.is_admin\(\)\)/i);
  assert.match(sql, /limit v_limit offset v_offset/i);
  assert.match(app, /rpc\('admin_list_audit_logs'/);
  assert.match(app, /audit-pagination/);
});

test('product writes, stock adjustment and supplier preference are transactional', () => {
  assert.match(sql, /create or replace function public\.admin_save_product/i);
  assert.match(sql, /insert into public\.stock_movements/i);
  assert.match(sql, /insert into public\.supplier_products/i);
  assert.match(sql, /insert into public\.custom_field_values/i);
  assert.match(securitySql, /revoke insert, update, delete on table public\.products from authenticated/i);
  assert.match(app, /rpc\('admin_save_product'/);
  assert.match(app, /rpc\('admin_delete_product'/);
  assert.match(intelligence, /rpc\('admin_update_product_planning'/);
});

test('profile photos are private and loaded with an authenticated request', () => {
  assert.match(securitySql, /update storage\.buckets set public = false where id = 'profile-images'/i);
  assert.match(securitySql, /profile images: authenticated read/i);
  assert.match(securitySql, /drop policy if exists "product images: public read"/i);
  assert.match(app, /object\/authenticated\/profile-images/);
  assert.doesNotMatch(app, /object\/public\/profile-images/);
  assert.match(app, /URL\.createObjectURL/);
});

test('CPF uses keyed HMAC while still detecting legacy SHA-256 hashes', () => {
  assert.match(sql, /cpf_hash_version/i);
  assert.match(edge, /CPF_HMAC_SECRET/);
  assert.match(edge, /name: "HMAC", hash: "SHA-256"/);
  assert.match(edge, /candidates: \[hmac, legacy\]/);
  assert.match(edge, /ensureCpfAvailable/);
  assert.match(edge, /cpf_hash_version: "hmac-sha256-v2"/);
});

test('Edge errors are sanitized and the rollback preserves app compatibility', () => {
  assert.match(edge, /manage_user_error/);
  assert.match(edge, /Não foi possível concluir a operação\. Tente novamente\./);
  assert.doesNotMatch(edge, /return reply\(\{ error: error instanceof Error \? error\.message/);
  assert.match(rollback, /grant select, insert on table public\.audit_logs to authenticated/i);
  assert.match(rollback, /update storage\.buckets set public = true where id = 'profile-images'/i);
  assert.match(worker, /harmony-store-v25-10/);
});
