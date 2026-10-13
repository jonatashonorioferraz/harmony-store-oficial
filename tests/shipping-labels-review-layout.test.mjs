import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../shipping-labels/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../shipping-labels/embedded.css', import.meta.url), 'utf8');

test('batch review uses the existing responsive metric cards and styled actions', () => {
  assert.match(html, /<dl class="review-metrics">/);
  for (const id of ['review-labels', 'review-invoices', 'review-products', 'review-pages']) {
    assert.match(html, new RegExp('<dd id="' + id + '">'));
  }
  assert.match(html, /id="review-state" class="review-state"/);
  assert.match(html, /id="review-generate" class="review-submit"/);
  assert.match(css, /\.review-metrics\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:650px\)\{\.review-metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('partial decision and problem actions retain responsive layout and explicit consent', () => {
  assert.match(html, /id="partial-consent" type="checkbox"/);
  assert.match(html, /class="resolution-actions"/);
  assert.match(css, /@media\(max-width:600px\)\{\.resolution-actions\{display:grid;grid-template-columns:1fr/);
  assert.match(css, /\.partial-choice\[hidden\]\{display:none\}/);
});
