import test from 'node:test';
import assert from 'node:assert/strict';
import {researchChannels,RESEARCH_CHANNELS} from '../supabase/functions/sync-commercial-calendar/research.mjs';
const domains=['shopee.com.br','mercadolivre.com.br','br.shein.com','seller-br.shein.com'];
const date='2026-10-01',to='2027-10-06';
const result=(body,events=[],sources=true)=>({ok:true,status:200,json:async()=>({status:'completed',usage:{input_tokens:1200,output_tokens:100},output:[
  {type:'web_search_call',action:{sources:sources?[{url:'https://'+body.tools[0].filters.allowed_domains[0]+'/oficial'}]:[]}},
  {type:'message',content:[{type:'output_text',text:JSON.stringify({events})}]}
]})});
test('each marketplace receives its own bounded request with no private records',async()=>{
  const calls=[];
  const results=await researchChannels(date,to,domains,async body=>{calls.push(body);return result(body)});
  assert.equal(calls.length,3);assert.deepEqual(results.map(r=>r.channel),RESEARCH_CHANNELS.map(r=>r.channel));
  assert.ok(results.every(r=>r.status==='completed'&&r.events.length===0));
  for(let i=0;i<3;i++){
    assert.equal(calls[i].max_tool_calls,1);assert.equal(calls[i].max_output_tokens,3000);assert.equal(calls[i].store,false);
    assert.equal(calls[i].text.format.schema.properties.events.maxItems,6);
    assert.match(calls[i].input,new RegExp(RESEARCH_CHANNELS[i].channel));
    assert.ok(new TextEncoder().encode(JSON.stringify(calls[i])).length<=6000);
  }
  assert.deepEqual(calls[2].tools[0].filters.allowed_domains,['br.shein.com','seller-br.shein.com']);
});
test('one provider failure does not erase other channels or trigger a retry',async()=>{
  let count=0;
  const results=await researchChannels(date,to,domains,async body=>{count++;return body.input.includes('exclusivamente SHEIN')?{ok:false,status:429}:result(body)});
  assert.equal(count,3);assert.equal(results[2].status,'failed');assert.equal(results[2].error_code,'provider_rate_limit');
  assert.equal(results[0].status,'completed');assert.equal(results[1].status,'completed');
});
test('missing allowed sources skips only that channel without spending',async()=>{
  let calls=0;
  const results=await researchChannels(date,to,['shopee.com.br'],async body=>{calls++;return result(body)});
  assert.equal(calls,1);assert.equal(results[1].error_code,'invalid_sources');assert.equal(results[2].error_code,'invalid_sources');
});
test('no consulted official source is unavailable, not a successful zero',async()=>{
  const results=await researchChannels(date,to,domains,async body=>result(body,[],false));
  assert.ok(results.every(r=>r.status==='failed'&&r.error_code==='no_consulted_sources'));
});
test('channel-mismatched evidence cannot be accepted',async()=>{
  const results=await researchChannels(date,to,domains,async body=>result(body,[{
    title:'Campanha com data',start_date:date,end_date:date,channel:'Geral',
    source_url:'https://'+body.tools[0].filters.allowed_domains[0]+'/oficial',
    source_excerpt:'Edicao anunciada para primeiro de outubro de 2026.',source_published_at:date
  }]));
  assert.ok(results.every(r=>r.status==='failed'&&r.error_code==='wrong_channel'));
});
test('exceptions stay sanitized and all channels still receive their one attempt',async()=>{
  let calls=0;
  const results=await researchChannels(date,to,domains,async()=>{calls++;throw new Error('secret private upstream error')});
  assert.equal(calls,3);assert.ok(results.every(r=>r.error_code==='sync_failed'));assert.ok(!JSON.stringify(results).includes('secret'));
});
