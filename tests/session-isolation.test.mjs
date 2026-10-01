import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const files=Object.fromEntries(await Promise.all(['app.js','production-receipts.js','production-orders.js','notifications.js','pwa.js'].map(async name=>[name,await readFile(new URL('../'+name,import.meta.url),'utf8')])));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const session=id=>({user:{id,email:id+'@example.test'},access_token:'access-'+id,refresh_token:'refresh-'+id,expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600});
const settle=()=>new Promise(resolve=>setImmediate(resolve));

// Minimal DOM doubles retain node identity so the real teardown and late callbacks can be exercised.
function environment(){
  const observers=[],events=new Map(),storage=new Map(),removedClasses=[],createdUrls=[];
  let body;
  const node=()=>({innerHTML:'',dataset:{},childNodes:[],querySelector(selector){return selector==='button'?(this.button??={onclick:null}):null},querySelectorAll:()=>[],remove(){body.childNodes=body.childNodes.filter(item=>item!==this)},replaceChildren(...nodes){this.childNodes=nodes},appendChild(child){this.childNodes.push(child)}});
  body=node();const app=node(),modal=node(),toast=node(),print=node();body.childNodes=[app,modal,toast,print];
  const document={body,documentElement:{dataset:{role:'admin'},classList:{add(){},remove:value=>removedClasses.push(value)}},querySelector:selector=>body.childNodes.includes(app)?({'#app':app,'#modal':modal,'#toast':toast}[selector]||null):null,querySelectorAll:()=>[],createElement:node,addEventListener(){},visibilityState:'visible'};
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  const location={search:'',reload(){throw Error('synthetic navigation failure')}};
  const window={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener(){},print(){}};
  const context=vm.createContext({window,document,localStorage,location,URLSearchParams,URL:{createObjectURL:blob=>{createdUrls.push(blob);return'blob:synthetic'},revokeObjectURL(){}},MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this)}observe(){}},AbortController,setTimeout,clearTimeout,setInterval(){},requestAnimationFrame:fn=>fn(),fetch:()=>{throw Error('unexpected external request')},console,alert(){},atob:value=>Buffer.from(value,'base64').toString('binary')});
  const run=source=>vm.runInContext(source,context);
  // Exclude only the automatic startup call; all functions are evaluated from the shipped source.
  run(files['app.js'].slice(0,files['app.js'].lastIndexOf("$('#app').innerHTML='<div class=\"loading\"")));
  const S=run('S');
  const authenticate=(id='admin-a',role='admin')=>{S.session=session(id);S.profile={id,role,status:'active',full_name:'Pessoa sintética'};localStorage.setItem('harmony.session',JSON.stringify(S.session))};
  return{context,run,S,window,document,localStorage,events,observers,removedClasses,createdUrls,authenticate,app,modal,print};
}

for(const [file,key] of [['production-receipts.js','HarmonyProduction'],['production-orders.js','HarmonyProductionOrders'],['notifications.js','HarmonyNotifications']]){
  test(file+': cached admin content is not reused by another account',async()=>{
    const env=environment();env.authenticate();let calls=0;
    env.context.rpc=async()=>{calls++;return[{id:'private-admin-row',worker_id:'admin-a',quantity:1}]};
    env.run(files[file]);const api=env.window[key];await api.load();const previous=calls;
    env.authenticate('worker-b','collaborator');env.context.rpc=async()=>{calls++;return[]};
    await api.load();assert.ok(calls>previous);assert.equal(api.state.ownerId,'worker-b');
    assert.equal(JSON.stringify(api.state).includes('private-admin-row'),false);
  });
  for(const id of ['admin-b','admin-a'])test(file+': old response and finally cannot replace a new request ('+id+')',async()=>{
    const env=environment();env.authenticate();const old=deferred(),next=deferred();
    env.context.rpc=()=>old.promise;env.run(files[file]);const api=env.window[key],oldLoad=api.load();
    api.reset();env.authenticate(id);env.context.rpc=()=>next.promise;const newLoad=api.load(),newLoading=api.state.loading;
    old.resolve([{id:'old-private-row',worker_id:'admin-a',quantity:1}]);await oldLoad;
    assert.equal(api.state.loading,newLoading);assert.equal(api.state.loaded,false);
    assert.equal(JSON.stringify(api.state).includes('old-private-row'),false);
    next.resolve([{id:'current-row',worker_id:id,quantity:1}]);await newLoad;
    assert.equal(api.state.loaded,true);assert.equal(api.state.loading,null);assert.match(JSON.stringify(api.state),/current-row/);
  });
}

