import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {sourceUrl,parseProposals,requestBody} from '../supabase/functions/sync-commercial-calendar/validation.mjs';

const root=resolve(import.meta.dirname,'..');
const read=name=>readFile(resolve(root,name),'utf8');
const context=vm.createContext({URL,Intl,Date,Map,Set});
vm.runInContext(await read('commercial-calendar-core.js'),context);
const C=context.HarmonyCommercialCore;
const get=(year,key)=>C.baseline(year).find(e=>e.key.startsWith(key+':'));

test('date-only math rejects impossible dates and crosses leap years',()=>{
  assert.equal(C.validDate('2026-02-29'),false);
  assert.equal(C.validDate('2028-02-29'),true);
  assert.equal(C.add('2028-02-28',1),'2028-02-29');
  assert.equal(C.add('2026-12-31',1),'2027-01-01');
  assert.equal(C.between('2026-10-01','2026-10-31'),30);
});
test('today uses Sao Paulo rather than the UTC day',()=>{
  assert.equal(C.today(new Date('2026-10-01T01:00:00Z')),'2026-09-30');
});
test('Brazilian movable dates, including the fifth-Friday Black Friday case',()=>{
  assert.equal(get(2026,'maes').start_date,'2026-05-10');
  assert.equal(get(2026,'pais').start_date,'2026-08-09');
  assert.equal(C.easter(2026),'2026-04-05');
  assert.equal(get(2026,'carnaval').start_date,'2026-02-17');
  assert.equal(get(2024,'black-friday').start_date,'2024-11-29');
  assert.equal(get(2026,'black-friday').start_date,'2026-11-27');
  assert.equal(get(2026,'cyber-monday').start_date,'2026-11-30');
});
test('marketplace recurrence is never labelled as confirmed',()=>{
  const dates=C.baseline(2026).filter(e=>e.channel==='Shopee');
  assert.equal(dates.length,12);
  assert.ok(dates.every(e=>e.status==='predicted'&&!e.source_checked_at&&!e.source_url));
});
test('base has stable unique keys across years',()=>{
  const dates=[...C.baseline(2026),...C.baseline(2027)];
  assert.equal(new Set(dates.map(e=>e.key)).size,dates.length);
});
test('pending proposals do not enter the calendar; reviewed replacements do',()=>{
  const base=get(2026,'shopee-9');
  const pending={id:'proposal',title:'Nova edicao',status:'pending',baseline_key:base.key,start_date:'2026-09-08'};
  assert.equal(C.merge([base],[pending],[])[0].title,base.title);
  const confirmed={...pending,status:'confirmed'};
  const out=C.merge([base],[confirmed],[{event_key:base.key,status:'planning'}]);
  assert.equal(out.length,1);assert.equal(out[0].title,'Nova edicao');assert.equal(out[0].plan.status,'planning');
});
test('internal plans remain accessible without an external announcement',()=>{
  const out=C.merge([],[],[{event_key:'manual:1',title:'Colecao interna',event_date:'2026-10-20',channel:'Loja própria'}]);
  assert.equal(out[0].status,'internal');assert.equal(out[0].key,'manual:1');
});
test('preparation milestones count production and delivery separately',()=>{
  const points=C.milestones({start_date:'2026-12-25',plan:{lead_days:60,production_days:15,shipping_days:7}});
  assert.equal(points[0].date,'2026-10-26');
  assert.equal(points[1].date,'2026-12-03');
  assert.equal(points[2].date,'2026-12-18');
});
test('alerts change at 60, 30, 15 and 7 days and respect closed plans',()=>{
  const event={start_date:'2026-12-25'};
  for(const [days,label] of [[60,'Planejar'],[30,'Preparar agora'],[15,'Revisar execução'],[7,'Reta final']]){
    assert.ok(C.signal(event,C.add(event.start_date,-days)).label.startsWith(label));
  }
  assert.equal(C.signal({...event,plan:{status:'cancelled'}},'2026-12-24').label,'Cancelada');
});
test('checklist percentage is based on boolean completion only',()=>{
  assert.equal(C.readiness({plan:{checklist:{offer:true,stock:'true',creative:false,logistics:true}}}).percent,50);
});
test('research states distinguish disabled, stale, failure and budget block',()=>{
  const now=new Date('2026-10-01T12:00:00Z');
  assert.match(C.research({enabled:false}).label,/desligada/);
  assert.match(C.research({enabled:true,pricing_approved:false}).label,/configuração/);
  assert.match(C.research({enabled:true,pricing_approved:true,budget_blocked:true}).label,/orçamento/);
  assert.match(C.research({enabled:true,pricing_approved:true},{status:'failed'},null,now).label,/falhou/);
  assert.match(C.research({enabled:true,pricing_approved:true},null,'2026-09-28T12:00:00Z',now).label,/desatualizada/);
  assert.match(C.research({enabled:true,pricing_approved:true},null,'2026-10-01T10:00:00Z',now).label,/recente/);
});
test('unsafe URLs, credential URLs and lookalike domains are rejected',()=>{
  const domains=['shopee.com.br','gov.br'];
  for(const url of ['javascript:alert(1)','http://shopee.com.br/x','https://shopee.com.br.evil.test/x','https://user:pass@shopee.com.br/x','https://shopee.com.br:8443/x','https://evil.test/x','https://shopee.com.br\\@evil.test/x']){
    assert.equal(sourceUrl(url,domains),null,url);
  }
  assert.equal(sourceUrl('https://ads.shopee.com.br/news/1#top',domains),'https://ads.shopee.com.br/news/1');
});
const proposal=()=>({title:'Campanha 11.11 2026',start_date:'2026-11-11',end_date:'2026-11-11',channel:'Shopee',source_url:'https://shopee.com.br/m/1111',source_excerpt:'A edicao informada na publicacao ocorre em 11 de novembro de 2026.',source_published_at:'2026-10-01'});
const response=events=>({status:'completed',output:[
  {type:'web_search_call',action:{sources:[{url:'https://shopee.com.br/m/1111'}]}},
  {type:'message',content:[{type:'output_text',text:JSON.stringify({events})}]}
]});
const parse=r=>parseProposals(r,['shopee.com.br'],'2026-10-01','2027-10-06');
test('provider proposals require a source actually consulted by web search',()=>{
  assert.equal(parse(response([proposal()])).length,1);
  assert.throws(()=>parse(response([{...proposal(),source_url:'https://shopee.com.br/m/invented'}])),/unverified_source/);
  const r=response([proposal()]);r.output.shift();assert.throws(()=>parse(r),/unverified_source/);
});
test('past, impossible, inverted and out-of-window campaign dates fail closed',()=>{
  for(const p of [
    {...proposal(),start_date:'2025-11-11'},
    {...proposal(),start_date:'2026-02-30'},
    {...proposal(),end_date:'2026-11-10'},
    {...proposal(),end_date:'2028-01-01'},
    {...proposal(),source_published_at:'2027-01-01'}
  ])assert.throws(()=>parse(response([p])),/invalid_/);
});
test('incomplete or refused output cannot mark a search successful',()=>{
  assert.throws(()=>parse({...response([]),status:'incomplete'}),/incomplete/);
  assert.throws(()=>parse({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}),/refused/);
});
test('duplicate proposals collapse and no evidence can yield an empty result',()=>{
  assert.equal(parse(response([proposal(),proposal()])).length,1);
  assert.equal(parse(response([])).length,0);
});
test('research is bounded and never includes business records',()=>{
  const b=requestBody('2026-10-01','2027-10-06',['shopee.com.br']);
  assert.equal(b.max_tool_calls,1);assert.equal(b.max_output_tokens,3000);assert.equal(b.store,false);
  assert.equal(b.text.format.strict,true);assert.equal(b.tools[0].type,'web_search');
  assert.ok(!('filters' in b.tools[0]));assert.ok(!('external_web_access' in b.tools[0]));
  assert.match(b.input,/site:shopee\.com\.br/);
  assert.ok(!('customer' in b));assert.match(b.instructions,/nunca instrucoes/);
});
test('frontend syntax and official mirrors are synchronized',async()=>{
  for(const file of ['commercial-calendar-core.js','commercial-calendar.js','commercial-calendar.css','app.js','index.html','service-worker.js']){
    const source=await read(file);assert.equal(source,await read('web/'+file),file);
    if(file.endsWith('.js'))assert.doesNotThrow(()=>new vm.Script(source,{filename:file}));
  }
});
test('PWA references the new assets with matching versions',async()=>{
  const index=await read('index.html'),sw=await read('service-worker.js'),build=await read('scripts/build-static.mjs');
  for(const name of ['commercial-calendar-core.js','commercial-calendar.js','commercial-calendar.css']){
    const version=index.match(new RegExp(name.replaceAll('.','\\.')+'\\?v=([0-9.]+)'))?.[1];assert.ok(version);assert.ok(sw.includes(name+'?v='+version));assert.ok(build.includes('"'+name+'"'));
  }
  const appVersion=index.match(/app\.js\?v=([0-9.]+)/)?.[1];assert.ok(appVersion);assert.ok(sw.includes('app.js?v='+appVersion));
  assert.match(index,/label-lots\.js\?v=3/);assert.match(index,/bills\.js\?v=25\.101\.1/);
});
test('migration keeps research disabled and protects every new table',async()=>{
  const sql=await read('supabase/migrations/20261001013000_commercial_calendar.sql');
  assert.match(sql,/enabled boolean not null default false/);
  assert.match(sql,/pricing_approved boolean not null default false/);
  for(const name of ['settings','sources','runs','events','plans','audit'])assert.ok(sql.includes('alter table public.commercial_calendar_'+name+' enable row level security'));
  assert.match(sql,/role='admin' and status='active'/);
  assert.match(sql,/run_day date not null unique/);
  assert.match(sql,/for update/);
  assert.ok(!sql.includes('cron.schedule'));
  assert.ok(!/update public\.(products|requests|bills|label_lots)\b/i.test(sql));
});
test('UI escapes external text, limits route to admins and clears on logout',async()=>{
  const ui=await read('commercial-calendar.js'),app=await read('app.js'),edge=await read('supabase/functions/sync-commercial-calendar/index.ts');
  assert.match(ui,/escape\(e\.source_excerpt\)/);assert.match(ui,/rel="noopener noreferrer"/);
  assert.match(ui,/S\.profile\?\.role==='admin'/);
  assert.match(app,/function clearLocalSession\(\)\{window\.HarmonyCommercialCalendar\?\.reset\(\)/);
  assert.match(edge,/CALENDAR_RESEARCH_APPROVED/);assert.match(edge,/AbortSignal\.timeout\(65000\)/);
  assert.ok(!ui.includes('OPENAI_API_KEY'));assert.ok(!ui.includes('SERVICE_ROLE_KEY'));
});

test('milestone preview safely rejects blank, fractional and extreme values',()=>{
  const valid={lead_days:'60',production_days:'15',shipping_days:'7'};
  assert.equal(C.previewMilestones('2026-12-25',valid).length,4);
  for(const invalid of ['', ' ', '-1', '1.5', '1e308', 'Infinity', 'NaN', null, true, {}, Infinity]){
    for(const key of Object.keys(valid)){
      let result;assert.doesNotThrow(()=>{result=C.previewMilestones('2026-12-25',{...valid,[key]:invalid})});
      assert.equal(result,null,key+': '+String(invalid));
    }
  }
  for(const [key,value] of [['lead_days',366],['production_days',181],['shipping_days',91]])assert.equal(C.previewMilestones('2026-12-25',{...valid,[key]:value}),null);
  for(const date of ['2026-02-30','','0000-01-01'])assert.equal(C.previewMilestones(date,valid),null);
  assert.equal(C.previewMilestones('2026-12-25',{lead_days:0,production_days:0,shipping_days:0}).length,4);
  assert.equal(C.previewMilestones('2026-12-25',{lead_days:365,production_days:180,shipping_days:90}).length,4);
});
test('hidden filters override flex and timeline uses validated inputs',async()=>{
  const css=await read('commercial-calendar.css'),ui=await read('commercial-calendar.js');
  assert.match(css,/\.commercial \[hidden\]\{display:none!important\}/);
  assert.match(ui,/\.hidden=!\['agenda','plans'\]\.includes\(tab\)/);
  assert.match(ui,/C\.previewMilestones\(date,/);
});

test('all marketplaces expose seasonal planning without inventing platform announcements',()=>{
  assert.deepEqual(Array.from(C.MARKETPLACES),['Shopee','Mercado Livre','SHEIN']);
  for(const channel of C.MARKETPLACES){
    const items=C.channelEvents(C.baseline(2026),channel);
    const bf=items.find(e=>e.key.endsWith('black-friday:2026-11-27'));
    assert.ok(bf);assert.equal(bf.channel,channel);assert.equal(bf.status,'opportunity');assert.equal(bf.source_url,null);
    assert.match(bf.rule,/Não é anúncio/);assert.equal(new Set(items.map(e=>e.key)).size,items.length);
    const saved={...bf,status:'internal',plan:{status:'planning'}};
    assert.equal(C.channelEvents([...C.baseline(2026),saved],channel).filter(e=>e.key===bf.key).length,1);
  }
  assert.equal(C.baseline(2026).filter(e=>e.channel==='SHEIN').length,0);
});
test('coverage never turns unavailable or unsearched channels into a successful empty search',()=>{
  const now=new Date('2026-10-01T12:00:00Z'),base={settings:{enabled:true,pricing_approved:true},last_run:{status:'partial',finished_at:'2026-10-01T11:00:00Z',channel_results:[
    {channel:'Shopee',status:'completed',result_count:2},{channel:'Mercado Livre',status:'completed',result_count:0},{channel:'SHEIN',status:'failed',result_count:0}
  ]}};
  assert.match(C.coverage('SHEIN',base,now).label,/indisponível/);
  assert.match(C.coverage('Mercado Livre',base,now).label,/Sem novo anúncio verificável/);
  assert.match(C.coverage('SHEIN',{settings:{enabled:true}},now).label,/Ainda não/);
  assert.match(C.research(base.settings,base.last_run,null,now).label,/parcialmente/);
});
