import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("intelligence migration is additive and protects administrative data", async () => {
  const sql = await readFile(new URL("../supabase/migrations/008_consumption_intelligence.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /drop\s+table/i);
  assert.match(sql, /add column if not exists safety_stock/i);
  assert.match(sql, /create table if not exists public\.suppliers/i);
  assert.match(sql, /create table if not exists public\.purchase_orders/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /private\.is_admin\(\)/i);
  assert.match(sql, /admin_create_purchase_order/i);
  assert.match(sql, /admin_receive_purchase_order/i);
  assert.match(sql, /admin_cancel_purchase_order/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});
