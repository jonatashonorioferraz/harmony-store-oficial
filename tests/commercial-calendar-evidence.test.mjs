import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {documentText,readPublicSource,verifySourceEvidence,sourceIdentity,SOURCE_LIMIT} from '../supabase/functions/sync-commercial-calendar/evidence.mjs';
import {researchChannels} from '../supabase/functions/sync-commercial-calendar/research.mjs';
const domains=['shopee.com.br'];
const event={title:'Campanha 10.10',start_date:'2026-10-10',end_date:'2026-10-10',channel:'Shopee',
  source_url:'https://shopee.com.br/m/1010',source_excerpt:'Campanha 10.10 acontece em 10 de outubro de 2026.',source_published_at:null,event_kind:'campaign'};
const html=text=>new Response('<html><head><title>Campanha oficial</title></head><body><main>'+text+'</main></body></html>',{headers:{'content-type':'text/html; charset=utf-8'}});
const fetchFixture=async()=>html(event.source_excerpt);
const verify=(candidate,fetcher=fetchFixture)=>verifySourceEvidence(candidate,domains,fetcher);
const response=events=>({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[{url:event.source_url}]}},
  {type:'message',content:[{type:'output_text',text:JSON.stringify({events})}]}]});

test('acceptance requires a real retrieved quote, campaign name, full year and exact period',async()=>{
  const accepted=await verify(event);assert.equal(accepted.source_evidence.version,1);
  assert.match(accepted.source_evidence.document_sha256,/^[a-f0-9]{64}$/);
  assert.equal(accepted.source_excerpt,event.source_excerpt);
  assert.equal(accepted.fingerprint_input,sourceIdentity(event));
});
test('a consulted URL and a fabricated quote are not date evidence',async()=>{
  await assert.rejects(()=>verify(event,async()=>html('Campanha 10.10. Consulte o portal para datas.')),/date_evidence_missing/);
});
test('old editions, unsupported end dates, missing year and unrelated dates fail closed',async()=>{
  for(const candidate of [
    {...event,start_date:'2027-10-10',end_date:'2027-10-10'},
    {...event,end_date:'2026-10-12'},
    {...event,source_excerpt:'Campanha 10.10 acontece em 10 de outubro.'},
    {...event,source_excerpt:'Publicado em 10/10/2026. Campanha 10.10.'},
    {...event,title:'Outra campanha inventada'}
  ])await assert.rejects(()=>verify(candidate),/date_evidence_missing/);
});
test('shared-year date ranges are accepted only for their explicit endpoints',async()=>{
  const candidate={...event,end_date:'2026-10-12',source_excerpt:'Campanha 10.10 acontece de 10 a 12 de outubro de 2026.'};
  assert.equal((await verify(candidate,async()=>html(candidate.source_excerpt))).end_date,'2026-10-12');
  await assert.rejects(()=>verify({...candidate,end_date:'2026-10-13'}),/date_evidence_missing/);
});
test('ISO and Brazilian numeric dates retain their complete year',async()=>{
  for(const date of ['2026-10-10','10/10/2026']){
    const candidate={...event,source_excerpt:'Campanha 10.10 acontece em '+date+'.'};
    assert.equal((await verify(candidate,async()=>html(candidate.source_excerpt))).start_date,event.start_date);
  }
});
test('seller registration and educational proposals never request source content',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return html(event.source_excerpt);};
  for(const candidate of [
    {...event,event_kind:'educational'},
    {...event,event_kind:'seller_registration'},
    {...event,title:'Como criar anuncios'},
    {...event,title:'Guia de campanhas'},
    {...event,title:'Cadastro de vendedores SHEIN',source_url:'https://seller-br.shein.com/'},
    {...event,title:'Shopee GMV Max'},
    {...event,source_url:'https://shopee.com.br/'}
  ])await assert.rejects(()=>verify(candidate,fetcher),/content_not_campaign/);
  assert.equal(calls,0);
});
test('an educational page is rejected even when the model calls it a campaign',async()=>{
  await assert.rejects(()=>verify(event,async()=>new Response('<title>Como criar anuncios</title><main>'+event.source_excerpt+'</main>',{headers:{'content-type':'text/html'}})),/content_not_campaign/);
});
test('scripts, structured metadata and footer copyright cannot provide evidence',async()=>{
  const body='<head><title>Campanha</title></head><script type="application/ld+json">'+event.source_excerpt+'</script><main>Confira novidades.</main><footer>'+event.source_excerpt+'</footer>';
  assert.ok(!documentText(body).includes('2026'));
  await assert.rejects(()=>verify(event,async()=>new Response(body,{headers:{'content-type':'text/html'}})),/date_evidence_missing/);
});
test('markup, accents, whitespace and HTML entities do not fabricate or lose dates',async()=>{
  const candidate={...event,title:'Promoção 10.10',source_excerpt:'Promoção 10.10 acontece em 10 de outubro de 2026.'};
  const accepted=await verify(candidate,async()=>html('<b>Promo&ccedil;&atilde;o 10.10</b>&nbsp; acontece em 10 de outubro de 2026.'));
  assert.equal(accepted.title,candidate.title);
});
test('missing public access, HTTP errors and unsupported responses remain unavailable',async()=>{
  for(const fetcher of [
    undefined,async()=>{throw new Error('private secret upstream');},
    async()=>new Response('Login',{status:403}),
    async()=>new Response('{}',{headers:{'content-type':'application/json'}})
  ])await assert.rejects(()=>verifySourceEvidence(event,domains,fetcher),/source_unavailable/);
});
test('unknown subdomains, credentials and private addresses are never fetched',async()=>{
  let calls=0;
  for(const url of ['https://127.0.0.1/x','https://169.254.169.254/x','https://unknown.shopee.com.br/x','https://user:secret@shopee.com.br/x']){
    await assert.rejects(()=>readPublicSource(url,domains,async()=>{calls++;return html('x');}),/source_unavailable/);
  }
  assert.equal(calls,0);
});
test('only one same-origin redirect is followed and requests have no credentials',async()=>{
  const urls=[];
  const source=await readPublicSource(event.source_url,domains,async(url,options)=>{
    urls.push(url);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');assert.equal(options.method,'GET');
    assert.ok(!('Authorization' in options.headers));assert.ok(!('Cookie' in options.headers));
    return urls.length===1?new Response(null,{status:302,headers:{location:'/m/new-1010'}}):html(event.source_excerpt);
  });
  assert.equal(urls.length,2);assert.ok(source.text.includes('2026'));
  for(const location of ['https://evil.test/x','http://shopee.com.br/x','https://127.0.0.1/x','https://ads.shopee.com.br/x']){
    let calls=0;
    await assert.rejects(()=>readPublicSource(event.source_url,domains,async()=>{calls++;return new Response(null,{status:302,headers:{location}});}),/source_unavailable/);
    assert.equal(calls,1);
  }
});
test('response size is bounded both with and without Content-Length',async()=>{
  for(const headers of [{'content-type':'text/html','content-length':String(SOURCE_LIMIT+1)},{'content-type':'text/html'}]){
    await assert.rejects(()=>readPublicSource(event.source_url,domains,async()=>new Response('x'.repeat(SOURCE_LIMIT+1),{headers})),/source_unavailable/);
  }
});
test('titles and excerpts do not affect stable identity, editions still do',()=>{
  const key=sourceIdentity(event);
  assert.equal(key,sourceIdentity({...event,title:'Outro titulo',source_excerpt:'Outro resumo',source_url:event.source_url+'?utm_source=newsletter'}));
  assert.notEqual(key,sourceIdentity({...event,start_date:'2027-10-10'}));
  assert.notEqual(key,sourceIdentity({...event,source_url:event.source_url+'?edition=2025'}));
  assert.notEqual(key,sourceIdentity({...event,event_kind:'campaign_registration'}));
});
test('one source is retrieved once per run even with multiple proposals',async()=>{
  const cache=new Map();let calls=0;
  const fetcher=async()=>{calls++;return html(event.source_excerpt);};
  await Promise.all([verifySourceEvidence(event,domains,fetcher,cache),verifySourceEvidence(event,domains,fetcher,cache)]);
  assert.equal(calls,1);
});
test('quality failures preserve other proposals and never become a clean empty success',async()=>{
  let calls=0;
  const data=response([event,{...event,title:'Como criar anuncios',event_kind:'educational'}]);
  const result=(await researchChannels('2026-10-01','2027-10-06',domains,async()=>{calls++;return {ok:true,json:async()=>data};},fetchFixture))[0];
  assert.equal(calls,1);assert.equal(result.status,'partial');assert.equal(result.events.length,1);
  assert.equal(result.rejection_reasons.content_not_campaign,1);
  const failed=(await researchChannels('2026-10-01','2027-10-06',domains,async()=>({ok:true,json:async()=>response([event])}),async()=>html('Sem data.')))[0];
  assert.equal(failed.status,'failed');assert.equal(failed.error_code,'date_evidence_missing');
});
const context=vm.createContext({URL,Intl,Date,Map,Set});
vm.runInContext(await readFile(new URL('../commercial-calendar-core.js',import.meta.url),'utf8'),context);
const C=context.HarmonyCommercialCore;
test('legacy proposals remain separate and cannot masquerade as verified evidence',()=>{
  assert.equal(C.hasSourceEvidence(event),false);
  assert.equal(C.hasSourceEvidence({...event,source_evidence:{version:1}}),false);
  assert.equal(C.hasSourceEvidence({...event,source_evidence:{version:1,kind:'campaign',document_sha256:'a'.repeat(64),checked_at:'2026-10-08T12:00:00Z'}}),true);
  assert.match(C.rejectionDetail({rejection_reasons:{content_not_campaign:2,date_evidence_missing:1}}),/conteúdo|data/i);
});
