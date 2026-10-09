import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {randomUUID,webcrypto} from 'node:crypto';
import {buildFinancialDocumentRequest,assessPaymentSuggestion,FinancialAIError} from '../supabase/functions/_shared/financial-document-ai.mjs';
const source=stripTypeScriptTypes((await readFile(new URL('../supabase/functions/analyze-financial-document/index.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''));
const entity=randomUUID(),actor=randomUUID(),intakeId=randomUUID(),contractId=randomUUID();
const bytes=new TextEncoder().encode('%PDF-1.7\nSYNTHETIC TEST DOCUMENT');
const intake={id:intakeId,entity_id:entity,contract_id:null,mode:'contract',storage_path:entity+'/ai-originals/test.pdf',mime_type:'application/pdf',byte_size:bytes.length};
const output={extraction:{document_kind:'contract',warnings:[]},usage:{input_tokens:1000,output_tokens:100},schema_version:'financial-document-v1'};
function fixture(settings={}){
 let handler;
 const calls=[],jobs=[],logs=[],state={paidCalls:0,uploads:0};
 const sourceIntake={...intake,...settings.intake};
 const service={auth:{getUser:async()=>settings.authError?{error:{message:'synthetic'},data:{user:null}}:{data:{user:{id:actor}},error:null}},
  storage:{from:name=>{assert.equal(name,'financial-contract-documents');return {
   upload:async(path,data,options)=>{state.uploads++;assert.equal(options.upsert,false);assert.ok(data.length);return {error:settings.uploadError||null}},
   download:async()=>({data:settings.originalMissing?null:new Blob([bytes],{type:'application/pdf'}),error:settings.originalMissing?{message:'synthetic'}:null})
  }}},
  rpc:async(name,args)=>{calls.push({name,args});
   if(name==='finalize_financial_ai_intake')return {data:{...sourceIntake,id:args.p_id,storage_path:args.p_path},error:null};
   if(name==='begin_financial_ai_run')return settings.budgetError?{data:null,error:{message:'Orcamento mensal esgotado'}}:{data:{start:!settings.replay,run:{id:args.p_run,status:settings.replay?'succeeded':'queued'}},error:null};
   if(name==='claim_financial_ai_run')return {data:settings.revoked?null:sourceIntake,error:null};
   if(name==='finish_financial_ai_run')return {data:null,error:null};
   throw Error('Unexpected privileged RPC: '+name);
  }};
 const client={rpc:async name=>{
  if(name==='financial_access')return {data:settings.denied?[]:[{id:entity,can_write:true}],error:null};
  if(name==='financial_contract_detail')return {data:{can_write:true,contract:{entity_id:settings.wrongContractEntity?randomUUID():entity,creditor_name:'Credor sintetico'},installments:[],payments:[]},error:null};
  throw Error('Unexpected client RPC: '+name);
 },from:table=>{assert.equal(table,'financial_ai_intakes');const query={select:()=>query,eq:()=>query,single:async()=>({data:settings.missingIntake?null:sourceIntake,error:null})};return query}};
 const context={Request,Response,TextDecoder,TextEncoder,Uint8Array,Blob,AbortController,atob,crypto:webcrypto,Intl,console:{error:x=>logs.push(x)},
  Deno:{env:{get:key=>({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',SUPABASE_ANON_KEY:'synthetic-public',OPENAI_API_KEY:settings.noKey?undefined:'synthetic-provider'}[key])},serve:fn=>{handler=fn}},
  EdgeRuntime:{waitUntil:promise=>jobs.push(promise)},
  createClient:(_url,key)=>key==='synthetic-service'?service:client,
  buildFinancialDocumentRequest,assessPaymentSuggestion,FinancialAIError,
  requestFinancialExtraction:async({apiKey,request})=>{assert.equal(apiKey,'synthetic-provider');assert.equal(request.store,false);state.paidCalls++;if(settings.providerError)throw new FinancialAIError('timeout',{costUncertain:true});return output}
 };
 runInNewContext(source,context,{timeout:1000});
 async function send(input={},headers={}){
  const request=new Request('https://example.test/functions/v1/analyze-financial-document',{method:'POST',headers:{Origin:'https://app.harmonylembrancinhas.com.br',Authorization:'Bearer synthetic-user-token','Content-Type':'application/json',...headers},body:JSON.stringify({entity_id:entity,intake_id:intakeId,run_id:randomUUID(),...input})});
  const response=await handler(request);await Promise.all(jobs);return {status:response.status,body:await response.json()};
 }
 return {send,state,calls,logs,jobs};
}
test('financial handler refuses untrusted origins before any auth, original or provider work',async()=>{const f=fixture();const r=await f.send({}, {Origin:'https://attacker.example'});assert.equal(r.status,403);assert.equal(f.calls.length,0);assert.equal(f.state.paidCalls,0)});
test('financial handler authenticates and checks company write access',async()=>{for(const settings of [{authError:true},{denied:true},{missingIntake:true}]){const f=fixture(settings),r=await f.send();assert.ok([401,403].includes(r.status));assert.equal(f.state.paidCalls,0);assert.equal(f.state.uploads,0)}});
test('financial handler does not start a paid task without a configured key',async()=>{const f=fixture({noKey:true}),r=await f.send();assert.equal(r.status,503);assert.equal(r.body.intake_id,intakeId);assert.equal(f.state.paidCalls,0);assert.equal(f.calls.length,0)});
test('financial handler returns a persisted job and does not mutate a financial ledger',async()=>{const f=fixture(),r=await f.send();assert.equal(r.status,202);assert.equal(f.state.paidCalls,1);assert.deepEqual(f.calls.map(x=>x.name),['begin_financial_ai_run','claim_financial_ai_run','finish_financial_ai_run']);const finish=f.calls.at(-1).args;assert.equal(finish.p_result.schema_version,'financial-document-v1');assert.equal(finish.p_input_tokens,1000);assert.equal(finish.p_error,null)});
test('financial handler resume never repeats a successful paid request',async()=>{const f=fixture({replay:true}),r=await f.send();assert.equal(r.status,200);assert.equal(f.state.paidCalls,0);assert.equal(f.jobs.length,0)});
test('financial handler enforces budget before calling the provider',async()=>{const f=fixture({budgetError:true}),r=await f.send();assert.equal(r.status,503);assert.equal(r.body.error,'budget_exhausted');assert.equal(f.state.paidCalls,0)});
test('financial handler revocation cancels the claim without provider access',async()=>{const f=fixture({revoked:true});await f.send();assert.equal(f.state.paidCalls,0);assert.equal(f.calls.filter(x=>x.name==='finish_financial_ai_run').length,0)});
test('financial handler missing original fails without paid work',async()=>{const f=fixture({originalMissing:true});await f.send();assert.equal(f.state.paidCalls,0);const last=f.calls.at(-1).args;assert.equal(last.p_result,null);assert.equal(last.p_error,'original_unavailable')});
test('financial handler provider timeout is recorded safely and never retried',async()=>{const f=fixture({providerError:true});await f.send();assert.equal(f.state.paidCalls,1);const last=f.calls.at(-1).args;assert.equal(last.p_result,null);assert.equal(last.p_input_tokens,null);assert.equal(last.p_error,'timeout');assert.deepEqual(f.logs,[])});
test('financial handler preserves original before reserving or reading it',async()=>{const f=fixture(),id=randomUUID();const r=await f.send({intake_id:null,id,mode:'contract',contract_id:null,name:'../contrato.pdf',mime:'application/pdf',base64:Buffer.from(bytes).toString('base64')});assert.equal(r.status,202);assert.equal(f.state.uploads,1);assert.equal(f.calls[0].name,'finalize_financial_ai_intake');assert.equal(f.calls[0].args.p_name,'contrato.pdf');assert.match(f.calls[0].args.p_sha256,/^[a-f0-9]{64}$/);assert.equal(f.calls[1].name,'begin_financial_ai_run')});
test('financial handler rejects misleading file signatures before storing',async()=>{const f=fixture();await f.send({intake_id:null,id:randomUUID(),mode:'contract',name:'unsafe.pdf',mime:'application/pdf',base64:Buffer.from('not a PDF').toString('base64')});assert.equal(f.state.uploads,0);assert.equal(f.state.paidCalls,0)});
test('financial handler refuses payment attachment to another company',async()=>{const f=fixture({wrongContractEntity:true});const r=await f.send({intake_id:null,id:randomUUID(),mode:'payment',contract_id:contractId,name:'comprovante.pdf',mime:'application/pdf',base64:Buffer.from(bytes).toString('base64')});assert.equal(r.status,403);assert.equal(f.state.uploads,0);assert.equal(f.state.paidCalls,0)});
