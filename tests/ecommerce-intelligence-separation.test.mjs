import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [migration,sharedMigration,intelligence,productVisibility,app]=await Promise.all([
  read('supabase/migrations/20260725230000_ecommerce_product_separation.sql'),
  read('supabase/migrations/20260726023000_shared_production_ecommerce_products.sql'),
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

test('database safely shares one product between production and ecommerce',()=>{
  assert.match(sharedMigration,/usage_scope in \('production','ecommerce','shared','internal'\)/);
  assert.match(sharedMigration,/v_requester_role = 'receiver'[\s\S]+not in \('ecommerce', 'shared'\)/);
  assert.match(sharedMigration,/v_requester_role = 'collaborator'[\s\S]+not in \('production', 'shared'\)/);
  assert.match(sharedMigration,/admin_save_product_v5/);
  assert.match(sharedMigration,/when v_scope = 'shared' then false/);
  assert.match(sharedMigration,/revoke all on function public\.admin_save_product_v5[^;]+from public, anon, authenticated/is);
});

test('product form lets admins classify production, ecommerce and shared products',()=>{
  assert.match(productVisibility,/Finalidade operacional/);
  assert.match(productVisibility,/Matéria-prima de produção/);
  assert.match(productVisibility,/Suprimento do e-commerce/);
  assert.match(productVisibility,/Produção e e-commerce/);
  assert.match(productVisibility,/isSharedCatalog/);
  assert.match(productVisibility,/purposeSelect\.value==='shared'/);
  assert.match(productVisibility,/visibilityInput\.checked=false;visibilityInput\.disabled=true/);
  assert.match(productVisibility,/p_usage_scope/);
  assert.match(productVisibility,/isManagedCatalog/);
  assert.match(productVisibility,/name='admin_save_product_v5'/);
  assert.match(app,/requestProductScopes=.*receiver.*\['ecommerce','shared'\].*\['production','shared'\]/);
});

test('intelligence separates ecommerce reports, planning and exports',()=>{
  assert.match(intelligence,/data-intel-subtab="ecommerce"/);
  assert.match(intelligence,/data-intel-area="operation"/);
  assert.match(intelligence,/SUPRIMENTOS DO E-COMMERCE/);
  assert.match(intelligence,/materialReport\(filteredRows\(\),scope\)/);
  assert.match(intelligence,/harmony-\$\{scope\}/);
  assert.match(intelligence,/requestScopeForReport=.*shared.*receiver.*ecommerce.*production/);
  assert.match(intelligence,/productScope==='shared'/);
  assert.match(intelligence,/Uso compartilhado/);
});

test('official mirrored assets stay synchronized',async()=>{
  assert.equal(intelligence,await read('web/intelligence.js'));
  assert.equal(productVisibility,await read('web/product-visibility.js'));
  assert.equal(app,await read('web/app.js'));
});
