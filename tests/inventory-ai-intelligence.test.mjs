import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const [sql, edge, ui, css, inventory, index, worker, help, manual, technical, audit, backup, recovery, pkg] = await Promise.all([
  readFile(new URL('supabase/migrations/20260811230510_inventory_ai_intelligence.sql', root), 'utf8'),
  readFile(new URL('supabase/functions/analyze-inventory-intelligence/index.ts', root), 'utf8'),
  readFile(new URL('intelligence-ai.js', root), 'utf8'),
  readFile(new URL('intelligence-ai.css', root), 'utf8'),
  readFile(new URL('production-inventory.js', root), 'utf8'),
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('service-worker.js', root), 'utf8'),
  readFile(new URL('help-center.js', root), 'utf8'),
  readFile(new URL('docs/manual/MANUAL-DO-APLICATIVO.md', root), 'utf8'),
  readFile(new URL('docs/technical/INTELIGENCIA-IA-INVENTARIO-V25.73.md', root), 'utf8'),
  readFile(new URL('docs/audit/AUDITORIA-INTELIGENCIA-IA-V25.73.md', root), 'utf8'),
  readFile(new URL('scripts/create-api-backup.mjs', root), 'utf8'),
  readFile(new URL('scripts/execute-api-recovery.mjs', root), 'utf8'),
  readFile(new URL('package.json', root), 'utf8'),
]);

test('AI database layer is additive, administrative and protected by RLS', () => {
  assert.doesNotMatch(sql, /drop\s+table|truncate\s+table|delete\s+from\s+public\.(products|requests|production_inventory)/i);
  for (const table of ['inventory_ai_settings', 'inventory_ai_analyses', 'inventory_ai_insights']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /using \(\(select private\.is_admin\(\)\)\)/);
  assert.match(sql, /private\.is_primary_admin\(\)/);
  assert.match(sql, /grant execute on function public\.service_inventory_ai_snapshot\(integer\) to service_role/);
  assert.match(sql, /revoke all on function public\.service_inventory_ai_snapshot\(integer\) from public,anon,authenticated/);
  assert.match(sql, /revoke all on function public\.service_finalize_inventory_ai_analysis[\s\S]*from public,anon,authenticated/);
});

test('snapshot calculates inventory facts in PostgreSQL without changing operational records', () => {
  assert.match(sql, /create or replace function public\.service_inventory_ai_snapshot/);
  assert.match(sql, /label_status='applied' and e\.current_quantity>0 and e\.transferred_at is null/);
  assert.match(sql, /boxes_over_45_days/);
  assert.match(sql, /estimated_coverage_days/);
  assert.match(sql, /production_order_items/);
  const snapshot = sql.slice(sql.indexOf('create or replace function public.service_inventory_ai_snapshot'), sql.indexOf('create or replace function public.service_finalize_inventory_ai_analysis'));
  assert.doesNotMatch(snapshot, /\b(update|insert into|delete from)\s+public\./i);
  assert.doesNotMatch(snapshot, /production_weekly_closings|rate_per_100|total_amount/i);
});

