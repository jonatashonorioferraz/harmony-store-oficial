import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function harness({requests=[],internal=[],team=[]}={}){
  let html='';
  const opened=[],filters=['all','production','ecommerce','internal'].map(kind=>({dataset:{hubFilter:kind},focus(){}}));
  const sort={value:'oldest',focus(){}},refresh={};
  let rows=[];
  const host={
    get innerHTML(){return html},
    set innerHTML(value){
      html=value;
      rows=[...value.matchAll(/data-hub-kind="([^"]+)" data-hub-id="([^"]+)"/g)].map(match=>({dataset:{hubKind:match[1],hubId:match[2]}}));
    },
    querySelectorAll(selector){return selector==='[data-hub-filter]'?filters:selector==='[data-hub-id]'?rows:[]},
    querySelector(selector){
      if(selector==='#hubArrivalOrder')return sort;
      if(selector==='#refreshRequestHub'||selector==='#retryRequestHub')return refresh;
      const kind=selector.match(/^\[data-hub-filter="([^"]+)"\]$/)?.[1];
      return filters.find(button=>button.dataset.hubFilter===kind)||null;
    }
  };
  const context={
    window:{HarmonyInternalSupplies:{load:async()=>{},state:{requests:internal},openRequest:id=>opened.push({kind:'internal',id})}},
    S:{team,requests,profile:{role:'admin'},view:'home'},
    renderPage:async()=>{},requestModalV2:request=>opened.push({kind:'standard',id:request.id}),
    esc:escapeHtml,document:{querySelector:()=>({querySelector:()=>host})},console
  };
  vm.runInNewContext(await read('request-hub.js'),context);
  return {hub:context.window.HarmonyRequestHub,host,opened,filters,sort,rows:()=>rows,context};
}

function fixtures(){
  return {
    team:[{id:'worker',role:'collaborator',full_name:'Colaboradora'},{id:'receiver',role:'receiver',full_name:'Recebedora'}],
    requests:[
      {id:'new-production',requested_by:'worker',protocol:12,status:'separating',created_at:'2026-10-03T12:00:00Z'},
      {id:'middle-ecommerce',requested_by:'receiver',protocol:11,status:'scheduled',created_at:'2026-10-02T12:00:00Z'},
      {id:'closed-production',requested_by:'worker',protocol:1,status:'delivered',created_at:'2026-09-01T12:00:00Z'}
    ],
    internal:[
      {id:'urgent-new',protocol:3,status:'pending',priority:'urgent',requested_by_name:'Compras',created_at:'2026-10-04T12:00:00Z'},
      {id:'old-internal',protocol:2,status:'pending',priority:'normal',requested_by_name:'Suprimentos',created_at:'2026-10-01T12:00:00Z'},
      {id:'cancelled',protocol:1,status:'cancelled',priority:'urgent',created_at:'2026-09-01T12:00:00Z'}
    ]
  };
}

test('admin home request hub integrates the three request sources',async()=>{
  const source=await read('request-hub.js');
  assert.match(source,/Matéria-prima/);
  assert.match(source,/Material do e-commerce/);
  assert.match(source,/Suprimento do e-commerce/);
  assert.match(source,/HarmonyInternalSupplies/);
  assert.match(source,/requester\?\.role==='receiver'\?'ecommerce':'production'/);
  assert.doesNotMatch(source,/request_items\?/);
  assert.match(source,/S\.profile\?\.role!=='admin'/);
});

test('every receiver request is ecommerce regardless of products',async()=>{
  const {hub}=await harness(fixtures());
  assert.equal(hub.classifyRequest({requested_by:'receiver'}),'ecommerce');
  assert.equal(hub.classifyRequest({requested_by:'worker'}),'production');
});

