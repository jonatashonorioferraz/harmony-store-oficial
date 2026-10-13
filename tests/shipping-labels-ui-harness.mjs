import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

class Events {
  listeners = new Map();
  addEventListener(name, listener, options = {}) {
    if (options.signal?.aborted) return;
    const entry = {listener, once: options.once};
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(entry);
    options.signal?.addEventListener('abort', () => this.removeEventListener(name, listener), {once:true});
  }
  removeEventListener(name, listener) { this.listeners.set(name, (this.listeners.get(name) || []).filter(e => e.listener !== listener)); }
  dispatchEvent(event) {
    event.target ||= this;
    for (const entry of [...(this.listeners.get(event.type) || [])]) {
      entry.listener.call(this, event);
      if (entry.once) this.removeEventListener(event.type, entry.listener);
    }
    return !event.defaultPrevented;
  }
}
class Event {
  constructor(type, fields = {}) { this.type = type; Object.assign(this, fields); }
  preventDefault() { this.defaultPrevented = true; }
}
class AbortController {
  signal = new Events();
  abort() { this.signal.aborted = true; this.signal.dispatchEvent(new Event('abort')); }
}
class Element extends Events {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc;
    this.children = []; this.attributes = new Map(); this.dataset = {}; this.style = {};
    this.className = ''; this.id = ''; this.hidden = false; this.disabled = false; this.value = '';
    this.scrollTop = 0; this.scrollLeft = 0; this.clientWidth = 500; this.clientHeight = 500;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(n => !names.includes(n)).join(' '); },
      toggle: (name, force) => { const value = force ?? !this.classList.contains(name); if (value) this.classList.add(name); else this.classList.remove(name); return value; },
    };
  }
  get isConnected() { return this === this.ownerDocument.body || Boolean(this.parentNode?.isConnected); }
  get scrollWidth() { return Math.max(this.clientWidth, ...this.children.map(e => (parseFloat(e.style.width) || 0) + 32)); }
  get textContent() { return this.children.length ? this.children.map(e => e.textContent).join('') : this._text || ''; }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  append(...nodes) { for (const n of nodes) { n.remove(); n.parentNode = this; this.children.push(n); } }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; }
  before(...nodes) { this.insert(nodes, 0); }
  after(...nodes) { this.insert(nodes, 1); }
  insert(nodes, after) { const parent = this.parentNode; for (const n of nodes) n.remove(); const i = parent.children.indexOf(this) + after; for (const n of nodes) n.parentNode = parent; parent.children.splice(i, 0, ...nodes); }
  replaceChildren(...nodes) { for (const n of this.children) n.parentNode = null; this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); if (name === 'class') this.className = String(value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  matches(selector) { if (selector[0] === '#') return this.id === selector.slice(1); if (selector[0] === '.') return this.classList.contains(selector.slice(1)); return this.tagName.toLowerCase() === selector; }
  querySelectorAll(selector) { const found = []; for (const child of this.children) { if (child.matches(selector)) found.push(child); found.push(...child.querySelectorAll(selector)); } return found; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  click() { if (this.disabled) return; this.clicks = (this.clicks || 0) + 1; const e = new Event('click'); this.dispatchEvent(e); this.onclick?.(e); }
  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() { this.scrolled = true; }
  setCustomValidity(text) { this.validationMessage = text; }
  reportValidity() { this.validityReported = true; return !this.validationMessage; }
}

export async function harness({authorized = true, previewTools = true} = {}) {
  const document = {activeElement:null};
  document.createElement = tag => new Element(tag, document);
  document.body = document.createElement('body');
  document.querySelector = selector => document.body.querySelector(selector);
  document.getElementById = id => document.querySelector('#' + id);
  const add = (parent, tag, id = '', className = '') => { const el = document.createElement(tag); el.id = id; el.className = className; parent.append(el); return el; };
  const layout = add(document.body, 'div', '', 'layout');
  const upload = add(layout, 'section', '', 'panel');
  for (const id of ['upload-title','files','invoice-files','file-list','invoice-list','convert']) add(upload, id.includes('files') ? 'input' : 'div', id);
  const result = add(layout, 'aside', '', 'panel result');
  add(result, 'h2', 'result-title');
  const body = add(result, 'div', '', 'result-body');
  const stage = add(body, 'div', 'preview', 'preview');
  add(body, 'p', 'preview-caption');
  const navigation = add(body, 'div', 'navigation'); navigation.hidden = true;
  const actions = add(body, 'div', 'actions'); actions.hidden = true;
  const download = add(actions, 'a', 'download'); download.download = 'etiquetas.pdf';
  const resolution = add(document.body, 'section', 'resolution-panel'); resolution.hidden = true;
  add(resolution, 'div', 'resolution-items');
  const pairing = add(document.body, 'section', 'pairing-report'); pairing.hidden = true;
  add(pairing, 'tbody', 'pairing-rows');
  const window = new Events();
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.connected = true; observers.push(this); }
    observe() {}
    disconnect() { this.connected = false; }
  }
  let id = 0; const frames = new Map();
  const context = vm.createContext({window, document, CustomEvent:Event, Event, AbortController,
    MutationObserver:Observer, ResizeObserver:Observer, Intl, console,
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; }, cancelAnimationFrame: n => frames.delete(n),
    fetch() { throw Error('Network forbidden'); },
    localStorage: {setItem(){throw Error('Persistence forbidden');},getItem(){throw Error('Persistence forbidden');}},
    authorized, previewCalls: [], initial: {labels:[], invoices:[], sequence:[]},
  });
  vm.runInContext(`const $=id=>document.getElementById(id); let selected=[],invoiceFiles=[],sequence=[],page=0,pdfReader=null,busy=false,disposed=false; globalThis.HarmonyConverterAccess={allowed:()=>authorized}; function preview(){previewCalls.push(page);}`, context);
  const app = await readFile(new URL('../shipping-labels/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('// Read-only session metadata for the local workspace UI.');
  const end = app.indexOf("$('previous').onclick", start);
  if (start < 0 || end < 0) throw Error('Workspace controller bridge missing');
  vm.runInContext(app.slice(start, end), context);
  if (previewTools) vm.runInContext(await readFile(new URL('../shipping-labels/preview-tools.js', import.meta.url), 'utf8'), context);
  vm.runInContext(await readFile(new URL('../shipping-labels/workspace-tools.js', import.meta.url), 'utf8'), context);
  function flush() { for (const observer of observers) if (observer.connected) observer.callback(); const queued = [...frames.values()]; frames.clear(); for (const callback of queued) callback(); }
  function set({labels = [], invoices = [], sequence = [], partial = false, busy = false} = {}) {
    context.initial = {labels, invoices, sequence, busy};
    vm.runInContext('selected=initial.labels;invoiceFiles=initial.invoices;sequence=initial.sequence;busy=initial.busy;pdfReader=sequence.length?{}:null;page=0;', context);
    navigation.hidden = !sequence.length; actions.hidden = !sequence.length;
    download.download = partial ? 'etiquetas-PARCIAL-1-de-2.pdf' : 'etiquetas.pdf';
    window.dispatchEvent(new Event('harmony-labels:workspace-request'));
    flush();
  }
  const input = (node, value) => { node.value = value; node.dispatchEvent(new Event('input')); };
  const query = selector => document.querySelector(selector);
  const queryAll = selector => document.body.querySelectorAll(selector);
  const clickText = text => { const button = queryAll('button').find(b => b.textContent === text); if (!button) throw Error('Button missing: ' + text); button.click(); };
  return {context,document,window,stage,add,set,flush,input,query,queryAll,clickText,Event};
}
