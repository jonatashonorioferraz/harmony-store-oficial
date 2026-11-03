-- Permite cadastrar os dados do boleto sem guardar um código não conferido.
-- O código continua sujeito ao formato da tabela e à validação dos dígitos
-- verificadores na interface antes de ser salvo ou copiado para pagamento.
begin;

alter table public.bills alter column digit_line drop not null;

create or replace function public.admin_create_bill(p_bill jsonb)
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
  if v_digit_line <> '' and length(v_digit_line) not in (44,47,48) then raise exception 'Linha digitável inválida.'; end if;
  insert into public.bills(
    beneficiary_name,beneficiary_document,description,amount,due_date,digit_line,
    document_path,document_mime,notes,ai_used,ai_model,ai_confidence,extraction,
    created_by,updated_by
  ) values (
    trim(p_bill->>'beneficiary_name'),nullif(trim(p_bill->>'beneficiary_document'),''),
    nullif(trim(p_bill->>'description'),''),(p_bill->>'amount')::numeric,(p_bill->>'due_date')::date,
    nullif(v_digit_line,''),nullif(trim(p_bill->>'document_path'),''),nullif(trim(p_bill->>'document_mime'),''),
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

notify pgrst, 'reload schema';
commit;
