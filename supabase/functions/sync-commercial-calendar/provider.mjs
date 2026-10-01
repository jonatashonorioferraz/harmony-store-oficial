import {requestBody} from './validation.mjs';

// Routine failures expose allowlisted metadata only. Authenticated operator preflight may include a bounded, redacted error description.
export async function providerFailure(response,diagnostic=false,secrets=[]){
  let error={};try{error=(await response.json())?.error||{}}catch{/* HTML and empty errors are deliberately ignored. */}
  const status=Number(response.status);
  const codes=new Set(['invalid_api_key','insufficient_quota','rate_limit_exceeded','model_not_found','unsupported_parameter','unsupported_value','invalid_request_error','invalid_json_schema','server_error','unsupported_country_region_territory','permission_denied','insufficient_permissions']);
  const params=new Set(['model','tools','tools[0].type','tools[0].filters','tool_choice','max_tool_calls','max_output_tokens','text.format','text.format.type','text.format.schema','response_format']);
  const message=typeof error.message==='string'?error.message.toLowerCase():'';
  let reason='provider_error';
  if(status===401)reason='provider_authentication';
  else if(status===403)reason='provider_permission';
  else if(error.code==='insufficient_quota')reason='provider_quota';
  else if(status===429)reason='provider_rate_limit';
  else if(error.code==='model_not_found')reason='provider_model_unavailable';
  else if(status===400)reason='provider_invalid_request';
  else if(status>=500)reason='provider_unavailable';
  let hint=null;
  if(/web.?search/.test(message)&&/json|schema|format/.test(message))hint='search_format_incompatible';
  else if(/max_tool_calls/.test(message))hint='max_tool_calls_unsupported';
  else if(/web.?search/.test(message)&&/support/.test(message))hint='search_model_incompatible';
  if(/country|region|territory/.test(message)&&/support|restrict|block/.test(message))hint='provider_region_restricted';
  const missing_scopes=/missing scopes|insufficient permissions/.test(message)?['api.model.read','api.responses.write','api.responses.read','api.responses.input_tokens.write'].filter(scope=>message.includes(scope)):[];
  if(missing_scopes.length)hint='missing_api_scopes';
  let description;
  if(diagnostic){
    description=typeof error.message==='string'?error.message:'No JSON error description supplied.';
    for(const secret of secrets)if(secret)description=description.split(secret).join('[REDACTED]');
    description=description.replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [REDACTED]')
      .replace(/\bsk[-_][a-z0-9_*.-]+/gi,'[REDACTED_KEY]')
      .replace(/\b(?:proj|org|req)[-_][a-z0-9_-]+/gi,'[REDACTED_ID]')
      .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,'[REDACTED_EMAIL]').slice(0,600);
  }
  return {...(diagnostic?{description}:{}),missing_scopes,error_code:reason,http_status:status,provider_code:codes.has(error.code)?error.code:null,
    provider_param:params.has(error.param)?error.param:null,hint};
}
export async function providerPreflight(requestProvider,secrets=[]){
  const body=requestBody('2026-10-01','2027-10-06',['shopee.com.br'],'Shopee');
  const model=await requestProvider('/v1/models/'+body.model,{method:'GET'});
  const model_access=model.ok?{http_status:200}:await providerFailure(model,true,secrets);
  if(model.status===401)return {status:'failed',stage:'model_access',...model_access};
  const count=await requestProvider('/v1/responses/input_tokens',{method:'POST',body:JSON.stringify({
    model:body.model,input:body.input,instructions:body.instructions,tools:body.tools,tool_choice:body.tool_choice,text:body.text
  })});
  if(!count.ok){
    const failure=await providerFailure(count,true,secrets);
    if(count.status===400&&failure.provider_param==='tools'){
      const probe=await requestProvider('/v1/responses/input_tokens',{method:'POST',body:JSON.stringify({
        model:body.model,input:body.input,instructions:body.instructions,tools:body.tools,tool_choice:body.tool_choice,text:{format:{type:'text'}}
      })});
      if(probe.ok){const data=await probe.json();return {status:'preflight_completed_variant',recommended_format:'text',input_tokens:data.input_tokens,model_access,original_failure:failure};}
      return {status:'failed',stage:'request_preflight',model_access,original_failure:failure,text_probe:await providerFailure(probe,true,secrets)};
    }
    return {status:'failed',stage:'request_preflight',model_access,...failure};
  }
  const data=await count.json();
  return {status:'preflight_completed',model:body.model,model_access,input_tokens:Number.isInteger(data.input_tokens)?data.input_tokens:null,
    note:'Token counting is not a successful research run.'};
}
