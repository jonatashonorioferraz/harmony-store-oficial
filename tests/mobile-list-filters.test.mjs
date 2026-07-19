import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const enhancements = await readFile(new URL('../enhancements.js', import.meta.url), 'utf8');
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

test('mobile search and filter remain visible and touch friendly', () => {
  assert.match(styles, /@media\(max-width:520px\)\{\.list-toolbar\{grid-template-columns:1fr/);
  assert.match(styles, /\.list-toolbar \.list-status,\.list-toolbar \.result-count\{grid-column:1\}/);
  assert.match(styles, /min-height:44px/);
});
