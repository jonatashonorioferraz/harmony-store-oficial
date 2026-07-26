import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [migration,intelligence,productVisibility,app]=await Promise.all([
  read('supabase/migrations/20260725230000_ecommerce_product_separation.sql'),
  read('intelligence.js'),
  read('product-visibility.js'),
  read('app.js'),
]);

test('database enforces the request catalogue that belongs to each requester profile',()=>{
  assert.match(migration,/v_requester_role = 'receiver' and v_product_scope <> 'ecommerce'/);
  assert.match(migration,/v_requester_role = 'collaborator' and v_product_scope <> 'production'/);
  assert.match(migration,/join public\.profiles profile on profile\.id = request\.requested_by/i);
  assert.match(migration,/admin_save_product_v4/);
  assert.match(migration,/product\.usage_scope_updated/);
  assert.match(migration,/revoke all on function public\.admin_save_product_v4[^;]+from public, anon, authenticated/is);
});

test('product form lets admins classify production and ecommerce without exposing internal supplies',()=>{
  assert.match(productVisibility,/Finalidade operacional/);
  assert.match(productVisibility,/Matéria-prima de produção/);
  assert.match(productVisibility,/Suprimento do e-commerce/);
  assert.match(productVisibility,/p_usage_scope/);
  assert.match(productVisibility,/isManagedCatalog/);
  assert.match(app,/requestProductScope=.*receiver.*ecommerce.*production/);
});

test('intelligence separates ecommerce reports, planning and exports',()=>{
  assert.match(intelligence,/data-intel-tab="ecommerce"/);
  assert.match(intelligence,/SUPRIMENTOS DO E-COMMERCE/);
  assert.match(intelligence,/materialReport\(filteredRows\(\),scope\)/);
  assert.match(intelligence,/harmony-\$\{scope\}/);
  assert.match(intelligence,/product\.usage_scope==='production'&&item\.suggested>0/);
});

test('official mirrored assets stay synchronized',async()=>{
  assert.equal(intelligence,await read('web/intelligence.js'));
  assert.equal(productVisibility,await read('web/product-visibility.js'));
  assert.equal(app,await read('web/app.js'));
});
