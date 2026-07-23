import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('temporary availability migration is additive, audited and admin protected', async () => {
  const sql=await read('supabase/migrations/20260722194500_product_temporary_availability.sql');
  assert.match(sql,/add column if not exists availability_status text not null default 'available'/i);
  assert.match(sql,/products_availability_status_check/i);
  assert.match(sql,/private\.is_admin\(\)/i);
  assert.match(sql,/product\.availability_updated/i);
  assert.match(sql,/revoke all on function public\.admin_save_product_v3[^;]+from public, anon/is);
  assert.match(sql,/grant execute on function public\.admin_save_product_v3[^;]+to authenticated/is);
  assert.match(sql,/before insert or update of product_id, requested_quantity/i);
  assert.match(sql,/new\.requested_quantity > old\.requested_quantity/i);
  assert.match(sql,/not \(select private\.is_admin\(\)\)/i);
  assert.match(sql,/^begin;/mi);
  assert.match(sql,/commit;\s*$/i);
});

test('request catalogue keeps unavailable products visible but disables their quantity', async () => {
  const source=await read('product-visibility.js');
  assert.match(source,/const visibleForRequests=[^;]+product\.active/);
  assert.doesNotMatch(source,/visibleForRequests=[^;]+availability_status/);
  assert.match(source,/isRequestAvailable/);
  assert.match(source,/Temporariamente indisponível/);
  assert.match(source,/Fornecedor sem estoque/);
  assert.match(source,/querySelectorAll\('\[data-minus\],\[data-plus\]'\)[\s\S]*disabled=true/);
  assert.match(source,/delete S\.cart\[id\]/);
  assert.match(source,/Remover da solicitação/);
});

test('ADM product form controls reason, return forecast and reactivation', async () => {
  const [source,css]=await Promise.all([read('product-visibility.js'),read('product-visibility.css')]);
  assert.match(source,/name=\"availability_status\"/);
  assert.match(source,/name=\"availability_reason\"/);
  assert.match(source,/name=\"availability_expected_on\"/);
  assert.match(source,/name='admin_save_product_v3'/);
  assert.match(source,/p_availability_status/);
  assert.match(css,/product-temporarily-unavailable/);
  assert.match(css,/product-availability-notice/);
  assert.match(css,/@media\(max-width:720px\)/);
});

test('new availability assets are mirrored in the deployable web folder', async () => {
  const [rootJs,webJs,rootCss,webCss]=await Promise.all([
    read('product-visibility.js'),read('web/product-visibility.js'),read('product-visibility.css'),read('web/product-visibility.css')
  ]);
  assert.equal(webJs,rootJs);
  assert.equal(webCss,rootCss);
});