test('logout clears private UI synchronously, uses captured credentials and blocks login when reload fails',async()=>{
  const env=environment();env.authenticate();env.modal.innerHTML='private modal';env.print.innerHTML='private print';
  env.window.HarmonyInternalSupplies={state:{receipts:[{amount:9876}]}}; // deliberately unreset legacy closure
  const revoke=deferred(),tokens=[],pushSessions=[];env.context.fetch=async(url,options)=>{tokens.push(options.headers.Authorization);return revoke.promise};
  env.context.cleanupPushSubscription=async value=>pushSessions.push(value);
  const logout=env.run('logout()');assert.equal(env.S.session,null);assert.equal(env.S.profile,null);
  assert.equal(env.localStorage.getItem('harmony.session'),null);assert.equal(env.document.querySelector('#modal'),null);
  assert.equal(env.document.body.childNodes.includes(env.print),false);assert.ok(env.removedClasses.includes('production-receipt-printing'));
  assert.match(env.document.body.childNodes[0].innerHTML,/Sessão encerrada/);assert.doesNotMatch(env.document.body.childNodes[0].innerHTML,/loginForm/);
  await assert.rejects(env.context.login('worker-b','synthetic-password'),{code:'SESSION_CHANGED'});
  revoke.resolve(response({}));await logout;assert.deepEqual(tokens,['Bearer access-admin-a']);assert.equal(pushSessions[0].user.id,'admin-a');
  env.context.renderLogin();assert.equal(env.document.body.childNodes.length,1);assert.match(env.document.body.childNodes[0].innerHTML,/Recarregar aplicativo/);
  const late=env.document.createElement('div');late.innerHTML='late private print';env.document.body.appendChild(late);
  env.observers.at(-1).fn();assert.equal(env.document.body.childNodes.includes(late),false);
});

test('an old refresh cannot restore a logged-out session',async()=>{
  const env=environment();env.authenticate();const pending=deferred();env.context.fetch=()=>pending.promise;
  const refresh=env.context.refreshSession();env.context.clearLocalSession();pending.resolve(response(session('admin-a')));
  await assert.rejects(refresh,{code:'SESSION_CHANGED'});assert.equal(env.S.session,null);assert.equal(env.localStorage.getItem('harmony.session'),null);
});

test('another tab changes account: old refresh preserves the new stored session',async()=>{
  const env=environment();env.authenticate();const pending=deferred();env.context.fetch=()=>pending.promise;const refresh=env.context.refreshSession();
  env.localStorage.setItem('harmony.session',JSON.stringify(session('worker-b')));
  env.events.get('storage')({key:'harmony.session',storageArea:env.localStorage});
  pending.resolve(response(session('admin-a')));await assert.rejects(refresh,{code:'SESSION_CHANGED'});
  assert.equal(JSON.parse(env.localStorage.getItem('harmony.session')).user.id,'worker-b');assert.equal(env.S.session,null);
});

test('storage ownership is checked even before the storage event is delivered',async()=>{
  const env=environment();env.authenticate();const pending=deferred();env.context.fetch=()=>pending.promise;const refresh=env.context.refreshSession();
  env.localStorage.setItem('harmony.session',JSON.stringify(session('worker-b')));pending.resolve(response(session('admin-a')));
  await assert.rejects(refresh,{code:'SESSION_CHANGED'});assert.equal(JSON.parse(env.localStorage.getItem('harmony.session')).user.id,'worker-b');assert.equal(env.S.session,null);
});

