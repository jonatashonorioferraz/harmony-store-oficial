-- Harmony Store Oficial - impede retirada de kit ainda usado em plano operacional.
begin;

create or replace function public.archive_shipping_kit_template(
  p_kit_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_name text;
begin
  if not (select private.can_manage_shipping_planning()) then
    raise exception 'Acesso restrito ao Planejamento de envios.' using errcode='42501';
  end if;
  if char_length(coalesce(p_reason,''))>500 then raise exception 'Motivo muito longo.'; end if;
  if exists(
    select 1
    from public.shipping_plan_items i
    join public.shipping_plans p on p.id=i.plan_id
    where i.kit_template_id=p_kit_id
      and p.status not in ('archived','cancelled')
  ) then
    raise exception 'Este kit esta em um plano ativo. Finalize ou cancele o plano antes de retira-lo do catalogo.' using errcode='23514';
  end if;
  update public.shipping_kit_templates
  set active=false,updated_by=v_actor
  where id=p_kit_id and active
  returning name into v_name;
  if v_name is null then raise exception 'Kit composto nao localizado.' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,origin,details)
  values(v_actor,'shipping_kit_template.archived','shipping_kit_template',p_kit_id::text,'database',
    jsonb_build_object('name',v_name,'reason',nullif(trim(coalesce(p_reason,'')),''),
      'history_preserved',true,'active_plan_guard',true));
end;
$$;

revoke all on function public.archive_shipping_kit_template(uuid,text) from public,anon,authenticated;
grant execute on function public.archive_shipping_kit_template(uuid,text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
