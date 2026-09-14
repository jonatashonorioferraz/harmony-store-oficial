import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../media-optimization.js', import.meta.url), 'utf8');
const origin = 'https://tyzfznwvjzmudxtcbbaf.supabase.co';
const uuid = '12345678-1234-4567-89ab-123456789abc';
const uploadUrl = `${origin}/storage/v1/object/product-images/${uuid}.jpg`;

function harness(options = {}) {
  const calls = [];
  const listeners = {};
  class Image {
    constructor(src) { this.src = src; this.removed = []; }
    get currentSrc() { return this.src; }
    removeAttribute(name) { this.removed.push(name); }
  }
  const window = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      if (options.rejectFetch) throw new Error('offline');
      return { ok: true };
    },
    createImageBitmap: options.bitmap
  };
  const context = vm.createContext({
    window, URL, Headers, Blob, HTMLImageElement: Image,
    createImageBitmap: options.bitmap,
    location: { href: 'https://app.harmonylembrancinhas.com.br/' },
    document: {
      addEventListener: (name, listener) => { listeners[name] = listener; },
      createElement: () => options.canvas
    }
  });
  vm.runInContext(source, context);
  return { window, calls, listeners, Image };
}

test('public images use contain variants without changing stored paths', () => {
  const { window } = harness();
  const url = new URL(window.HarmonyMedia.productUrl('folder/a%20b.jpg', 480));
  assert.equal(url.pathname, '/storage/v1/render/image/public/product-images/folder/a%20b.jpg');
  assert.equal(url.searchParams.get('width'), '480');
  assert.equal(url.searchParams.get('quality'), '85');
  assert.equal(url.searchParams.get('resize'), 'contain');
  assert.equal(new URL(window.HarmonyMedia.shippingUrl('a.jpg')).searchParams.get('width'), '1024');
});

test('private buckets and custom query strings are not transformed', () => {
  const { window } = harness();
  assert.match(window.HarmonyMedia.publicImage('bill-documents', 'a.jpg'), /\/object\/public\//);
  assert.match(window.HarmonyMedia.productUrl('a.jpg?token=secret'), /\/object\/public\//);
});

test('failed transformation retries original once and remembers the failure', () => {
  const h = harness();
  const img = new h.Image(h.window.HarmonyMedia.productUrl('a.jpg'));
  h.listeners.error({ target: img });
  assert.equal(img.src, `${origin}/storage/v1/object/public/product-images/a.jpg`);
  h.listeners.error({ target: img });
  assert.equal(h.window.HarmonyMedia.productUrl('a.jpg'), img.src);
});

test('three failures disable subsequent transformations in the page session', () => {
  const h = harness();
  for (const path of ['a.jpg', 'b.jpg', 'c.jpg']) {
    h.listeners.error({ target: new h.Image(h.window.HarmonyMedia.productUrl(path)) });
  }
  assert.match(h.window.HarmonyMedia.productUrl('d.jpg'), /\/object\/public\//);
});

test('immutable public uploads retain authorization and add browser cache', async () => {
  const h = harness();
  const body = new Blob(['photo'], { type: 'image/jpeg' });
  const signal = new AbortController().signal;
  const init = { method: 'POST', body, signal, headers: { Authorization: 'Bearer test', apikey: 'test', 'Content-Type': body.type } };
  await h.window.fetch(uploadUrl, init);
  assert.equal(h.calls[0].init.body, body);
  assert.equal(h.calls[0].init.signal, signal);
  assert.equal(h.calls[0].init.headers.get('authorization'), 'Bearer test');
  assert.equal(h.calls[0].init.headers.get('cache-control'), 'max-age=31536000');
  assert.equal(init.headers['cache-control'], undefined);
});

test('private, external, upsert and mutable uploads remain untouched', async () => {
  const h = harness();
  const body = new Blob(['photo'], { type: 'image/jpeg' });
  for (const [url, headers] of [
    [uploadUrl.replace('product-images', 'bill-documents'), {}],
    [uploadUrl.replace('product-images', 'profile-images'), {}],
    [uploadUrl.replace(origin, 'https://other.example'), {}],
    [uploadUrl, { 'x-upsert': 'true' }],
    [uploadUrl.replace(uuid, 'avatar'), {}]
  ]) {
    const init = { method: 'POST', body, headers };
    await h.window.fetch(url, init);
    assert.equal(h.calls.at(-1).init, init);
  }
});

test('Request inputs retain original request headers and init', async () => {
  const h = harness();
  const input = new Request(uploadUrl, { headers: { Authorization: 'Bearer test' } });
  const init = { method: 'POST', body: new Blob(['photo'], { type: 'image/jpeg' }) };
  await h.window.fetch(input, init);
  assert.equal(h.calls[0].input, input);
  assert.equal(h.calls[0].init, init);
});

test('compression keeps MIME, aspect ratio and only accepts smaller output', async () => {
  let closed = false;
  const body = new Blob([new Uint8Array(300000)], { type: 'image/jpeg' });
  const compressed = new Blob(['smaller'], { type: body.type });
  const canvas = { getContext: () => ({ drawImage() {} }), toBlob: cb => cb(compressed) };
  const h = harness({ bitmap: async () => ({ width: 3200, height: 1600, close() { closed = true; } }), canvas });
  await h.window.fetch(uploadUrl, { method: 'POST', body });
  assert.equal(h.calls[0].init.body, compressed);
  assert.equal(canvas.width, 1600);
  assert.equal(canvas.height, 800);
  assert.equal(closed, true);
});

test('decoder failure preserves original upload', async () => {
  const body = new Blob([new Uint8Array(300000)], { type: 'image/jpeg' });
  const h = harness({ bitmap: async () => { throw new Error('unsupported'); } });
  await h.window.fetch(uploadUrl, { method: 'POST', body });
  assert.equal(h.calls[0].init.body, body);
});

test('upload network failure never retries a POST', async () => {
  const h = harness({ rejectFetch: true });
  await assert.rejects(h.window.fetch(uploadUrl, { method: 'POST', body: new Blob(['a'], { type: 'image/jpeg' }) }), /offline/);
  assert.equal(h.calls.length, 1);
});

test('module loads before application and is included in PWA shell', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const sw = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  const mediaIndex = html.indexOf('media-optimization.js?v=25.100');
  const appIndex = html.indexOf('app.js?v=25.100');
  assert.ok(mediaIndex >= 0 && appIndex > mediaIndex);
  assert.match(sw, /media-optimization\.js\?v=25\.100/);
});
