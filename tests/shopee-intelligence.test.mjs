import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const [sql,dailyMigration,parser,ai,ui,css,index,worker,help,manual,technical,audit,backup,recovery,pkg]=await Promise.all([
  readFile(new URL('supabase/migrations/20260814223000_shopee_intelligence.sql',root),'utf8'),
  readFile(new URL('supabase/migrations/20260815130000_shopee_day_ledger_and_shipping_kit_fix.sql',root),'utf8'),
  readFile(new URL('supabase/functions/process-shopee-report/index.ts',root),'utf8'),
  readFile(new URL('supabase/functions/analyze-shopee-intelligence/index.ts',root),'utf8'),
  readFile(new URL('shopee-intelligence.js',root),'utf8'),
  readFile(new URL('shopee-intelligence.css',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('service-worker.js',root),'utf8'),
  readFile(new URL('help-center.js',root),'utf8'),
  readFile(new URL('docs/manual/MANUAL-DO-APLICATIVO.md',root),'utf8'),
  readFile(new URL('docs/technical/SHOPEE-ANALYTICS-IA-V25.84.md',root),'utf8'),
  readFile(new URL('docs/audit/AUDITORIA-SHOPEE-ANALYTICS-V25.84.md',root),'utf8'),
  readFile(new URL('scripts/create-api-backup.mjs',root),'utf8'),
  readFile(new URL('scripts/execute-api-recovery.mjs',root),'utf8'),
  readFile(new URL('package.json',root),'utf8'),
]);

test('database model is additive, normalized and admin-only',()=>{
  assert.doesNotMatch(sql,/drop\s+table|truncate\s+table|delete\s+from\s+public\.(products|requests|production_inventory)/i);
  for(const table of ['shopee_import_batches','shopee_sales_daily','shopee_traffic_sources','shopee_product_performance','shopee_product_funnel_daily','shopee_promotion_metrics','shopee_promotion_campaigns','shopee_ai_settings','shopee_ai_analyses','shopee_ai_insights']){
    assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql,new RegExp(`alter table public\\.%I enable row level security`));
  }
  assert.match(sql,/private\.is_admin\(\)/);
  assert.match(sql,/private\.is_primary_admin\(\)/);
  for(const index of ['shopee_import_batches_imported_by_idx','shopee_ai_settings_updated_by_idx','shopee_ai_analyses_created_by_idx','shopee_ai_insights_reviewed_by_idx','shopee_ai_insights_dismissed_by_idx'])assert.match(sql,new RegExp(index));
  assert.match(sql,/drop policy if exists %I on public\.%I/);
  assert.doesNotMatch(sql,/drop policy if exists %L on public\.%I/);
  assert.match(sql,/grant execute on function public\.service_commit_shopee_import\(text,date,date,text,bigint,text,text,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb\) to service_role/);
  assert.match(sql,/revoke all on function public\.service_commit_shopee_import[\s\S]*from public,anon,authenticated/);
});

