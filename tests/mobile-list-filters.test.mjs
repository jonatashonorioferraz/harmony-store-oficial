import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [enhancements, app, productionOrders, helpCenter, intelligence] = await Promise.all([
  readFile(new URL('../enhancements.js', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../production-orders.js', import.meta.url), 'utf8'),
  readFile(new URL('../help-center.js', import.meta.url), 'utf8'),
  readFile(new URL('../intelligence.js', import.meta.url), 'utf8'),
]);
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('request catalog has searchable category filters', () => {
  assert.match(enhancements, /S\.view==='new'/);
  assert.match(enhancements, /placeholder:'Nome, cor, unidade ou descrição'/);
  assert.match(enhancements, /key:'new-products'/);
  assert.match(enhancements, /filterCategory/);
});

test('search controls cover the main searchable modules', () => {
  for (const key of ['requests','products','team','categories','fields','production-receipts','production-models','production-weeks','intelligence-suppliers','intelligence-purchases']) {
    assert.match(enhancements, new RegExp(`key:'${key}'`));
  }
  assert.match(enhancements, /listControlState/);
});

test('every generic search supports suggestions, accents, clear and the Enter key', () => {
  assert.match(enhancements, /searchSuggestionValues/);
  assert.match(enhancements, /attachSearchSuggestions/);
  assert.match(enhancements, /document\.createElement\('datalist'\)/);
  assert.match(enhancements, /enterkeyhint/);
  assert.match(enhancements, /event\.key!=='Enter'/);
  assert.match(enhancements, /addEventListener\('search'/);
  assert.match(enhancements, /products\.map\(product=>product\.name\)/);
});

test('custom product, production, help and idea filters use the same search contract', () => {
  for (const source of [app, productionOrders, helpCenter, intelligence]) {
    assert.match(source, /<datalist/);
    assert.match(source, /enterkeyhint="search"/);
    assert.match(source, /(?:addEventListener\('search'|\.onsearch=)/);
    assert.match(source, /key==='Enter'/);
  }
  assert.match(productionOrders, /normalizeOrderSearch/);
  assert.match(app, /editableProducts\.map\(item=>`<option value=/);
});

test('mobile search and filter remain visible and touch friendly', () => {
  assert.match(styles, /@media\(max-width:520px\)\{\.list-toolbar\{grid-template-columns:1fr/);
  assert.match(styles, /\.list-toolbar \.list-status,\.list-toolbar \.result-count\{grid-column:1\}/);
  assert.match(styles, /min-height:44px/);
});