test('same-account token refresh in another tab keeps the document active',()=>{
  const env=environment();env.authenticate();env.localStorage.setItem('harmony.session',JSON.stringify({...session('admin-a'),access_token:'renewed'}));
  env.events.get('storage')({key:'harmony.session',storageArea:env.localStorage});assert.equal(env.S.profile.id,'admin-a');assert.notEqual(env.document.querySelector('#app'),null);
});

for(const call of ["rest('products?select=*')","storageFetch('/storage/v1/object/authenticated/profile-images/synthetic')","edge({action:'change-own-password'})"]){
  test(call+': a late 401 cannot refresh credentials after logout',async()=>{
    const env=environment();env.authenticate();const pending=deferred();let calls=0;env.context.fetch=()=>{calls++;return pending.promise};
    const request=env.run(call);await settle();env.context.clearLocalSession();pending.resolve(response({},401));
    await assert.rejects(request,{code:'SESSION_CHANGED'});assert.equal(calls,1);
  });
}

test('JSON decoding and avatar blobs that finish after logout are discarded',async()=>{
  for(const kind of ['json','blob']){
    const env=environment();env.authenticate();const body=deferred();env.context.fetch=async()=>({ok:true,status:200,json:()=>body.promise,blob:()=>body.promise});
    const pending=env.run(kind==='json'?"rest('profiles?select=*')":"privateProfilePhotoUrl({avatar_path:'private/avatar.jpg'})");
    await settle();env.context.clearLocalSession();body.resolve(kind==='json'?[{id:'private'}]:{});
    await assert.rejects(pending,{code:'SESSION_CHANGED'});assert.equal(env.createdUrls.length,0);
  }
});

test('pagination does not join pages from different sessions',async()=>{
  const env=environment();env.authenticate();let calls=0;
  env.context.rest=async()=>{calls++;env.context.clearLocalSession();return[{id:'private'}]};
  await assert.rejects(env.context.restAll('synthetic?select=*',{},1),{code:'SESSION_CHANGED'});assert.equal(calls,1);
});

test('overlapping password logins cannot replace the winning account',async()=>{
  const env=environment(),first=deferred(),second=deferred();let calls=0;
  env.context.fetch=async url=>{if(url.includes('grant_type=password'))return ++calls===1?first.promise:second.promise;return response([{id:'worker-b',status:'active',role:'collaborator',must_change_password:true}])};
  const a=env.context.login('admin-a','synthetic-a'),b=env.context.login('worker-b','synthetic-b');
  second.resolve(response(session('worker-b')));await b;first.resolve(response(session('admin-a')));
  await assert.rejects(a,{code:'SESSION_CHANGED'});assert.equal(env.S.profile.id,'worker-b');assert.equal(JSON.parse(env.localStorage.getItem('harmony.session')).user.id,'worker-b');
});

test('password reauthentication may renew only the current principal',async()=>{
  const env=environment();env.authenticate();env.context.fetch=async()=>response(session('worker-b'));
  await assert.rejects(env.context.passwordSignIn('synthetic'),{code:'SESSION_CHANGED'});assert.equal(env.S.session.user.id,'admin-a');
});

test('loadData stages results without restoring private arrays after logout',async()=>{
  const env=environment();env.authenticate();const team=deferred();env.context.restAll=async path=>path.startsWith('profiles?')?team.promise:[{id:'private'}];env.context.rpc=async()=>[];
  const pending=env.context.loadData();await settle();env.context.clearLocalSession();team.resolve([{id:'admin-a'}]);
  await assert.rejects(pending,{code:'SESSION_CHANGED'});for(const key of ['products','requests','team','categories','fields'])assert.equal(env.S[key].length,0);
});

