// Isolated SQL integration tests; never connects to Supabase or production.
// Provide PGLITE_ROOT pointing to an existing isolated installation.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
if(!process.env.PGLITE_ROOT)throw new Error('PGLITE_ROOT is required; no remote fallback is permitted.');
const require=createRequire(join(process.env.PGLITE_ROOT,'package.json'));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const adminId='11111111-1111-4111-8111-111111111111',workerId='22222222-2222-4222-8222-222222222222',inactiveId='33333333-3333-4333-8333-333333333333';
const migration=await readFile(resolve(import.meta.dirname,'../supabase/migrations/20261001013000_commercial_calendar.sql'),'utf8');
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
const call=async(sql,args=[])=>{const r=await db.query(sql,args);return r.rows[0]?.result};
async function identity(role,uid=''){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)",[role,uid]);
  await db.exec('set role '+role);
}
try{
  await db.exec(String.raw`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create table public.profiles(id uuid primary key,role text,status text,full_name text);
    insert into public.profiles values
      ('11111111-1111-4111-8111-111111111111','admin','active','Admin Teste'),
      ('22222222-2222-4222-8222-222222222222','collaborator','active','Colaboradora Teste'),
      ('33333333-3333-4333-8333-333333333333','admin','inactive','Admin Inativo');
  `);
  await check('migration applies twice without enabling paid research',async()=>{
    await db.exec(migration);await db.exec(migration);
    const s=await call('select to_jsonb(s) result from public.commercial_calendar_settings s');
    assert.equal(s.enabled,false);assert.equal(s.pricing_approved,false);assert.equal(s.monthly_budget_cents,3000);
  });
  const dashboard=()=>call("select public.commercial_calendar_dashboard(current_date,current_date+90) result");
  await check('anonymous, collaborator and inactive administrator denied',async()=>{
    await identity('anon');await assert.rejects(dashboard,/permission denied/);
    await identity('authenticated',workerId);await assert.rejects(dashboard,/Acesso administrativo/);
    await identity('authenticated',inactiveId);await assert.rejects(dashboard,/Acesso administrativo/);
  });
  await check('active administrator can read only through guarded RPCs',async()=>{
    await identity('authenticated',adminId);
    assert.equal((await dashboard()).owners.length,1);
    await assert.rejects(()=>db.query('select * from public.commercial_calendar_settings'),/permission denied/);
    await assert.rejects(()=>db.query('update public.commercial_calendar_settings set enabled=true'),/permission denied/);
    await assert.rejects(()=>call('select public.claim_commercial_calendar_sync() result'),/permission denied/);
  });
  const plan={event_key:'manual:test',title:'Campanha de teste',event_date:'2026-12-25',channel:'Geral',owner_id:adminId,status:'planning',lead_days:60,production_days:15,shipping_days:7,checklist:{offer:false,stock:false,creative:false,logistics:false},notes:'Somente teste',revision:0};
  const save=p=>call('select public.save_commercial_campaign($1::jsonb) result',[JSON.stringify(p)]);
  await check('plan creation and optimistic revision preserve concurrent work',async()=>{
    const saved=await save(plan);assert.equal(saved.revision,1);
    await assert.rejects(()=>save({...plan,notes:'stale'}),/Este plano mudou/);
    const updated=await save({...plan,revision:1,notes:'Atualizado'});assert.equal(updated.revision,2);
  });
  await check('invalid owner, checklist, timing and premature readiness rejected',async()=>{
    await assert.rejects(()=>save({...plan,revision:2,owner_id:workerId}),/Responsavel invalido/);
    await assert.rejects(()=>save({...plan,revision:2,checklist:{offer:'true'}}),/Checklist invalido/);
    await assert.rejects(()=>save({...plan,revision:2,lead_days:1}),/Antecedencia/);
    await assert.rejects(()=>save({...plan,revision:2,status:'ready'}),/Conclua o checklist/);
    const saved=await save({...plan,revision:2,status:'ready',checklist:{offer:true,stock:true,creative:true,logistics:true}});assert.equal(saved.revision,3);
  });
  await check('disabled research cannot reserve a paid attempt',async()=>{
    await identity('service_role');
    assert.equal((await call('select public.claim_commercial_calendar_sync() result')).reason,'disabled');
  });
  let run,day,event;
  await check('atomic daily reservation admits one attempt only',async()=>{
    await db.query('update public.commercial_calendar_settings set enabled=true,pricing_approved=true');
    run=await call('select public.claim_commercial_calendar_sync() result');
    assert.equal(run.allowed,true);assert.equal(run.reserved_cents,100);day=run.run_day;
    assert.equal((await call('select public.claim_commercial_calendar_sync() result')).reason,'already_attempted');
  });
  const finish=(events,error=null)=>call('select public.finish_commercial_calendar_sync($1,$2::jsonb,$3,null,null) result',[run.run_id,JSON.stringify(events),error]);
  await check('untrusted sources cannot be ingested',async()=>{
    event={fingerprint:'a'.repeat(64),title:'Campanha futura',start_date:day,end_date:day,channel:'Shopee',source_url:'https://shopee.com.br.evil.test/offer',source_excerpt:'Publicacao com data informada para a edicao atual.',source_published_at:day};
    await assert.rejects(()=>finish([event]),/Fonte nao autorizada/);
  });
  await check('ingestion only creates pending proposals and a completed ledger entry',async()=>{
    event.source_url='https://shopee.com.br/m/test-calendar';
    const result=await finish([event]);assert.equal(result.status,'completed');
    const saved=await call('select to_jsonb(e) result from public.commercial_calendar_events e');
    assert.equal(saved.status,'pending');event=saved;
    await assert.rejects(()=>finish([]),/Execucao indisponivel/);
  });
  await check('human review is audited and rejects stale decisions',async()=>{
    await identity('authenticated',adminId);
    const reviewed=await call("select public.review_commercial_event($1,1,'confirmed',null) result",[event.id]);
    assert.equal(reviewed.status,'confirmed');assert.equal(reviewed.reviewed_by,adminId);
    await assert.rejects(()=>call("select public.review_commercial_event($1,1,'rejected',null) result",[event.id]),/Esta proposta mudou/);
    await identity('service_role');
    const count=await call('select count(*)::integer result from public.commercial_calendar_audit');
    assert.equal(count,4);
  });
  await check('budget blocks future attempts without refunding failures',async()=>{
    await db.exec('reset role');
    await db.query("update public.commercial_calendar_runs set run_day=(now() at time zone 'America/Sao_Paulo')::date-1,status='failed'");
    // Use the current month explicitly even on its first day.
    await db.query("update public.commercial_calendar_runs set run_day=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date");
    await db.query('update public.commercial_calendar_settings set monthly_budget_cents=0');
    // Existing-day guard also prevents spending. Remove that isolated fixture only,
    // then reserve a prior-date row if the current month has another day.
    await db.query('delete from public.commercial_calendar_events');
    await db.query('delete from public.commercial_calendar_runs');
    await identity('service_role');
    assert.equal((await call('select public.claim_commercial_calendar_sync() result')).reason,'budget_blocked');
    await db.query('update public.commercial_calendar_settings set monthly_budget_cents=100');
    const attempt=await call('select public.claim_commercial_calendar_sync() result');run=attempt;
    await finish([],'provider_timeout');
    const sum=await call('select sum(reserved_cents)::integer result from public.commercial_calendar_runs');assert.equal(sum,100);
    assert.equal((await call('select public.claim_commercial_calendar_sync() result')).reason,'already_attempted');
  });
  console.log('SQL isolated: '+passed+' scenarios passed; no remote connections.');
} finally {await db.close()}
