import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const [sql,js,css,html,worker,receiptCss]=await Promise.all([
  readFile(new URL('supabase/migrations/20260720170000_production_orders.sql',root),'utf8'),
  readFile(new URL('production-orders.js',root),'utf8'),
  readFile(new URL('production-orders.css',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('service-worker.js',root),'utf8'),
  readFile(new URL('production-receipts.css',root),'utf8'),
]);

test('production orders are isolated from receiving and payments',()=>{
  assert.match(sql,/create table if not exists public\.production_orders/);
  assert.match(sql,/create table if not exists public\.production_order_items/);
  assert.doesNotMatch(sql,/rate_per_100|payment|amount|finished_production_receipts/);
  assert.match(js,/Este módulo não calcula pagamentos/);
  assert.match(js,/pagamento continua sendo calculado somente no recebimento/);
});

test('database authorization protects own orders and admin mutations',()=>{
  assert.match(sql,/enable row level security/g);
  assert.match(sql,/worker_id = \(select auth\.uid\(\)\)/);
  assert.match(sql,/if not \(select private\.is_admin\(\)\)/);
  assert.match(sql,/security definer/g);
  assert.match(sql,/set search_path = ''/g);
  assert.match(sql,/revoke all on function public\.admin_save_production_order/);
  assert.match(sql,/grant execute on function public\.admin_save_production_order/);
  assert.match(sql,/role in \('collaborator','receiver'\)/);
});

test('workflow supports drafts, notifications, acknowledgement and audit',()=>{
  for(const status of ['draft','sent','viewed','acknowledged','cancelled'])assert.match(sql,new RegExp(`'${status}'`));
  assert.match(sql,/app_notification_recipients/);
  assert.match(sql,/production_order\.acknowledged/);
  assert.match(sql,/production_order\.cancelled/);
  assert.match(js,/Salvar rascunho/);
  assert.match(js,/Confirmar que recebi a lista/);
  assert.match(js,/Duplicar/);
});

test('catalog photos, colors, PDF and responsive UI are present',()=>{
  assert.match(js,/list_finished_product_models/);
  assert.match(js,/list_finished_production_colors/);
  assert.match(js,/product-images/);
  assert.match(js,/async function printProductionOrder/);
  assert.match(js,/const mobilePrint=/);
  assert.match(js,/Android\|iPhone\|iPad\|iPod/);
  assert.match(js,/waitForPrintAssets\(source\)/);
  assert.match(js,/if\(mobilePrint\(\)\)/);
  assert.match(js,/window\.print\(\);return/);
  assert.match(js,/window\.open\('about:blank','_blank'\)/);
  assert.match(js,/copy\.querySelectorAll\('\.no-print'\)/);
  assert.match(js,/printWindow\.document/);
  assert.match(js,/printWindow\.print\(\)/);
  assert.match(js,/O navegador bloqueou a janela do PDF/);
  assert.match(js,/doc\.fonts\?\.ready/);
  assert.match(js,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(js,/@page\{size:A4 portrait;margin:9mm\}/);
  assert.match(js,/break-inside:avoid/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media print/);
  assert.match(css,/#modal,#modal>\.modal,#productionOrderPrint/);
  assert.match(css,/max-height:none!important/);
  assert.match(receiptCss,/body>\*:not\(#productionPrint\):not\(#modal\)/);
  assert.match(html,/production-orders\.js\?v=25\.28/);
  assert.match(html,/production-orders\.css\?v=25\.28/);
  assert.match(worker,/production-orders\.js/);
  assert.match(worker,/harmony-store-v25-30/);
});
