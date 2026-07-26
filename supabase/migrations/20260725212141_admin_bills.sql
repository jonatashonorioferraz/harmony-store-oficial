-- Harmony Store Oficial — boletos a pagar com documentos privados e auditoria.
-- Mudança aditiva: não altera pagamentos de produção, estoque ou autenticação.

begin;

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  protocol bigint generated always as identity unique,
  beneficiary_name text not null,
  beneficiary_document text,
  description text,
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  digit_line text not null check (digit_line ~ '^[0-9]{44}$|^[0-9]{47}$|^[0-9]{48}$'),
  document_path text,
  document_mime text,
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  notes text,
  ai_used boolean not null default false,
  ai_model text,
  ai_confidence numeric(5,4) check (ai_confidence between 0 and 1),
  extraction jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  paid_by uuid references public.profiles(id) on delete restrict,
  paid_at timestamptz,
  payment_proof_path text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='paid' and paid_at is not null and paid_by is not null) or status<>'paid')
);

create unique index bills_digit_line_unique
  on public.bills(digit_line);
create index bills_status_due_date_idx on public.bills(status,due_date);
create index bills_created_by_idx on public.bills(created_by);

create table public.bill_ai_runs (
  id bigint generated always as identity primary key,
  created_by uuid not null references public.profiles(id) on delete restrict,
  document_path text not null,
  model text not null,
  status text not null check (status in ('success','failed')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  error_code text,
  created_at timestamptz not null default now()
);

create index bill_ai_runs_user_created_idx on public.bill_ai_runs(created_by,created_at desc);

create trigger touch_updated_at before update on public.bills
for each row execute function public.touch_updated_at();

alter table public.bills enable row level security;
alter table public.bill_ai_runs enable row level security;

create policy "bills: admin read" on public.bills
for select to authenticated using ((select private.is_admin()));
create policy "bill ai: admin read" on public.bill_ai_runs
for select to authenticated using ((select private.is_admin()));

grant select on public.bills to authenticated;
grant select on public.bill_ai_runs to authenticated;
grant select on public.bills to service_role;
grant select,insert on public.bill_ai_runs to service_role;
grant usage,select on sequence public.bill_ai_runs_id_seq to service_role;

create function public.admin_create_bill(p_bill jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_actor uuid := (select auth.uid());
  v_digit_line text := regexp_replace(coalesce(p_bill->>'digit_line',''),'\D','','g');
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if nullif(trim(p_bill->>'beneficiary_name'),'') is null then raise exception 'Informe o beneficiário.'; end if;
  if coalesce((p_bill->>'amount')::numeric,0) <= 0 then raise exception 'Informe um valor válido.'; end if;
  if nullif(p_bill->>'due_date','') is null then raise exception 'Informe o vencimento.'; end if;
  if length(v_digit_line) not in (44,47,48) then raise exception 'Linha digitável inválida.'; end if;
  insert into public.bills(
    beneficiary_name,beneficiary_document,description,amount,due_date,digit_line,
    document_path,document_mime,notes,ai_used,ai_model,ai_confidence,extraction,
    created_by,updated_by
  ) values (
    trim(p_bill->>'beneficiary_name'),nullif(trim(p_bill->>'beneficiary_document'),''),
    nullif(trim(p_bill->>'description'),''),(p_bill->>'amount')::numeric,(p_bill->>'due_date')::date,
    v_digit_line,nullif(trim(p_bill->>'document_path'),''),nullif(trim(p_bill->>'document_mime'),''),
    nullif(trim(p_bill->>'notes'),''),coalesce((p_bill->>'ai_used')::boolean,false),
    nullif(trim(p_bill->>'ai_model'),''),nullif(p_bill->>'ai_confidence','')::numeric,
    coalesce(p_bill->'extraction','{}'::jsonb),v_actor,v_actor
  ) returning id into v_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'bill.created','bill',v_id::text,jsonb_build_object('due_date',p_bill->>'due_date','amount',p_bill->>'amount','ai_used',coalesce((p_bill->>'ai_used')::boolean,false)));
  return v_id;
exception when unique_violation then
  raise exception 'Este boleto já está cadastrado.' using errcode='23505';
end;
$$;

create function public.admin_update_bill(p_bill_id uuid,p_bill jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_digit_line text := regexp_replace(coalesce(p_bill->>'digit_line',''),'\D','','g');
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if length(v_digit_line) not in (44,47,48) then raise exception 'Linha digitável inválida.'; end if;
  update public.bills set
    beneficiary_name=trim(p_bill->>'beneficiary_name'),
    beneficiary_document=nullif(trim(p_bill->>'beneficiary_document'),''),
    description=nullif(trim(p_bill->>'description'),''),
    amount=(p_bill->>'amount')::numeric,
    due_date=(p_bill->>'due_date')::date,
    digit_line=v_digit_line,
    notes=nullif(trim(p_bill->>'notes'),''),
    updated_by=v_actor
  where id=p_bill_id and status='pending'
    and nullif(trim(p_bill->>'beneficiary_name'),'') is not null
    and (p_bill->>'amount')::numeric > 0;
  if not found then raise exception 'Somente boletos pendentes podem ser editados.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'bill.updated','bill',p_bill_id::text,jsonb_build_object('due_date',p_bill->>'due_date','amount',p_bill->>'amount'));
exception when unique_violation then
  raise exception 'Este boleto já está cadastrado.' using errcode='23505';
end;
$$;

create function public.admin_mark_bill_paid(p_bill_id uuid,p_payment_proof_path text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  update public.bills set status='paid',paid_at=now(),paid_by=v_actor,
    payment_proof_path=nullif(trim(p_payment_proof_path),''),updated_by=v_actor
  where id=p_bill_id and status='pending';
  if not found then raise exception 'Boleto não localizado ou já finalizado.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values(v_actor,'bill.paid','bill',p_bill_id::text);
end;
$$;

create function public.admin_cancel_bill(p_bill_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if not (select private.is_admin()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'Informe o motivo do cancelamento.'; end if;
  update public.bills set status='cancelled',cancelled_at=now(),updated_by=v_actor,
    notes=concat_ws(E'\n',notes,'Cancelamento: '||trim(p_reason))
  where id=p_bill_id and status='pending';
  if not found then raise exception 'Somente boletos pendentes podem ser cancelados.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'bill.cancelled','bill',p_bill_id::text,jsonb_build_object('reason',trim(p_reason)));
end;
$$;

revoke all on function public.admin_create_bill(jsonb) from public,anon,authenticated;
revoke all on function public.admin_update_bill(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.admin_mark_bill_paid(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_cancel_bill(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_create_bill(jsonb) to authenticated;
grant execute on function public.admin_update_bill(uuid,jsonb) to authenticated;
grant execute on function public.admin_mark_bill_paid(uuid,text) to authenticated;
grant execute on function public.admin_cancel_bill(uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bill-documents','bill-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "bill documents: admin read" on storage.objects for select to authenticated
using(bucket_id='bill-documents' and (select private.is_admin()));
create policy "bill documents: admin upload" on storage.objects for insert to authenticated
with check(bucket_id='bill-documents' and (storage.foldername(name))[1]=(select auth.uid())::text and (select private.is_admin()));
create policy "bill documents: admin update" on storage.objects for update to authenticated
using(bucket_id='bill-documents' and (select private.is_admin()))
with check(bucket_id='bill-documents' and (select private.is_admin()));
create policy "bill documents: admin delete" on storage.objects for delete to authenticated
using(bucket_id='bill-documents' and (select private.is_admin()));

notify pgrst, 'reload schema';
commit;