test('notification detail finishing after reset cannot reopen a private modal',async()=>{
  const env=environment();env.authenticate('worker-a','collaborator');env.context.rpc=async()=>[{id:'notice-a',body:'private'}];env.run(files['notifications.js']);const api=env.window.HarmonyNotifications;await api.load();
  const pending=deferred();env.context.rpc=()=>pending.promise;
  // Invoke the real private detail handler through its source-scoped API for this behavioral regression.
  env.run(files['notifications.js'].replace('const HarmonyNotifications=','const DetailTest=').replace('state,load,reset,unread,','state,load,reset,openDetail,unread,').replace('window.HarmonyNotifications=HarmonyNotifications;','window.DetailTest=DetailTest;'));
  const detail=env.window.DetailTest;env.context.rpc=async()=>[{id:'notice-a',body:'private'}];await detail.load();env.context.rpc=()=>pending.promise;
  const open=detail.openDetail(detail.state.items[0]);detail.reset();env.authenticate('worker-b','collaborator');pending.resolve('2026-10-01T00:00:00Z');await open;assert.equal(env.modal.innerHTML,'');
});

test('push cleanup uses the captured account even when live S is empty',async()=>{
  const env=environment();let unsubscribed=false;env.context.currentPushSubscription=async()=>({endpoint:'https://push.example.test/synthetic',unsubscribe:async()=>{unsubscribed=true}});
  const start=files['pwa.js'].indexOf('async function cleanupPushSubscription('),end=files['pwa.js'].indexOf('\nasync function sendNotificationEvent',start);env.run(files['pwa.js'].slice(start,end));
  let authorization;env.context.fetch=async(url,options)=>{authorization=options.headers.Authorization;return response({})};await env.context.cleanupPushSubscription(session('admin-a'));
  assert.equal(authorization,'Bearer access-admin-a');assert.equal(unsubscribed,true);
});

test('a request started after another tab switches account fails before sending',async()=>{
  const env=environment();env.authenticate();env.localStorage.setItem('harmony.session',JSON.stringify(session('worker-b')));let calls=0;env.context.fetch=async()=>{calls++;return response([])};
  await assert.rejects(env.context.rest('products?select=*'),{code:'SESSION_CHANGED'});assert.equal(calls,0);assert.equal(env.S.session,null);assert.equal(JSON.parse(env.localStorage.getItem('harmony.session')).user.id,'worker-b');
});

test('a restored session cannot clear a different account after its request fails',async()=>{
  const env=environment();env.localStorage.setItem('harmony.session',JSON.stringify(session('admin-a')));const pending=deferred();env.context.fetch=()=>pending.promise;
  const restoring=env.context.restore();await settle();env.localStorage.setItem('harmony.session',JSON.stringify(session('worker-b')));env.events.get('storage')({key:'harmony.session'});pending.reject(Error('synthetic offline failure'));
  await assert.rejects(restoring,{code:'SESSION_CHANGED'});assert.equal(JSON.parse(env.localStorage.getItem('harmony.session')).user.id,'worker-b');
});

test('private bill blob finishing after logout closes its popup without displaying the document',async()=>{
  const env=environment();env.authenticate();const blob=deferred();let navigated=false,closed=false;
  env.window.open=()=>({document:{body:{}},location:{replace(){navigated=true}},close(){closed=true}});
  env.context.fetch=async()=>({ok:true,status:200,blob:()=>blob.promise});
  const bills=await readFile(new URL('../bills.js',import.meta.url),'utf8');env.run(bills.match(/^async function openDocument\(path\).*$/m)[0]);
  const pending=env.context.openDocument('synthetic/private.pdf');await settle();env.context.clearLocalSession();blob.resolve({});await pending;
  assert.equal(closed,true);assert.equal(navigated,false);assert.equal(env.createdUrls.length,0);
});

test('JSON helper does not swallow session invalidation while consuming a Storage body',async()=>{
  const env=environment();env.authenticate();const body=deferred();env.context.fetch=async()=>({ok:true,status:200,json:()=>body.promise});
  const result=await env.context.storageFetch('/storage/v1/object/profile-images/synthetic');const pending=env.context.json(result);env.context.clearLocalSession();body.resolve({id:'private'});
  await assert.rejects(pending,{code:'SESSION_CHANGED'});
});

