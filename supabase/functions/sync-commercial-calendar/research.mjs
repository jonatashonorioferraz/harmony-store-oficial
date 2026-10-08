import {requestBody,partitionProposals,consultedSources,researchEvidence} from './validation.mjs';
import {providerFailure} from './provider.mjs';
import {verifySourceEvidence} from './evidence.mjs';

export const RESEARCH_CHANNELS=[
  {channel:'Shopee',domains:['shopee.com.br']},
  {channel:'Mercado Livre',domains:['mercadolivre.com.br']},
  {channel:'SHEIN',domains:['br.shein.com','seller-br.shein.com']}
];
export function safeError(error){
  const allowed=new Set(['invalid_sources','provider_rate_limit','provider_error','incomplete_response','refused_response','invalid_response','invalid_proposal','unverified_source','invalid_date','invalid_publication_date','wrong_channel','no_consulted_sources','request_too_large','date_evidence_missing','content_not_campaign','source_unavailable']);
  if(allowed.has(error?.message))return error.message;
  return ['TimeoutError','AbortError'].includes(error?.name)?'provider_timeout':'sync_failed';
}
// Exactly one bounded request for EACH marketplace; no retries or cross-channel success.
export async function researchChannels(from,to,allowedDomains,requestProvider,requestSource){
  const sourceCache=new Map();
  return Promise.all(RESEARCH_CHANNELS.map(async spec=>{
    let evidence=null,usage={input_tokens:null,output_tokens:null};
    try{
      const domains=spec.domains.filter(domain=>allowedDomains.some(a=>domain===a||domain.endsWith('.'+a)));
      if(!domains.length)throw new Error('invalid_sources');
      const body=requestBody(from,to,domains,spec.channel);
      if(new TextEncoder().encode(JSON.stringify(body)).length>6000)throw new Error('request_too_large');
      const response=await requestProvider(body);
      if(!response.ok)return {channel:spec.channel,status:'failed',events:[],...await providerFailure(response)};
      const data=await response.json();
      evidence=researchEvidence(data,domains);
      for(const key of Object.keys(usage))if(Number.isSafeInteger(data.usage?.[key])&&data.usage[key]>=0)usage[key]=data.usage[key];
      let {events,rejections}=partitionProposals(data,domains,from,to,spec.channel);
      const verified=await Promise.all(events.map(async(event,index)=>{
        try{return {event:await verifySourceEvidence(event,domains,requestSource,sourceCache)};}
        catch(error){
          const code=['date_evidence_missing','content_not_campaign','source_unavailable'].includes(error?.message)?error.message:'source_unavailable';
          return {rejection:{index,code,reason:code,start_date:event.start_date,end_date:event.end_date}};
        }
      }));
      rejections.push(...verified.filter(x=>x.rejection).map(x=>x.rejection));
      const seen=new Set();
      events=verified.filter(x=>x.event).map(x=>x.event).filter(event=>{
        if(seen.has(event.fingerprint_input))return false;seen.add(event.fingerprint_input);return true;
      });
      const rejection_reasons={};
      for(const item of rejections)rejection_reasons[item.reason]=(rejection_reasons[item.reason]||0)+1;
      evidence={...evidence,validation_rejections:rejections};
      const validation={rejected_count:rejections.length,rejection_reasons};
      if(rejections.length&&!events.length)return {channel:spec.channel,status:'failed',error_code:rejections[0].code,events:[],evidence,...validation,...usage};
      if(!consultedSources(data,domains).size)throw new Error('no_consulted_sources');
      return {channel:spec.channel,status:rejections.length?'partial':'completed',error_code:rejections[0]?.code,events,evidence,...validation,...usage};
    }catch(error){return {channel:spec.channel,status:'failed',error_code:safeError(error),events:[],evidence,...usage};}
  }));
}
