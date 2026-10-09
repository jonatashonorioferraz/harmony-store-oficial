-- Additive workspace, authenticated summaries and immutable private originals.
begin;
create table public.contract_documents (
  id uuid primary key,
  entity_id uuid not null,
  contract_id uuid not null,
  payment_id uuid,
  original_name text not null check(length(original_name) between 1 and 180),
  mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
  byte_size integer not null check(byte_size between 1 and 8388608),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key(contract_id,entity_id) references public.financial_contracts(id,entity_id),
  foreign key(payment_id,contract_id,entity_id) references public.contract_payments(id,contract_id,entity_id),
  unique(entity_id,sha256)
);
create index contract_documents_contract_idx on public.contract_documents(contract_id,created_at,id);
create index contract_documents_payment_idx on public.contract_documents(payment_id) where payment_id is not null;
alter table public.contract_documents enable row level security;
revoke all on public.contract_documents from public,anon,authenticated,service_role;
grant select on public.contract_documents to authenticated,service_role;
create policy contract_documents_read on public.contract_documents for select to authenticated
using(private.can_access_financial_entity(entity_id,false));
create trigger contract_documents_immutable before update or delete on public.contract_documents
for each row execute function private.block_financial_history_mutation();
create trigger contract_documents_no_truncate before truncate on public.contract_documents
for each statement execute function private.block_financial_history_mutation();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('financial-contract-documents','financial-contract-documents',false,8388608,array['application/pdf','image/png','image/jpeg']);
-- Authenticated users cannot insert, overwrite or remove originals. Uploads pass through the authenticated Edge function.
create policy financial_originals_read on storage.objects for select to authenticated
using(bucket_id='financial-contract-documents' and exists(select 1 from public.contract_documents d
 where d.storage_path=name and private.can_access_financial_entity(d.entity_id,false)));

create function public.finalize_financial_document(p_actor uuid,p_id uuid,p_contract_id uuid,p_payment_id uuid,
 p_name text,p_mime text,p_size integer,p_sha256 text,p_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_entity uuid; v public.contract_documents;
begin
 select entity_id into v_entity from public.financial_contracts where id=p_contract_id;
 perform 1 from public.financial_entities where id=v_entity for update;
 if v_entity is null or not exists(select 1 from public.profiles p where p.id=p_actor and p.role='admin' and p.status='active'
  and (p.is_primary_admin or exists(select 1 from public.financial_permissions f where f.entity_id=v_entity and f.profile_id=p.id and f.active and f.can_write)))
 then raise exception 'Acesso financeiro negado'; end if;
 select * into v from public.contract_documents where id=p_id;
 if found then
  if v.contract_id<>p_contract_id or v.payment_id is distinct from p_payment_id or v.sha256<>p_sha256 or v.original_name<>p_name
   or v.mime_type<>p_mime or v.byte_size<>p_size or v.storage_path<>p_path or v.created_by<>p_actor then raise exception 'Documento repetido com dados diferentes'; end if;
  return to_jsonb(v);
 end if;
 if p_path is distinct from (v_entity::text||'/'||p_contract_id::text||'/'||p_sha256||(case p_mime when 'application/pdf' then '.pdf' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else '' end))
 then raise exception 'Caminho do documento invalido'; end if;
 if not exists(select 1 from storage.objects where bucket_id='financial-contract-documents' and name=p_path and (metadata->>'size')::bigint=p_size)
 then raise exception 'Original nao confirmado no armazenamento'; end if;
 if exists(select 1 from public.contract_documents where entity_id=v_entity and sha256=p_sha256) then raise exception 'Este arquivo ja esta vinculado a um contrato desta empresa'; end if;
 insert into public.contract_documents(id,entity_id,contract_id,payment_id,original_name,mime_type,byte_size,sha256,storage_path,created_by)
 values(p_id,v_entity,p_contract_id,p_payment_id,p_name,p_mime,p_size,p_sha256,p_path,p_actor) returning * into v;
 insert into public.contract_audit_events(entity_id,contract_id,actor_id,action,after_data)
 values(v_entity,p_contract_id,p_actor,'document.attached',to_jsonb(v));
 return to_jsonb(v);
end $$;
revoke all on function public.finalize_financial_document(uuid,uuid,uuid,uuid,text,text,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_financial_document(uuid,uuid,uuid,uuid,text,text,integer,text,text) to service_role;

create function public.financial_workspace(p_entity_id uuid,p_query text default '',p_status text default 'all',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not private.can_access_financial_entity(p_entity_id,false) then raise exception 'Acesso financeiro negado'; end if;
 if p_offset is null or p_offset<0 or p_offset>1000000 or p_query is null or length(p_query)>160 or p_status is null or p_status not in ('all','active','overdue','settled') then raise exception 'Filtro invalido'; end if;
 with records as materialized (
  select c.id,c.created_at,c.title,c.creditor_name,c.reference,c.contract_date,c.revision,private.financial_contract_totals(c.id) totals
  from public.financial_contracts c where c.entity_id=p_entity_id
 ), filtered as (
  select * from records where (p_query='' or strpos(lower(title||' '||creditor_name||' '||coalesce(reference,'')),lower(p_query))>0)
  and (p_status='all' or p_status='settled' and (totals->>'remaining_amount')::numeric=0
   or p_status='active' and (totals->>'remaining_amount')::numeric>0
   or p_status='overdue' and (totals->>'overdue_amount')::numeric>0)
 ), page as(select * from filtered order by created_at desc,id desc limit 25 offset p_offset)
 select jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,id desc),'[]') from page),
 'count',(select count(*) from filtered),'page_size',25,'can_write',private.can_access_financial_entity(p_entity_id,true),
 'summary',(select jsonb_build_object('contracts',count(*),'active',count(*) filter(where (totals->>'remaining_amount')::numeric>0),
 'settled',count(*) filter(where (totals->>'remaining_amount')::numeric=0),
 'scheduled',coalesce(sum((totals->>'scheduled_amount')::numeric),0)::text,'paid',coalesce(sum((totals->>'paid_amount')::numeric),0)::text,
 'remaining',coalesce(sum((totals->>'remaining_amount')::numeric),0)::text,'overdue',coalesce(sum((totals->>'overdue_amount')::numeric),0)::text) from records)) into v_result;
 return v_result || jsonb_build_object('today',v_today,'upcoming',(
  select coalesce(jsonb_agg(to_jsonb(x) order by x.due_date,x.contract_id,x.position),'[]') from (
   select c.id contract_id,c.title,b.* from public.financial_contracts c cross join lateral private.financial_installment_balances(c.id) b
   where c.entity_id=p_entity_id and b.remaining>0 and b.due_date<=v_today+30 order by b.due_date,c.id,b.position limit 12
  ) x),'monthly',(
  select coalesce(jsonb_agg(to_jsonb(x) order by x.month),'[]') from (
   select to_char(p.effective_date,'YYYY-MM') as "month",sum(p.amount)::text amount from public.contract_payments p
   where p.entity_id=p_entity_id and p.effective_date>=((date_trunc('month',v_today)-interval '11 months')::date)
   and not exists(select 1 from public.contract_payment_reversals r where r.payment_id=p.id)
   group by to_char(p.effective_date,'YYYY-MM')
  ) x));
end $$;
revoke all on function public.financial_workspace(uuid,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.financial_workspace(uuid,text,text,integer) to authenticated;
comment on table public.contract_documents is 'Private immutable originals hashed by the authenticated Edge function. Attachment alone never settles an installment.';
commit;
