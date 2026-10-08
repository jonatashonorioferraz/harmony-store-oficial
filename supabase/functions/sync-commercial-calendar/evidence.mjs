// Public source verification. No browser session, credentials, retries or AI calls.
import {isoDate,sourceUrl} from './validation.mjs';

export const SOURCE_LIMIT=384*1024;
const HOSTS=new Set(['shopee.com.br','www.shopee.com.br','seller.shopee.com.br','ads.shopee.com.br',
  'mercadolivre.com.br','www.mercadolivre.com.br','vendedores.mercadolivre.com.br',
  'mercadolivreexperience.mercadolivre.com.br','br.shein.com','seller-br.shein.com']);
const fold=value=>String(value??'').normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const entities={nbsp:' ',amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',aacute:'a',eacute:'e',iacute:'i',oacute:'o',uacute:'u',atilde:'a',otilde:'o',acirc:'a',ecirc:'e',ocirc:'o',ccedil:'c',ndash:'-',mdash:'-'};
function decode(text){return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(all,entity)=>{
  if(entity[0]!=='#')return entities[entity.toLowerCase()]??all;
  const point=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
  return point>0&&point<=0x10ffff?String.fromCodePoint(point):' ';
});}
export function documentText(html){
  // Metadata, scripts and navigation cannot supply dates for a campaign.
  const clean=html.replace(/<!--[\s\S]*?(?:-->|$)/g,' ')
    .replace(/<(script|style|noscript|template|head|nav|header|footer|form|aside|svg|iframe)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,' ')
    .replace(/<([a-z][a-z0-9]*)\b[^>]*(?:\shidden(?:\s|=|>)|\saria-hidden\s*=\s*["']true["'])[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
  const content=clean.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)\s*>/i)?.[1]??clean;
  return fold(decode(content.replace(/<[^>]*>/g,' ')));
}
export function sourceIdentity(event){
  const u=new URL(event.source_url);
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'])u.searchParams.delete(key);
  u.hash='';u.searchParams.sort();
  return JSON.stringify(['source-evidence-v1',u.href,event.channel,event.start_date,event.end_date,event.event_kind]);
}
function fullDates(text){
  const found=new Set(),months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const put=(y,m,d)=>{const value=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');if(isoDate(value))found.add(value);};
  for(const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g))put(m[1],m[2],m[3]);
  for(const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g))put(m[3],m[2],m[1]);
  const pattern=new RegExp('\\b(?:(\\d{1,2})\\s*(?:a|ate|-)\\s*)?(\\d{1,2})\\s+de\\s+('+months.join('|')+')\\s+de\\s+(\\d{4})\\b','g');
  for(const m of text.matchAll(pattern)){const month=months.indexOf(m[3])+1;put(m[4],month,m[2]);if(m[1])put(m[4],month,m[1]);}
  return [...found].sort();
}
function nonCampaign(title,url){
  const t=fold(title),path=new URL(url).pathname;
  return path==='/'||/(?:^|\/)(?:login|signup|register|cadastro)(?:\/|$)/i.test(path)
    ||/\b(tutorial|tutoriais|guia|aprenda|como (?:criar|configurar|usar|utilizar|anunciar|vender|participar)|cadastro de vendedores|portal do vendedor|central do vendedor|torne-se um vendedor)\b/.test(t)
    ||(/\b(gmv max|ads facil|roas|product ads)\b/.test(t)&&!/\b(campanha|black friday|cyber monday|ofertas)\b/.test(t));
}
function safePublicUrl(value,domains){
  const url=sourceUrl(value,domains);
  return url&&HOSTS.has(new URL(url).hostname)?url:null;
}
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function readPublicSource(url,domains,requestSource){
  if(typeof requestSource!=='function'||!safePublicUrl(url,domains))throw new Error('source_unavailable');
  const origin=new URL(url).origin,signal=AbortSignal.timeout(8000);
  let target=url;
  for(let hop=0;hop<2;hop++){
    const response=await requestSource(target,{method:'GET',redirect:'manual',credentials:'omit',signal,
      headers:{Accept:'text/html, text/plain;q=0.9'}});
    if([301,302,303,307,308].includes(response.status)){
      await response.body?.cancel();
      const location=response.headers.get('location');
      if(!location||hop===1)throw new Error('source_unavailable');
      const next=safePublicUrl(new URL(location,target).href,domains);
      if(!next||new URL(next).origin!==origin)throw new Error('source_unavailable');
      target=next;continue;
    }
    if(!response.ok||!/^text\/(?:html|plain)\b/i.test(response.headers.get('content-type')||'')
      ||Number(response.headers.get('content-length')||0)>SOURCE_LIMIT||!response.body){
      await response.body?.cancel();throw new Error('source_unavailable');
    }
    const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
    let bytes=0,body='';
    try{
      while(true){
        signal.throwIfAborted();
        const chunk=await reader.read();if(chunk.done)break;
        bytes+=chunk.value.byteLength;if(bytes>SOURCE_LIMIT)throw new Error('source_unavailable');
        body+=decoder.decode(chunk.value,{stream:true});
      }
      body+=decoder.decode();
    }finally{await reader.cancel().catch(()=>{});}
    const html=/^text\/html\b/i.test(response.headers.get('content-type'));
    const title=html?fold(decode((body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]*>/g,' '))):'';
    const text=html?documentText(body):fold(body);
    if(!text)throw new Error('source_unavailable');
    return {text,title,document_sha256:await digest(text),checked_at:new Date().toISOString()};
  }
  throw new Error('source_unavailable');
}
export async function verifySourceEvidence(event,domains,requestSource,cache=new Map()){
  if(!['campaign','campaign_registration'].includes(event.event_kind)||nonCampaign(event.title,event.source_url))throw new Error('content_not_campaign');
  const quote=fold(event.source_excerpt),title=fold(event.title);
  if(quote.length<10||event.source_excerpt.length>420||!quote.includes(title)
    ||/\b(publicad[oa]|atualizad[oa]|copyright|ultima atualizacao)\b/.test(quote))throw new Error('date_evidence_missing');
  const dates=fullDates(quote);
  if(!dates.length||dates[0]!==event.start_date||dates.at(-1)!==event.end_date)throw new Error('date_evidence_missing');
  if(!cache.has(event.source_url))cache.set(event.source_url,readPublicSource(event.source_url,domains,requestSource).catch(()=>null));
  const source=await cache.get(event.source_url);
  if(!source)throw new Error('source_unavailable');
  if(source.title&&nonCampaign(source.title,event.source_url))throw new Error('content_not_campaign');
  if(!source.text.includes(quote))throw new Error('date_evidence_missing');
  return {...event,fingerprint_input:sourceIdentity(event),source_evidence:{
    version:1,kind:event.event_kind,document_sha256:source.document_sha256,checked_at:source.checked_at
  }};
}
