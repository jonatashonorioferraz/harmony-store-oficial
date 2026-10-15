
-- Shared operational summaries, never original files or buyer/address fields.
create table public.expedition_accounts (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 80),
 created_at timestamptz not null default now(), unique(name)
);
create unique index expedition_accounts_name_unique on public.expedition_accounts(lower(btrim(name)));
insert into public.expedition_accounts(name) values('Harmony Store Oficial');
create table public.expedition_batches (
 id uuid primary key, account_id uuid not null references public.expedition_accounts(id), channel text not null check(channel in ('shopee','mercado-livre')),
 actor_id uuid references public.profiles(id) on delete set null, actor_name text not null,
 created_at timestamptz not null default now(), pages integer not null check(pages between 1 and 1000),
 total integer not null check(total between 1 and 1000), included integer not null check(included between 1 and 1000),
 new_count integer not null default 0, repeated_count integer not null default 0, conflicts integer not null default 0,
 payload jsonb not null
);
create table public.expedition_orders (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.expedition_accounts(id),
 channel text not null check(channel in ('shopee','mercado-livre')), identity_key text not null,
 identified boolean not null, order_ref text not null, shipment_ref text not null,
 products jsonb not null, first_batch uuid not null references public.expedition_batches(id), first_seen timestamptz not null default now(),
 unique(account_id,channel,identity_key)
);
create table public.expedition_batch_orders (
 batch_id uuid not null references public.expedition_batches(id), order_id uuid not null references public.expedition_orders(id),
 repeated boolean not null, conflicting boolean not null, primary key(batch_id,order_id)
);
create table public.expedition_listings (
 account_id uuid not null references public.expedition_accounts(id), channel text not null,
 listing_id text not null, status text not null default 'review' check(status in ('review','personalized','single','adjusted')),
 note text not null default '' check(length(note)<=1000), responsible text not null default '' check(length(responsible)<=100),
 revision integer not null default 1, updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id) on delete set null,
 primary key(account_id,channel,listing_id)
);
create index expedition_batches_created_idx on public.expedition_batches(created_at desc,id);
create index expedition_batches_account_idx on public.expedition_batches(account_id,channel,created_at desc);
create index expedition_batches_actor_idx on public.expedition_batches(actor_id);
create index expedition_orders_first_batch_idx on public.expedition_orders(first_batch);
create index expedition_orders_first_seen_idx on public.expedition_orders(first_seen,account_id,channel);
create index expedition_batch_orders_order_idx on public.expedition_batch_orders(order_id);
create index expedition_listings_updated_by_idx on public.expedition_listings(updated_by);
alter table public.expedition_accounts enable row level security;
revoke all on public.expedition_accounts from public,anon,authenticated,service_role;
grant select on public.expedition_accounts to service_role;
alter table public.expedition_batches enable row level security;
revoke all on public.expedition_batches from public,anon,authenticated,service_role;
grant select on public.expedition_batches to service_role;
alter table public.expedition_orders enable row level security;
revoke all on public.expedition_orders from public,anon,authenticated,service_role;
grant select on public.expedition_orders to service_role;
alter table public.expedition_batch_orders enable row level security;
revoke all on public.expedition_batch_orders from public,anon,authenticated,service_role;
grant select on public.expedition_batch_orders to service_role;
alter table public.expedition_listings enable row level security;
revoke all on public.expedition_listings from public,anon,authenticated,service_role;
grant select on public.expedition_listings to service_role;

