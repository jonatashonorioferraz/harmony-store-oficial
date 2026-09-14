import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../bills.js', import.meta.url), 'utf8');
const start = source.indexOf('async function openDocument(path)');
const end = source.indexOf('\nfunction addNavigation', start);
assert.ok(start >= 0 && end > start, 'Document opener must be isolated');
const opener = source.slice(start, end);

function harness({ blocked = false, status = 200, fetchError, closeDuringFetch = false, navigationError = false } = {}) {
  const events = [], alerts = [], timers = [];
  const popup = {
    opener: {}, closed: false, document: { title: '', body: {} },
    location: { replace(url) { events.push(['navigate', url]); if (navigationError) throw Error('navigation failed'); } },
    close() { this.closed = true; events.push(['close']); }
  };
  const context = vm.createContext({
    window: { open(...args) { events.push(['open', ...args]); return blocked ? null : popup; } },
    storageFetch: async path => {
      events.push(['fetch', path, popup.opener]);
      if (closeDuringFetch) popup.closed = true;
      if (fetchError) throw Error('sensitive network details');
      return { ok: status === 200, status, blob: async () => ({ type: 'application/pdf' }) };
    },
    encodedStoragePath: path => path.split('/').map(encodeURIComponent).join('/'),
    URL: {
      createObjectURL() { events.push(['create']); return 'blob:private-document'; },
      revokeObjectURL(url) { events.push(['revoke', url]); }
    },
    setTimeout(fn, delay) { timers.push({ fn, delay }); },
    alert(message) { alerts.push(message); }
  });
  vm.runInContext(opener, context);
  return { open: path => context.openDocument(path), events, alerts, timers, popup };
}

test('reserves the tab synchronously and disconnects opener before authenticated fetch', async () => {
  const h = harness();
  const pending = h.open('owner/document x.pdf');
  assert.deepEqual(h.events[0], ['open', 'about:blank', '_blank']);
  assert.deepEqual(h.events[1], ['fetch', '/storage/v1/object/authenticated/bill-documents/owner/document%20x.pdf', null]);
  await pending;
  assert.ok(h.events.some(e => e[0] === 'navigate' && e[1] === 'blob:private-document'));
  assert.equal(h.alerts.length, 0);
  assert.equal(h.timers[0].delay, 60000);
  h.timers[0].fn();
  assert.deepEqual(h.events.at(-1), ['revoke', 'blob:private-document']);
});

test('blocked tabs do not download private bytes', async () => {
  const h = harness({ blocked: true });
  await h.open('owner/document.pdf');
  assert.equal(h.events.length, 1);
  assert.equal(h.alerts.length, 1);
  assert.equal(h.timers.length, 0);
});

test('HTTP errors close the waiting tab and report only the status', async () => {
  const h = harness({ status: 403 });
  await h.open('owner/document.pdf');
  assert.equal(h.popup.closed, true);
  assert.match(h.alerts[0], /HTTP 403/);
  assert.equal(h.events.some(e => e[0] === 'create'), false);
});

test('network errors close the waiting tab without exposing internal details', async () => {
  const h = harness({ fetchError: true });
  await h.open('owner/document.pdf');
  assert.equal(h.popup.closed, true);
  assert.equal(h.alerts.length, 1);
  assert.doesNotMatch(h.alerts[0], /sensitive/);
});

test('a tab closed during download does not receive a blob URL', async () => {
  const h = harness({ closeDuringFetch: true });
  await h.open('owner/document.pdf');
  assert.equal(h.events.some(e => e[0] === 'create'), false);
  assert.equal(h.alerts.length, 0);
});

test('navigation failures release the private blob URL', async () => {
  const h = harness({ navigationError: true });
  await h.open('owner/document.pdf');
  assert.ok(h.events.some(e => e[0] === 'revoke'));
  assert.equal(h.popup.closed, true);
  assert.equal(h.alerts.length, 1);
});

test('official web mirror includes exactly the same opener', () => {
  const mirror = readFileSync(new URL('../web/bills.js', import.meta.url), 'utf8');
  assert.ok(mirror.includes(opener));
});
