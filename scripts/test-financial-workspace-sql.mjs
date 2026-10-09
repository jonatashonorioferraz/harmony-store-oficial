// Synthetic, in-memory PostgreSQL only. No remote URL or production fallback.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
if(!process.env.PGLITE_ROOT)throw Error('PGLITE_ROOT required');
const require=createRequire(join(process.env.PGLITE_ROOT,'package.json'));
const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();
const primary=randomUUID(),worker=randomUUID(),other=randomUUID(),company=randomUUID(),company2=randomUUID();
const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.result;
let passed=0;
async function identity(role,id=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role)}
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
const workspace=(id=company,query='',status='all',offset=0)=>scalar('select public.financial_workspace($1,$2,$3,$4) result',[id,query,status,offset]);
const documentId=randomUUID(),hash='a'.repeat(64);
let contract,payment;
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
 await db.query("insert into public.profiles values($1,'admin','active',true),($2,'collaborator','active',false),($3,'admin','active',false)",[primary,worker,other]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261008200451_financial_contracts_foundation.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261009013958_financial_contracts_workspace.sql',import.meta.url),'utf8'));
 await identity('authenticated',primary);
 await scalar('select public.create_financial_entity($1,$2) result',[company,'Empresa de teste']);await scalar('select public.create_financial_entity($1,$2) result',[company2,'Outra empresa']);
 await check('empty dashboard has explicit zeros, no sample business records',async()=>{const d=await workspace();assert.equal(d.count,0);assert.equal(d.summary.remaining,'0');assert.deepEqual(d.upcoming,[])});
 for(let i=0;i<27;i++){const data=await scalar('select public.create_financial_contract($1::jsonb) result',[JSON.stringify({entity_id:company,idempotency_key:randomUUID(),title:'Contrato teste '+i,creditor_name:'Credor sintetico',contract_date:'2020-01-01',installments:[{due_date:'2020-01-31',amount:'100.01'},{due_date:'2020-02-29',amount:'100.00'}]})]);if(i===0)contract=data.id}
 await check('summary includes contracts beyond the current page',async()=>{const d=await workspace();assert.equal(d.items.length,25);assert.equal(d.count,27);assert.equal(d.summary.scheduled,'5400.27');assert.equal(d.summary.overdue,'5400.27');assert.equal(d.upcoming.length,12);const p=await workspace(company,'','all',25);assert.equal(p.items.length,2)});
 await check('search is literal and does not affect company totals',async()=>{const d=await workspace(company,'Contrato teste 26');assert.equal(d.count,1);assert.equal(d.summary.contracts,27);assert.equal((await workspace(company,'%')).count,0)});
 await check('invalid pagination and status are rejected',async()=>{await assert.rejects(()=>workspace(company,'','invalid'));await assert.rejects(()=>workspace(company,'','all',-1))});
 await check('company balances are separated',async()=>assert.equal((await workspace(company2)).summary.contracts,0));
 const detail=await scalar('select public.financial_contract_detail($1) result',[contract]);
 payment=await scalar('select public.record_contract_payment($1,1,$2::jsonb) result',[contract,JSON.stringify({idempotency_key:randomUUID(),amount:'50.01',effective_date:'2020-01-15',kind:'regular',allocations:[{installment_id:detail.installments[0].id,amount:'50.01'}]})]);
 await check('partial payment is reflected in full company totals',async()=>{const d=await workspace();assert.equal(d.summary.paid,'50.01');assert.equal(d.summary.remaining,'5350.26')});
 await check('reverse restores balance without deleting the ledger',async()=>{await scalar('select public.reverse_contract_payment($1,2,$2,$3) result',[payment.id,randomUUID(),'Correcao de teste isolado']);assert.equal(Number((await workspace()).summary.paid),0)});
 for(const [role,id] of [['authenticated',worker],['authenticated',other],['anon',''],['service_role','']])await check('workspace denies '+role+' '+id.slice(0,5),async()=>{await identity(role,id);await assert.rejects(()=>workspace())});
 await identity('postgres');
 await check('original bucket is private with bounded formats and size',async()=>{const b=(await db.query("select * from storage.buckets where id='financial-contract-documents'")).rows[0];assert.equal(b.public,false);assert.equal(Number(b.file_size_limit),8388608);assert.equal(b.allowed_mime_types.length,3)});
 await check('document metadata has no direct write grants',async()=>{for(const role of ['anon','authenticated','service_role'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal(await scalar('select has_table_privilege($1,$2,$3) result',[role,'public.contract_documents',privilege]),false)});
 const path=company+'/'+contract+'/'+hash+'.pdf';
 const finalize=(actor=primary,id=documentId,name='contrato-teste.pdf',sha=hash,storagePath=path)=>scalar('select public.finalize_financial_document($1,$2,$3,null,$4,$5,$6,$7,$8) result',[actor,id,contract,name,'application/pdf',100,sha,storagePath]);
 await identity('service_role');
 await check('finalization requires a stored original',async()=>await assert.rejects(()=>finalize()));
 await identity('postgres');await db.query("insert into storage.objects(bucket_id,name,metadata) values('financial-contract-documents',$1,'{\"size\":100}')",[path]);await identity('service_role');
 await check('service finalization rechecks actor financial access',async()=>await assert.rejects(()=>finalize(worker)));
 await check('stored original can be linked once with idempotent replay',async()=>{const first=await finalize(),second=await finalize();assert.equal(first.id,second.id);assert.equal(first.sha256,hash)});
 await check('document replay cannot change metadata',async()=>await assert.rejects(()=>finalize(primary,documentId,'changed.pdf')));
 await check('same file cannot be counted as another financial document',async()=>await assert.rejects(()=>finalize(primary,randomUUID())));
 await identity('authenticated',primary);
 await check('authenticated caller cannot forge server integrity metadata',async()=>await assert.rejects(()=>finalize()));
 await check('owner reads private original via document authorization',async()=>assert.equal(await scalar('select count(*)::int result from storage.objects'),1));
 await identity('authenticated',worker);
 await check('collaborator cannot read document metadata or original',async()=>{assert.equal(await scalar('select count(*)::int result from public.contract_documents'),0);assert.equal(await scalar('select count(*)::int result from storage.objects'),0)});
 await identity('postgres');
 await check('immutable document and audit resist owner update/delete',async()=>{await assert.rejects(()=>db.exec('delete from public.contract_documents'));await assert.rejects(()=>db.exec('truncate public.contract_documents'));assert.equal(await scalar("select count(*)::int result from public.contract_audit_events where action='document.attached'"),1)});
 console.log(passed+' financial workspace scenarios passed. No production access.');
}finally{await db.close()}
