-- Harmony Store Oficial — conclusão imediata de uma solicitação já separada.

begin;

create or replace function public.admin_complete_request_now(
  p_request_id uuid,
  p_fulfillment_method text,
  p_delivered_by_name text,
  p_received_by_name text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_status text;
begin
  if not (select private.is_admin()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_fulfillment_method not in ('delivery','pickup') then
    raise exception 'Escolha entrega ou coleta.';
  end if;
  if nullif(trim(p_delivered_by_name),'') is null or nullif(trim(p_received_by_name),'') is null then
    raise exception 'Informe quem entregou e quem recebeu.';
  end if;

  select r.status into v_status
  from public.requests r
  where r.id=p_request_id
  for update;

  if v_status is null then
    raise exception 'Solicitação não localizada.' using errcode='P0002';
  end if;
  if v_status<>'separating' then
    raise exception 'A conclusão imediata está disponível apenas após salvar a separação.';
  end if;

  update public.requests
  set status='scheduled',
      fulfillment_method=p_fulfillment_method,
      scheduled_for=now()
  where id=p_request_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_actor,'request.delivery_confirmed_directly','request',p_request_id::text,
    jsonb_build_object('method',p_fulfillment_method,'confirmed_at',now()));

  perform public.admin_complete_request(p_request_id,p_delivered_by_name,p_received_by_name);
end;
$$;

revoke all on function public.admin_complete_request_now(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_complete_request_now(uuid,text,text,text) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
