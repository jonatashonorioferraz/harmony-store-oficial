import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const [app,visibility,receipts,supplies,transfer,integration,help,migration]=await Promise.all([
  read('app.js'),read('product-visibility.js'),read('production-receipts.js'),read('internal-supplies.js'),
  read('transfer-center.js'),read('shipping-inventory-integration.js'),read('help-center.js'),
  read('supabase/migrations/20260824231638_ecommerce_manager_operational_access.sql')
]);

test('gerente reúne os catálogos de produção e e-commerce sem ser promovida a ADM',()=>{
  assert.match(app,/is_ecommerce_manager\s*\?\['production','ecommerce','shared'\]/);
  assert.ok(app.includes("role:isEcommerceManager?'collaborator':accessProfile"));
  assert.match(visibility,/S\.profile\?\.is_ecommerce_manager\|\|product\.hidden_from_collaborators/);
  assert.doesNotMatch(app,/role:isEcommerceManager\?'admin'/);
});

test('gerente herda operações de recebimento, suprimentos e transferência',()=>{
  assert.match(receipts,/isReceiverOperator=\(\)=>role\(\)==='receiver'\|\|isEcommerceManager\(\)/);
  assert.match(supplies,/\['admin','receiver'\]\.includes\(S\.profile\?\.role\)\|\|isEcommerceManager\(\)/);
  assert.match(transfer,/canDispatch=.*is_ecommerce_manager/);
  assert.match(integration,/canConfirm=.*is_ecommerce_manager/);
});

test('valores de pagamento e ferramentas administrativas continuam bloqueados',()=>{
  assert.match(receipts,/canSeeReceiptValues=\(\)=>isAdmin\(\)/);
  assert.match(receipts,/canSeePaymentValues=\(\)=>!isReceiverOperator\(\)/);
  assert.match(help,/if\(topic\.id==='payments'\)return false/);
  assert.doesNotMatch(migration,/create or replace function private\.is_admin/);
  assert.doesNotMatch(migration,/is_ecommerce_manager[^\n]+role\s*=\s*'admin'/i);
});

test('Supabase aplica a mesma herança e mascara dados financeiros',()=>{
  assert.match(migration,/role='receiver' or coalesce\(is_ecommerce_manager,false\)/);
  assert.match(migration,/role in \('admin','receiver'\) or coalesce\(is_ecommerce_manager,false\)/);
  assert.match(migration,/v_is_ecommerce_manager[\s\S]*v_product_scope not in \('production','ecommerce','shared'\)/);
  assert.match(migration,/case when v_role='admin' then r\.rate_per_100_snapshot else null::numeric end/);
  assert.match(migration,/and not coalesce\(p\.is_ecommerce_manager,false\)/);
  assert.match(migration,/payment_values',false/);
  assert.match(migration,/admin_role',false/);
});

test('arquivos oficiais de acesso ficam sincronizados',async()=>{
  for(const path of ['app.js','product-visibility.js','production-receipts.js','internal-supplies.js','help-center.js','transfer-center.js']){
    const normalize=value=>value.replaceAll('\r\n','\n');
    assert.equal(normalize(await read(path)),normalize(await read(`web/${path}`)),path);
  }
});
