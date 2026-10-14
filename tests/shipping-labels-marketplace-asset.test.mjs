import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Mercado Livre logo contains alpha and uses the same versioned URL throughout the journey', async () => {
  const base = new URL('../', import.meta.url);
  const asset = await readFile(new URL('shipping-labels/assets/mercado-livre.webp', base));
  assert.equal(asset.toString('ascii', 0, 4), 'RIFF');
  assert.equal(asset.toString('ascii', 8, 12), 'WEBP');
  let alpha = false;
  for (let offset = 12; offset + 8 <= asset.length;) {
    const kind = asset.toString('ascii', offset, offset + 4);
    const size = asset.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + size <= asset.length, 'valid WebP chunk bounds');
    if (kind === 'VP8X') alpha ||= Boolean(asset[offset + 8] & 0x10);
    if (kind === 'VP8L') alpha ||= Boolean(asset[offset + 12] & 0x10);
    offset += 8 + size + (size % 2);
  }
  assert.ok(alpha, 'logo must retain a real alpha channel');
  assert.deepEqual(asset, await readFile(new URL('web/shipping-labels/assets/mercado-livre.webp', base)));
  const html = await readFile(new URL('shipping-labels/index.html', base), 'utf8');
  const controller = await readFile(new URL('shipping-labels/guided.js', base), 'utf8');
  const url = html.match(/assets\/mercado-livre\.webp\?v=[0-9.]+/u)?.[0];
  assert.ok(url, 'logo URL is versioned to invalidate the old image');
  assert.ok(controller.includes(url), 'selection and active platform share the corrected logo');
});
