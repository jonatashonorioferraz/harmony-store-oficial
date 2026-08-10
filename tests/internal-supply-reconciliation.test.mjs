import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [ui, css, migration, backup] = await Promise.all([
  readFile(new URL('../internal-supplies.js', import.meta.url), 'utf8'),
  readFile(new URL('../internal-supplies.css', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260810204500_internal_supply_receipt_reconciliation.sql', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/create-api-backup.mjs', import.meta.url), 'utf8'),
]);

test('manual receipt reconciliation is additive, restricted and audited', () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /create table if not exists public\.internal_supply_request_item_fulfillments/);
  assert.match(migration, /request_item_id uuid not null unique/);
  assert.match(migration, /receipt_item_id uuid not null unique/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /private\.is_admin\(\)/);
  assert.match(migration, /security definer/g);
  assert.match(migration, /internal_supply\.receipt_item_linked/);
  assert.match(migration, /internal_supply\.receipt_item_unlinked/);
  assert.match(migration, /grant execute on function public\.admin_link_internal_receipt_item/);
  assert.match(migration, /commit;\s*$/);
});

test('request status accepts natural or explicitly confirmed receipt matches', () => {
  assert.match(migration, /bought\.product_id=wanted\.product_id/);
  assert.match(migration, /fulfillment\.request_item_id=wanted\.id/);
  assert.match(migration, /when v_complete then 'delivered'/);
  assert.match(migration, /when v_has_confirmed_receipt then 'separating'/);
  assert.match(migration, /if v_request_status='cancelled'/);
});

test('admin can review a different commercial description without changing receipt inventory identity', () => {
  assert.match(ui, /Vincular item do cupom/);
  assert.match(ui, /Revisar vínculo/);
  assert.match(ui, /Descrição comercial diferente no cupom fiscal/);
  assert.match(ui, /admin_link_internal_receipt_item/);
  assert.match(ui, /admin_unlink_internal_receipt_item/);
  assert.match(ui, /raw_description/);
  assert.doesNotMatch(migration, /update public\.internal_purchase_receipt_items\s+set product_id/i);
});

test('future AI suggestions prefer products from the linked request', () => {
  assert.match(ui, /bestProduct\(item\.description,requested\)\|\|bestProduct/);
});

test('reconciliation is responsive and included in encrypted API backup inventory', () => {
  assert.match(css, /\.supply-match-modal/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(backup, /internal_supply_request_item_fulfillments/);
});
