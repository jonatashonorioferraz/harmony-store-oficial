-- Additive coverage update. Does not enable research or change its budget.
begin;
alter table public.commercial_calendar_events drop constraint if exists commercial_calendar_events_channel_check;
alter table public.commercial_calendar_events add constraint commercial_calendar_events_channel_check
  check(channel in ('Geral','Shopee','Mercado Livre','SHEIN','Loja própria'));
alter table public.commercial_calendar_plans drop constraint if exists commercial_calendar_plans_channel_check;
alter table public.commercial_calendar_plans add constraint commercial_calendar_plans_channel_check
  check(channel in ('Geral','Shopee','Mercado Livre','SHEIN','Loja própria'));
alter table public.commercial_calendar_runs add column if not exists channel_results jsonb not null default '[]'::jsonb;
alter table public.commercial_calendar_runs drop constraint if exists commercial_calendar_runs_status_check;
alter table public.commercial_calendar_runs add constraint commercial_calendar_runs_status_check
  check(status in ('running','completed','partial','failed'));
insert into public.commercial_calendar_sources(domain,label) values
  ('br.shein.com','SHEIN Brasil'),('seller-br.shein.com','SHEIN Marketplace Brasil')
on conflict(domain) do nothing;

create or replace function public.finish_commercial_calendar_research(p_run_id uuid,p_results jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  item jsonb; event jsonb; run public.commercial_calendar_runs; all_events jsonb:='[]'; coverage jsonb:='[]';
  seen text[]:='{}'; channels text[]:=array['Shopee','Mercado Livre','SHEIN']; channel text;
  successes integer:=0; inputs integer:=0; outputs integer:=0; result jsonb; final_status text; event_host text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Servico necessario.' using errcode='42501'; end if;
  select * into run from public.commercial_calendar_runs where id=p_run_id for update;
  if run.id is null or run.status<>'running' then raise exception 'Execucao indisponivel.'; end if;
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results)<>3 then raise exception 'Cobertura invalida.'; end if;
  for item in select value from jsonb_array_elements(p_results) loop
    channel:=item->>'channel';
    if channel is null or not(channel=any(channels)) or channel=any(seen) then raise exception 'Canal invalido ou duplicado.'; end if;
    seen:=array_append(seen,channel);
    if item->>'status' is null or item->>'status' not in ('completed','failed') or jsonb_typeof(item->'events') is distinct from 'array' then raise exception 'Resultado invalido.'; end if;
    if item->>'status'='completed' then
      if jsonb_array_length(item->'events')>6 then raise exception 'Resultado invalido.'; end if;
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
      all_events:=all_events||(item->'events');
      inputs:=inputs+greatest(coalesce((item->>'input_tokens')::integer,0),0);
      outputs:=outputs+greatest(coalesce((item->>'output_tokens')::integer,0),0);
    elsif jsonb_array_length(item->'events')<>0 then raise exception 'Canal com falha nao pode incluir propostas.';
    end if;
    coverage:=coverage||jsonb_build_array(jsonb_build_object('channel',channel,'status',item->>'status',
      'result_count',jsonb_array_length(item->'events'),'error_code',case when item->>'status'='failed' then left(coalesce(item->>'error_code','sync_failed'),80) else null end));
  end loop;
  result:=public.finish_commercial_calendar_sync(p_run_id,all_events,
    case when successes=0 then 'all_channels_failed' else null end,inputs,outputs);
  final_status:=case when successes=3 then 'completed' when successes=0 then 'failed' else 'partial' end;
  update public.commercial_calendar_runs set status=final_status,channel_results=coverage where id=p_run_id;
  return jsonb_build_object('status',final_status,'proposals',jsonb_array_length(all_events),'channels',coverage);
end $$;
revoke all on function public.finish_commercial_calendar_research(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_commercial_calendar_research(uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
