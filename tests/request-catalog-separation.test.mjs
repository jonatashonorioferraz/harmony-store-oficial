import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('database blocks products from crossing the production and internal catalogues', async () => {
  const sql = await read('supabase/migrations/20260720143000_separate_production_internal_catalogs.sql');
  assert.match(sql, /enforce_production_request_product/);
  assert.match(sql, /usage_scope = 'production'/);
  assert.match(sql, /enforce_internal_supply_product/);
  assert.match(sql, /usage_scope = 'internal'/);
  assert.match(sql, /before insert or update of product_id on public\.request_items/i);
  assert.match(sql, /before insert or update of product_id on public\.internal_supply_request_items/i);
  assert.match(sql, /before insert or update of product_id on public\.internal_purchase_receipt_items/i);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
});

test('production request catalogue uses an exact production scope for every requester role', async () => {
  const source = await read('product-visibility.js');
  const context = {
    S:{profile:{id:'receiver-1',role:'receiver'},products:[],cart:{}},
    rpc:async()=>{},productModal:async()=>{},renderNew:()=>{},requestModalV2:async()=>{},renderProducts:()=>{},
    document:{querySelector:()=>null,querySelectorAll:()=>[]},
    window:{},console,
  };
  vm.createContext(context);vm.runInContext(source,context);
  const {isProductionCatalog,visibleForRequests}=context.window.HarmonyProductVisibility;
  assert.equal(isProductionCatalog({usage_scope:'production'}),true);
  assert.equal(isProductionCatalog({usage_scope:'internal'}),false);
  assert.equal(isProductionCatalog({usage_scope:'ecommerce'}),false);
  assert.equal(visibleForRequests({active:true,usage_scope:'internal'}),false);
  assert.equal(visibleForRequests({active:true,usage_scope:'production',hidden_from_collaborators:true}),true);
});

test('internal supplies support secure photos and keep them visible in catalogue and details', async () => {
  const [source,css,sql] = await Promise.all([
    read('internal-supplies.js'),
    read('internal-supplies.css'),
    read('supabase/migrations/20260720143000_separate_production_internal_catalogs.sql'),
  ]);
  assert.match(source, /name="photo" type="file" accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(source, /admin_save_internal_supply_product_v2/);
  assert.match(source, /p_image_path:nextImage/);
  assert.match(source, /uploadInternalProductPhoto/);
  assert.match(source, /2097152/);
  assert.match(source, /supply-detail-photo/);
  assert.match(source, /loading="lazy"/);
  assert.match(css, /\.internal-product-photo/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(sql, /product_photo_updated/);
  assert.match(sql, /revoke all on function public\.admin_save_internal_supply_product_v2[^;]+from public, anon/is);
  assert.match(sql, /grant execute on function public\.admin_save_internal_supply_product_v2[^;]+to authenticated/is);
});

test('raw-material request details retain product thumbnails and mobile layout', async () => {
  const [app,styles] = await Promise.all([read('app.js'),read('styles.css')]);
  assert.match(app, /function requestItemVisual/);
  assert.match(app, /data-request-product-photo/);
  assert.match(app, /filter\(p=>p\.active&&p\.usage_scope==='production'\)/);
  assert.match(styles, /\.request-item-photo/);
  assert.match(styles, /@media\(max-width:720px\)[^{]*\{\.item-editor/);
});
