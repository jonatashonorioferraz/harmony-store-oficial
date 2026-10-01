import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {htmlAssets,workerAssets} from '../scripts/lib/release-assets.mjs';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [source,app,html,worker,css]=await Promise.all(['operational-central.js','app.js','index.html','service-worker.js','operational-central.css'].map(read));
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return{resolve,promise}};
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const item={key:'bill:synthetic',rule:'FIN-01',family:'financial',entity_type:'bill',entity_id:'synthetic',protocol:'37',facts:{due_date:'2026-09-30'},classification:'attention',title:'Boleto sintético vencido',message:'Vencimento em 30/09/2026.',origin:{view:'bills',id:'synthetic'},source_updated_at:'2026-10-01T10:00:00Z'};
  return{schema_version:'b0.1',rules_version:'b0.1',evaluation_id:'synthetic',evaluated_at:'2026-10-02T01:00:00Z',business_date:'2026-10-01',timezone:'America/Sao_Paulo',sources:[{id:'bills',status:'evaluated',complete:true,row_count:1,fetched_at:'2026-10-02T01:00:00Z'},{id:'requests',status:'evaluated',complete:true,row_count:0,fetched_at:'2026-10-02T01:00:00Z'}],conditions:[item],priorities:[item],summary:{text:'Resumo sintético da consulta.',evaluated_sources:2,counts:{overdue_bills:1,due_today_bills:0,due_tomorrow_bills:0,open_requests:0,past_scheduled_requests:0}}};
}
function harness({loadBriefing}={}){
  let epoch=0,requestHandler=async()=>response(fixture()),page;const calls=[],routes=[],elements=new Map();
  const control=selector=>{if(!elements.has(selector))elements.set(selector,{dataset:{},focus(){}});return elements.get(selector)};
  page={innerHTML:'',querySelector:selector=>control(selector),querySelectorAll:selector=>selector==='[data-oc-origin]'?[...page.innerHTML.matchAll(/data-oc-origin="([^"]+)"/g)].map((match,index)=>{const element=control('origin:'+index);element.dataset.ocOrigin=match[1];return element}):[]};
  const S={profile:{id:'synthetic-admin',role:'admin',status:'active'},session:{access_token:'synthetic-token'},view:'operational-central',requests:[{id:'old'}]};
  const HarmonySession={capture:()=>({epoch}),isCurrent:value=>value.epoch===epoch,assert(value){if(!this.isCurrent(value))throw Object.assign(Error('session changed'),{code:'SESSION_CHANGED'})}};
  const context=vm.createContext({S,window:{HarmonySession},document:{querySelector:selector=>selector==='#page'?page:null},API:'https://synthetic.example.test',KEY:'synthetic-publishable',ensureSession:async()=>{},refreshSession:async()=>{S.session.access_token='renewed'},apiFetch:async(url,options)=>{calls.push({url,options});return requestHandler(url,options)},restAll:async()=>[{id:'fresh'}],renderApp:()=>routes.push(S.view),esc:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),Date,Intl,console});
  let runnable=source;
  if(loadBriefing){
    // Native custom VM import callbacks require an extra Node flag. Substitute
    // only the import expression for this controlled boundary; all session,
    // state and rendering code stays intact. Default tests use the real import.
    const expression=/\bimport\((['"])\.\/central-briefing\.mjs(?:\?[^'"]*)?\1\)/g;
    assert.equal([...source.matchAll(expression)].length,1);
    context.__loadBriefing=loadBriefing;
    runnable=source.replace(expression,match=>match.replace(/^import/,'__loadBriefing'));
  }
  vm.runInContext(runnable,context,{filename:fileURLToPath(new URL('../operational-central.js',import.meta.url)),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});const api=context.window.HarmonyOperationalCentral;
  return{context,api,S,page,calls,routes,control,setResponse:fn=>requestHandler=fn,invalidate:()=>epoch++,replacePage:()=>page={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]}};
}

test('active primary and secondary administrators can query; other roles and inactive users cannot',async()=>{
  for(const profile of [{role:'admin',status:'active',is_primary_admin:true},{role:'admin',status:'active',is_primary_admin:false},{role:'admin',status:'inactive'},{role:'collaborator',status:'active'},{role:'receiver',status:'active',is_ecommerce_manager:true}]){
    const h=harness();h.S.profile={id:'synthetic',...profile};await h.api.render(h.page);
    assert.equal(h.calls.length,profile.role==='admin'&&profile.status==='active'?1:0);
    if(!h.calls.length)assert.match(h.page.innerHTML,/somente para administradores/);
  }
});

test('entering and refreshing consult the Edge without using another module cache',async()=>{
  const h=harness();h.context.window.HarmonyBills={state:{items:[{secret:'unrelated'}]},load:()=>{throw Error('cache should not be used for evaluation')}};
  await h.api.render(h.page);assert.match(h.page.innerHTML,/Boleto sintético vencido/);assert.doesNotMatch(h.page.innerHTML,/unrelated/);
  assert.match(h.page.innerHTML,/01\/10\/2026, 22:00/);assert.match(h.page.innerHTML,/São Paulo/);
  assert.equal(h.calls[0].url,'https://synthetic.example.test/functions/v1/operational-central');assert.equal(h.calls[0].options.method,'POST');assert.equal(h.calls[0].options.body,'{}');
  await h.control('[data-oc-refresh]').onclick();await h.api.render(h.page);assert.equal(h.calls.length,3);
});

test('unavailable source never displays zero or a green all-clear',async()=>{
  const h=harness(),data=fixture();data.summary.evaluated_sources=1;data.sources[0].status='unavailable';data.sources[0].complete=false;data.summary.counts.overdue_bills=null;data.summary.counts.due_today_bills=null;data.summary.counts.due_tomorrow_bills=null;
  data.conditions=[];data.priorities=[];h.setResponse(async()=>response(data));await h.api.render(h.page);
  assert.match(h.page.innerHTML,/Consulta parcial/);assert.match(h.page.innerHTML,/Indisponível nesta consulta/);assert.match(h.page.innerHTML,/1 de 2 fontes/);assert.doesNotMatch(h.page.innerHTML,/Nenhuma ocorrência encontrada/);
});

test('request errors discard earlier totals and are shown without inventing zero counts',async()=>{
  const h=harness();await h.api.render(h.page);h.setResponse(async()=>{throw Error('Sem conexão sintética')});await h.control('[data-oc-refresh]').onclick();
  assert.match(h.page.innerHTML,/Consulta não concluída/);assert.match(h.page.innerHTML,/Nenhum total foi confirmado/);assert.doesNotMatch(h.page.innerHTML,/oc-metric|Boleto sintético vencido/);
});

test('malformed response and permission denial fail closed',async()=>{
  for(const invalid of [response({}),response({error:{message:'internal backend details'}},403)]){
    const h=harness();h.setResponse(async()=>invalid);await h.api.render(h.page);assert.match(h.page.innerHTML,/Consulta não concluída/);assert.doesNotMatch(h.page.innerHTML,/oc-metric|internal backend details/);
  }
});

test('logout invalidates in-flight evaluation before any private result is painted',async()=>{
  const h=harness(),pending=deferred();h.setResponse(()=>pending.promise);const loading=h.api.render(h.page);await settle();h.invalidate();h.S.profile=null;h.api.reset();h.page.innerHTML='Sessão encerrada';pending.resolve(response(fixture()));await loading;assert.equal(h.page.innerHTML,'Sessão encerrada');
});

test('leaving and returning discards the earlier result and cannot finish the new loading state',async()=>{
  const h=harness(),old=deferred(),next=deferred();h.setResponse(()=>old.promise);const a=h.api.render(h.page);await settle();h.setResponse(()=>next.promise);const b=h.api.render(h.page);await settle();old.resolve(response(fixture()));await a;assert.match(h.page.innerHTML,/Consultando boletos/);const newData=fixture();newData.conditions[0].title='Consulta mais recente';next.resolve(response(newData));await b;assert.match(h.page.innerHTML,/Consulta mais recente/);assert.doesNotMatch(h.page.innerHTML,/Boleto sintético vencido/);
});

test('a late 401 after logout does not refresh or retry authentication',async()=>{
  const h=harness(),pending=deferred();let refreshed=0;h.context.refreshSession=async()=>refreshed++;h.setResponse(()=>pending.promise);const a=h.api.render(h.page);await settle();h.invalidate();h.api.reset();pending.resolve(response({},401));await a;assert.equal(refreshed,0);assert.equal(h.calls.length,1);
});

test('an expired token retries once within the same session',async()=>{
  const h=harness();let calls=0;h.setResponse(async()=>++calls===1?response({},401):response(fixture()));await h.api.render(h.page);assert.equal(calls,2);assert.equal(h.calls[1].options.headers.Authorization,'Bearer renewed');assert.match(h.page.innerHTML,/Boleto sintético vencido/);
});

test('filters change the current result without network calls and escape external text',async()=>{
  const h=harness(),data=fixture();data.conditions[0].title='<img src=x onerror=alert(1)>';data.conditions[0].message='Texto <script>malicioso</script>';h.setResponse(async()=>response(data));await h.api.render(h.page);
  assert.match(h.page.innerHTML,/&lt;img/);assert.doesNotMatch(h.page.innerHTML,/<script>malicioso/);
  h.control('[data-oc-family]').onchange({target:{value:'requests'}});assert.match(h.page.innerHTML,/Nenhuma observação neste filtro/);assert.equal(h.calls.length,1);
});

test('only approved module routes are rendered even if the payload contains an external origin',async()=>{
  const h=harness(),data=fixture();data.conditions[0].origin={view:'https://untrusted.test',id:'synthetic'};h.setResponse(async()=>response(data));await h.api.render(h.page);assert.doesNotMatch(h.page.innerHTML,/untrusted|data-oc-origin=/);
});

test('release integrates one active-admin menu entry and synchronized offline assets',async()=>{
  assert.equal((app.match(/nav\('operational-central'/g)||[]).length,1);assert.match(app,/a&&S\.profile\.status==='active'\?nav\('operational-central'/);assert.match(app,/HarmonyOperationalCentral\.render\(p\)/);assert.match(app,/window\.HarmonyOperationalCentral\]/);
  for(const name of ['central-briefing.mjs','operational-central.js','operational-central.css']){assert.equal(await read('web/'+name),await read(name));const version=htmlAssets(html).get(name)?.version;assert.match(version||'',/^\d+\.\d+\.\d+$/);assert.equal(workerAssets(worker).get(name)?.version,version)}
  assert.match(css,/@media\(max-width:720px\)/);assert.match(css,/min-height:44px/);assert.doesNotMatch(source,/setInterval|localStorage|send-push|mark_app_notification/);
});

test('cards display the real evaluator protocol and factual dates without using the device timezone',async()=>{
  const {evaluateOperational}=await import('../supabase/functions/operational-central/evaluator.mjs');
  const at='2026-10-02T01:00:00Z',row=(id,protocol)=>({id:'00000000-0000-4000-8000-'+String(id).padStart(12,'0'),protocol,status:'pending',updated_at:'2026-10-01T10:00:00Z'});
  const data=evaluateOperational({evaluatedAt:at,sources:[{id:'bills',status:'evaluated',complete:true,row_count:1,fetched_at:at,rows:[{...row(1,37),due_date:'2026-10-01'}]},{id:'requests',status:'evaluated',complete:true,row_count:1,fetched_at:at,rows:[{...row(2,42),status:'scheduled',created_at:'2026-09-28T01:00:00Z',scheduled_for:'2026-10-01T23:00:00Z'}]}]});
  const h=harness();h.setResponse(async()=>response(data));await h.api.render(h.page);
  assert.match(h.page.innerHTML,/Boleto #0037/);assert.match(h.page.innerHTML,/Vencimento: 01\/10\/2026/);assert.match(h.page.innerHTML,/Solicitação #0042/);assert.match(h.page.innerHTML,/Agendada para 01\/10\/2026, 20:00/);assert.match(h.page.innerHTML,/Criada em 27\/09\/2026, 22:00/);assert.doesNotMatch(h.page.innerHTML,/Consulta não concluída/);
});

test('opening bills refreshes its source before routing and does not open a cached entity',async()=>{
  const h=harness(),fresh=deferred(),forces=[];h.context.window.HarmonyBills={state:{loading:null,items:[{id:'old'}]},load:async force=>{forces.push(force);return fresh.promise},open(){throw Error('must not open an old entity')}};
  await h.api.render(h.page);const opening=h.page.querySelectorAll('[data-oc-origin]')[0].onclick();await settle();assert.equal(h.routes.length,0);assert.deepEqual(forces,[true]);assert.match(h.page.innerHTML,/Atualizando o módulo de origem/);
  fresh.resolve();await opening;assert.deepEqual(h.routes,['bills']);
});

test('opening requests replaces stale list only after its current-session response completes',async()=>{
  const h=harness(),data=fixture(),fresh=deferred();data.conditions[0].origin={view:'requests',id:'synthetic'};h.setResponse(async()=>response(data));h.context.restAll=()=>fresh.promise;await h.api.render(h.page);
  const opening=h.page.querySelectorAll('[data-oc-origin]')[0].onclick();await settle();assert.equal(h.S.requests[0].id,'old');fresh.resolve([{id:'fresh'}]);await opening;assert.equal(h.S.requests[0].id,'fresh');assert.deepEqual(h.routes,['requests']);
});

test('logout during origin reload prevents routing or replacing the next session data',async()=>{
  const h=harness(),data=fixture(),fresh=deferred();data.conditions[0].origin={view:'requests',id:'synthetic'};h.setResponse(async()=>response(data));h.context.restAll=()=>fresh.promise;await h.api.render(h.page);
  const opening=h.page.querySelectorAll('[data-oc-origin]')[0].onclick();await settle();h.invalidate();h.api.reset();h.S.requests=[{id:'next-session'}];fresh.resolve([{id:'old-private'}]);await opening;assert.equal(h.S.requests[0].id,'next-session');assert.deepEqual(h.routes,[]);
});


test('morning preview uses the actual server consultation, not 07:30, and sends nothing',async()=>{
  const h=harness();await h.api.render(h.page);
  assert.match(h.page.innerHTML,/PRÉVIA DA CONSULTA ATUAL/);assert.match(h.page.innerHTML,/Resumo da manhã/);
  assert.match(h.page.innerHTML,/Envio automático não ativado/);assert.match(h.page.innerHTML,/WhatsApp não conectado/);
  assert.match(h.page.innerHTML,/Horário previsto: 07:30/);assert.match(h.page.innerHTML,/Prévia da consulta atual · 01\/10\/2026 22:00/);
  assert.match(h.page.innerHTML,/Boleto #0037: vencido e pendente no app/);assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].url,'https://synthetic.example.test/functions/v1/operational-central');
});

test('preview is replaced on refresh and disappears on network failure, without retaining a morning snapshot',async()=>{
  const h=harness();await h.api.render(h.page);assert.match(h.page.innerHTML,/Boleto #0037: vencido/);
  const next=fixture();next.conditions[0].protocol='38';next.evaluated_at='2026-10-02T02:00:00Z';h.setResponse(async()=>response(next));await h.control('[data-oc-refresh]').onclick();
  assert.match(h.page.innerHTML,/Boleto #0038: vencido/);assert.match(h.page.innerHTML,/01\/10\/2026 23:00/);assert.doesNotMatch(h.page.innerHTML,/Boleto #0037: vencido/);
  h.setResponse(async()=>{throw Error('offline')});await h.control('[data-oc-refresh]').onclick();assert.doesNotMatch(h.page.innerHTML,/oc-briefing-text|Boleto #0038: vencido/);
});

test('a malformed briefing contract reports unavailable preview without fabricating a summary',async()=>{
  const h=harness(),data=fixture();data.business_date='2026-10-02';h.setResponse(async()=>response(data));await h.api.render(h.page);
  assert.match(h.page.innerHTML,/oc-briefing-error/);assert.match(h.page.innerHTML,/prévia confiável/);assert.doesNotMatch(h.page.innerHTML,/oc-briefing-text/);assert.match(h.page.innerHTML,/Boleto sintético vencido/);
});

test('a finished preview is no longer retained after session reset and next-session failure',async()=>{
  const h=harness();await h.api.render(h.page);assert.match(h.page.innerHTML,/Boleto #0037: vencido/);
  h.invalidate();h.api.reset();h.S.profile.id='next-admin';h.setResponse(async()=>response({},403));await h.api.render(h.page);
  assert.doesNotMatch(h.page.innerHTML,/oc-briefing-text|#0037/);assert.match(h.page.innerHTML,/Consulta não concluída/);
});


test('logout while the briefing import is pending cannot compose or repaint private facts in the next session',{timeout:5000},async()=>{
  const composer=await import('../central-briefing.mjs'),started=deferred(),pending=deferred();let composed=0;
  const h=harness({loadBriefing:specifier=>{assert.match(specifier,/^\.\/central-briefing\.mjs\?v=/);started.resolve();return pending.promise}});
  const old=h.api.render(h.page);await started.promise;
  assert.equal(h.calls.length,1);assert.match(h.page.innerHTML,/Consultando boletos/);assert.doesNotMatch(h.page.innerHTML,/#0037|oc-briefing-text/);
  h.invalidate();h.api.reset();h.S.profile={id:'next-admin',role:'admin',status:'active'};h.S.session={access_token:'next-session-token'};
  h.page.innerHTML='<main>Conteúdo da próxima sessão</main>';
  pending.resolve({buildDailyBriefing:data=>{composed++;return composer.buildDailyBriefing(data)}});await old;
  assert.equal(composed,0,'an obsolete evaluation must not reach the compositor after its import completes');
  assert.equal(h.page.innerHTML,'<main>Conteúdo da próxima sessão</main>');assert.equal(h.S.profile.id,'next-admin');
  assert.deepEqual(h.routes,[]);assert.equal(h.calls.length,1);
});