test('arrival positions span all open sources, ignore urgency and preserve source records',async()=>{
  const data=fixtures(),before=JSON.stringify(data);
  const {hub,host}=await harness(data);
  await hub.mount();
  assert.equal(hub.state.error,'');
  assert.deepEqual(Array.from(hub.state.items,item=>[item.id,item.queue_position]),[
    ['old-internal',1],['middle-ecommerce',2],['new-production',3],['urgent-new',4]
  ]);
  assert.equal(JSON.stringify(data),before);
  assert.match(host.innerHTML,/class="hub-oldest-label"/);
  assert.match(host.innerHTML,/Urgente/);
  assert.match(host.innerHTML,/#0012/);
  assert.match(host.innerHTML,/datetime="2026-10-01T12:00:00.000Z"/);
  assert.match(host.innerHTML,/\d{2}\/\d{2}\/2026 · \d{2}:\d{2}/);
  assert.match(host.innerHTML,/Atendimento livre/);
  assert.match(host.innerHTML,/Você pode atender qualquer solicitação/);
});

test('filtering preserves global positions and never relabels a newer request as oldest',async()=>{
  const {hub,host,filters,rows}=await harness(fixtures());
  await hub.mount();
  filters.find(button=>button.dataset.hubFilter==='production').onclick();
  assert.deepEqual(rows().map(button=>button.dataset.hubId),['new-production']);
  assert.match(host.innerHTML,/>3ª<\/b>/);
  assert.match(host.innerHTML,/1 de 4 em aberto · Numeração geral preservada/);
  assert.doesNotMatch(host.innerHTML,/class="hub-oldest-label"/);
  assert.match(host.innerHTML,/data-hub-filter="production" aria-pressed="true"/);
  filters.find(button=>button.dataset.hubFilter==='all').onclick();
  assert.equal(rows().length,4);
  assert.equal((host.innerHTML.match(/class="hub-oldest-label"/g)||[]).length,1);
});

test('newest-first display keeps arrival ranks and the canonical oldest-first queue unchanged',async()=>{
  const {hub,host,sort,rows}=await harness(fixtures());
  await hub.mount();
  sort.onchange({target:{value:'newest'}});
  assert.deepEqual(rows().map(button=>button.dataset.hubId),['urgent-new','new-production','middle-ecommerce','old-internal']);
  assert.equal(hub.state.items[0].id,'old-internal');
  assert.equal(hub.state.items[0].queue_position,1);
  assert.match(host.innerHTML,/<option value="newest" selected>/);
  assert.match(host.innerHTML,/>4ª<\/b>/);
  sort.onchange({target:{value:'oldest'}});
  assert.equal(rows()[0].dataset.hubId,'old-internal');
});

test('missing and invalid dates remain unranked at the end in both sorting directions',async()=>{
  const data=fixtures();
  for(const [id,created_at] of [['no-date',null],['empty-date',''],['invalid-date','not-a-date']]){
    data.requests.push({id,created_at,requested_by:'worker',protocol:20,status:'pending'});
  }
  const {hub,host,sort,rows}=await harness(data);
  await hub.mount();
  assert.equal(hub.state.items.length,7);
  assert.ok(hub.state.items.slice(4).every(item=>item.queue_position===null));
  assert.match(host.innerHTML,/Data de envio indisponível/);
  assert.doesNotMatch(host.innerHTML,/NaN|Invalid Date|01\/01\/1970/);
  const unknown=rows().slice(4).map(button=>button.dataset.hubId);
  sort.onchange({target:{value:'newest'}});
  assert.deepEqual(rows().slice(4).map(button=>button.dataset.hubId),unknown);
  assert.equal(rows()[0].dataset.hubId,'urgent-new');
});

test('a queue without valid dates never invents an oldest request',async()=>{
  const {hub,host}=await harness({requests:[{id:'unknown',protocol:1,status:'pending',created_at:null}]});
  await hub.mount();
  assert.equal(hub.state.items[0].queue_position,null);
  assert.doesNotMatch(host.innerHTML,/class="hub-oldest-label"/);
  assert.match(host.innerHTML,/Posição indisponível/);
});

test('equal timestamps have stable positions independent of loading order',async()=>{
  const data=fixtures();
  data.requests=data.requests.filter(item=>item.status!=='delivered').map(item=>({...item,created_at:'2026-10-01T12:00:00Z'}));
  data.internal=data.internal.filter(item=>item.status!=='cancelled').map(item=>({...item,created_at:'2026-10-01T12:00:00Z'}));
  const first=await harness(data);
  const second=await harness({...data,requests:[...data.requests].reverse(),internal:[...data.internal].reverse()});
  await first.hub.load();
  await second.hub.load();
  assert.deepEqual(Array.from(first.hub.state.items,item=>[item.id,item.queue_position]),Array.from(second.hub.state.items,item=>[item.id,item.queue_position]));
});

test('newer requests in either original flow remain freely openable',async()=>{
  const {hub,rows,opened}=await harness(fixtures());
  await hub.mount();
  await rows().find(button=>button.dataset.hubId==='new-production').onclick();
  await rows().find(button=>button.dataset.hubId==='urgent-new').onclick();
  assert.deepEqual(opened,[{kind:'standard',id:'new-production'},{kind:'internal',id:'urgent-new'}]);
});

test('closing a request recalculates the open queue without changing protocols',async()=>{
  const data=fixtures(),{hub}=await harness(data);
  await hub.load();
  data.internal.find(item=>item.id==='old-internal').status='delivered';
  await hub.load();
  assert.equal(hub.state.items[0].id,'middle-ecommerce');
  assert.equal(hub.state.items[0].queue_position,1);
  assert.equal(hub.state.items[0].protocol,11);
});

test('requester text remains escaped in content and accessible button labels',async()=>{
  const data=fixtures();
  data.team[0].full_name='<img src=x onerror="alert(1)">';
  const {hub,host}=await harness(data);
  await hub.mount();
  assert.doesNotMatch(host.innerHTML,/<img src=x/);
  assert.match(host.innerHTML,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test('non-admin profiles cannot mount the queue',async()=>{
  const {hub,host,context}=await harness(fixtures());
  context.S.profile.role='collaborator';
  await hub.mount();
  assert.equal(host.innerHTML,'');
});

test('hub links keep the original request flows and only list open statuses',async()=>{
  const [hub,internal]=await Promise.all([read('request-hub.js'),read('internal-supplies.js')]);
  assert.match(hub,/new Set\(\['pending','separating','scheduled'\]\)/);
  assert.match(hub,/requestModalV2\(request\)/);
  assert.match(hub,/HarmonyInternalSupplies\.openRequest\(id\)/);
  assert.match(internal,/openRequestFromHub/);
  assert.match(internal,/openRequest:openRequestFromHub/);
});

test('hub asset versions match the shell cache and official mirrors without fixed version literals',async()=>{
  const [html,worker,css,pkg]=await Promise.all([read('index.html'),read('service-worker.js'),read('request-hub.css'),read('package.json')]);
  for(const extension of ['css','js']){
    const reference=html.match(new RegExp('request-hub\\.'+extension+'\\?v=\\d+\\.\\d+(?:\\.\\d+)?'))?.[0];
    assert.ok(reference,'versioned '+extension+' reference missing');
    assert.ok(worker.includes("'./"+reference+"'"),'cached '+extension+' version differs');
  }
  assert.match(worker,/const CACHE='harmony-store-v\d+-\d+-r\d+'/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(JSON.parse(pkg).version,/^\d+\.\d+\.\d+$/);
  for(const filename of ['request-hub.js','request-hub.css','index.html','service-worker.js']){
    assert.equal((await read(filename)).replaceAll('\r\n','\n'),(await read('web/'+filename)).replaceAll('\r\n','\n'),filename+' mirror differs');
  }
});