test('Edge Function authenticates admins, anonymizes people and keeps secrets on the server', () => {
  assert.match(edge, /admin\.auth\.getUser\(bearer\)/);
  assert.match(edge, /caller\.role !== "admin"/);
  assert.match(edge, /OPENAI_API_KEY/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /worker_name: `Colaboradora \$\{index \+ 1\}`/);
  assert.match(edge, /store: false/);
  assert.match(edge, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(edge, /gpt-5\.6-terra/);
  assert.match(edge, /type: "json_schema"/);
  assert.match(edge, /strict: true/);
  assert.doesNotMatch(ui, /OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
});

test('AI cost and concurrency controls prevent uncontrolled use', () => {
  assert.match(sql, /monthly_budget_usd numeric\(10,4\) not null default 5/);
  assert.match(sql, /scheduled_daily_limit integer not null default 2/);
  assert.match(sql, /manual_cooldown_minutes integer not null default 10/);
  assert.match(edge, /BUDGET_REACHED/);
  assert.match(edge, /ANALYSIS_IN_PROGRESS/);
  assert.match(edge, /reason: "daily_limit"/);
  assert.match(edge, /snapshot_fingerprint/);
  assert.match(edge, /6 \* 3600000/);
  assert.match(edge, /input_tokens/);
  assert.match(edge, /output_tokens/);
  assert.match(technical, /agendamento externo ainda desativado/i);
});

test('AI is advisory, evidence-based and never performs inventory or payment mutations', () => {
  assert.match(edge, /Toda afirmação quantitativa deve aparecer nas evidências/);
  assert.match(edge, /jamais afirme que alterou estoque, ordens ou pagamentos/);
  assert.match(ui, /Por que a IA sugeriu isso\?/);
  assert.match(ui, /Marcar como conferido/);
  assert.match(ui, /admin_mark_inventory_ai_insight/);
  assert.doesNotMatch(edge, /transfer_production_inventory|adjust_production_inventory|production_weekly_closings/);
  assert.doesNotMatch(ui, /Pergunte aos dados|perguntas programadas|campo de perguntas/i);
});

test('AI is admin-only, integrated into the main dashboard and opens inventory tabs', () => {
  assert.match(ui, /const isAdmin=\(\)=>S\?\.profile\?\.role==='admin'/);
  assert.match(ui, /S\.view!=='intelligence'/);
  assert.match(ui, /#inventoryAiDashboard/);
  assert.doesNotMatch(ui, /tabs\.insertBefore\(button,tabs\.firstChild\)/);
  assert.match(ui, /O restante da aba Inteligência continua funcionando normalmente/);
  assert.match(ui, /window\.HarmonyProductionInventory\?\.open/);
  assert.match(inventory, /window\.HarmonyProductionInventory=Object\.freeze/);
  assert.match(inventory, /\['balance','boxes','movements','workers'\]\.includes\(tab\)/);
});

test('AI dashboard observer renders once and does not create an extra tab', () => {
  assert.match(ui, /dashboard\.querySelector\('\.inventory-ai-page,\.inventory-ai-unavailable'\)\)return/);
  assert.doesNotMatch(ui, /data-inventory-ai-tab|inventoryAiTab/);
  assert.match(ui, /inventory-ai-live-metrics/);
  assert.match(ui, /inventory-ai-data-grid/);
});

test('Intelligence navigation has five main areas and preserves detailed reports internally', async () => {
  const intelligence = await readFile(new URL('intelligence.js', root), 'utf8');
  assert.equal((intelligence.match(/data-intel-area=/g)||[]).length,5);
  for (const area of ['dashboard','shopee','operation','supply','ideas']) assert.match(intelligence,new RegExp(`data-intel-area="${area}"`));
  for (const report of ['operations','materials','ecommerce','people','production','quality','purchases','suppliers','planning']) assert.match(intelligence,new RegExp(`data-intel-subtab="${report}"`));
  assert.match(intelligence,/id="inventoryAiDashboard"/);
  assert.doesNotMatch(intelligence,/data-intel-tab=/);
});

test('desktop, tablet, mobile and offline assets are complete', () => {
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(index, /intelligence-ai\.css\?v=25\.74/);
  assert.match(index, /intelligence-ai\.js\?v=25\.74/);
  assert.match(worker, /harmony-store-v25-91-r1/);
  assert.match(worker, /intelligence-ai\.css\?v=25\.74/);
  assert.match(worker, /intelligence-ai\.js\?v=25\.74/);
  assert.equal(JSON.parse(pkg).version, '25.91.0');
});

test('backup, recovery, help and three documentation levels cover the feature', () => {
  for (const source of [backup, recovery]) {
    assert.match(source, /'inventory_ai_settings'/);
    assert.match(source, /'inventory_ai_analyses'/);
    assert.match(source, /'inventory_ai_insights'/);
  }
  assert.match(help, /Inventário com IA/);
  assert.match(help, /A IA não altera estoque, ordens, pagamentos ou cadastros/);
  assert.match(manual, /### Central de Inteligência e Inventário com IA/);
  assert.match(manual, /não possui campo de perguntas/i);
  assert.match(technical, /## Separação de responsabilidades/);
  assert.match(audit, /## Riscos avaliados e controles/);
});
