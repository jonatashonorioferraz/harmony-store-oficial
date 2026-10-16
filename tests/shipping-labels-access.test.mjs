import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const [parent, child, controller, core, html] = await Promise.all([
  read('shipping-labels.js'), read('shipping-labels/access.js'),
  read('shipping-labels/app.js'), read('app.js'), read('shipping-labels/index.html'),
]);

function element() {
  return { style: {}, children: [], events: {}, isConnected: true,
    addEventListener(type, fn) { this.events[type] = fn; },
    setAttribute(key, value) { this[key] = value; },
    removeAttribute(key) { delete this[key]; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    remove() { this.isConnected = false; },
    classList: { toggle() {} },
  };
}
function parentEnvironment() {
  const page = element(), host = element(), loading = element(), events = {}, observers = [], timers = [];
  page.querySelector = () => loading;
  const S = { session: {}, profile: {role: 'admin', status: 'active'}, view: 'shipping-labels' };
  let disposed = 0, renders = 0;
  const context = vm.createContext({
    S, sessionDocumentClosed: false, location: {origin: 'https://example.test'},
    document: {body: element(), querySelector: id => id === '#page' ? page : host,
      createElement: () => ({...element(), contentWindow: {HarmonyLabelsGuide:{},HarmonyConverterLifecycle: {dispose() { disposed++; }}}})},
    head: () => '', renderApp: () => { renders++; },
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
    addEventListener: (type, fn) => { events[type] = fn; },
    setTimeout: fn => {timers.push(fn);return timers.length;}, clearTimeout() {},
  });
  context.window = context;
  vm.runInContext(parent, context);
  return {context, S, page, host, loading, timers, events, observers, api: context.HarmonyShippingLabels,
    disposed: () => disposed, renders: () => renders};
}

test('only active signed-in ADMs can open the converter', () => {
  const env = parentEnvironment();
  assert.equal(env.api.canUse(), true);
  for (const role of ['receiver', 'worker', 'collaborator']) {
    env.S.profile.role = role; env.S.profile.is_ecommerce_manager = true;
    assert.equal(env.api.canUse(), false);
    env.api.render(); assert.equal(env.host.children.length, 0);
    assert.equal(env.S.view, 'home');
  }
  env.S.profile.role = 'admin';
  env.S.profile.status = 'inactive'; assert.equal(env.api.canUse(), false);
  env.S.profile.status = 'active'; env.S.profile.must_change_password = true;
  assert.equal(env.api.canUse(), false);
  env.S.profile.must_change_password = false; env.context.sessionDocumentClosed = true;
  assert.equal(env.api.canUse(), false);
  env.context.sessionDocumentClosed = false; env.S.session = null;
  assert.equal(env.api.canUse(), false);
});

test('the frame accepts only its own layout messages and disposes on navigation', () => {
  const env = parentEnvironment(); env.api.render();
  const frame = env.host.children[0];
  assert.match(frame.src, /^shipping-labels\/index\.html\?v=/);
  assert.equal(frame.referrerpolicy, 'no-referrer');
  const event = {source: frame.contentWindow, origin: 'https://example.test',
    data: {type: 'harmony-labels:height', height: 900}};
  env.events.message({...event, source: {}}); assert.equal(frame.style.height, undefined);
  env.events.message({...event, origin: 'https://other.test'}); assert.equal(frame.style.height, undefined);
  env.events.message(event); assert.equal(frame.style.height, '908px');
  env.events.message({...event, data: {...event.data, height: Infinity}});
  assert.equal(frame.style.height, '908px');
  env.S.view = 'home'; env.observers[0]();
  assert.equal(env.disposed(), 1); assert.equal(frame.isConnected, false);
  env.api.reset(); assert.equal(env.disposed(), 1);
});

test('native menu keeps lots separate and clears the tool on session teardown', () => {
  const render = core.match(/function renderApp\(\)\{[\s\S]*?(?=\nfunction )/)[0];
  for (const [role, status, expected] of [['admin','active',true],['admin','inactive',false],['receiver','active',false]]) {
    const nodes = {'#app': element(), '#logout': element()};
    const context = vm.createContext({ S: {profile: {role,status,full_name: 'Teste'}},
      window: {}, sessionDocumentClosed: false, $: id => nodes[id],
      initials: () => '', esc: x => x, nav: (id, icon, label) => `<button data-view="${id}">${label}</button>`,
      document: {querySelectorAll: () => []}, logout() {}, renderPage() {} });
    vm.runInContext(render + ';renderApp()', context);
    assert.equal(nodes['#app'].innerHTML.includes('data-view="shipping-labels"'), expected);
    assert.ok(nodes['#app'].innerHTML.includes('data-view="label-lots"'));
  }
  assert.match(core, /function clearLocalSession\([^]*?HarmonyShippingLabels\?\.reset\?\.\(\)/);
});

test('a late frame load cannot remove the newly opened converter', () => {
  const env = parentEnvironment(); env.api.render();
  const previous = env.host.children[0]; env.api.render();
  const current = env.host.children[1];
  previous.events.load();
  assert.equal(current.isConnected, true);
  assert.equal(env.disposed(), 1);
  current.events.load();
  env.api.reset(); assert.equal(env.disposed(), 2);
});

test('incomplete initialization stays hidden and offers a scoped retry',()=>{
  const env=parentEnvironment();env.api.render();
  const frame=env.host.children[0];
  assert.equal(frame.style.visibility,'hidden');
  delete frame.contentWindow.HarmonyLabelsGuide;
  frame.events.load();
  assert.equal(frame.style.visibility,'hidden');assert.equal(env.loading.hidden,false);
  const retry=env.loading.children.at(-1);assert.equal(retry.textContent,'Tentar novamente');
  retry.events.click();const next=env.host.children[1];
  assert.equal(frame.isConnected,false);assert.equal(next.style.visibility,'hidden');
  env.timers[0]();assert.equal(next.style.visibility,'hidden','Old timer cannot reveal the new frame');
  next.events.load();assert.equal(next.style.visibility,'visible');assert.equal(env.loading.hidden,true);
});

test('a slow load can recover without recreating the converter or losing files',()=>{
  const env=parentEnvironment();env.api.render();const frame=env.host.children[0];
  const lifecycle=frame.contentWindow.HarmonyConverterLifecycle;
  delete frame.contentWindow.HarmonyConverterLifecycle;env.timers[0]();
  assert.match(env.loading.textContent,/demorando/);assert.equal(frame.style.visibility,'hidden');
  frame.contentWindow.HarmonyConverterLifecycle=lifecycle;frame.events.load();
  assert.equal(frame.style.visibility,'visible');assert.equal(env.disposed(),0);
});

test('long pending batches use the outer page scroll and reject invalid heights',()=>{
  const env=parentEnvironment();env.api.render();const frame=env.host.children[0];
  const send=height=>env.events.message({source:frame.contentWindow,origin:'https://example.test',data:{type:'harmony-labels:height',height}});
  send(12000);assert.equal(frame.style.height,'12008px');
  for(const height of [-10,0,NaN,Infinity]){send(height);assert.equal(frame.style.height,'12008px');}
});

test('direct URLs and revoked admin access clear the child before use', () => {
  for (const mode of ['direct', 'other-origin', 'no-admin', 'admin']) {
    const body = element(), events = {}, timers = [];
    let allowed = mode === 'admin', disposed = 0;
    const context = vm.createContext({document: {body, createElement: element},
      location: {origin: 'https://example.test'}, addEventListener: (t, fn) => {events[t] = fn;},
      setInterval: fn => {timers.push(fn); return 1;}, clearInterval() {},
      HarmonyConverterLifecycle: {dispose() {disposed++;}}});
    context.window = context;
    context.parent = mode === 'direct' ? context : {
      location: {origin: mode === 'other-origin' ? 'https://other.test' : 'https://example.test'},
      HarmonyShippingLabels: {canUse: () => allowed}, postMessage() {},
    };
    vm.runInContext(child, context);
    assert.equal(context.HarmonyConverterAccess.allowed(), mode === 'admin');
    if (mode === 'admin') { allowed = false; timers[0](); }
    assert.equal(disposed, 1);
    assert.match(body.children[0].children[0].textContent, /conta ADM/);
  }
});

test('closing the converter during a pending file read cannot restore private results', async () => {
  const nodes = new Map();
  const get = id => {if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id);};
  get('document-mode').value = 'picking'; get('dpi').value = '203'; get('size').value = '100x150';
  let finish, published = 0;
  const pending = new Promise(resolve => {finish = resolve;});
  const context = vm.createContext({document: {getElementById: get, createElement: element},
    HarmonyConverterAccess: {allowed: () => true}, addEventListener() {},
    CompressionStream, DecompressionStream, URL: {createObjectURL() {published++;}, revokeObjectURL() {}},
    LocalZpl: {parseZpl() {throw Error('No parsing after disposal');}}});
  context.window = context; vm.runInContext(controller, context);
  get('files').events.change({target: {files: [{name: 'synthetic.zpl', size: 10, text: () => pending}]}});
  const conversion = get('check').onclick();
  context.HarmonyConverterLifecycle.dispose(); context.HarmonyConverterLifecycle.dispose();
  context.document.getElementById = () => null;
  finish('^XA^XZ'); await conversion;
  assert.equal(published, 0);
});

test('converter packages only local assets and restricts OCR resources to same-origin assets', async () => {
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
  for (const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"]*)?"/g)) {
    if (match[1].startsWith('../')) continue;
    const relative = 'shipping-labels/' + match[1];
    const [source, built] = await Promise.all([read(relative), read('dist/client/' + relative)]);
    assert.equal(source, built);
  }
  for (const file of await readdir(new URL('../shipping-labels/', import.meta.url))) {
    assert.doesNotMatch(file, /\.(pdf|zip|zpl)$/i);
  }
  for (const name of ['engine.js','invoices.js','picking.js','batch-review.js','app.js']) {
    assert.doesNotMatch(await read('shipping-labels/' + name), /\b(?:localStorage|sessionStorage|indexedDB|XMLHttpRequest|sendBeacon)\b/);
  }
});
