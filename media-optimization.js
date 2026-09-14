(function () {
  'use strict';
  const origin = 'https://tyzfznwvjzmudxtcbbaf.supabase.co';
  const buckets = new Set(['product-images', 'shipping-planning-images']);
  const originals = new Map();
  const failed = new Set();
  let failures = 0;

  // Existing objects, permissions and paths remain unchanged.
  function publicImage(bucket, path, width = 1024) {
    const original = origin + '/storage/v1/object/public/' + bucket + '/' + path;
    if (!path || !buckets.has(bucket) || failed.has(original) || failures >= 3) return original;
    try {
      const url = new URL(original);
      // Do not transform tokenized URLs or already customized requests.
      if (url.search || url.hash) return original;
      url.pathname = url.pathname.replace('/object/public/', '/render/image/public/');
      url.searchParams.set('width', String([480, 1024].includes(width) ? width : 1024));
      url.searchParams.set('quality', '85');
      url.searchParams.set('resize', 'contain');
      const optimized = url.href;
      originals.set(optimized, original);
      return optimized;
    } catch (_) {
      return original;
    }
  }

  document.addEventListener('error', function (event) {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const original = originals.get(image.currentSrc || image.src);
    if (!original) return;
    failed.add(original);
    failures += 1;
    // Retry only once; never loop on missing originals.
    image.removeAttribute('srcset');
    image.src = original;
  }, true);

  async function compress(file) {
    if (!window.createImageBitmap || file.size < 262144 || file.size > 2097152) return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24000000) return file;
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      // Keep MIME and extension consistent, including PNG transparency.
      const blob = await new Promise(resolve => canvas.toBlob(resolve, file.type, 0.88));
      return blob && blob.type === file.type && blob.size < file.size ? blob : file;
    } catch (_) {
      return file;
    } finally {
      if (bitmap) bitmap.close();
    }
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    // Only new public image uploads. Auth, private documents, reads and upserts
    // use the untouched fetch path. No retry of an upload after network errors.
    if ((typeof input !== 'string' && !(input instanceof URL)) || !init ||
        !(init.body instanceof Blob) || String(init.method || '').toUpperCase() !== 'POST') {
      return nativeFetch(input, init);
    }
    let url;
    try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href); }
    catch (_) { return nativeFetch(input, init); }
    const match = url.pathname.match(/^\/storage\/v1\/object\/(product-images|shipping-planning-images)\/(.+)$/);
    const headers = new Headers(init.headers);
    const immutable = match && /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(match[2]);
    if (url.origin !== origin || !immutable || headers.get('x-upsert') === 'true' ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(init.body.type)) {
      return nativeFetch(input, init);
    }
    const body = await compress(init.body);
    if (!headers.has('cache-control')) headers.set('cache-control', 'max-age=31536000');
    return nativeFetch(input, Object.assign({}, init, { headers, body }));
  };

  window.HarmonyMedia = Object.freeze({
    publicImage,
    productUrl: (path, width) => publicImage('product-images', path, width),
    shippingUrl: (path, width) => publicImage('shipping-planning-images', path, width)
  });
})();
