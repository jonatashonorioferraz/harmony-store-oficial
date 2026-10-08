-- Evidence gate only: preserve budgets, schedule, plans and all historical decisions.
begin;
alter table public.commercial_calendar_events add column if not exists source_evidence jsonb not null default '{}'::jsonb;
create index if not exists commercial_calendar_events_source_period_idx
  on public.commercial_calendar_events(channel,start_date,end_date);
create or replace function public.finish_commercial_calendar_sync(p_run_id uuid,p_events jsonb,p_error_code text default null,p_input_tokens integer default null,p_output_tokens integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare run public.commercial_calendar_runs; item jsonb; proof jsonb; old public.commercial_calendar_events;
  v_source_domain text; found_count integer:=0; start_day date; end_day date; checked timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Servico necessario.' using errcode='42501'; end if;
  select * into run from public.commercial_calendar_runs where id=p_run_id for update;
  if run.id is null or run.status<>'running' then raise exception 'Execucao indisponivel.'; end if;
  if p_error_code is null then
    if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>20 then raise exception 'Resultado invalido.'; end if;
    -- Serialize this small ingestion only, including matching legacy fingerprints.
    perform pg_advisory_xact_lock(7391082026);
    for item in select value from jsonb_array_elements(p_events) loop
      v_source_domain:=lower(substring(item->>'source_url' from '^https://([^/?#:]+)'));
      if v_source_domain is null or not exists(select 1 from public.commercial_calendar_sources s where s.enabled and (v_source_domain=s.domain or right(v_source_domain,length(s.domain)+1)='.'||s.domain)) then raise exception 'Fonte nao autorizada.'; end if;
      if (item->>'source_url') ~ '^https://[^/]*[@\\]' then raise exception 'Fonte invalida.'; end if;
      start_day:=(item->>'start_date')::date; end_day:=(item->>'end_date')::date;
      if start_day<run.run_day or end_day<start_day or end_day>run.run_day+370 then raise exception 'Periodo da fonte invalido.'; end if;
      proof:=item->'source_evidence';
      if not coalesce(jsonb_typeof(proof)='object' and proof->'version'='1'::jsonb
        and proof->>'kind' in ('campaign','campaign_registration')
        and proof->>'document_sha256' ~ '^[a-f0-9]{64}$'
        and proof->>'checked_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$',false)
        then raise exception 'Evidencia da fonte obrigatoria.'; end if;
      checked:=(proof->>'checked_at')::timestamptz;
      if checked<run.started_at-interval '1 minute' or checked>now()+interval '1 minute' then raise exception 'Evidencia fora desta execucao.'; end if;
      if length(item->>'source_excerpt')>420 then raise exception 'Trecho de evidencia invalido.'; end if;
      select * into old from public.commercial_calendar_events e
      where e.fingerprint=item->>'fingerprint' or
        (e.channel=item->>'channel' and e.start_date=start_day and e.end_date=end_day and e.source_url=item->>'source_url'
          and (e.source_evidence->>'kind' is null or e.source_evidence->>'kind'=proof->>'kind'))
      order by (e.fingerprint=item->>'fingerprint') desc,
        case e.status when 'confirmed' then 0 when 'rejected' then 1 else 2 end,e.source_checked_at,e.id
      limit 1 for update;
      if old.id is null then
        insert into public.commercial_calendar_events(fingerprint,title,start_date,end_date,channel,source_url,source_excerpt,source_published_at,run_id,source_evidence,source_checked_at)
        values(item->>'fingerprint',btrim(item->>'title'),start_day,end_day,item->>'channel',item->>'source_url',item->>'source_excerpt',nullif(item->>'source_published_at','')::date,run.id,proof,checked);
      elsif old.status='pending' then
        -- Preserve the original legacy wording for audit, never rewrite reviewed records.
        if old.source_evidence->'version' is distinct from '1'::jsonb then
          proof:=proof||jsonb_build_object('previous_title',old.title,'previous_source_excerpt',old.source_excerpt);
        end if;
        update public.commercial_calendar_events set
          title=btrim(item->>'title'),source_excerpt=item->>'source_excerpt',
          source_published_at=nullif(item->>'source_published_at','')::date,
          source_evidence=old.source_evidence||proof,source_checked_at=checked,last_seen_at=now(),
          run_id=run.id,revision=revision+1 where id=old.id;
      else
        update public.commercial_calendar_events set last_seen_at=now() where id=old.id;
      end if;
      found_count:=found_count+1;
    end loop;
  end if;
  update public.commercial_calendar_runs set status=case when p_error_code is null then 'completed' else 'failed' end,
    finished_at=now(),result_count=found_count,error_code=p_error_code,input_tokens=greatest(p_input_tokens,0),output_tokens=greatest(p_output_tokens,0)
  where id=p_run_id;
  return jsonb_build_object('status',case when p_error_code is null then 'completed' else 'failed' end,'result_count',found_count);
end $$;

create or replace function public.finish_commercial_calendar_research(p_run_id uuid,p_results jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  item jsonb; event jsonb; run public.commercial_calendar_runs; all_events jsonb:='[]'; coverage jsonb:='[]';
  seen text[]:='{}'; channels text[]:=array['Shopee','Mercado Livre','SHEIN']; channel text;
  successes integer:=0; clean_successes integer:=0; rejected integer; reasons jsonb; reason record; reason_total integer; inputs integer:=0; outputs integer:=0; result jsonb; final_status text; event_host text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Servico necessario.' using errcode='42501'; end if;
  select * into run from public.commercial_calendar_runs where id=p_run_id for update;
  if run.id is null or run.status<>'running' then raise exception 'Execucao indisponivel.'; end if;
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results)<>3 then raise exception 'Cobertura invalida.'; end if;
  for item in select value from jsonb_array_elements(p_results) loop
    channel:=item->>'channel';
    if channel is null or not(channel=any(channels)) or channel=any(seen) then raise exception 'Canal invalido ou duplicado.'; end if;
    seen:=array_append(seen,channel);
    if item->>'status' is null or item->>'status' not in ('completed','partial','failed') or jsonb_typeof(item->'events') is distinct from 'array' then raise exception 'Resultado invalido.'; end if;
    rejected:=coalesce((item->>'rejected_count')::integer,0);
    reasons:=coalesce(item->'rejection_reasons','{}'::jsonb);
    if rejected<0 or rejected>6 or jsonb_array_length(item->'events')+rejected>6 or jsonb_typeof(reasons)<>'object' then raise exception 'Validacao invalida.'; end if;
    reason_total:=0;
    for reason in select key,value from jsonb_each(reasons) loop
      if reason.key not in ('date_format','inverted_dates','before_window','after_window','source_not_allowed','source_not_consulted','publication_date_invalid','wrong_channel','invalid_proposal','date_evidence_missing','content_not_campaign','source_unavailable')
        or jsonb_typeof(reason.value)<>'number' or (reason.value#>>'{}')::integer<1 or (reason.value#>>'{}')::integer>6 then raise exception 'Motivo de descarte invalido.'; end if;
      reason_total:=reason_total+(reason.value#>>'{}')::integer;
    end loop;
    if reason_total<>rejected or (item->>'status'='completed' and rejected<>0)
      or (item->>'status'='partial' and (rejected=0 or jsonb_array_length(item->'events')=0)) then raise exception 'Resumo de validacao inconsistente.'; end if;
    inputs:=inputs+greatest(coalesce((item->>'input_tokens')::integer,0),0);
    outputs:=outputs+greatest(coalesce((item->>'output_tokens')::integer,0),0);
    if item->>'status' in ('completed','partial') then
      for event in select value from jsonb_array_elements(item->'events') loop
        if event->>'channel' is distinct from channel then raise exception 'Canal da proposta invalido.'; end if;
        event_host:=lower(substring(event->>'source_url' from '^https://([^/?#:]+)'));
        if event_host is null or not(case channel
          when 'Shopee' then event_host='shopee.com.br' or right(event_host,length('.shopee.com.br'))='.shopee.com.br'
          when 'Mercado Livre' then event_host='mercadolivre.com.br' or right(event_host,length('.mercadolivre.com.br'))='.mercadolivre.com.br'
          else event_host in ('br.shein.com','seller-br.shein.com') or right(event_host,length('.br.shein.com'))='.br.shein.com' or right(event_host,length('.seller-br.shein.com'))='.seller-br.shein.com'
        end) then raise exception 'Fonte nao corresponde ao canal.'; end if;
      end loop;
      successes:=successes+1;
      if item->>'status'='completed' then clean_successes:=clean_successes+1; end if;
      all_events:=all_events||(item->'events');
    elsif jsonb_array_length(item->'events')<>0 then raise exception 'Canal com falha nao pode incluir propostas.';
    end if;
    coverage:=coverage||jsonb_build_array(jsonb_build_object('channel',channel,'status',item->>'status',
      'result_count',jsonb_array_length(item->'events'),'rejected_count',rejected,'rejection_reasons',reasons,'error_code',case when item->>'status'<>'completed' then left(coalesce(item->>'error_code','sync_failed'),80) else null end));
  end loop;
  result:=public.finish_commercial_calendar_sync(p_run_id,all_events,
    case when successes=0 then 'all_channels_failed' else null end,inputs,outputs);
  final_status:=case when clean_successes=3 then 'completed' when successes=0 then 'failed' else 'partial' end;
  update public.commercial_calendar_runs set status=final_status,channel_results=coverage where id=p_run_id;
  return jsonb_build_object('status',final_status,'proposals',jsonb_array_length(all_events),'channels',coverage);
end $$;
create or replace function public.review_commercial_event(p_id uuid,p_revision integer,p_decision text,p_baseline_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; old public.commercial_calendar_events; saved public.commercial_calendar_events;
begin
  actor:=public.commercial_calendar_require_admin();
  if p_decision not in ('confirmed','rejected') or p_decision is null then raise exception 'Decisao invalida.'; end if;
  if p_baseline_key is not null and p_baseline_key !~ '^[a-z0-9-]+:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data-base invalida.'; end if;
  select * into old from public.commercial_calendar_events where id=p_id for update;
  if old.id is null or old.status<>'pending' or old.revision is distinct from p_revision then raise exception 'Esta proposta mudou. Atualize a lista.' using errcode='40001'; end if;
  if p_decision='confirmed' and old.source_evidence->'version' is distinct from '1'::jsonb then
    raise exception 'Evidencia da data ainda nao revalidada. Aguarde uma fonte comprovada ou descarte a proposta.' using errcode='23514';
  end if;
  if p_baseline_key is not null and p_decision='confirmed' then
    -- Retire the previous proposal only after an explicit administrator decision.
    update public.commercial_calendar_events set status='rejected',reviewed_by=actor,reviewed_at=now(),revision=revision+1
    where baseline_key=p_baseline_key and status='confirmed';
  end if;
  update public.commercial_calendar_events set status=p_decision,baseline_key=p_baseline_key,reviewed_by=actor,reviewed_at=now(),revision=revision+1
  where id=p_id returning * into saved;
  insert into public.commercial_calendar_audit(actor_id,action,entity_key,details)
  values(actor,'event_'||p_decision,p_id::text,jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(saved)));
  return to_jsonb(saved);
end $$;
revoke all on function public.finish_commercial_calendar_sync(uuid,jsonb,text,integer,integer) from public,anon,authenticated;
revoke all on function public.finish_commercial_calendar_research(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.review_commercial_event(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.finish_commercial_calendar_sync(uuid,jsonb,text,integer,integer),
  public.finish_commercial_calendar_research(uuid,jsonb) to service_role;
grant execute on function public.review_commercial_event(uuid,integer,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
