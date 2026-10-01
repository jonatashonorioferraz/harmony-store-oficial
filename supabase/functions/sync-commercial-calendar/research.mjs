import {requestBody,parseProposals,consultedSources} from './validation.mjs';

export const RESEARCH_CHANNELS=[
  {channel:'Shopee',domains:['shopee.com.br']},
  {channel:'Mercado Livre',domains:['mercadolivre.com.br']},
  {channel:'SHEIN',domains:['br.shein.com','seller-br.shein.com']}
];
export function safeError(error){
  const allowed=new Set(['invalid_sources','provider_rate_limit','provider_error','incomplete_response','refused_response','invalid_response','invalid_proposal','unverified_source','invalid_date','invalid_publication_date','wrong_channel','no_consulted_sources','request_too_large']);
  if(allowed.has(error?.message))return error.message;
  return ['TimeoutError','AbortError'].includes(error?.name)?'provider_timeout':'sync_failed';
}
// Exactly one bounded request for EACH marketplace; no retries or cross-channel success.
export async function researchChannels(from,to,allowedDomains,requestProvider){
  return Promise.all(RESEARCH_CHANNELS.map(async spec=>{
    try{
      const domains=spec.domains.filter(domain=>allowedDomains.some(a=>domain===a||domain.endsWith('.'+a)));
      if(!domains.length)throw new Error('invalid_sources');
      const body=requestBody(from,to,domains,spec.channel);
      if(new TextEncoder().encode(JSON.stringify(body)).length>6000)throw new Error('request_too_large');
      const response=await requestProvider(body);
      if(!response.ok)throw new Error(response.status===429?'provider_rate_limit':'provider_error');
      const data=await response.json(),events=parseProposals(data,domains,from,to);
      if(events.length>6)throw new Error('invalid_response');
      if(events.some(e=>e.channel!==spec.channel))throw new Error('wrong_channel');
      if(!consultedSources(data,domains).size)throw new Error('no_consulted_sources');
      return {channel:spec.channel,status:'completed',events,input_tokens:data.usage?.input_tokens??null,output_tokens:data.usage?.output_tokens??null};
    }catch(error){return {channel:spec.channel,status:'failed',error_code:safeError(error),events:[]};}
  }));
}
