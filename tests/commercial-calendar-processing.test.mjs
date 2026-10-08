import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {partitionProposals,requestBody} from '../supabase/functions/sync-commercial-calendar/validation.mjs';
import {researchChannels} from '../supabase/functions/sync-commercial-calendar/research.mjs';
const from='2026-10-01',to='2027-10-06',url='https://shopee.com.br/m/black-friday';
const event={event_kind:'campaign',title:'Campanha de teste',start_date:'2026-11-27',end_date:'2026-11-27',channel:'Shopee',source_url:url,source_excerpt:'Campanha de teste acontece em 27 de novembro de 2026.',source_published_at:from};
const response=events=>({status:'completed',usage:{input_tokens:900,output_tokens:100},output:[
  {type:'web_search_call',status:'completed',action:{sources:[{url:url+'?utm_source=openai'}]}},
  {type:'message',content:[{type:'output_text',text:JSON.stringify({events})}]}
]});
const split=events=>partitionProposals(response(events),['shopee.com.br'],from,to,'Shopee');
const sourceFixture=async()=>new Response('<main>'+event.source_excerpt+'</main>',{headers:{'content-type':'text/html'}});
test('one past proposal does not discard a valid future proposal or change its year',()=>{
  const out=split([{...event,start_date:'2025-11-28',end_date:'2025-11-28'},event]);
  assert.equal(out.events.length,1);assert.equal(out.events[0].start_date,'2026-11-27');
  assert.equal(out.rejections[0].reason,'before_window');assert.equal(out.rejections[0].start_date,'2025-11-28');
});
test('malformed, inverted and outside-window dates have distinct rejection reasons',()=>{
  for(const [candidate,reason] of [
    [{...event,start_date:'27/11/2026'},'date_format'],
    [{...event,end_date:'2026-11-26'},'inverted_dates'],
    [{...event,end_date:'2028-01-01'},'after_window']
  ])assert.equal(split([candidate]).rejections[0].reason,reason);
});
test('unofficial and unconsulted URLs are rejected individually, not legalized',()=>{
  const out=split([{...event,source_url:'https://evil.test/private'}, {...event,source_url:url+'/invented'},event]);
  assert.equal(out.events.length,1);assert.deepEqual(out.rejections.map(x=>x.reason),['source_not_allowed','source_not_consulted']);
  assert.ok(!JSON.stringify(out.rejections).includes('private'));
});
test('duplicates collapse without converting malformed envelopes into success',()=>{
  assert.equal(split([event,event]).events.length,1);
  assert.throws(()=>split(Array(7).fill(event)),/invalid_response/);
  assert.throws(()=>partitionProposals({...response([]),status:'incomplete'},['shopee.com.br'],from,to,'Shopee'),/incomplete_response/);
});
test('mixed candidates preserve partial status, counts and failure details',async()=>{
  const out=await researchChannels(from,to,['shopee.com.br'],async()=>({ok:true,json:async()=>response([event,{...event,start_date:'2025-11-28',end_date:'2025-11-28'}])}),sourceFixture);
  assert.equal(out[0].status,'partial');assert.equal(out[0].events.length,1);assert.equal(out[0].rejected_count,1);
  assert.deepEqual(out[0].rejection_reasons,{before_window:1});
});
test('all-invalid, clean-empty and inaccessible sources remain different outcomes',async()=>{
  const run=async data=>(await researchChannels(from,to,['shopee.com.br'],async()=>({ok:true,json:async()=>data})))[0];
  const rejected=await run(response([{...event,start_date:'2025-01-01',end_date:'2025-01-01'}]));
  assert.equal(rejected.status,'failed');assert.equal(rejected.rejected_count,1);
  assert.equal((await run(response([]))).status,'completed');
  const absent=response([]);absent.output.shift();assert.equal((await run(absent)).error_code,'no_consulted_sources');
});
test('request constrains channel and date shape while keeping the existing cost envelope',()=>{
  for(const [channel,domains] of [['Shopee',['shopee.com.br']],['Mercado Livre',['mercadolivre.com.br']],['SHEIN',['br.shein.com','seller-br.shein.com']]]){
    const body=requestBody(from,to,domains,channel),properties=body.text.format.schema.properties.events.items.properties;
    assert.deepEqual(properties.channel.enum,[channel]);
    assert.ok(new RegExp(properties.start_date.pattern).test('2026-11-27'));
    assert.ok(!new RegExp(properties.start_date.pattern).test('27/11/2026'));
    assert.match(body.instructions,/Zero propostas/);assert.match(body.input,/DATA MINIMA: 2026-10-01/);
    assert.ok(new TextEncoder().encode(JSON.stringify(body)).length<=6000);
    assert.equal(body.max_tool_calls,1);assert.equal(body.max_output_tokens,3000);
  }
});
const context=vm.createContext({URL,Intl,Date,Map,Set});
vm.runInContext(await readFile(new URL('../commercial-calendar-core.js',import.meta.url),'utf8'),context);
const C=context.HarmonyCommercialCore,now=new Date('2026-10-01T16:00:00Z');
test('activation and rejected response are shown as independent truthful states',()=>{
  const d={settings:{enabled:true,pricing_approved:true},last_run:{status:'failed',finished_at:'2026-10-01T15:00:00Z',channel_results:['Shopee','Mercado Livre','SHEIN'].map(channel=>({channel,status:'failed',error_code:'invalid_date',rejected_count:1,rejection_reasons:{before_window:1}}))}};
  assert.equal(C.activation(d.settings),'IA habilitada');
  assert.match(C.research(d.settings,d.last_run,null,now).label,/não validadas/);
  assert.match(C.coverage('Shopee',d,now).label,/não validada/);assert.match(C.coverage('Shopee',d,now).detail,/anterior/);
  d.last_run.channel_results[0].error_code='provider_timeout';d.last_run.channel_results[0].rejection_reasons={};
  assert.match(C.coverage('Shopee',d,now).label,/indisponível/);
});
test('partial channel is visibly incomplete and never green',()=>{
  const d={settings:{enabled:true,pricing_approved:true},last_run:{status:'partial',finished_at:'2026-10-01T15:00:00Z',channel_results:[{channel:'Shopee',status:'partial',result_count:2,rejected_count:1,rejection_reasons:{source_not_allowed:1}}]}};
  assert.equal(C.coverage('Shopee',d,now).level,'warm');assert.match(C.coverage('Shopee',d,now).label,/2 proposta.*1 descartada/);
});
