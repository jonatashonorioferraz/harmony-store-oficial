import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const worker = await readFile(new URL('service-worker.js', root), 'utf8');
const pwa = await readFile(new URL('pwa.js', root), 'utf8');
const html = await readFile(new URL('index.html', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

const shellSource = worker.match(/const SHELL=\[([\s\S]*?)\];/)?.[1] || '';
const shell = [...shellSource.matchAll(/'([^']+)'/g)].map(match => match[1]);
const pathOf = value => value.replace(/^\.\//, '');

function pngDimensions(bytes) {
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('PWA offline shell contains only existing production assets within its budget', async () => {
  assert.ok(shell.length >= 15, 'Offline shell unexpectedly incomplete.');
  assert.equal(new Set(shell).size, shell.length, 'Offline shell contains duplicate assets.');
  assert.doesNotMatch(shellSource, /app-icon-master|icon-192\.png|icon-512\.png/);
  let totalBytes = 0;
  for (const asset of shell.filter(item => item !== './')) {
    const file = new URL(pathOf(asset), root);
    await access(file);
    totalBytes += (await stat(file)).size;
  }
  assert.ok(totalBytes < 2_500_000, `Offline shell exceeded 2.5 MB: ${totalBytes} bytes.`);
});

test('manifest icons, portrait mode and brand metadata remain installable', async () => {
  assert.equal(manifest.orientation, 'portrait-primary');
  assert.equal(manifest.display, 'standalone');
  assert.match(html, /name="theme-color" content="#d84f91"/i);
  assert.match(html, /rel="apple-touch-icon"/i);
  const purposes = new Set();
  for (const icon of manifest.icons) {
    purposes.add(icon.purpose);
    const bytes = await readFile(new URL(icon.src, root));
    const expected = Number(icon.sizes.split('x')[0]);
    assert.deepEqual(pngDimensions(bytes), { width: expected, height: expected });
  }
  assert.ok(purposes.has('any'));
  assert.ok(purposes.has('maskable'));
});

test('service worker update and offline fallback remain versioned and safe', () => {
  const major = packageJson.version.split('.')[0];
  assert.match(worker, new RegExp(`harmony-store-v${major}`));
  assert.match(worker, /request\.mode==='navigate'\?caches\.match\('\.\/index\.html'\)/);
  assert.match(worker, /url\.origin!==self\.location\.origin/);
  assert.match(pwa, /updateViaCache:'none'/);
  assert.match(pwa, /registration\.update\(\)/);
});