test('a queued browser print is cancelled when logout clears the document',async()=>{
  const env=environment();env.authenticate();const frames=[];let prints=0;env.context.requestAnimationFrame=fn=>frames.push(fn);env.window.print=()=>prints++;
  const pending=env.window.HarmonyPrint.printCurrentDocument('production-receipt-printing');env.context.clearLocalSession();frames.shift()();frames.shift()();
  await assert.rejects(pending,{code:'SESSION_CHANGED'});assert.equal(prints,0);
});

test('logout before a cross-tab storage event preserves the new account and revokes only the old credentials',async()=>{
  const env=environment();env.authenticate();env.localStorage.setItem('harmony.session',JSON.stringify(session('worker-b')));
  const revoke=deferred(),tokens=[],pushSessions=[];
  env.context.fetch=async(url,options)=>{tokens.push(options.headers.Authorization);return revoke.promise};
  env.context.cleanupPushSubscription=async value=>pushSessions.push(value);
  const pending=env.context.logout();assert.equal(env.S.session,null);assert.equal(JSON.parse(env.localStorage.getItem('harmony.session')).user.id,'worker-b');
  revoke.resolve(response({}));await pending;assert.deepEqual(tokens,['Bearer access-admin-a']);assert.equal(pushSessions[0].user.id,'admin-a');
  assert.equal(JSON.parse(env.localStorage.getItem('harmony.session')).user.id,'worker-b');
  env.events.get('storage')({key:'harmony.session',storageArea:env.localStorage});
  assert.equal(JSON.parse(env.localStorage.getItem('harmony.session')).user.id,'worker-b');
  await assert.rejects(env.context.login('worker-b','synthetic'),{code:'SESSION_CHANGED'});
});

test('push cleanup does not unsubscribe a browser endpoint reassigned while the old account RPC is pending',async()=>{
  const env=environment(),pending=deferred();let unsubscribed=false,authorization;
  env.context.currentPushSubscription=async()=>({endpoint:'https://push.example.test/shared',unsubscribe:async()=>{unsubscribed=true}});
  const start=files['pwa.js'].indexOf('async function cleanupPushSubscription('),end=files['pwa.js'].indexOf('\nasync function sendNotificationEvent',start);env.run(files['pwa.js'].slice(start,end));
  env.context.fetch=async(url,options)=>{authorization=options.headers.Authorization;return pending.promise};
  const cleanup=env.context.cleanupPushSubscription(session('admin-a'));await settle();
  env.localStorage.setItem('harmony.session',JSON.stringify(session('worker-b')));pending.resolve(response({}));await cleanup;
  assert.equal(authorization,'Bearer access-admin-a');assert.equal(unsubscribed,false);assert.equal(JSON.parse(env.localStorage.getItem('harmony.session')).user.id,'worker-b');
});

test('push cleanup leaves an already active different account subscription intact even if removal fails',async()=>{
  const env=environment();env.authenticate('worker-b','collaborator');let unsubscribed=false;
  env.context.currentPushSubscription=async()=>({endpoint:'https://push.example.test/shared',unsubscribe:async()=>{unsubscribed=true}});
  const start=files['pwa.js'].indexOf('async function cleanupPushSubscription('),end=files['pwa.js'].indexOf('\nasync function sendNotificationEvent',start);env.run(files['pwa.js'].slice(start,end));
  env.context.fetch=async()=>{throw Error('synthetic unavailable')};
  await assert.rejects(env.context.cleanupPushSubscription(session('admin-a')),/synthetic unavailable/);assert.equal(unsubscribed,false);assert.equal(env.S.profile.id,'worker-b');
});

test('session teardown invokes all registered cache resets before the document is reused',()=>{
  const env=environment();env.authenticate();const reset=[];
  for(const key of ['HarmonyCommercialCalendar','HarmonyProductionOrders','HarmonyProduction','HarmonyNotifications','HarmonyProductionInventory'])env.window[key]={reset:()=>reset.push(key)};
  env.context.clearLocalSession();assert.deepEqual(reset,['HarmonyCommercialCalendar','HarmonyProductionOrders','HarmonyProduction','HarmonyNotifications','HarmonyProductionInventory']);
  assert.equal(env.document.querySelector('#app'),null);assert.match(env.document.body.childNodes[0].innerHTML,/Sessão encerrada/);
});

