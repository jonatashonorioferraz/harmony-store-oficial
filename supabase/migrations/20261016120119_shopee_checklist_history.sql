-- Local Shopee checklist summaries; preserve the active-ADM gate and first recorded quantities.
alter table public.expedition_orders add column source_keys jsonb not null default '[]';
create or replace function private.expedition(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); v_actor_name text; aid uuid; bid uuid; oid uuid; existing jsonb; clean jsonb; o jsonb; p jsonb;
 items jsonb; normalized jsonb:='[]'; fresh integer:=0; repeats integer:=0; conflict_count integer:=0; is_repeat boolean; conflict boolean;
 resolved_alias boolean; old_oid uuid; alias_keys jsonb; candidate_id uuid; ch text; start_at timestamptz; end_at timestamptz; page_offset integer; answer jsonb; search_term text;
begin
 select full_name into v_actor_name from public.profiles where id=actor and role='admin' and status='active' and not coalesce(must_change_password,false);
 if actor is null or not found then raise exception 'Acesso restrito a administradores ativos.' using errcode='42501'; end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>3000000 then raise exception 'Dados inválidos.'; end if;
 if p_action='accounts' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.expedition_accounts),'[]');
 elsif p_action='account_create' then
  if length(btrim(p_input->>'name')) not between 2 and 80 then raise exception 'Informe um nome de conta entre 2 e 80 caracteres.'; end if;
  insert into public.expedition_accounts(name) values(btrim(p_input->>'name')) returning id into aid;
  return jsonb_build_object('id',aid);
 elsif p_action='record' then
  aid:=(p_input->>'account_id')::uuid; bid:=(p_input->>'request_id')::uuid; ch:=p_input->>'channel';
  if aid is null or bid is null or ch is null or ch not in ('shopee','mercado-livre') or not exists(select 1 from public.expedition_accounts where id=aid) then raise exception 'Selecione uma conta e um canal válidos.'; end if;
  if jsonb_typeof(p_input->'orders') is distinct from 'array' or jsonb_array_length(p_input->'orders') not between 1 and 1000 then raise exception 'Lote vazio ou grande demais.'; end if;
  for o in select value from jsonb_array_elements(p_input->'orders') loop
   if jsonb_typeof(o->'identified') is distinct from 'boolean' or jsonb_typeof(o->'products') is distinct from 'array' or jsonb_array_length(o->'products')>1000 then raise exception 'Pedido inválido.'; end if;
   if (o->>'identified')::boolean then
    if ch='shopee' then
     if coalesce(o->>'order_ref','') !~ '^\d{6}[A-Z0-9]{8}$' or o->>'key' is distinct from 'shopee:'||(o->>'order_ref') or coalesce(o->>'shipment_ref','') !~ '^(BR[A-Z0-9]{10,20})?$' then raise exception 'Pedido Shopee inválido.'; end if;
    elsif ch<>'mercado-livre' or coalesce(o->>'shipment_ref','') !~ '^\d{8,20}$' or o->>'key' is distinct from 'shipment:'||(o->>'shipment_ref') or coalesce(o->>'order_ref','') !~ '^(\d{8,20})?$' then raise exception 'Identificação do envio inválida.'; end if;
   elsif coalesce(o->>'key','') !~ '^label:[0-9]{1,6}x[0-9]{1,6}:[a-f0-9]{64}$' or coalesce(o->>'order_ref','')<>'' or coalesce(o->>'shipment_ref','')<>'' or jsonb_array_length(o->'products')>0 then
    raise exception 'Etiqueta sem identificação inválida.';
   end if;
   items:='[]';
   for p in select value from jsonb_array_elements(o->'products') loop
    if (ch='mercado-livre' and (coalesce(p->>'listing_id','') !~ '^MLB[0-9]+$' or length(p->>'listing_id')>40)) or coalesce(length(p->>'title'),0) not between 1 and 500 or coalesce(length(p->>'sku'),121)>120 or coalesce(length(p->>'variation'),501)>500 or coalesce(p->>'quantity','') !~ '^[1-9][0-9]{0,6}$' then raise exception 'Produto inválido.'; end if;
    items:=items||jsonb_build_array(jsonb_build_object('listing_id',case when ch='shopee' then 'title:'||md5(lower(regexp_replace(btrim(p->>'title'),'\s+',' ','g'))) else p->>'listing_id' end,'title',btrim(p->>'title'),'sku',p->>'sku','variation',p->>'variation','quantity',(p->>'quantity')::integer));
   end loop;
   -- Sort product lines so Excel row order does not cause a false conflict.
   select coalesce(jsonb_agg(value order by value::text),'[]') into items from jsonb_array_elements(items);
   alias_keys:='[]';
   if ch='shopee' and (o->>'identified')::boolean then
    if jsonb_typeof(o->'source_keys') is distinct from 'array' or jsonb_array_length(o->'source_keys') not between 1 and 1000 then raise exception 'Origem do checklist inválida.'; end if;
    if exists(select 1 from jsonb_array_elements_text(o->'source_keys') k where k !~ '^label:[0-9]{1,6}x[0-9]{1,6}:[a-f0-9]{64}$') then raise exception 'Origem do checklist inválida.'; end if;
    select jsonb_agg(k order by k) into alias_keys from (select distinct value k from jsonb_array_elements(o->'source_keys')) a;
   end if;
   normalized:=normalized||jsonb_build_array(jsonb_build_object('key',o->>'key','identified',(o->>'identified')::boolean,'order_ref',o->>'order_ref','shipment_ref',o->>'shipment_ref','products',items)||case when ch='shopee' and (o->>'identified')::boolean then jsonb_build_object('source_keys',alias_keys) else '{}'::jsonb end);
  end loop;
  if (select count(distinct value->>'key') from jsonb_array_elements(normalized))<>jsonb_array_length(normalized) then raise exception 'Há etiquetas repetidas dentro do lote. Remova as cópias antes de registrar.'; end if;
  select jsonb_agg(value order by value->>'key') into normalized from jsonb_array_elements(normalized);
  clean:=jsonb_build_object('account_id',aid,'channel',ch,'pages',(p_input->>'pages')::integer,'total',(p_input->>'total')::integer,'included',coalesce((p_input->>'included')::integer,jsonb_array_length(normalized)),'orders',normalized);
  -- Serializes concurrent replay of the same request, including ambiguous network retries.
  perform pg_advisory_xact_lock(hashtextextended(bid::text,0));
  select payload into existing from public.expedition_batches where id=bid;
  if found then
   if existing<>clean then raise exception 'Este registro já existe com outro conteúdo.'; end if;
   return (select jsonb_build_object('id',id,'new_count',new_count,'repeated_count',repeated_count,'conflicts',conflicts) from public.expedition_batches where id=bid);
  end if;
  if (p_input->>'total')::integer<(clean->>'included')::integer or (clean->>'included')::integer<jsonb_array_length(normalized) then raise exception 'Total de etiquetas inválido.'; end if;
  -- Serialize Shopee identity upgrades and aliases across different request IDs.
  if ch='shopee' then perform pg_advisory_xact_lock(hashtextextended(aid::text||':shopee',0)); end if;
  insert into public.expedition_batches(id,account_id,channel,actor_id,actor_name,pages,total,included,payload)
   values(bid,aid,ch,actor,coalesce(v_actor_name,'Administrador'),(p_input->>'pages')::integer,(p_input->>'total')::integer,(clean->>'included')::integer,clean);
  for o in select value from jsonb_array_elements(normalized) loop
   oid:=null;resolved_alias:=false;
   if ch='shopee' and not (o->>'identified')::boolean then
    select id into oid from public.expedition_orders where account_id=aid and channel=ch and identified and source_keys ? (o->>'key');
    resolved_alias:=oid is not null;
   end if;
   if ch='shopee' and (o->>'identified')::boolean then
    select id into candidate_id from public.expedition_orders where account_id=aid and channel=ch and identified
      and ((shipment_ref<>'' and shipment_ref=o->>'shipment_ref') or source_keys ?| array(select jsonb_array_elements_text(o->'source_keys')))
      and identity_key<>o->>'key' limit 1;
    if candidate_id is not null then raise exception 'O envio ou checklist já pertence a outro pedido no histórico. Confira o ID lido.'; end if;
    -- Promote an old bitmap placeholder instead of counting the same document twice.
    if not exists(select 1 from public.expedition_orders where account_id=aid and channel=ch and identity_key=o->>'key') then
     select id into old_oid from public.expedition_orders where account_id=aid and channel=ch and not identified and jsonb_array_length(products)=0
       and identity_key in (select jsonb_array_elements_text(o->'source_keys')) order by first_seen,id limit 1;
     if old_oid is not null then update public.expedition_orders set identity_key=o->>'key',identified=true,order_ref=o->>'order_ref',shipment_ref=o->>'shipment_ref',products=o->'products' where id=old_oid; end if;
    end if;
   end if;
   if not resolved_alias then
   insert into public.expedition_orders(account_id,channel,identity_key,identified,order_ref,shipment_ref,products,first_batch)
    values(aid,ch,o->>'key',(o->>'identified')::boolean,o->>'order_ref',o->>'shipment_ref',o->'products',bid)
    on conflict(account_id,channel,identity_key) do nothing returning id into oid;
   end if;
   is_repeat:=resolved_alias or oid is null; conflict:=false;
   if is_repeat then
    if resolved_alias then select products into existing from public.expedition_orders where id=oid; else
    select id,products into oid,existing from public.expedition_orders where account_id=aid and channel=ch and identity_key=o->>'key';end if;
    if ch='shopee' and (o->>'identified')::boolean and jsonb_array_length(existing)=0 and jsonb_array_length(o->'products')>0 then
     update public.expedition_orders set products=o->'products' where id=oid;existing:=o->'products';
    end if;
    conflict:=not resolved_alias and existing<>o->'products' and not (ch='shopee' and jsonb_array_length(o->'products')=0); repeats:=repeats+1;
    if conflict then conflict_count:=conflict_count+1; end if;
   else
    fresh:=fresh+1;
    for p in select value from jsonb_array_elements(o->'products') loop
     if btrim(p->>'variation')='' then
      insert into public.expedition_listings(account_id,channel,listing_id) values(aid,ch,p->>'listing_id') on conflict do nothing;
     end if;
    end loop;
   end if;
   if ch='shopee' and (o->>'identified')::boolean then
    update public.expedition_orders set source_keys=(select jsonb_agg(k order by k) from (select distinct value k from jsonb_array_elements(source_keys||(o->'source_keys'))) a) where id=oid;
    for old_oid in select id from public.expedition_orders where account_id=aid and channel=ch and not identified and jsonb_array_length(products)=0
       and identity_key in (select jsonb_array_elements_text(o->'source_keys')) and id<>oid loop
     update public.expedition_orders set first_seen=least(first_seen,(select first_seen from public.expedition_orders where id=old_oid)) where id=oid;
     insert into public.expedition_batch_orders(batch_id,order_id,repeated,conflicting)
      select batch_id,oid,repeated,conflicting from public.expedition_batch_orders where order_id=old_oid on conflict do nothing;
     delete from public.expedition_batch_orders where order_id=old_oid;
     delete from public.expedition_orders where id=old_oid;
    end loop;
    for p in select value from jsonb_array_elements(o->'products') loop
     if btrim(p->>'variation')='' and not conflict then insert into public.expedition_listings(account_id,channel,listing_id) values(aid,ch,p->>'listing_id') on conflict do nothing; end if;
    end loop;
   end if;
   insert into public.expedition_batch_orders values(bid,oid,is_repeat,conflict) on conflict do nothing;
  end loop;
  update public.expedition_batches set new_count=fresh,repeated_count=repeats,conflicts=conflict_count where id=bid;
  return jsonb_build_object('id',bid,'new_count',fresh,'repeated_count',repeats,'conflicts',conflict_count);
 elsif p_action='classify' then
  if p_input->>'status' not in ('review','personalized','single','adjusted') or length(p_input->>'note')>1000 or length(p_input->>'responsible')>100 then raise exception 'Classificação inválida.'; end if;
  update public.expedition_listings set status=p_input->>'status',note=p_input->>'note',responsible=p_input->>'responsible',updated_by=actor,updated_at=now(),revision=revision+1
   where account_id=(p_input->>'account_id')::uuid and channel=p_input->>'channel' and listing_id=p_input->>'listing_id' and revision=(p_input->>'revision')::integer;
  if not found then raise exception 'Outro administrador atualizou este anúncio. Atualize a lista e tente novamente.'; end if;
  return jsonb_build_object('saved',true);
 elsif p_action='workspace' then
  aid:=nullif(p_input->>'account_id','')::uuid; ch:=nullif(p_input->>'channel','');
  start_at:=(p_input->>'from')::date::timestamp at time zone 'America/Sao_Paulo';
  end_at:=((p_input->>'to')::date+1)::timestamp at time zone 'America/Sao_Paulo';
  page_offset:=coalesce((p_input->>'offset')::integer,0);search_term:=coalesce(p_input->>'search','');
  if start_at is null or end_at is null or end_at<=start_at or end_at-start_at>interval '367 days' or page_offset<0 or page_offset>1000000 or coalesce((p_input->>'listing_offset')::integer,0) not between 0 and 1000000 or length(search_term)>100 or ch not in ('shopee','mercado-livre') then raise exception 'Filtros inválidos. Use um período de até um ano.'; end if;
  with selected as (
   select * from public.expedition_orders where first_seen>=start_at and first_seen<end_at and (aid is null or account_id=aid) and (ch is null or channel=ch)
  ), channels as (
   select b.channel,b.conversions,b.reprocessed,coalesce(o.orders,0) orders,coalesce(o.labels,0) labels,coalesce(o.orders_with_products,0) orders_with_products
   from (select channel,count(*) conversions,sum(repeated_count) reprocessed from public.expedition_batches where created_at>=start_at and created_at<end_at and (aid is null or account_id=aid) and (ch is null or channel=ch) group by channel) b
   left join (select channel,count(*) filter(where identified) orders,count(*) filter(where not identified) labels,
    count(*) filter(where jsonb_array_length(products)>0) orders_with_products from selected group by channel) o using(channel)
  ), lines as (
   select s.channel,p.value item from selected s cross join lateral jsonb_array_elements(s.products) p
  ) select jsonb_build_object('channels',coalesce((select jsonb_agg(to_jsonb(c)) from channels c),'[]'),
   'products',coalesce((select jsonb_agg(to_jsonb(t)) from (select channel,item->>'listing_id' listing_id,max(item->>'title') title,item->>'variation' variation,sum((item->>'quantity')::bigint) quantity,count(*) lines from lines group by channel,item->>'listing_id',case when channel='shopee' then '' else item->>'title' end,item->>'variation' order by quantity desc,title limit 100) t),'[]'),
   'product_limit',100) into answer;
  with filtered as (
   select b.* from public.expedition_batches b where b.created_at>=start_at and b.created_at<end_at and (aid is null or b.account_id=aid) and (ch is null or b.channel=ch)
    and (search_term='' or b.id::text=search_term or exists(select 1 from public.expedition_batch_orders bo join public.expedition_orders o on o.id=bo.order_id where bo.batch_id=b.id and (o.order_ref=search_term or o.shipment_ref=search_term)))
  ) select answer||jsonb_build_object('batch_count',(select count(*) from filtered),
   'batches',coalesce((select jsonb_agg(to_jsonb(t)) from (select id,account_id,channel,actor_name,created_at,pages,total,included,new_count,repeated_count,conflicts from filtered order by created_at desc,id limit 25 offset page_offset) t),'[]')) into answer;
  -- Listings are lifetime candidates for the selected account/channel, not just
  -- the displayed historical period; classification persists across new lots.
  with lines as (
   select o.id,o.account_id,o.channel,o.first_seen,p.value item from public.expedition_orders o cross join lateral jsonb_array_elements(o.products) p
   where (aid is null or o.account_id=aid) and (ch is null or o.channel=ch)
  ), listings as (
   select l.*,max(item->>'title') title,count(distinct x.id) filter(where btrim(item->>'variation')='') affected_orders,
    max(x.first_seen) last_seen,count(distinct x.id) filter(where btrim(item->>'variation')<>'' and x.first_seen>l.updated_at) later_with_variation,
    count(distinct x.id) filter(where btrim(item->>'variation')='' and x.first_seen>l.updated_at) later_without_variation
   from public.expedition_listings l join lines x on x.account_id=l.account_id and x.channel=l.channel and x.item->>'listing_id'=l.listing_id
   group by l.account_id,l.channel,l.listing_id
  ) select answer||jsonb_build_object('listing_count',(select count(*) from listings),
   'listings',coalesce((select jsonb_agg(to_jsonb(t)) from (select * from listings order by (status='review') desc,affected_orders desc,listing_id,account_id limit 25 offset coalesce((p_input->>'listing_offset')::integer,0)) t),'[]')) into answer;
  return answer;
 elsif p_action='detail' then
  return coalesce((select jsonb_agg(jsonb_build_object('order_ref',o.order_ref,'shipment_ref',o.shipment_ref,'identified',o.identified,'products',o.products,'repeated',bo.repeated,'conflicting',bo.conflicting) order by o.shipment_ref,o.id) from public.expedition_batch_orders bo join public.expedition_orders o on o.id=bo.order_id where bo.batch_id=(p_input->>'id')::uuid),'[]');
 end if;
 raise exception 'Operação inválida.';
end; $$;
