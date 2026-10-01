import test from 'node:test';
import assert from 'node:assert/strict';
import {providerFailure,providerPreflight} from '../supabase/functions/sync-commercial-calendar/provider.mjs';
test('provider diagnosis distinguishes auth, quota, model, request and service errors',async()=>{
  for(const [status,code,expected] of [[401,'invalid_api_key','provider_authentication'],[403,null,'provider_permission'],[429,'insufficient_quota','provider_quota'],[429,null,'provider_rate_limit'],[404,'model_not_found','provider_model_unavailable'],[400,'invalid_request_error','provider_invalid_request'],[503,null,'provider_unavailable']]){
    assert.equal((await providerFailure({status,json:async()=>({error:{code}})})).error_code,expected);
  }
});
test('upstream messages, credentials and arbitrary codes never leave diagnosis',async()=>{
  const result=await providerFailure({status:400,json:async()=>({error:{message:'secret sk-private and confidential data',code:'private',param:'private'}})});
  assert.equal(result.provider_code,null);assert.equal(result.provider_param,null);assert.ok(!JSON.stringify(result).includes('private'));
});
test('search format incompatibility is identified without echoing upstream text',async()=>{
  const r=await providerFailure({status:400,json:async()=>({error:{message:'Web search cannot be used with json_schema response format. SECRET',param:'text.format'}})});
  assert.equal(r.hint,'search_format_incompatible');assert.equal(r.provider_param,'text.format');assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('preflight counts tokens only and never generates or searches',async()=>{
  const calls=[];
  const r=await providerPreflight(async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>({input_tokens:1500})}});
  assert.equal(r.status,'preflight_completed');assert.equal(calls.length,2);
  assert.match(calls[0].path,/^\/v1\/models\//);assert.equal(calls[1].path,'/v1/responses/input_tokens');
  assert.ok(calls.every(x=>x.path!=='/v1/responses'));
});
test('failed model access stops preflight without a second request',async()=>{
  let calls=0;const r=await providerPreflight(async()=>{calls++;return {ok:false,status:401,json:async()=>({error:{code:'invalid_api_key'}})}});
  assert.equal(calls,1);assert.equal(r.stage,'model_access');assert.equal(r.error_code,'provider_authentication');
});

test('catalog read denial does not imply response generation is denied',async()=>{
  let calls=0;const r=await providerPreflight(async()=>{calls++;return calls===1?{ok:false,status:403,json:async()=>({error:{message:'Missing scopes: api.model.read'}})}:{ok:true,status:200,json:async()=>({input_tokens:1000})}});
  assert.equal(calls,2);assert.equal(r.status,'preflight_completed');assert.deepEqual(r.model_access.missing_scopes,['api.model.read']);
});
test('region restrictions are classified without copying provider content',async()=>{
  const r=await providerFailure({status:403,json:async()=>({error:{code:'unsupported_country_region_territory',message:'Country not supported: secret'}})});
  assert.equal(r.hint,'provider_region_restricted');assert.ok(!JSON.stringify(r).includes('secret'));
});

test('operator diagnostics redact credentials and identifiers before returning text',async()=>{
  const r=await providerFailure({status:400,json:async()=>({error:{message:'Invalid secret-value sk-proj-abc123 Bearer abc.token test@example.com proj-123 value'}})},true,['secret-value']);
  assert.ok(!r.description.includes('secret-value'));assert.ok(!r.description.includes('sk-proj-abc123'));
  assert.ok(!r.description.includes('abc.token'));assert.ok(!r.description.includes('test@example.com'));
  assert.ok(!r.description.includes('proj-123'));assert.ok(r.description.length<=600);
});
test('format compatibility probe never invokes generation',async()=>{
  const calls=[];
  const r=await providerPreflight(async(path,options)=>{
    calls.push({path,options});
    if(calls.length===2)return {ok:false,status:400,json:async()=>({error:{param:'tools',message:'Unsupported combination'}})};
    return {ok:true,status:200,json:async()=>({input_tokens:1000})};
  });
  assert.equal(r.status,'preflight_completed_variant');assert.equal(r.recommended_format,'text');assert.equal(calls.length,3);
  assert.ok(calls.every(c=>c.path!=='/v1/responses'));
  assert.equal(JSON.parse(calls[2].options.body).text.format.type,'text');
});
