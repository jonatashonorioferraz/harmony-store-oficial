import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [ui, css, migration, edge] = await Promise.all([
  readFile(new URL('../internal-supplies.js', import.meta.url), 'utf8'),
  readFile(new URL('../internal-supplies.css', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260719230000_internal_supplies_and_receipt_ai.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/analyze-internal-receipt/index.ts', import.meta.url), 'utf8'),
]);

test('internal supply module is restricted to admin and receiver profiles', () => {
  assert.match(ui, /\['admin','receiver'\]\.includes\(S\.profile\?\.role\)/);
  assert.match(migration, /role in \('admin','receiver'\)/);
  assert.match(edge, /caller\.role !== "admin"/);
});

test('requests collect item identity without asking the receiver for quantities', () => {
  assert.match(ui, /map\(item=>\(\{product_id:item\.id\}\)\)/);
  assert.match(ui, /Você só precisa informar quais itens estão faltando/);
  assert.doesNotMatch(ui, /Quantidade solicitada/);
  assert.match(migration, /values\(v_id,v_item\.product_id,1\)/);
});

test('receipt workflow supports linked and direct purchases with mandatory review', () => {
  assert.match(ui, /Registrar compra direta/);
  assert.match(ui, /Anexar cupom da compra/);
  assert.match(ui, /Confirmar compra e registrar os dados/);
  assert.match(ui, /Criar novo produto automaticamente/);
  assert.match(migration, /purchase_origin in \('requested','direct'\)/);
  assert.match(migration, /case when v_request is null then 'direct' else 'requested' end/);
});

test('price report tracks increases and reductions without exposing values to receiver', () => {
  assert.match(ui, /previousPrice/);
  assert.match(ui, /currentPrice/);
  assert.match(ui, /variationPct/);
  assert.match(ui, /Menor \/ maior/);
  assert.match(ui, /if\(!isAdmin\(\)\)return/);
  assert.match(css, /price-variation\.up/);
  assert.match(css, /price-variation\.down/);
});

test('receipt AI keeps the secret server-side and applies authentication, rate and file checks', () => {
  assert.match(edge, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.doesNotMatch(ui, /OPENAI_API_KEY/);
  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /count \|\| 0\) >= 20/);
  assert.match(edge, /file\.size > 5242880/);
  assert.match(edge, /internal_receipt_ai_runs/);
});

test('database change is additive, transactional, audited and uses private receipt storage', () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /usage_scope in \('production','ecommerce','internal'\)/);
  assert.match(migration, /security definer/g);
  assert.match(migration, /public\.audit_logs/);
  assert.match(migration, /values\('internal-receipts','internal-receipts',false/);
  assert.match(migration, /enable row level security/g);
});
