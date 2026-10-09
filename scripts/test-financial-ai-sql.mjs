// Synthetic, in-memory PostgreSQL only. Never uses a remote database or real files.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
if(!process.env.PGLITE_ROOT)throw Error('PGLITE_ROOT required; no remote fallback.');
const require=createRequire(join(process.env.PGLITE_ROOT,'package.json'));
const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();
const root=process.env.FINANCIAL_AI_TEST_ROOT||resolve(import.meta.dirname,'..');
const migration=process.env.FINANCIAL_AI_TEST_MIGRATION||join(root,'supabase/migrations/20261009023940_financial_document_ai_review.sql');
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.result;
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
async function identity(role,id=''){assert.ok(['postgres','anon','authenticated','service_role'].includes(role));await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role)}
const primary=randomUUID(),writer=randomUUID(),reader=randomUUID(),outsider=randomUUID(),company=randomUUID(),company2=randomUUID();
const tables=['financial_ai_settings','financial_ai_intakes','financial_ai_runs','financial_ai_links'];
let contract,intake,runId,contractResult;
const contractInput={entity_id:company,idempotency_key:randomUUID(),title:'Contrato sintetico IA',creditor_name:'Credor sintetico',contract_date:'2020-01-01',installments:[{due_date:'2020-02-01',amount:'100.00'},{due_date:'2020-03-01',amount:'100.00'}]};
const state=(id=company,intakeId=null)=>scalar('select public.financial_ai_state($1,$2) result',[id,intakeId]);
const begin=(id,run=randomUUID(),retry=false,actor=writer)=>scalar('select public.begin_financial_ai_run($1,$2,$3,$4) result',[actor,id,run,retry]);
const claim=(run,actor=writer)=>scalar('select public.claim_financial_ai_run($1,$2) result',[actor,run]);
const finish=(run,result,tokens=[1000,100],error=null)=>scalar('select public.finish_financial_ai_run($1,$2,$3::jsonb,$4,$5,$6) result',[writer,run,result?JSON.stringify(result):null,tokens?.[0]??null,tokens?.[1]??null,error]);
let nextHash=1;
async function storeIntake({entity=company,mode='contract',contractId=null,actor=writer,id=randomUUID(),hash=(nextHash++).toString(16).padStart(64,'0'),stored=true}={}){
 const path=entity+'/ai-originals/'+hash+'.pdf';
 if(stored){await identity('postgres');await db.query("insert into storage.objects(bucket_id,name,metadata) values('financial-contract-documents',$1,'{\"size\":100}')",[path]);}
 await identity('service_role');
 return scalar('select public.finalize_financial_ai_intake($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',[actor,id,entity,contractId,mode,'original-sintetico.pdf','application/pdf',100,hash,path]);
}
const result={extraction:{document_kind:'contract'},schema_version:'financial-document-v1',usage:{input_tokens:1000,output_tokens:100},assessment:null};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;create schema storage;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create table public.profiles(id uuid primary key,role text,status text,is_primary_admin boolean default false);
 create function private.is_primary_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active' and is_primary_admin)$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;grant select on storage.objects to authenticated;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
 await db.query("insert into public.profiles values($1,'admin','active',true),($2,'admin','active',false),($3,'admin','active',false),($4,'admin','active',false)",[primary,writer,reader,outsider]);
 for(const file of ['20261008200451_financial_contracts_foundation.sql','20261009013958_financial_contracts_workspace.sql'])await db.exec(await readFile(join(root,'supabase/migrations',file),'utf8'));
 await check('migration creates no contracts or payments and starts disabled',async()=>{await db.exec(await readFile(migration,'utf8'));assert.equal(await scalar('select enabled result from public.financial_ai_settings'),false);assert.equal(await scalar('select count(*)::int result from public.financial_contracts'),0);assert.equal(await scalar('select count(*)::int result from public.contract_payments'),0)});
 await check('RLS and opt-in grants on every AI table',async()=>{for(const table of tables){assert.equal(await scalar('select relrowsecurity result from pg_class where oid=$1::regclass',['public.'+table]),true);for(const role of ['anon','authenticated','service_role'])for(const op of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal(await scalar('select has_table_privilege($1,$2,$3) result',[role,'public.'+table,op]),false)}});
 await check('server RPCs are not exposed to clients',async()=>{const functions=(await db.query("select oid::regprocedure::text signature,proname from pg_proc where proname in ('finalize_financial_ai_intake','begin_financial_ai_run','claim_financial_ai_run','finish_financial_ai_run')")).rows;assert.equal(functions.length,4);for(const f of functions){for(const role of ['anon','authenticated'])assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE') result",[role,f.signature]),false);assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE') result",[f.signature]),true)}});
 await identity('authenticated',primary);
 for(const [id,name] of [[company,'Empresa sintetica A'],[company2,'Empresa sintetica B']])await scalar('select public.create_financial_entity($1,$2) result',[id,name]);
 await scalar('select public.set_financial_permission($1,$2,$3) result',[company,writer,'write']);await scalar('select public.set_financial_permission($1,$2,$3) result',[company,reader,'read']);
 await check('only a financial writer may preserve an original',async()=>{await assert.rejects(()=>storeIntake({actor:reader}));await assert.rejects(()=>storeIntake({actor:outsider}));await assert.rejects(()=>storeIntake({entity:company2}));await assert.rejects(()=>storeIntake({stored:false}));});
 intake=await storeIntake();
 await check('same original resumes its intake without overwriting it',async()=>{const same=await storeIntake({hash:intake.sha256,stored:false});assert.equal(same.id,intake.id);assert.equal(same.storage_path,intake.storage_path)});
 await check('disabled AI does not reserve budget or remove the original',async()=>{await assert.rejects(()=>begin(intake.id));await identity('postgres');assert.equal(await scalar('select count(*)::int result from public.financial_ai_runs'),0);assert.equal(await scalar('select count(*)::int result from public.financial_ai_intakes'),1)});
 await db.exec('update public.financial_ai_settings set enabled=true');await identity('service_role');
 await check('begin reserves once, replay and concurrent request do not duplicate',async()=>{runId=randomUUID();const a=await begin(intake.id,runId);assert.equal(a.start,true);assert.equal((await begin(intake.id,runId)).start,false);assert.equal((await begin(intake.id)).start,false)});
 await check('clients cannot forge a result or bypass review',async()=>{await identity('authenticated',writer);await assert.rejects(()=>finish(runId,result));await assert.rejects(()=>scalar('select public.confirm_financial_ai_contract($1,$2::jsonb,true) result',[runId,JSON.stringify(contractInput)]));await identity('service_role')});
 await check('claim executes a queued job at most once',async()=>{assert.equal((await claim(runId)).id,intake.id);assert.equal(await claim(runId),null)});
 await check('successful extraction stores suggestions, not financial records',async()=>{await finish(runId,result);await identity('postgres');assert.equal(await scalar('select count(*)::int result from public.financial_contracts'),0);assert.equal(await scalar('select count(*)::int result from public.contract_payments'),0);assert.equal(await scalar('select status result from public.financial_ai_runs where id=$1',[runId]),'succeeded');assert.ok(Number(await scalar('select estimated_cost_brl result from public.financial_ai_runs where id=$1',[runId]))<2)});
 await identity('authenticated',writer);
 await check('read state restores previous original and successful result',async()=>{const d=await state(company,intake.id);assert.equal(d.items.length,1);assert.equal(d.items[0].run.id,runId);assert.equal(d.items[0].run.result.schema_version,'financial-document-v1')});
 await check('human review checkbox is enforced on the server',async()=>await assert.rejects(()=>scalar('select public.confirm_financial_ai_contract($1,$2::jsonb,false) result',[runId,JSON.stringify(contractInput)])));
 await check('contract confirmation atomically links original and human input',async()=>{contractResult=await scalar('select public.confirm_financial_ai_contract($1,$2::jsonb,true) result',[runId,JSON.stringify(contractInput)]);contract=contractResult.id;const docs=await scalar('select public.financial_all_documents($1) result',[contract]);assert.equal(docs.length,1);assert.equal(docs[0].sha256,intake.sha256);const d=await scalar('select public.financial_contract_detail($1) result',[contract]);assert.equal(d.payments.length,0);assert.ok(d.audit.some(e=>e.action==='ai.contract_reviewed'))});
 await check('confirmation replay cannot create another contract or change review',async()=>{assert.equal((await scalar('select public.confirm_financial_ai_contract($1,$2::jsonb,true) result',[runId,JSON.stringify(contractInput)])).id,contract);await assert.rejects(()=>scalar('select public.confirm_financial_ai_contract($1,$2::jsonb,true) result',[runId,JSON.stringify({...contractInput,title:'Different'})]))});
 await check('reader can inspect originals but cannot confirm',async()=>{await identity('authenticated',reader);assert.equal((await state()).items.length,1);assert.ok(await scalar('select count(*)::int result from storage.objects')>0);await assert.rejects(()=>scalar('select public.confirm_financial_ai_contract($1,$2::jsonb,true) result',[runId,JSON.stringify(contractInput)]))});
 await check('unrelated administrator sees neither originals nor extracted data',async()=>{await identity('authenticated',outsider);assert.equal(await scalar('select count(*)::int result from public.financial_ai_intakes'),0);assert.equal(await scalar('select count(*)::int result from public.financial_ai_runs'),0);assert.equal(await scalar('select count(*)::int result from storage.objects'),0);await assert.rejects(()=>state())});
 const pending=await storeIntake({mode:'payment',contractId:contract}),badRun=randomUUID();await begin(pending.id,badRun);await claim(badRun);await finish(badRun,{...result,extraction:{document_kind:'payment_schedule'},assessment:{payment_suggestion_allowed:false}});
 await identity('authenticated',writer);
 const d=await scalar('select public.financial_contract_detail($1) result',[contract]);
 const payInput={idempotency_key:randomUUID(),amount:'50.00',effective_date:'2020-01-15',kind:'regular',transaction_reference:'SYNTHETIC-001',allocations:[{installment_id:d.installments[0].id,amount:'50.00'}]};
 const confirmPay=(run,review=true,rev=1,data=payInput)=>scalar('select public.confirm_financial_ai_payment($1,$2,$3,$4::jsonb,$5) result',[run,contract,rev,JSON.stringify(data),review]);
 await check('scheduled transfer cannot be promoted to payment',async()=>await assert.rejects(()=>confirmPay(badRun)));
 const receipt=await storeIntake({mode:'payment',contractId:contract}),goodRun=randomUUID();await begin(receipt.id,goodRun);await claim(goodRun);await finish(goodRun,{...result,extraction:{document_kind:'payment_receipt'},assessment:{payment_suggestion_allowed:true}});await identity('authenticated',writer);
 await check('payment review, revision, and allocations remain authoritative',async()=>{await assert.rejects(()=>confirmPay(goodRun,false));await assert.rejects(()=>confirmPay(goodRun,true,9));await assert.rejects(()=>confirmPay(goodRun,true,1,{...payInput,amount:'50.01'}));assert.equal((await scalar('select public.financial_contract_detail($1) result',[contract])).payments.length,0)});
 await check('confirmed receipt links once and replay does not pay twice',async()=>{const first=await confirmPay(goodRun),again=await confirmPay(goodRun);assert.equal(first.id,again.id);const detail=await scalar('select public.financial_contract_detail($1) result',[contract]);assert.equal(detail.payments.length,1);assert.equal(Number(detail.totals.paid_amount),50);const docs=await scalar('select public.financial_all_documents($1) result',[contract]);assert.equal(docs.length,2);assert.equal(docs.find(x=>x.ai_run_id===goodRun).payment_id,first.id)});
 const failed=await storeIntake(),failedRun=randomUUID();await begin(failed.id,failedRun);await claim(failedRun);await finish(failedRun,null,null,'timeout');
 await check('failure retains conservative reservation and never auto-retries',async()=>{assert.equal((await begin(failed.id)).run.id,failedRun);assert.equal((await begin(failed.id)).start,false);await identity('postgres');assert.equal(await scalar('select estimated_cost_brl result from public.financial_ai_runs where id=$1',[failedRun]),null);assert.equal(Number(await scalar('select reserved_brl result from public.financial_ai_runs where id=$1',[failedRun])),2)});
 await check('explicit retry creates a separate audited reservation',async()=>{await identity('service_role');const retry=await begin(failed.id,randomUUID(),true);assert.equal(retry.start,true);assert.notEqual(retry.run.id,failedRun)});
 const revoked=await storeIntake(),revokeRun=randomUUID();await begin(revoked.id,revokeRun);await identity('authenticated',primary);await scalar('select public.set_financial_permission($1,$2,$3) result',[company,writer,'revoked']);
 await check('permission revocation is rechecked before paid work',async()=>{await identity('service_role');assert.equal(await claim(revokeRun),null);assert.equal(await scalar('select started_at result from public.financial_ai_runs where id=$1',[revokeRun]),null);await identity('authenticated',writer);await assert.rejects(()=>state())});
 await identity('authenticated',primary);await scalar('select public.set_financial_permission($1,$2,$3) result',[company,writer,'write']);
 await check('monthly limit cannot exceed user approval or drift exchange reference',async()=>{await identity('postgres');await assert.rejects(()=>db.exec('update public.financial_ai_settings set monthly_limit_brl=31'));await assert.rejects(()=>db.exec('update public.financial_ai_settings set usd_brl_reference=1'))});
 await check('budget guard is shared and stops reservations before exceeding limit',async()=>{await identity('postgres');await db.exec('update public.financial_ai_settings set monthly_limit_brl=10');const budgetIntake=await storeIntake();let blocked=false;for(let i=0;i<7;i++){try{const job=await begin(budgetIntake.id,randomUUID(),true);await claim(job.run.id);await finish(job.run.id,null,null,'timeout')}catch{blocked=true;break}}assert.equal(blocked,true);await identity('postgres');const used=await scalar('select sum(coalesce(estimated_cost_brl,reserved_brl)) result from public.financial_ai_runs');assert.ok(Number(used)<=10)});
 await check('history is immutable and service has read-only backup access',async()=>{for(const table of ['financial_ai_intakes','financial_ai_links']){await assert.rejects(()=>db.exec('delete from public.'+table));await assert.rejects(()=>db.exec('truncate public.'+table))}for(const table of tables)assert.equal(await scalar("select has_table_privilege('service_role',$1,'SELECT') result",['public.'+table]),true)});
 if(process.env.FINANCIAL_AI_CATALOG_OUTPUT){
  const catalog=[];
  for(const table of tables){
   const primaryKey=(await db.query(`select a.attname from pg_constraint c join unnest(c.conkey) with ordinality k(attnum,n) on true join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum where c.conrelid=$1::regclass and c.contype='p' order by k.n`,['public.'+table])).rows.map(x=>x.attname);
   const foreignKeys=(await db.query(`select array(select a.attname from unnest(c.conkey) with ordinality k(n,i) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.n order by k.i) columns,ns.nspname schema,t.relname as table,c.condeferrable deferrable,array(select a.attname from unnest(c.confkey) with ordinality k(n,i) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.n order by k.i) as "targetColumns" from pg_constraint c join pg_class t on t.oid=c.confrelid join pg_namespace ns on ns.oid=t.relnamespace where c.conrelid=$1::regclass and c.contype='f' order by c.conname`,['public.'+table])).rows;
   const triggers=(await db.query('select tgname from pg_trigger where tgrelid=$1::regclass and not tgisinternal order by tgname',['public.'+table])).rows.map(x=>x.tgname);
   catalog.push({name:table,primaryKey,foreignKeys,generated:[],triggers,serviceSelect:true,serviceInsert:false,capture:true,classification:'business',retention:'Capture retained financial AI originals metadata, budget reservations, results and human review links. Originals are private Storage objects; long-term recovery is not certified.'});
  }
  await writeFile(process.env.FINANCIAL_AI_CATALOG_OUTPUT,JSON.stringify(catalog,null,2));
 }
 console.log(passed+' financial AI SQL scenarios passed. No production access.');
}finally{await db.close()}
