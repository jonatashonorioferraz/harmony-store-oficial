import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import postcss from 'postcss';
import {htmlAssets,workerAssets} from '../scripts/lib/release-assets.mjs';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const source=await read('admin-studio.js'),css=await read('admin-studio.css');
function harness(profile={id:'test-admin',role:'admin',status:'active'}){
  const attributes=new Map(),observers=[];let shell=true,resolvePage;
  const S={profile,view:'requests'};
  const root={toggleAttribute(name,enabled){if(enabled)attributes.set(name,'');else attributes.delete(name)},removeAttribute(name){attributes.delete(name)}};
  const context=vm.createContext({S,window:{},document:{documentElement:root,querySelector:selector=>selector==='#app > .shell'&&shell?{}:null,getElementById:()=>({})},MutationObserver:class{constructor(callback){observers.push(callback)}observe(){}},queueMicrotask,renderApp(){},renderPage:()=>new Promise(resolve=>{resolvePage=resolve}),Date,Intl,console});
  vm.runInContext(source,context);
  return{context,S,attributes,api:context.window.HarmonyAdminStudio,notify:async()=>{observers.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve))},setShell:value=>{shell=value},finishPage:()=>resolvePage()};
}
test('theme enables only active ADM shells, not collaborators, receivers, login or password gate',()=>{
  for(const profile of [{id:'a',role:'admin',status:'active'},{id:'b',role:'admin',status:'active',is_primary_admin:false},{role:'admin',status:'inactive'},{role:'admin',status:'active',must_change_password:true},{role:'collaborator',status:'active'},{role:'receiver',status:'active'},null]){
    const h=harness(profile);assert.equal(h.attributes.has('data-admin-studio'),profile?.role==='admin'&&profile.status==='active'&&!profile.must_change_password);
    h.setShell(false);h.api.sync();assert.equal(h.attributes.has('data-admin-studio'),false);
  }
});
test('switching from ADM to collaborator or signing out removes marker synchronously',()=>{
  for(const profile of [{role:'collaborator',status:'active'},null]){
    const h=harness();h.S.profile=profile;h.context.renderApp();assert.equal(h.attributes.has('data-admin-studio'),false);
  }
});
test('DOM replacement removes admin presentation even without a renderApp call',async()=>{
  const h=harness();h.setShell(false);await h.notify();assert.equal(h.attributes.has('data-admin-studio'),false);
});
test('a late previous-session render cannot re-enable the admin theme',async()=>{
  const h=harness(),pending=h.context.renderPage();h.S.profile={id:'next',role:'collaborator',status:'active'};h.context.renderApp();h.finishPage();await pending;assert.equal(h.attributes.has('data-admin-studio'),false);
});
test('oldest follows creation time, not protocol, with stable ties across request categories',()=>{
  const h=harness(),now=Date.parse('2026-10-09T12:00:00Z');
  const rows=[{id:'b',kind:'production',protocol:1,status:'pending',created_at:'2026-10-08T12:00:00Z'},{id:'a',kind:'internal',protocol:99,status:'scheduled',created_at:'2026-10-05T12:00:00Z'},{id:'c',kind:'production',status:'delivered',created_at:'2026-10-01T12:00:00Z'},{id:'d',kind:'production',status:'separating',created_at:'2026-10-08T12:00:00Z'}];
  const result=h.api.snapshot(rows,now);assert.equal(result.total,3);assert.equal(result.oldest.id,'a');assert.equal(result.days,4);assert.equal(result.pending,1);assert.equal(result.separating,1);assert.equal(result.scheduled,1);assert.equal(rows[0].id,'b');
  assert.equal(h.api.snapshot([...rows].reverse(),now).oldest.id,'a');
});
test('missing, invalid and future dates never become an invented oldest request',()=>{
  const h=harness(),now=Date.parse('2026-10-09T12:00:00Z');
  for(const value of [undefined,null,'','bad date','2027-10-09T12:00:00Z']){
    const result=h.api.snapshot([{id:'test',status:'pending',created_at:value}],now);assert.equal(result.total,1);assert.equal(result.oldest,null);assert.equal(result.days,null);
  }
  assert.equal(h.api.snapshot([],now).total,0);
});
test('every style selector is ADM-scoped and screen-only; print and all other roles retain their CSS',()=>{
  const parsed=postcss.parse(css);let count=0;
  parsed.walkRules(rule=>{
    if(rule.parent.type==='atrule'&&rule.parent.name==='keyframes')return;
    assert.ok(rule.selector.startsWith('html[data-role="admin"][data-admin-studio]'),rule.selector);
    // Selector lists are expressed with :is(), never an unguarded comma branch.
    let depth=0;for(const character of rule.selector){if(character==='(')depth++;if(character===')')depth--;if(character===','&&depth===0)assert.fail('Unguarded selector list: '+rule.selector)}
    let screen=false;for(let parent=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule'&&parent.name==='media'&&parent.params==='screen')screen=true;
    assert.ok(screen,rule.selector);count++;
  });
  assert.ok(count>100);assert.match(css,/prefers-reduced-motion:no-preference/);assert.match(css,/max-width:720px/);assert.match(css,/focus-visible/);
});
test('home additions are read-only, use actual queue states and keep existing navigation and free choice',()=>{
  assert.doesNotMatch(source,/\bfetch\s*\(|apiFetch|restAll|localStorage|sessionStorage|setInterval|access_token/);
  assert.match(source,/state\.items/);assert.match(source,/!state\.loading&&!state\.error/);assert.match(source,/focusOldest/);assert.match(source,/data-hub-filter="all"/);assert.match(source,/sort\.dispatchEvent/);assert.match(source,/Dados ainda n&atilde;o confirmados/);assert.match(source,/n&atilde;o de unidades produzidas/);
});
test('new assets are mirrored, offline-ready and loaded after existing UI modules without version regressions',async()=>{
  const html=await read('index.html'),worker=await read('service-worker.js');
  for(const name of ['admin-studio.css','admin-studio.js']){
    assert.equal(await read('web/'+name),await read(name));assert.equal(htmlAssets(html).get(name).version,workerAssets(worker).get(name).version);
  }
  assert.ok(html.indexOf('admin-studio.js')>html.indexOf('harmony-icons.js'));
  assert.ok(html.indexOf('admin-studio.css')>html.indexOf('financial-contracts.css'));
  assert.match(worker,/admin-studio-sora\.ttf/);
  assert.deepEqual(await readFile(new URL('../admin-studio-sora.ttf',import.meta.url)),await readFile(new URL('../web/admin-studio-sora.ttf',import.meta.url)));
});