function syntheticPrintWindow(){
  const state={opened:0,printed:0,closed:0,written:0};
  const win={closed:false,document:{images:[],fonts:{ready:Promise.resolve()},open(){},write(){state.written++},close(){}},focus(){},print(){state.printed++},close(){if(!this.closed)state.closed++;this.closed=true},addEventListener(){}};
  return{state,win};
}
const syntheticSheet=()=>({outerHTML:'<main>Conteúdo privado sintético</main>',querySelector:()=>null,querySelectorAll:()=>[],cloneNode(){return this}});

for(const kind of ['request','order']){
  test(kind+' print cannot open a popup after logout while source assets are pending',async()=>{
    const env=environment();env.authenticate();const assets=deferred(),popup=syntheticPrintWindow(),sheet=syntheticSheet(),button={innerHTML:'Imprimir'};
    env.context.location.href='https://example.test/';env.window.open=()=>{popup.state.opened++;return popup.win};
    let pending;
    if(kind==='request'){env.context.waitForRequestListAssets=()=>assets.promise;env.context.requestListMobilePrint=()=>false;pending=env.context.printRequestList(sheet,button)}
    else{env.run(files['production-orders.js'].match(/^async function printProductionOrder\(\).*$/m)[0]);env.context.waitForPrintAssets=()=>assets.promise;env.context.mobilePrint=()=>false;const original=env.document.querySelector;env.document.querySelector=selector=>selector==='#productionOrderPrint'?sheet:original(selector);pending=env.context.printProductionOrder()}
    env.context.clearLocalSession();assets.resolve();await pending;assert.equal(popup.state.opened,0);assert.equal(popup.state.printed,0);
  });
}

for(const kind of ['request','order','inventory','shipping']){
  test(kind+' print closes its already opened popup synchronously at logout and never prints afterward',async()=>{
    const env=environment();env.authenticate();const assets=deferred(),popup=syntheticPrintWindow(),sheet=syntheticSheet(),button={innerHTML:'Imprimir'};
    env.context.location.href='https://example.test/';env.context.setTimeout=()=>1;env.context.navigator={userAgent:'synthetic desktop'};env.window.matchMedia=()=>({matches:false});
    env.window.open=()=>{popup.state.opened++;return popup.win};
    let pending;
    if(kind==='request'){let calls=0;env.context.waitForRequestListAssets=()=>++calls===1?Promise.resolve():assets.promise;env.context.requestListMobilePrint=()=>false;pending=env.context.printRequestList(sheet,button)}
    else if(kind==='order'){
      env.run(files['production-orders.js'].match(/^async function printProductionOrder\(\).*$/m)[0]);env.context.waitForPrintAssets=async()=>{};env.context.mobilePrint=()=>false;env.context.productionOrderPrintCss='';popup.win.document.fonts.ready=assets.promise;
      const original=env.document.querySelector;env.document.querySelector=selector=>selector==='#productionOrderPrint'?sheet:original(selector);pending=env.context.printProductionOrder();
    }else if(kind==='inventory'){
      const code=await readFile(new URL('../production-inventory.js',import.meta.url),'utf8');env.run(code.slice(code.indexOf('async function printHtml(html,button)'),code.indexOf('const printReport=')));
      env.context.mobilePrint=()=>false;env.context.printCss='';env.context.waitAssets=()=>assets.promise;pending=env.context.printHtml(sheet.outerHTML,button);
    }else{
      const code=await readFile(new URL('../shipping-planning.js',import.meta.url),'utf8');env.run(code.match(/^async function printPlan\(plan,button\).*$/m)[0]);
      env.context.matchMedia=()=>({matches:false});env.context.navigator={userAgent:'synthetic desktop'};env.context.protocol=()=>1;env.context.printCss='';env.context.waitImages=()=>assets.promise;
      const original=env.document.querySelector;env.document.querySelector=selector=>selector==='#shippingPlanPrint'?sheet:original(selector);pending=env.context.printPlan({id:'synthetic'},button);
    }
    await settle();assert.equal(popup.state.opened,1);assert.equal(popup.state.written,1);
    env.context.clearLocalSession();assert.equal(popup.state.closed,1);assets.resolve();await pending;assert.equal(popup.state.printed,0);
  });
}