test('imports are deduplicated, versioned and transactionally committed',()=>{
  assert.match(sql,/unique\(report_type,period_start,period_end,file_hash\)/);
  assert.match(sql,/where is_latest and status='validated'/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/status='superseded'/);
  assert.match(parser,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(parser,/file\.size > maxFileBytes/);
  assert.match(parser,/bytes\[0\] !== 0x50 \|\| bytes\[1\] !== 0x4b/);
  assert.match(parser,/workbook\.SheetNames\.length > 30/);
  assert.match(parser,/rowCount > 100000/);
  assert.match(parser,/service_commit_shopee_import_v2/);
  assert.match(parser,/p_import_mode: importMode/);
  assert.match(ui,/finally\{SH\.uploading='';renderActive\(\)/);
});

test('planilhas diárias e semanais têm uma única fonte canônica por dia',()=>{
  assert.match(dailyMigration,/create table if not exists public\.shopee_import_days/);
  assert.match(dailyMigration,/primary key \(report_type,metric_date\)/);
  assert.match(dailyMigration,/enable row level security/);
  assert.match(dailyMigration,/service_commit_shopee_import_v2/);
  assert.match(dailyMigration,/p_import_mode text default 'append'/);
  assert.match(dailyMigration,/p_import_mode not in \('append','replace'\)/);
  assert.match(dailyMigration,/status','already_covered'/);
  assert.match(dailyMigration,/accepted_dates/);
  assert.match(dailyMigration,/skipped_dates/);
  assert.match(dailyMigration,/join public\.shopee_import_days d on d\.report_type='shop_stats'/);
  assert.match(ui,/Adicionar dados de uma nova data ou período/);
  assert.match(ui,/Selecionar nova planilha/);
  assert.match(ui,/Corrigir um período já importado/);
  assert.match(ui,/data-shopee-new-upload/);
  assert.match(ui,/data-shopee-correct/);
  assert.match(ui,/expected_period_start/);
  assert.match(ui,/expected_period_end/);
  assert.match(parser,/PERIODO_DA_CORRECAO_DIFERENTE/);
  assert.match(parser,/parsed\.periodStart !== expectedPeriodStart/);
  assert.match(parser,/Nenhum dado foi alterado/);
  assert.match(parser,/const parserVersion = "1\.3\.0"/);
  assert.match(parser,/hasHourlyRows/);
  assert.match(parser,/period\.start === period\.end && hasHourlyRows/);
  assert.match(parser,/const officialTotal = rows\[1\]/);
  assert.match(parser,/salesRow\(officialTotal, orderType, period\.start\)/);
  assert.match(parser,/TOTAL_DIARIO_NAO_LOCALIZADO/);
  assert.match(parser,/single_day_hourly_consolidated/);
  assert.match(parser,/if \(uploadedNow\) await admin\.storage\.from\("shopee-imports"\)\.remove/);
  assert.doesNotMatch(ui,/Substituir por arquivo corrigido/);
  assert.match(ui,/scrollIntoView/);
  assert.match(ui,/SH\.from=response\.period_start/);
  assert.match(ui,/dia\(s\) adicionado\(s\)/);
  for(const source of [backup,recovery])assert.match(source,/'shopee_import_days'/);
});

test('calendário próprio informa cobertura diária sem depender do seletor nativo',()=>{
  assert.match(ui,/shopee_import_days\?select=metric_date,report_type/);
  assert.match(ui,/function coverageByDay\(\)/);
  assert.match(ui,/function coverageState\(iso\)/);
  assert.match(ui,/function coverageCalendar\(\)/);
  assert.match(ui,/Dados completos/);
  assert.match(ui,/Dados parciais/);
  assert.match(ui,/Sem dados/);
  assert.match(ui,/Fora do período monitorado/);
  assert.match(ui,/data-shopee-import-missing/);
  assert.match(css,/\.shopee-calendar-day\.complete/);
  assert.match(css,/\.shopee-calendar-day\.partial/);
  assert.match(css,/\.shopee-calendar-day\.missing/);
  assert.match(css,/\.shopee-calendar-day\.outside/);
  assert.match(css,/@media\(max-width:560px\)[\s\S]*\.shopee-coverage-calendar/);
});

test('histórico de importações é cronológico, compacto e filtrável',()=>{
  assert.match(ui,/const sortedImports=items=>/);
  assert.match(ui,/importDateValue\(b\)-importDateValue\(a\)/);
  assert.match(ui,/historyCategory:'all'/);
  assert.match(ui,/id="shopeeHistoryFilters"/);
  assert.match(ui,/Todas as categorias/);
  assert.match(ui,/Visão geral/);
  assert.match(ui,/Produtos/);
  assert.match(ui,/Marketing/);
  assert.match(ui,/type="date"/);
  assert.match(ui,/id="clearShopeeHistoryFilters"/);
  assert.match(css,/\.shopee-history-window\{max-height:500px;overflow:auto/);
  assert.match(css,/\.shopee-history-window \.shopee-table thead\{position:sticky/);
  assert.match(css,/@media\(max-width:820px\)\{\.shopee-import-history/);
  assert.match(css,/@media\(max-width:560px\)\{\.shopee-history-filters/);
});

test('three Shopee report families have independent structural validation',()=>{
  assert.match(parser,/parseShopStats/);assert.match(parser,/parseProductFunnel/);assert.match(parser,/parsePromotions/);
  assert.match(parser,/Estatísticas da Loja|shop_stats/);
  assert.match(parser,/product_funnel/);assert.match(parser,/promotions/);
  assert.match(parser,/COLUNAS_OBRIGATORIAS_AUSENTES/);
  assert.match(parser,/Esta planilha não corresponde ao tipo de relatório selecionado/);
});

test('AI is real, server-side, evidence-based and cost controlled',()=>{
  assert.match(ai,/https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(ai,/OPENAI_API_KEY/);assert.match(ai,/store: false/);assert.match(ai,/type: "json_schema"/);assert.match(ai,/strict: true/);
  assert.match(ai,/Toda afirmação quantitativa deve aparecer em evidence/);
  assert.match(ai,/BUDGET_REACHED/);assert.match(ai,/ANALYSIS_IN_PROGRESS/);assert.match(ai,/snapshot_fingerprint/);
  assert.match(ui,/ANALYSIS_REQUEST_TIMEOUT_MS=75000/);
  assert.match(ui,/path==='analyze-shopee-intelligence'\?fetchAnalysis/);
  assert.doesNotMatch(ui,/OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
  assert.doesNotMatch(ai,/transfer_production_inventory|production_weekly_closings|update public\.products/i);
});

test('dashboard is isolated, responsive and available offline',()=>{
  assert.match(ui,/const isAdmin=\(\)=>S\?\.profile\?\.role==='admin'/);
  for(const tab of ['overview','products','marketing','promotions','imports'])assert.match(ui,new RegExp(`'${tab}'`));
  assert.match(ui,/Visão geral/);assert.match(ui,/Produtos/);assert.match(ui,/Marketing/);assert.match(ui,/Promoções/);assert.match(ui,/Importações/);
  assert.match(css,/@media\(max-width:1180px\)/);assert.match(css,/@media\(max-width:820px\)/);assert.match(css,/@media\(max-width:560px\)/);assert.match(css,/@media\(max-width:390px\)/);
  assert.match(index,/shopee-intelligence\.css\?v=25\.92/);assert.match(index,/shopee-intelligence\.js\?v=25\.92/);
  assert.match(worker,/shopee-intelligence\.css\?v=25\.92/);assert.match(worker,/shopee-intelligence\.js\?v=25\.92/);assert.match(worker,/harmony-store-v25-94-r1/);
  assert.equal(JSON.parse(pkg).version,'25.94.0');
});

test('executive dashboard uses the Shopee identity and exposes daily values',()=>{
  assert.match(ui,/assets\/platform-shopee\.svg/);
  assert.match(ui,/Faturamento diário/);
  assert.match(ui,/data-shopee-metric="sales"/);
  assert.match(ui,/data-shopee-metric="orders"/);
  assert.match(ui,/data-shopee-trend-index/);
  assert.match(ui,/row\[`\$\{series\}_\$\{SH\.trendMetric\}`\]/);
  assert.match(sql,/placed_sales/);assert.match(sql,/paid_sales/);assert.match(sql,/placed_orders/);assert.match(sql,/paid_orders/);
  assert.match(ui,/FUNIL DE CONVERSÃO/);assert.match(ui,/ORIGEM DAS VENDAS PAGAS/);assert.match(ui,/QUALIDADE DOS DADOS/);
  assert.doesNotMatch(ui,/Pedidos feitos × pagos/);
  for(const selector of ['shopee-executive-grid','shopee-chart-selected','shopee-daily-values','shopee-support-grid'])assert.match(css,new RegExp(`\\.${selector}`));
  assert.match(css,/\.shopee-intelligence,\.shopee-intelligence \*\{box-sizing:border-box;min-width:0\}/);
  assert.match(css,/\.shopee-header-brand,\.shopee-header-actions\{flex:none;width:100%\}/);
  assert.match(css,/\.shopee-tabs button\{[^}]*flex:0 0 auto[^}]*white-space:nowrap/);
});

test('help, manual, audit, backup and recovery cover the module',()=>{
  assert.match(help,/Shopee Analytics/);assert.match(manual,/## Shopee Analytics/);
  assert.match(technical,/## Separação de responsabilidades/);assert.match(audit,/## Riscos e controles/);
  for(const source of [backup,recovery])for(const table of ['shopee_import_batches','shopee_sales_daily','shopee_product_funnel_daily','shopee_ai_analyses'])assert.match(source,new RegExp(`'${table}'`));
});
