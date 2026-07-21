import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('product visibility migration is additive, audited and admin protected', async () => {
  const sql = await read('supabase/migrations/20260719203000_product_collaborator_visibility.sql');
  assert.match(sql, /add column if not exists hidden_from_collaborators boolean not null default false/i);
  assert.match(sql, /private\.is_admin\(\)/i);
  assert.match(sql, /product\.collaborator_visibility_updated/i);
  assert.match(sql, /revoke all on function public\.admin_save_product_v2[^;]+from public, anon/is);
  assert.match(sql, /grant execute on function public\.admin_save_product_v2[^;]+to authenticated/is);
  assert.match(sql, /^begin;/mi);
  assert.match(sql, /commit;\s*$/i);
});

test('only the regular collaborator loses hidden products from new requests', async () => {
  const source = await read('product-visibility.js');
  const context = {
    S:{profile:{role:'collaborator'},products:[],cart:{}},
    rpc:async()=>{},productModal:async()=>{},renderNew:()=>{},requestModalV2:async()=>{},renderProducts:()=>{},
    document:{querySelector:()=>null,querySelectorAll:()=>[]},
    window:{},console,
  };
  vm.createContext(context);vm.runInContext(source,context);
  const visible=context.window.HarmonyProductVisibility.visibleForRequests;
  const hidden={active:true,usage_scope:'production',hidden_from_collaborators:true};
  const normal={active:true,usage_scope:'production',hidden_from_collaborators:false};
  assert.equal(visible(hidden),false);
  assert.equal(visible(normal),true);
  context.S.profile.role='receiver';assert.equal(visible(hidden),true);
  context.S.profile.role='admin';assert.equal(visible(hidden),true);
});

test('product form, catalogue and offline cache include the visibility control', async () => {
  const [feature,html,worker,css] = await Promise.all([
    read('product-visibility.js'),read('index.html'),read('service-worker.js'),read('product-visibility.css'),
  ]);
  assert.match(feature, /Ocultar para colaboradoras de produção/);
  assert.match(feature, /ADM principal, outros ADMs e colaboradoras de recebimento/);
  assert.match(feature, /name='admin_save_product_v2'|name='admin_save_product'/);
  assert.match(feature, /editingOwnRequest[\s\S]*request\.status==='pending'/);
  assert.match(html, /product-visibility\.js/);
  assert.match(html, /product-visibility\.css/);
  assert.match(worker, /harmony-store-v25-23/);
  assert.match(css, /product-visibility-check/);
});

test('internal supplies stay out of the production request and product catalogues', async () => {
  const feature = await read('product-visibility.js');
  assert.match(feature, /product\.usage_scope==='production'/);
  assert.match(feature, /fullProducts\.filter\(isProductionCatalog\)/);
});
