import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProposals,consultedSources,researchEvidence} from '../supabase/functions/sync-commercial-calendar/validation.mjs';
import {researchChannels} from '../supabase/functions/sync-commercial-calendar/research.mjs';
const url='https://shopee.com.br/m/campanha';
const event={title:'Campanha com fonte',start_date:'2026-10-10',end_date:'2026-10-10',channel:'Shopee',source_url:url,source_excerpt:'Anuncio da edicao de 10 de outubro de 2026.',source_published_at:'2026-10-01'};
const fixture=()=>({status:'completed',usage:{input_tokens:1200,output_tokens:150},output:[
  {type:'web_search_call',status:'completed',action:{sources:[]}},
  {type:'message',content:[{type:'output_text',text:JSON.stringify({events:[event]}),annotations:[{type:'url_citation',url}]}]}
]});
const parse=data=>parseProposals(data,['shopee.com.br'],'2026-10-01','2027-10-06');
test('completed search citations are valid evidence even without action sources',()=>{
  assert.equal(parse(fixture()).length,1);assert.equal(consultedSources(fixture(),['shopee.com.br']).size,1);
});
test('citation metadata without an actual completed search is rejected',()=>{
  for(const status of ['in_progress','failed',undefined]){
    const data=fixture();data.output[0].status=status;assert.throws(()=>parse(data),/unverified_source/);
  }
  const data=fixture();data.output.shift();assert.throws(()=>parse(data),/unverified_source/);
});
test('unofficial, malformed and different-reference citations cannot authorize proposals',()=>{
  for(const citation of [
    {type:'url_citation',url:'https://evil.test/campaign'},
    {type:'url_citation',url:url+'?different=1'},
    {type:'url_citation',url:'https://user:password@shopee.com.br/m/campanha'},
    {type:'file_citation',url},
    {type:'url_citation',url:'javascript:alert(1)'}
  ]){
    const data=fixture();data.output[1].content[0].annotations=[citation];assert.throws(()=>parse(data),/unverified_source/);
  }
});
test('generated JSON cannot forge provider citation metadata',()=>{
  const data=fixture();data.output[1].content[0].annotations=[];
  data.output[1].content[0].text=JSON.stringify({events:[event],annotations:[{type:'url_citation',url}]});
  assert.throws(()=>parse(data),/unverified_source/);
});
test('safe evidence diagnosis contains only counts and allowlisted public URLs',()=>{
  const data=fixture();data.output[1].content[0].text=JSON.stringify({events:[{...event,title:'PRIVATE_TITLE',source_excerpt:'PRIVATE_EXCERPT',source_url:'https://evil.test/PRIVATE_PATH'}]});
  const evidence=researchEvidence(data,['shopee.com.br']);
  assert.equal(evidence.search_call_count,1);assert.equal(evidence.search_source_count,0);
  assert.equal(evidence.citation_count,1);assert.equal(evidence.official_source_count,1);
  assert.deepEqual(evidence.proposal_sources,[{official_url:null,consulted:false}]);
  assert.ok(!JSON.stringify(evidence).includes('PRIVATE'));
});
test('failed source validation retains numeric usage and useful safe evidence',async()=>{
  const data=fixture();data.output[1].content[0].annotations=[];
  const results=await researchChannels('2026-10-01','2027-10-06',['shopee.com.br'],async()=>({ok:true,json:async()=>data}));
  assert.equal(results[0].status,'failed');assert.equal(results[0].error_code,'unverified_source');
  assert.equal(results[0].input_tokens,1200);assert.equal(results[0].output_tokens,150);
  assert.equal(results[0].evidence.official_source_count,0);
});

test('actual public source URLs match the same page without provider attribution',()=>{
  for(const page of [
    'https://shopee.com.br/m/black-friday',
    'https://mercadolivreexperience.mercadolivre.com.br/',
    'https://br.shein.com/sale/black-friday-local-underwear-sc-0052060138.html'
  ]){
    const domain=new URL(page).hostname,data=fixture();
    data.output[0].action.sources=[{url:page+'?utm_source=openai'}];
    data.output[1].content[0].annotations=[];
    data.output[1].content[0].text=JSON.stringify({events:[{...event,source_url:page}]});
    assert.equal(parseProposals(data,[domain],'2026-10-01','2027-10-06')[0].source_url,page);
  }
});
test('only the exact provider attribution is ignored; content and duplicate parameters remain significant',()=>{
  for(const query of ['edition=2025&utm_source=openai','utm_source=another','utm_source=openai&utm_source=another','utm_source=openai&campaign=wrong']){
    const data=fixture();data.output[0].action.sources=[{url:url+'?'+query}];data.output[1].content[0].annotations=[];
    assert.throws(()=>parse(data),/unverified_source/);
  }
});
test('provider attribution normalization is symmetric and preserves content parameters',()=>{
  const data=fixture();data.output[0].action.sources=[{url:url+'?edition=2026&utm_source=openai'}];data.output[1].content[0].annotations=[];
  data.output[1].content[0].text=JSON.stringify({events:[{...event,source_url:url+'?edition=2026'}]});
  assert.equal(parse(data)[0].source_url,url+'?edition=2026');
  data.output[0].action.sources=[{url}];data.output[1].content[0].text=JSON.stringify({events:[{...event,source_url:url+'?utm_source=openai'}]});
  assert.equal(parse(data)[0].source_url,url);
});
