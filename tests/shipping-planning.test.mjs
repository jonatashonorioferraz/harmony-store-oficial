import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html,app,script,style,migration,catalogMigration,colorMigration,edge,sw] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url),'utf8'),
  readFile(new URL('../app.js', import.meta.url),'utf8'),
  readFile(new URL('../shipping-planning.js', import.meta.url),'utf8'),
  readFile(new URL('../shipping-planning.css', import.meta.url),'utf8'),
  readFile(new URL('../supabase/migrations/20260812223000_shipping_planning.sql', import.meta.url),'utf8'),
  readFile(new URL('../supabase/migrations/20260813103000_shipping_exclusive_product_catalog.sql', import.meta.url),'utf8'),
  readFile(new URL('../supabase/migrations/20260813210448_shipping_color_combinations.sql', import.meta.url),'utf8'),
  readFile(new URL('../supabase/functions/manage-user/index.ts', import.meta.url),'utf8'),
  readFile(new URL('../service-worker.js', import.meta.url),'utf8'),
]);
const [backup,recovery] = await Promise.all([
  readFile(new URL('../scripts/create-api-backup.mjs', import.meta.url),'utf8'),
  readFile(new URL('../scripts/execute-api-recovery.mjs', import.meta.url),'utf8'),
]);

test('módulo está carregado, versionado e disponível offline',()=>{
  assert.match(html,/shipping-planning\.css\?v=25\.82/);
  assert.match(html,/shipping-planning\.js\?v=25\.82/);
  assert.match(sw,/shipping-planning\.css\?v=25\.82/);
  assert.match(sw,/shipping-planning\.js\?v=25\.82/);
});

test('acesso é restrito à gerente de e-commerce e ADM principal',()=>{
  assert.match(migration,/p\.is_ecommerce_manager or p\.is_primary_admin/);
  assert.match(migration,/enable row level security/g);
  assert.match(migration,/revoke all privileges on table public\.shipping_plans from public, anon, authenticated/);
  assert.match(migration,/revoke all on function public\.list_shipping_plans\(text\) from public, anon, authenticated/);
  assert.match(migration,/split_part\(v_image_path,'\/',1\)<>v_actor::text/);
  assert.match(script,/is_ecommerce_manager\|\|S\?\.profile\?\.is_primary_admin|is_ecommerce_manager\|\|S\.profile\?\.is_primary_admin/);
  assert.match(script,/Conclua todos os produtos/);
  assert.match(edge,/is_ecommerce_manager/);
});

test('plano reutiliza catálogo, calcula totais e impede conclusão incompleta',()=>{
  assert.match(migration,/references public\.finished_product_models/);
  assert.match(migration,/references public\.finished_production_colors/);
  assert.match(migration,/listing_units::bigint \* i\.volume_quantity::bigint/);
  assert.match(migration,/Conclua todos os produtos antes de marcar o envio como pronto/);
  assert.match(migration,/completed=case when v_item_changed then false else completed end/);
  assert.match(migration,/v_plan\.status='ready'[\s\S]*status='checking'/);
  assert.match(script,/list_finished_product_models/);
  assert.match(script,/list_finished_production_colors/);
});

test('UX inclui quadro, fotos, produtos exclusivos, tags Full e PDF isolado',()=>{
  for(const text of ['Próximos envios','Em preparação','Em conferência','Prontos para coleta','Exclusivo deste envio','Cadastro da produção','Gerar PDF']) assert.match(script,new RegExp(text));
  assert.match(script,/shipping-full-tag mercado/);
  assert.match(script,/shipping-full-tag shopee/);
  assert.match(app,/shipping-planning-printing/);
  assert.match(style,/@media\(max-width:720px\)/);
  assert.match(style,/@media print/);
});

test('produto exclusivo é salvo e reutilizado em catálogo isolado do módulo',()=>{
  assert.match(catalogMigration,/create table if not exists public\.shipping_exclusive_products/);
  assert.doesNotMatch(catalogMigration,/shipping_exclusive_products[\s\S]{0,300}references public\.finished_product_models/);
  assert.match(catalogMigration,/enable row level security/);
  assert.match(catalogMigration,/private\.can_manage_shipping_planning/);
  assert.match(catalogMigration,/list_shipping_exclusive_products/);
  assert.match(catalogMigration,/save_shipping_exclusive_product/);
  assert.match(script,/list_shipping_exclusive_products/);
  assert.match(script,/save_shipping_exclusive_product/);
  assert.match(script,/Salvo somente no Planejamento de envios/);
  assert.match(script,/Criar novo produto exclusivo/);
  for(const source of [backup,recovery])for(const table of ['shipping_exclusive_products','shipping_plans','shipping_plan_items'])assert.match(source,new RegExp(`'${table}'`));
});

test('combinações de 2 a 4 cores reutilizam apenas o catálogo oficial e ficam isoladas no módulo',()=>{
  assert.match(colorMigration,/create table if not exists public\.shipping_color_combinations/);
  assert.match(colorMigration,/create table if not exists public\.shipping_color_combination_items/);
  assert.match(colorMigration,/references public\.finished_production_colors\(id\)/);
  assert.match(colorMigration,/position between 1 and 4/);
  assert.match(colorMigration,/v_count not between 2 and 4/);
  assert.match(colorMigration,/unique \(combination_id, color_id\)/);
  assert.match(colorMigration,/shipping_color_combinations_active_signature_uidx/);
  assert.match(colorMigration,/enable row level security/g);
  assert.match(colorMigration,/private\.can_manage_shipping_planning/);
  assert.match(colorMigration,/revoke all privileges on table public\.shipping_color_combinations from public, anon, authenticated/);
  assert.match(colorMigration,/list_shipping_plans_with_colors/);
  assert.match(colorMigration,/save_shipping_plan_with_colors/);
  assert.match(colorMigration,/shipping_color_combination\.saved/);
  assert.match(script,/Nova combinação de cores/);
  assert.match(script,/Escolha de 2 a 4 cores/);
  assert.match(script,/list_shipping_color_combinations/);
  assert.match(script,/save_shipping_color_combination/);
  assert.match(script,/save_shipping_plan_with_colors/);
  assert.match(script,/color_combination_id:selected\.combinationId/);
  assert.match(script,/colorDots\(item\.color_hex\)/);
  for(const source of [backup,recovery])for(const table of ['shipping_color_combinations','shipping_color_combination_items'])assert.match(source,new RegExp(`'${table}'`));
});

test('nome da outra plataforma aparece somente quando Outra plataforma é selecionada',()=>{
  assert.match(script,/shipping-other-platform/);
  assert.match(script,/other\.style\.display=visible\?'':'none'/);
  assert.match(style,/shipping-other-platform\[hidden\]\{display:none!important\}/);
});

test('editor mantem produto, observacao e remocao visiveis no desktop, tablet e celular',()=>{
  assert.match(style,/@media\(max-width:1500px\)/);
  assert.match(style,/@media\(max-width:900px\)/);
  assert.match(style,/shipping-plan-editor\{overflow-x:hidden\}/);
  assert.match(style,/data-remove-shipping-item[^}]+width:100%/);
  assert.match(style,/grid-template-areas:\s*"photo listing product color volume total"\s*"photo notes notes notes notes remove"/);
  assert.match(style,/grid-template-areas:\s*"photo product product"\s*"photo listing listing"[\s\S]*"remove remove remove"/);
  assert.match(style,/label:nth-child\(7\)\{grid-area:notes\}/);
});

