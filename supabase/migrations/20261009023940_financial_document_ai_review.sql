-- AI is an audited draft, never authority to create or settle a financial record.
begin;
create table public.financial_ai_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 monthly_limit_brl numeric(10,2) not null default 30 check(monthly_limit_brl between 0 and 30),
 usd_brl_reference numeric(8,4) not null default 6.5 check(usd_brl_reference=6.5),
 model text not null default 'gpt-5.6-luna' check(model='gpt-5.6-luna')
);
insert into public.financial_ai_settings(id) values(true);
create table public.financial_ai_intakes (
 id uuid primary key, entity_id uuid not null references public.financial_entities(id),
 contract_id uuid, mode text not null check(mode in ('contract','payment')),
 original_name text not null check(length(original_name) between 1 and 180),
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 byte_size integer not null check(byte_size between 1 and 8388608),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), storage_path text not null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 unique(id,entity_id), foreign key(contract_id,entity_id) references public.financial_contracts(id,entity_id),
 check((mode='contract' and contract_id is null) or (mode='payment' and contract_id is not null))
);
create unique index financial_ai_intakes_content_idx on public.financial_ai_intakes(entity_id,sha256,mode,coalesce(contract_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index financial_ai_intakes_contract_idx on public.financial_ai_intakes(contract_id);
create index financial_ai_intakes_created_idx on public.financial_ai_intakes(entity_id,created_at desc,id desc);
create table public.financial_ai_runs (
 id uuid primary key, intake_id uuid not null, entity_id uuid not null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 budget_month date not null, reserved_brl numeric(10,2) not null default 2 check(reserved_brl=2),
 estimated_cost_brl numeric(12,6), input_tokens integer, output_tokens integer,
 status text not null default 'queued' check(status in ('queued','processing','succeeded','failed')),
 started_at timestamptz, completed_at timestamptz, error_code text,
 result jsonb, unique(id,intake_id,entity_id),
 foreign key(intake_id,entity_id) references public.financial_ai_intakes(id,entity_id),
 check(estimated_cost_brl is null or estimated_cost_brl between 0 and 2),
 check(input_tokens is null or input_tokens between 0 and 1050000),
 check(output_tokens is null or output_tokens between 0 and 8000),
 check((status='succeeded')=(result is not null)),
 check(result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=700000))
);
create index financial_ai_runs_budget_idx on public.financial_ai_runs(budget_month);
create index financial_ai_runs_intake_idx on public.financial_ai_runs(intake_id,created_at desc,id desc);
create index financial_ai_runs_actor_idx on public.financial_ai_runs(created_by,created_at desc);
create table public.financial_ai_links (
 intake_id uuid primary key, run_id uuid not null unique, entity_id uuid not null,
 contract_id uuid not null, payment_id uuid,
 confirmed_by uuid not null references public.profiles(id), confirmed_at timestamptz not null default now(),
 confirmed_input jsonb not null, result jsonb not null,
 foreign key(run_id,intake_id,entity_id) references public.financial_ai_runs(id,intake_id,entity_id),
 foreign key(contract_id,entity_id) references public.financial_contracts(id,entity_id),
 foreign key(payment_id,contract_id,entity_id) references public.contract_payments(id,contract_id,entity_id)
);
create index financial_ai_links_contract_idx on public.financial_ai_links(contract_id,confirmed_at);
create index financial_ai_links_payment_idx on public.financial_ai_links(payment_id) where payment_id is not null;

alter table public.financial_ai_settings enable row level security;
alter table public.financial_ai_intakes enable row level security;
alter table public.financial_ai_runs enable row level security;
alter table public.financial_ai_links enable row level security;
revoke all on public.financial_ai_settings,public.financial_ai_intakes,public.financial_ai_runs,public.financial_ai_links from public,anon,authenticated,service_role;
grant select on public.financial_ai_settings,public.financial_ai_intakes,public.financial_ai_runs,public.financial_ai_links to service_role;
grant select on public.financial_ai_intakes,public.financial_ai_runs,public.financial_ai_links to authenticated;
create policy financial_ai_intakes_read on public.financial_ai_intakes for select to authenticated using(private.can_access_financial_entity(entity_id,false));
create policy financial_ai_runs_read on public.financial_ai_runs for select to authenticated using(private.can_access_financial_entity(entity_id,false));
create policy financial_ai_links_read on public.financial_ai_links for select to authenticated using(private.can_access_financial_entity(entity_id,false));
create trigger financial_ai_intakes_immutable before update or delete on public.financial_ai_intakes for each row execute function private.block_financial_history_mutation();
create trigger financial_ai_intakes_no_truncate before truncate on public.financial_ai_intakes for each statement execute function private.block_financial_history_mutation();
create trigger financial_ai_links_immutable before update or delete on public.financial_ai_links for each row execute function private.block_financial_history_mutation();
create trigger financial_ai_links_no_truncate before truncate on public.financial_ai_links for each statement execute function private.block_financial_history_mutation();
create trigger financial_ai_runs_no_delete before delete on public.financial_ai_runs for each row execute function private.block_financial_history_mutation();
create trigger financial_ai_runs_no_truncate before truncate on public.financial_ai_runs for each statement execute function private.block_financial_history_mutation();
create policy financial_ai_originals_read on storage.objects for select to authenticated using(bucket_id='financial-contract-documents' and exists(
 select 1 from public.financial_ai_intakes i where i.storage_path=name and private.can_access_financial_entity(i.entity_id,false)));

create function private.financial_ai_actor(p_actor uuid,p_entity uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_actor and p.role='admin' and p.status='active' and
 (p.is_primary_admin or exists(select 1 from public.financial_permissions f where f.entity_id=p_entity and f.profile_id=p.id and f.active and f.can_write)))
$$;
revoke all on function private.financial_ai_actor(uuid,uuid) from public,anon,authenticated,service_role;

create function public.finalize_financial_ai_intake(p_actor uuid,p_id uuid,p_entity uuid,p_contract uuid,p_mode text,p_name text,p_mime text,p_size integer,p_sha256 text,p_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.financial_ai_intakes;
begin
 perform 1 from public.financial_entities where id=p_entity for update;
 if not found or not private.financial_ai_actor(p_actor,p_entity) then raise exception 'Acesso financeiro negado'; end if;
 if p_mode is null or p_mode not in ('contract','payment') or (p_mode='payment' and not exists(select 1 from public.financial_contracts where id=p_contract and entity_id=p_entity)) or (p_mode='contract' and p_contract is not null) then raise exception 'Destino do documento invalido'; end if;
 if p_path is distinct from (p_entity::text||'/ai-originals/'||p_sha256||(case p_mime when 'application/pdf' then '.pdf' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else '' end)) then raise exception 'Caminho do original invalido'; end if;
 if not exists(select 1 from storage.objects where bucket_id='financial-contract-documents' and name=p_path and (metadata->>'size')::bigint=p_size) then raise exception 'Original nao preservado'; end if;
 select * into v from public.financial_ai_intakes where id=p_id;
 if found then
  if v.entity_id<>p_entity or v.contract_id is distinct from p_contract or v.mode<>p_mode or v.sha256<>p_sha256 or v.byte_size<>p_size or v.mime_type<>p_mime then raise exception 'Chave do original reutilizada com dados diferentes'; end if;
  return to_jsonb(v);
 end if;
 select * into v from public.financial_ai_intakes where entity_id=p_entity and sha256=p_sha256 and mode=p_mode and contract_id is not distinct from p_contract;
 if found then return to_jsonb(v); end if;
 insert into public.financial_ai_intakes(id,entity_id,contract_id,mode,original_name,mime_type,byte_size,sha256,storage_path,created_by)
 values(p_id,p_entity,p_contract,p_mode,p_name,p_mime,p_size,p_sha256,p_path,p_actor) returning * into v;
 return to_jsonb(v);
end $$;

create function public.begin_financial_ai_run(p_actor uuid,p_intake uuid,p_run uuid,p_retry boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.financial_ai_intakes; r public.financial_ai_runs; cfg public.financial_ai_settings; v_used numeric;
 v_month date:=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date;
begin
 select * into strict cfg from public.financial_ai_settings where id for update;
 select * into strict i from public.financial_ai_intakes where id=p_intake;
 perform 1 from public.financial_entities where id=i.entity_id for update;
 if not private.financial_ai_actor(p_actor,i.entity_id) then raise exception 'Acesso financeiro negado'; end if;
 select * into r from public.financial_ai_runs where id=p_run;
 if found then
  if r.intake_id<>p_intake or r.created_by<>p_actor then raise exception 'Chave de leitura reutilizada'; end if;
  return jsonb_build_object('run',to_jsonb(r),'start',false);
 end if;
 if exists(select 1 from public.financial_ai_links where intake_id=p_intake) then raise exception 'Original ja confirmado; consulte o contrato'; end if;
 select * into r from public.financial_ai_runs where intake_id=p_intake order by created_at desc,id desc limit 1;
 if found then
  if r.status='succeeded' or (r.status in ('queued','processing') and r.created_at>now()-interval '3 minutes') or not coalesce(p_retry,false) then
   return jsonb_build_object('run',to_jsonb(r),'start',false);
  end if;
 end if;
 if not cfg.enabled then raise exception 'Leitura por IA desativada'; end if;
 if (select count(*) from public.financial_ai_runs where created_by=p_actor and created_at>now()-interval '1 hour')>=20 then raise exception 'Limite de 20 leituras por hora atingido'; end if;
 select coalesce(sum(coalesce(estimated_cost_brl,reserved_brl)),0) into v_used from public.financial_ai_runs where budget_month=v_month;
 if v_used+2>cfg.monthly_limit_brl then raise exception 'Limite preventivo mensal de IA atingido; original preservado'; end if;
 insert into public.financial_ai_runs(id,intake_id,entity_id,created_by,budget_month) values(p_run,p_intake,i.entity_id,p_actor,v_month) returning * into r;
 return jsonb_build_object('run',to_jsonb(r),'start',true);
end $$;

create function public.claim_financial_ai_run(p_actor uuid,p_run uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.financial_ai_runs; i public.financial_ai_intakes;
begin
 select * into r from public.financial_ai_runs where id=p_run for update;
 if not found or r.created_by<>p_actor or r.status<>'queued' or r.created_at<now()-interval '3 minutes' then return null; end if;
 select * into strict i from public.financial_ai_intakes where id=r.intake_id;
 if not private.financial_ai_actor(p_actor,i.entity_id) then return null; end if;
 update public.financial_ai_runs set status='processing',started_at=now() where id=p_run;
 return to_jsonb(i);
end $$;

create function public.finish_financial_ai_run(p_actor uuid,p_run uuid,p_result jsonb,p_input_tokens integer,p_output_tokens integer,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.financial_ai_runs; v_cost numeric; v_ok boolean;
begin
 select * into r from public.financial_ai_runs where id=p_run for update;
 if not found or r.created_by<>p_actor or r.status<>'processing' then return false; end if;
 v_ok:=p_result is not null and p_error is null and jsonb_typeof(p_result)='object' and octet_length(p_result::text)<=700000
  and p_input_tokens between 0 and 1050000 and p_output_tokens between 0 and 8000;
 if coalesce(v_ok,false) then
  -- Conservative reference conversion, not an invoice, tax or exchange-rate guarantee.
  v_cost:=ceil(((p_input_tokens::numeric*0.20+p_output_tokens::numeric*1.20)/1000000)*6.5*1000000)/1000000;
  update public.financial_ai_runs set status='succeeded',completed_at=now(),result=p_result,input_tokens=p_input_tokens,output_tokens=p_output_tokens,estimated_cost_brl=v_cost where id=p_run;
 else
  update public.financial_ai_runs set status='failed',completed_at=now(),error_code=case when p_error in ('AI_TIMEOUT','AI_RATE_LIMITED','AI_REFUSED','AI_INCOMPLETE','AI_INVALID_OUTPUT','AI_USAGE_UNAVAILABLE','AI_CONNECTION_ERROR','AI_NOT_CONFIGURED','AI_PROVIDER_ERROR','ORIGINAL_UNAVAILABLE','ACCESS_REVOKED') then p_error else 'AI_INVALID_OUTPUT' end where id=p_run;
 end if;
 return true;
end $$;

create function public.financial_ai_state(p_entity uuid,p_intake uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg public.financial_ai_settings; v_month date:=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date; v_used numeric;
begin
 if not private.can_access_financial_entity(p_entity,false) then raise exception 'Acesso financeiro negado'; end if;
 select * into strict cfg from public.financial_ai_settings where id;
 select coalesce(sum(coalesce(estimated_cost_brl,reserved_brl)),0) into v_used from public.financial_ai_runs where budget_month=v_month;
 return jsonb_build_object('enabled',cfg.enabled,'model',cfg.model,'month',v_month,'limit_brl',cfg.monthly_limit_brl,'used_estimated_brl',v_used,'reservation_brl',2,'usd_brl_reference',cfg.usd_brl_reference,
 'items',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]') from (
  select i.*, (select to_jsonb(r)||jsonb_build_object('stale',r.status in ('queued','processing') and r.created_at<now()-interval '3 minutes') from public.financial_ai_runs r where r.intake_id=i.id order by r.created_at desc,r.id desc limit 1) as run,
  (select jsonb_build_object('contract_id',l.contract_id,'payment_id',l.payment_id,'confirmed_at',l.confirmed_at) from public.financial_ai_links l where l.intake_id=i.id) as confirmed
  from public.financial_ai_intakes i where i.entity_id=p_entity and (p_intake is null or i.id=p_intake) order by i.created_at desc,i.id desc limit 50
 ) x));
end $$;

create function public.confirm_financial_ai_contract(p_run uuid,p_input jsonb,p_reviewed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.financial_ai_runs; i public.financial_ai_intakes; l public.financial_ai_links; v_result jsonb;
begin
 select * into strict r from public.financial_ai_runs where id=p_run;
 select * into strict i from public.financial_ai_intakes where id=r.intake_id;
 perform 1 from public.financial_entities where id=i.entity_id for update;
 if not private.can_access_financial_entity(i.entity_id,true) then raise exception 'Acesso financeiro negado'; end if;
 if p_reviewed is distinct from true or r.status<>'succeeded' or i.mode<>'contract' or (p_input->>'entity_id')::uuid is distinct from i.entity_id then raise exception 'Confira os dados e o original antes de cadastrar'; end if;
 select * into l from public.financial_ai_links where intake_id=i.id;
 if found then
  if l.run_id<>p_run or l.confirmed_input<>p_input then raise exception 'Original ja confirmado com outros dados'; end if;
  return l.result;
 end if;
 if exists(select 1 from public.financial_ai_links l2 join public.financial_ai_intakes i2 on i2.id=l2.intake_id where i2.entity_id=i.entity_id and i2.sha256=i.sha256) or exists(select 1 from public.contract_documents where entity_id=i.entity_id and sha256=i.sha256) then raise exception 'Este original ja esta vinculado; confira o historico'; end if;
 v_result:=public.create_financial_contract(p_input);
 insert into public.financial_ai_links(intake_id,run_id,entity_id,contract_id,confirmed_by,confirmed_input,result) values(i.id,r.id,i.entity_id,(v_result->>'id')::uuid,auth.uid(),p_input,v_result);
 insert into public.contract_audit_events(entity_id,contract_id,actor_id,action,after_data) values(i.entity_id,(v_result->>'id')::uuid,auth.uid(),'ai.contract_reviewed',jsonb_build_object('run_id',r.id,'intake_id',i.id,'sha256',i.sha256,'confirmed_input',p_input-'idempotency_key'));
 return v_result;
end $$;

create function public.confirm_financial_ai_payment(p_run uuid,p_contract_id uuid,p_expected_revision integer,p_input jsonb,p_reviewed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.financial_ai_runs; i public.financial_ai_intakes; l public.financial_ai_links; v_result jsonb;
begin
 select * into strict r from public.financial_ai_runs where id=p_run;
 select * into strict i from public.financial_ai_intakes where id=r.intake_id;
 perform 1 from public.financial_entities where id=i.entity_id for update;
 if not private.can_access_financial_entity(i.entity_id,true) then raise exception 'Acesso financeiro negado'; end if;
 if p_reviewed is distinct from true or r.status<>'succeeded' or i.mode<>'payment' or i.contract_id is distinct from p_contract_id or (r.result->'assessment'->>'payment_suggestion_allowed') is distinct from 'true' then raise exception 'Este documento nao confirma pagamento realizado; confira o original'; end if;
 select * into l from public.financial_ai_links where intake_id=i.id;
 if found then
  if l.run_id<>p_run or l.contract_id<>p_contract_id or l.confirmed_input<>p_input then raise exception 'Original ja confirmado com outros dados'; end if;
  return l.result;
 end if;
 if exists(select 1 from public.financial_ai_links l2 join public.financial_ai_intakes i2 on i2.id=l2.intake_id where i2.entity_id=i.entity_id and i2.sha256=i.sha256) or exists(select 1 from public.contract_documents where entity_id=i.entity_id and sha256=i.sha256) then raise exception 'Este original ja esta vinculado; confira o historico'; end if;
 v_result:=public.record_contract_payment(p_contract_id,p_expected_revision,p_input);
 insert into public.financial_ai_links(intake_id,run_id,entity_id,contract_id,payment_id,confirmed_by,confirmed_input,result) values(i.id,r.id,i.entity_id,p_contract_id,(v_result->>'id')::uuid,auth.uid(),p_input,v_result);
 insert into public.contract_audit_events(entity_id,contract_id,actor_id,action,after_data) values(i.entity_id,p_contract_id,auth.uid(),'ai.payment_reviewed',jsonb_build_object('run_id',r.id,'intake_id',i.id,'sha256',i.sha256,'payment_id',v_result->>'id','confirmed_input',p_input-'idempotency_key'));
 return v_result;
end $$;

create function public.financial_all_documents(p_contract_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_entity uuid;
begin
 select entity_id into v_entity from public.financial_contracts where id=p_contract_id;
 if v_entity is null or not private.can_access_financial_entity(v_entity,false) then raise exception 'Acesso financeiro negado'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]') from (
  select d.id,d.original_name,d.mime_type,d.byte_size,d.sha256,d.storage_path,d.created_at,d.payment_id,null::uuid as ai_run_id from public.contract_documents d where d.contract_id=p_contract_id
  union all
  select i.id,i.original_name,i.mime_type,i.byte_size,i.sha256,i.storage_path,i.created_at,l.payment_id,l.run_id from public.financial_ai_intakes i join public.financial_ai_links l on l.intake_id=i.id where l.contract_id=p_contract_id
 ) x);
end $$;

revoke all on function public.finalize_financial_ai_intake(uuid,uuid,uuid,uuid,text,text,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.begin_financial_ai_run(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.claim_financial_ai_run(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.finish_financial_ai_run(uuid,uuid,jsonb,integer,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.financial_ai_state(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.confirm_financial_ai_contract(uuid,jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function public.confirm_financial_ai_payment(uuid,uuid,integer,jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function public.financial_all_documents(uuid) from public,anon,authenticated,service_role;
grant execute on function public.finalize_financial_ai_intake(uuid,uuid,uuid,uuid,text,text,text,integer,text,text) to service_role;
grant execute on function public.begin_financial_ai_run(uuid,uuid,uuid,boolean) to service_role;
grant execute on function public.claim_financial_ai_run(uuid,uuid) to service_role;
grant execute on function public.finish_financial_ai_run(uuid,uuid,jsonb,integer,integer,text) to service_role;
grant execute on function public.financial_ai_state(uuid,uuid) to authenticated;
grant execute on function public.confirm_financial_ai_contract(uuid,jsonb,boolean) to authenticated;
grant execute on function public.confirm_financial_ai_payment(uuid,uuid,integer,jsonb,boolean) to authenticated;
grant execute on function public.financial_all_documents(uuid) to authenticated;
comment on table public.financial_ai_settings is 'Approved preventive monthly budget for this module only. BRL values use a conservative configured conversion and are not a provider invoice guarantee. Enable only after isolated checks.';
comment on table public.financial_ai_runs is 'An uncertain or interrupted paid attempt retains its BRL 2 reservation. No automatic retry. Original and human confirmation are separate.';
commit;
