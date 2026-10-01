import {requestBody} from './validation.mjs';

// Only allowlisted diagnostics leave the server. Never return upstream messages.
export async function providerFailure(response){
  let error={};try{error=(await response.json())?.error||{}}catch{/* HTML and empty errors are deliberately ignored. */}
  const status=Number(response.status);
  const codes=new Set(['invalid_api_key','insufficient_quota','rate_limit_exceeded','model_not_found','unsupported_parameter','unsupported_value','invalid_request_error','invalid_json_schema','server_error']);
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
  return {error_code:reason,http_status:status,provider_code:codes.has(error.code)?error.code:null,
    provider_param:params.has(error.param)?error.param:null,hint};
}
export async function providerPreflight(requestProvider){
  const body=requestBody('2026-10-01','2027-10-06',['shopee.com.br'],'Shopee');
  const model=await requestProvider('/v1/models/'+body.model,{method:'GET'});
  if(!model.ok)return {status:'failed',stage:'model_access',...await providerFailure(model)};
  const count=await requestProvider('/v1/responses/input_tokens',{method:'POST',body:JSON.stringify({
    model:body.model,input:body.input,instructions:body.instructions,tools:body.tools,tool_choice:body.tool_choice,text:body.text
  })});
  if(!count.ok)return {status:'failed',stage:'request_preflight',...await providerFailure(count)};
  const data=await count.json();
  return {status:'preflight_completed',model:body.model,input_tokens:Number.isInteger(data.input_tokens)?data.input_tokens:null,
    note:'Token counting is not a successful research run.'};
}
