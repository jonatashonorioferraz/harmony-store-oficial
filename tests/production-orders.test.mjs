import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const [sql,externalSql,js,css,confirmationCss,html,worker,receiptCss,pickerCss,help,manual]=await Promise.all([
  readFile(new URL('supabase/migrations/20260720170000_production_orders.sql',root),'utf8'),
  readFile(new URL('supabase/migrations/20260804143000_admin_external_production_order_acknowledgement.sql',root),'utf8'),
  readFile(new URL('production-orders.js',root),'utf8'),
  readFile(new URL('production-orders.css',root),'utf8'),
  readFile(new URL('production-order-confirmation.css',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('service-worker.js',root),'utf8'),
  readFile(new URL('production-receipts.css',root),'utf8'),
  readFile(new URL('production-order-color-picker.css',root),'utf8'),
  readFile(new URL('help-center.js',root),'utf8'),
  readFile(new URL('docs/manual/MANUAL-DO-APLICATIVO.md',root),'utf8'),
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

test('production order cache is isolated when another collaborator signs in on the same device',()=>{
  assert.match(js,/ownerId:null/);
  assert.match(js,/if\(PO\.ownerId!==ownerId\)\{reset\(\);PO\.ownerId=ownerId\}/);
  assert.match(js,/groupRows\(orders\)\.filter\(canAccessOrder\)/);
  assert.match(js,/order\.worker_id===S\?\.profile\?\.id/);
  assert.match(js,/if\(!canAccessOrder\(order\)\)return/);
  assert.match(js,/Object\.freeze\(\{state:PO,load,reset,open:/);
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

test('admins can register an external acknowledgement without touching receiving or payments',()=>{
  assert.match(externalSql,/add column if not exists acknowledgement_source/);
  assert.match(externalSql,/acknowledged_by uuid references public\.profiles/);
  assert.match(externalSql,/create or replace function public\.admin_acknowledge_production_order/);
  assert.match(externalSql,/if not \(select private\.is_admin\(\)\)/);
  assert.match(externalSql,/status not in \('sent','viewed'\)/);
  assert.match(externalSql,/production_order\.admin_acknowledged/);
  assert.match(externalSql,/revoke all on function public\.admin_acknowledge_production_order/);
  assert.match(externalSql,/grant execute on function public\.admin_acknowledge_production_order/);
  assert.doesNotMatch(externalSql,/finished_production_receipts|payment_closings|rate_per_100/);
  assert.match(js,/Registrar confirmação externa/);
  assert.match(js,/admin_acknowledge_production_order/);
  assert.match(js,/Este registro não confirma produção entregue e não calcula pagamentos/);
  assert.match(js,/Confirmada pelo ADM/);
  assert.match(confirmationCss,/\.production-order-confirm-modal/);
  assert.match(confirmationCss,/@media \(max-width: 700px\)/);
  assert.match(confirmationCss,/@media print/);
  assert.match(help,/confirmação externa com data, meio e auditoria/);
  assert.match(manual,/não registra produtos acabados, não altera a contagem oficial e não calcula pagamentos/);
});

test('new production items move to the top and receive immediate focus',()=>{
  assert.match(js,/addProductionOrderItem/);
  assert.match(js,/const existing=new Set\(root\.children\)/);
  assert.match(js,/root\.prepend\(added\)/);
  assert.match(js,/added\.querySelector\('\.production-order-model-trigger'\)\?\.focus\(\)/);
});

test('model picker provides photos, scrolling and accent-insensitive autocomplete',()=>{
  assert.match(js,/enhanceProductionOrderModelPickers/);
  assert.match(js,/production-order-model-option-photo/);
  assert.match(js,/Digite algumas letras do modelo/);
  assert.match(js,/normalize\('NFD'\)/);
  assert.match(js,/dataset\.modelSearch\.includes\(term\)/);
  assert.match(js,/modelo.*encontrado/);
  assert.match(pickerCss,/\.production-order-model-options/);
  assert.match(pickerCss,/max-height:340px/);
  assert.match(pickerCss,/overflow-y:auto/);
});

test('every color option has its registered visual swatch',()=>{
  assert.match(js,/enhanceProductionOrderColorPickers/);
  assert.match(js,/\[\.\.\.select\.options\]\.forEach/);
  assert.match(js,/color\?\.hex_code/);
  assert.match(js,/role','listbox/);
  assert.match(js,/aria-selected/);
  assert.match(js,/ArrowDown/);
  assert.match(js,/ArrowUp/);
  assert.match(js,/Escape/);
  assert.match(pickerCss,/\.production-order-color-options/);
  assert.match(pickerCss,/grid-template-columns:repeat\(2/);
  assert.match(pickerCss,/overflow-y:auto/);
  assert.match(pickerCss,/-webkit-overflow-scrolling:touch/);
  assert.match(pickerCss,/touch-action:pan-y/);
  assert.match(pickerCss,/@media\(max-width:700px\)/);
  assert.match(html,/production-order-color-picker\.css/);
  assert.match(worker,/production-order-color-picker\.css/);
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
  assert.match(js,/HarmonyPrint\.printCurrentDocument\('production-order-printing'\)/);
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
  assert.match(receiptCss,/html\.production-receipt-printing body>\*:not\(#productionPrint\)/);
  assert.match(html,/production-orders\.js\?v=25\.49/);
  assert.match(html,/production-orders\.css\?v=25\.49/);
  assert.match(worker,/production-orders\.js/);
  assert.match(worker,/harmony-store-v25-82/);
});
