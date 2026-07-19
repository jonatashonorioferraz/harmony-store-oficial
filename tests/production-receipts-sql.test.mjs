import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production migration is additive, proportional and role protected", async () => {
  const sql = await readFile(new URL("../supabase/migrations/009_finished_production_receipts.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /drop\s+table/i);
  assert.match(sql, /role in \('admin', 'collaborator', 'receiver'\)/i);
  assert.match(sql, /create table if not exists public\.finished_product_models/i);
  assert.match(sql, /create table if not exists public\.finished_production_receipts/i);
  assert.match(sql, /create table if not exists public\.production_weekly_closings/i);
  assert.match(sql, /extract\(isodow from week_start\) = 1/i);
  assert.match(sql, /sum\(quantity::numeric\*rate_per_100_snapshot\/100\)/i);
  assert.match(sql, /case when v_role='admin'.*else null::numeric end/is);
  assert.match(sql, /private\.is_production_receiver\(\)/i);
  assert.match(sql, /v_record\.received_by=\(select auth\.uid\(\)\)/i);
  assert.match(sql, /closing_id is not null then raise exception/i);
  assert.match(sql, /p_received_on between week_start and week_end/i);
  assert.match(sql, /admin_close_production_week/i);
  assert.match(sql, /admin_mark_production_week_paid/i);
  assert.match(sql, /admin_reopen_production_week/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});

test("user management accepts the receiver role without admin access", async () => {
  const edge = await readFile(new URL("../supabase/functions/manage-user/index.ts", import.meta.url), "utf8");
  assert.match(edge, /value === "receiver" \? "receiver" : "collaborator"/);
  assert.match(edge, /caller\.role !== "admin"/);
  assert.match(edge, /const requestedRole = safeRole\(body\.role\)/);
  assert.match(edge, /role: requestedRole/);
});

test("box conference migration preserves old receipts and pays official quantity", async () => {
  const sql = await readFile(new URL("../supabase/migrations/010_production_box_conference.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /drop\s+table/i);
  assert.match(sql, /declared_quantity = coalesce\(declared_quantity, quantity\)/i);
  assert.match(sql, /collection_id = coalesce\(collection_id, gen_random_uuid\(\)\)/i);
  assert.match(sql, /generated always as \(quantity - declared_quantity\) stored/i);
  assert.match(sql, /check \(quantity >= 0\)/i);
  assert.match(sql, /check \(declared_quantity >= 0\)/i);
  assert.match(sql, /sum\(quantity::numeric\*rate_per_100_snapshot\/100\)/i);
  assert.doesNotMatch(sql, /sum\(declared_quantity::numeric\*rate_per_100_snapshot\/100\)/i);
  assert.match(sql, /v_receipt_count=0/i);
  assert.match(sql, /security definer set search_path = ''/i);
  assert.match(sql, /create or replace function public\.create_finished_production_collection/i);
  assert.match(sql, /jsonb_to_recordset\(p_items\)/i);
  assert.match(sql, /p_items is null or jsonb_typeof\(p_items\)<>'array'/i);
  assert.doesNotMatch(sql, /v_role in \('collaborator','receiver'\).*rate_per_100_snapshot/is);
  assert.match(sql, /v_role='collaborator' and r\.worker_id=v_uid/i);
  assert.match(sql, /create or replace function public\.update_finished_production_collection/i);
  assert.match(sql, /create or replace function public\.delete_finished_production_collection/i);
  assert.match(sql, /revoke all on function public\.create_finished_production_collection.*from public, anon/is);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});

test("privacy migration hides open receipt values but preserves weekly payments", async () => {
  const sql = await readFile(new URL("../supabase/migrations/011_supplier_integration_and_production_value_privacy.sql", import.meta.url), "utf8");
  assert.match(sql, /drop function if exists public\.list_finished_production_receipts\(date,date,uuid\)/i);
  assert.match(sql, /case when v_role = 'admin' then r\.rate_per_100_snapshot else null::numeric end/i);
  assert.match(sql, /case when v_role = 'admin'[\s\S]*round\(r\.quantity::numeric \* r\.rate_per_100_snapshot \/ 100, 4\)/i);
  assert.doesNotMatch(sql, /v_role\s*=\s*'collaborator'[\s\S]{0,120}rate_per_100_snapshot/i);
  assert.doesNotMatch(sql, /production_weekly_closings/i);
  assert.match(sql, /create or replace function private\.require_supplier_product_link\(\)/i);
  assert.match(sql, /from public\.supplier_products sp/i);
  assert.match(sql, /create trigger require_supplier_product_link/i);
  assert.match(sql, /revoke all on function public\.list_finished_production_receipts.*from public, anon/is);
  assert.match(sql, /grant execute on function public\.list_finished_production_receipts.*to authenticated/is);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});