-- One narrow privileged implementation in the unexposed schema. Every call
-- rechecks the live profile. Public entry point is SECURITY INVOKER.
create function private.expedition(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); v_actor_name text; aid uuid; bid uuid; oid uuid; existing jsonb; clean jsonb; o jsonb; p jsonb;
 items jsonb; normalized jsonb:='[]'; fresh integer:=0; repeats integer:=0; conflict_count integer:=0; is_repeat boolean; conflict boolean;
 ch text; start_at timestamptz; end_at timestamptz; page_offset integer; answer jsonb; search_term text;
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
    if ch<>'mercado-livre' or coalesce(o->>'shipment_ref','') !~ '^\d{8,20}$' or o->>'key' is distinct from 'shipment:'||(o->>'shipment_ref') or coalesce(o->>'order_ref','') !~ '^(\d{8,20})?$' then raise exception 'Identificação do envio inválida.'; end if;
   elsif coalesce(o->>'key','') !~ '^label:[0-9]{1,6}x[0-9]{1,6}:[a-f0-9]{64}$' or coalesce(o->>'order_ref','')<>'' or coalesce(o->>'shipment_ref','')<>'' or jsonb_array_length(o->'products')>0 then
    raise exception 'Etiqueta sem identificação inválida.';
   end if;
   items:='[]';
   for p in select value from jsonb_array_elements(o->'products') loop
    if coalesce(p->>'listing_id','') !~ '^MLB[0-9]+$' or length(p->>'listing_id')>40 or coalesce(length(p->>'title'),0) not between 1 and 500 or coalesce(length(p->>'sku'),121)>120 or coalesce(length(p->>'variation'),501)>500 or coalesce(p->>'quantity','') !~ '^[1-9][0-9]{0,6}$' then raise exception 'Produto inválido.'; end if;
    items:=items||jsonb_build_array(jsonb_build_object('listing_id',p->>'listing_id','title',p->>'title','sku',p->>'sku','variation',p->>'variation','quantity',(p->>'quantity')::integer));
   end loop;
   -- Sort product lines so Excel row order does not cause a false conflict.
   select coalesce(jsonb_agg(value order by value::text),'[]') into items from jsonb_array_elements(items);
   normalized:=normalized||jsonb_build_array(jsonb_build_object('key',o->>'key','identified',(o->>'identified')::boolean,'order_ref',o->>'order_ref','shipment_ref',o->>'shipment_ref','products',items));
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
  insert into public.expedition_batches(id,account_id,channel,actor_id,actor_name,pages,total,included,payload)
   values(bid,aid,ch,actor,coalesce(v_actor_name,'Administrador'),(p_input->>'pages')::integer,(p_input->>'total')::integer,(clean->>'included')::integer,clean);
  for o in select value from jsonb_array_elements(normalized) loop
   oid:=null;
   insert into public.expedition_orders(account_id,channel,identity_key,identified,order_ref,shipment_ref,products,first_batch)
    values(aid,ch,o->>'key',(o->>'identified')::boolean,o->>'order_ref',o->>'shipment_ref',o->'products',bid)
    on conflict(account_id,channel,identity_key) do nothing returning id into oid;
   is_repeat:=oid is null; conflict:=false;
   if is_repeat then
    select id,products into oid,existing from public.expedition_orders where account_id=aid and channel=ch and identity_key=o->>'key';
    conflict:=existing<>o->'products'; repeats:=repeats+1;
    if conflict then conflict_count:=conflict_count+1; end if;
   else
    fresh:=fresh+1;
    for p in select value from jsonb_array_elements(o->'products') loop
     if btrim(p->>'variation')='' then
      insert into public.expedition_listings(account_id,channel,listing_id) values(aid,ch,p->>'listing_id') on conflict do nothing;
     end if;
    end loop;
   end if;
   insert into public.expedition_batch_orders values(bid,oid,is_repeat,conflict);
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
   'products',coalesce((select jsonb_agg(to_jsonb(t)) from (select channel,item->>'listing_id' listing_id,item->>'title' title,item->>'variation' variation,sum((item->>'quantity')::bigint) quantity,count(*) lines from lines group by channel,item->>'listing_id',item->>'title',item->>'variation' order by quantity desc,title limit 100) t),'[]'),
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
revoke all on function private.expedition(text,jsonb) from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.expedition(text,jsonb) to authenticated;
create function public.expedition(p_action text,p_input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.expedition(p_action,p_input); $$;
revoke all on function public.expedition(text,jsonb) from public,anon,service_role;
grant execute on function public.expedition(text,jsonb) to authenticated;