test('PWA install observer never reinserts its button into the closed session document',()=>{
  const env=environment();env.authenticate();env.context.installed=false;let insertions=0;
  const append=env.document.body.appendChild,replace=env.document.body.replaceChildren;
  env.document.body.appendChild=function(child){insertions++;child.parentElement=this;append.call(this,child)};
  env.document.body.replaceChildren=function(...children){for(const child of this.childNodes)child.parentElement=null;replace.call(this,...children)};
  const create=env.document.createElement;env.document.createElement=()=>{const node=create();node.setAttribute=()=>{};node.addEventListener=()=>{};return node};
  const start=files['pwa.js'].indexOf('if(!installed){'),end=files['pwa.js'].indexOf('function applicationServerKey',start);env.run(files['pwa.js'].slice(start,end));
  const installObserver=env.observers.at(-1);assert.equal(insertions,1);env.context.clearLocalSession();
  for(let n=0;n<5;n++){installObserver.fn();env.observers.at(-1).fn()}
  assert.equal(insertions,1);assert.equal(env.document.body.childNodes.length,1);assert.match(env.document.body.childNodes[0].innerHTML,/Sessão encerrada/);
});

test('thermal label printing succeeds in a valid session and cancels if logout occurs during its audit request',async()=>{
  const code=await readFile(new URL('../production-inventory.js',import.meta.url),'utf8');
  const fn=code.slice(code.indexOf('async function printThermalLabel('),code.indexOf('async function confirmLabelApplied('));
  for(const logoutDuringAudit of [false,true]){
    const env=environment();env.authenticate();env.run(fn);const audit=deferred(),alerts=[];let prints=0;
    env.context.recordLabelOutput=()=>logoutDuringAudit?audit.promise:Promise.resolve();env.context.waitAssets=async()=>{};env.context.alert=message=>alerts.push(message);
    env.document.head={appendChild(){}};env.window.print=()=>{prints++;env.events.get('afterprint')?.()};
    const button={innerHTML:'Imprimir'},pending=env.context.printThermalLabel({box_code:'SYNTHETIC'},{toDataURL:()=>''},button);
    if(logoutDuringAudit){env.context.clearLocalSession();audit.resolve()}await pending;
    assert.equal(prints,logoutDuringAudit?0:1);assert.equal(button.disabled,false);assert.equal(button.innerHTML,'Imprimir');
    assert.deepEqual(alerts,[]);
  }
});

test('shipping mobile print cancellation removes its temporary head stylesheet without an unhandled rejection',async()=>{
  const env=environment();env.authenticate();const assets=deferred(),sheet=syntheticSheet(),button={innerHTML:'Imprimir'};let styles=0,prints=0;
  const code=await readFile(new URL('../shipping-planning.js',import.meta.url),'utf8');env.run(code.match(/^async function printPlan\(plan,button\).*$/m)[0]);
  env.context.matchMedia=()=>({matches:true});env.context.printCss='';env.context.waitImages=()=>assets.promise;
  env.document.head={appendChild(style){styles++;style.remove=()=>styles--}};env.window.print=()=>prints++;
  const original=env.document.querySelector;env.document.querySelector=selector=>selector==='#shippingPlanPrint'?sheet:original(selector);
  const pending=env.context.printPlan({id:'synthetic'},button);assert.equal(styles,1);env.context.clearLocalSession();assets.resolve();await pending;
  assert.equal(styles,0);assert.equal(prints,0);assert.equal(button.disabled,false);
});
