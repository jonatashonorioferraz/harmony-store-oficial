import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html,app,script,style,migration,edge,sw] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url),'utf8'),
  readFile(new URL('../app.js', import.meta.url),'utf8'),
  readFile(new URL('../shipping-planning.js', import.meta.url),'utf8'),
  readFile(new URL('../shipping-planning.css', import.meta.url),'utf8'),
  readFile(new URL('../supabase/migrations/20260812223000_shipping_planning.sql', import.meta.url),'utf8'),
  readFile(new URL('../supabase/functions/manage-user/index.ts', import.meta.url),'utf8'),
  readFile(new URL('../service-worker.js', import.meta.url),'utf8'),
]);

test('módulo está carregado, versionado e disponível offline',()=>{
  assert.match(html,/shipping-planning\.css\?v=25\.79/);
  assert.match(html,/shipping-planning\.js\?v=25\.79/);
  assert.match(sw,/shipping-planning\.css\?v=25\.79/);
  assert.match(sw,/shipping-planning\.js\?v=25\.79/);
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
