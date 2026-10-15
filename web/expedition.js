
(function(){
 'use strict';
 const statuses={review:'Revisar variação',personalized:'Personalizado',single:'Sem variação necessária',adjusted:'Ajustado, aguardando validação'};
 const channels={'mercado-livre':'Mercado Livre',shopee:'Shopee'};
 const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let panel=null,owner=null,accounts=[],selectedAccount='',tab='converter',loadSerial=0,offset=0,listingOffset=0;
 const pending=new Map();let saving=false;
 const allowed=()=>window.HarmonyShippingLabels?.canUse()===true;
 const actor=()=>S.profile?.id;
 const call=(action,input={})=>{if(!allowed())throw Error('Sessão encerrada.');return rpc('expedition',{p_action:action,p_input:input});};
 const current=()=>allowed()&&owner===actor()&&panel?.isConnected;
 const accountName=id=>accounts.find(a=>a.id===id)?.name||'Conta';
 const date=value=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
 function notify(message){if(current())panel.querySelector('#exp-status').textContent=message;}
 function purge(){if(!allowed()||owner!==actor()){pending.clear();accounts=[];selectedAccount='';owner=null;loadSerial++;}}
 function historyAccount(){if(!current()||!selectedAccount)throw Error('Selecione a conta da loja acima do conversor. Se a lista não carregou, clique em Atualizar contas.');return selectedAccount;}
 async function savePending(){
  if(saving)return 'Sincronização em andamento. Confira o aviso acima.';
  saving=true;const who=actor();let message='';
  try{
   for(const [id,input] of pending){
    if(!allowed()||who!==actor())throw Error('Sessão encerrada.');
    const result=await call('record',input);
    if(!allowed()||who!==actor())return '';
    pending.delete(id);message='Histórico salvo: '+result.new_count+' registro(s) novo(s), '+result.repeated_count+' já conhecido(s).';
    if(result.conflicts)message+=' '+result.conflicts+' pedido(s) com produtos diferentes do primeiro registro; as métricas originais foram preservadas. Consulte o lote no histórico.';
   }
   notify(message);return message;
  }catch(error){if(!allowed()||who!==actor())throw error;message='PDF disponível, mas o histórico não foi confirmado. '+error.message+' Use “Tentar salvar histórico”. Mantenha esta aba aberta até salvar.';notify(message);throw error;}
  finally{saving=false;if(current())panel.querySelector('#exp-retry').hidden=pending.size===0;}
 }
 async function record(input){
  if(!allowed()||owner!==actor())throw Error('Sessão encerrada.');
  if(!accounts.some(a=>a.id===input.account_id))throw Error('Conta não selecionada.');
  pending.set(input.request_id,input);return savePending();
 }
 async function loadAccounts(){
  const who=actor();notify('Carregando contas…');
  try{const data=await call('accounts');if(!current()||who!==actor())return;accounts=data;
   if(!accounts.some(a=>a.id===selectedAccount))selectedAccount=accounts[0]?.id||'';
   panel.querySelector('#exp-account').innerHTML=accounts.map(a=>'<option value="'+e(a.id)+'">'+e(a.name)+'</option>').join('');
   panel.querySelector('#exp-account').value=selectedAccount;
   panel.querySelector('#exp-filter-account').innerHTML='<option value="">Todas as contas</option>'+accounts.map(a=>'<option value="'+e(a.id)+'">'+e(a.name)+'</option>').join('');
   notify(pending.size?'Há histórico aguardando sincronização. Use “Tentar salvar histórico” antes de sair.':'Conta pronta. Confira a conta da loja antes de gerar cada lote.');
  }catch(error){if(current()&&who===actor())notify('Não foi possível carregar as contas: '+error.message);}
 }
 function filters(){return {account_id:panel.querySelector('#exp-filter-account').value,channel:panel.querySelector('#exp-channel').value,from:panel.querySelector('#exp-from').value,to:panel.querySelector('#exp-to').value,search:panel.querySelector('#exp-search').value.trim(),offset,listing_offset:listingOffset};}
 async function load(){
  const serial=++loadSerial,who=actor();const target=panel.querySelector('#exp-results');target.textContent='Carregando registros…';
  try{const data=await call('workspace',filters());if(!current()||serial!==loadSerial||who!==actor())return;
   if(tab==='history')renderHistory(data,target);else renderListings(data,target);
  }catch(error){if(current()&&serial===loadSerial)target.textContent='Não foi possível carregar: '+error.message;}
 }
 function paginate(target,count,value,kind){
  const footer=document.createElement('div');footer.className='exp-pagination';
  footer.innerHTML='<button type="button" '+(value===0?'disabled':'')+'>Anterior</button><span>'+ (count?value+1:0)+'–'+Math.min(value+25,count)+' de '+count+'</span><button type="button" '+(value+25>=count?'disabled':'')+'>Próxima</button>';
  const buttons=footer.querySelectorAll('button');buttons.forEach((b,i)=>b.onclick=()=>{if(kind==='history')offset=Math.max(0,offset+(i?25:-25));else listingOffset=Math.max(0,listingOffset+(i?25:-25));load();});target.append(footer);
 }
 function renderHistory(data,target){
  target.innerHTML='<div class="exp-metrics">'+Object.entries(channels).map(([key,name])=>{const c=data.channels.find(c=>c.channel===key)||{};return '<article><h3>'+name+'</h3><strong>'+Number(c.orders||0)+'</strong><p>pedidos/envios únicos identificados</p><small>'+Number(c.conversions||0)+' conversões · '+Number(c.reprocessed||0)+' registros reprocessados<br>'+Number(c.labels||0)+' etiquetas únicas sem identificação de pedido<br>'+Number(c.orders_with_products||0)+' pedidos com produtos do Excel</small></article>';}).join('')+'</div><p class="exp-note">Contagem pela primeira conversão registrada, no horário de Brasília. Não representa vendas totais nem expedição confirmada. Etiquetas em imagem são deduplicadas pelo conteúdo; arquivos diferentes do mesmo pedido sem identificação podem não ser reconhecidos. Produtos disponíveis apenas nos pedidos vinculados ao Excel. Quantidades são unidades comerciais, sem multiplicar peças dos kits.</p><details class="exp-products"><summary>Produtos e variações mais processados</summary><p>Até 100 combinações no período; reprocessamentos não somam quantidades.</p><div class="exp-table"><table><thead><tr><th>Canal / anúncio</th><th>Produto</th><th>Variação</th><th>Unidades comerciais</th></tr></thead><tbody>'+data.products.map(p=>'<tr><td>'+e(channels[p.channel])+'<br>'+e(p.listing_id)+'</td><td>'+e(p.title)+'</td><td>'+e(p.variation||'Siga a descrição. Se personalizado, confira o pedido.')+'</td><td>'+Number(p.quantity)+'</td></tr>').join('')+'</tbody></table></div>'+(data.products.length?'':'<p>Nenhum produto registrado no período.</p>')+'</details><h3>Lotes gerados</h3><p>A busca por pedido/envio filtra os lotes, mantendo os indicadores do período.</p><div class="exp-batches">'+data.batches.map(b=>'<article><div><b>'+e(channels[b.channel])+' · '+e(accountName(b.account_id))+'</b><p>'+date(b.created_at)+' · '+e(b.actor_name)+'</p><p>'+b.included+' de '+b.total+' etiquetas · '+b.pages+' páginas · '+b.new_count+' novas · '+b.repeated_count+' já conhecidas'+(b.conflicts?' · '+b.conflicts+' divergências de produtos':'')+'</p><small>Lote '+e(b.id)+'</small></div><button type="button" data-detail="'+e(b.id)+'">Ver pedidos</button></article>').join('')+'</div>'+(data.batches.length?'':'<p>Nenhum lote encontrado. O histórico começa com as próximas conversões.</p>');
  paginate(target,data.batch_count,offset,'history');
  const detail=document.createElement('section');detail.id='exp-detail';detail.setAttribute('aria-live','polite');target.append(detail);
  target.querySelectorAll('[data-detail]').forEach(b=>b.onclick=async()=>{
   b.disabled=true;const who=actor(),serial=loadSerial;
   try{const rows=await call('detail',{id:b.dataset.detail});if(!current()||who!==actor()||serial!==loadSerial)return;
    detail.innerHTML='<h3>Pedidos do lote</h3><p>As métricas preservam os produtos da primeira conversão. Uma divergência exige conferir os arquivos; não altera o PDF gerado.</p>'+rows.map(r=>'<article class="exp-order"><b>'+e(r.identified?'Pedido '+(r.order_ref||'não informado')+' · Envio '+r.shipment_ref:'Etiqueta sem identificação de pedido')+'</b><p>'+ (r.repeated?'Já registrado anteriormente':'Primeiro registro')+(r.conflicting?' · Produtos divergentes nesta geração':'')+'</p><ul>'+r.products.map(p=>'<li>'+p.quantity+' un. · '+e(p.title)+' · '+e(p.variation||'Siga a descrição. Se personalizado, confira o pedido.')+'</li>').join('')+'</ul></article>').join('');detail.scrollIntoView({block:'start',behavior:'smooth'});
   }catch(error){if(current())detail.textContent=error.message;}finally{b.disabled=false;}
  });
 }
 function renderListings(data,target){
  target.innerHTML='<h3>Anúncios e variações</h3><p>Lista acumulada das contas e canais selecionados, independente do período. A falta de variação no Excel é um sinal para revisão, não prova de erro no anúncio. Personalizados continuam exigindo conferência dos detalhes no pedido.</p><p>'+data.listing_count+' anúncio(s) com ocorrências sem variação. As alterações abaixo organizam a central e não modificam o anúncio na plataforma.</p><div class="exp-listings">'+data.listings.map((l,i)=>'<form class="exp-listing" data-index="'+i+'"><p class="exp-eyebrow">'+e(accountName(l.account_id))+' · '+e(channels[l.channel])+'</p><h4>'+e(l.title)+'</h4><b>'+e(l.listing_id)+'</b><p>'+l.affected_orders+' pedido(s) sem variação · Última conversão: '+date(l.last_seen)+'</p>'+(l.status==='adjusted'?'<p>Após a classificação: '+l.later_with_variation+' pedidos com variação e '+l.later_without_variation+' sem variação. Confira antes de considerar resolvido.</p>':'')+'<label>Situação<select name="status">'+Object.entries(statuses).map(([key,name])=>'<option value="'+key+'" '+(l.status===key?'selected':'')+'>'+name+'</option>').join('')+'</select></label><label>Responsável<input name="responsible" maxlength="100" value="'+e(l.responsible)+'"></label><label>Observações<textarea name="note" maxlength="1000">'+e(l.note)+'</textarea></label><p>Siga a descrição. Se personalizado, confira o pedido.</p><button type="submit">Salvar classificação</button><span class="exp-save-status" role="status"></span></form>').join('')+'</div>'+(data.listings.length?'':'<p>Nenhum anúncio para revisar nesta seleção.</p>');
  paginate(target,data.listing_count,listingOffset,'listings');
  target.querySelectorAll('form').forEach(form=>form.onsubmit=async event=>{
   event.preventDefault();const l=data.listings[Number(form.dataset.index)],button=form.querySelector('button'),status=form.querySelector('.exp-save-status');button.disabled=true;
   try{await call('classify',{account_id:l.account_id,channel:l.channel,listing_id:l.listing_id,revision:l.revision,status:form.elements.status.value,note:form.elements.note.value,responsible:form.elements.responsible.value});if(current())await load();}
   catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  });
 }
 function selectTab(value){
  tab=value;loadSerial++;panel.querySelectorAll('[data-exp-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.expTab===value)));
  panel.querySelector('#exp-converter').hidden=value!=='converter';panel.querySelector('#exp-dashboard').hidden=value==='converter';
  if(value!=='converter')load();
 }
 function mount(container){
  purge();owner=actor();panel=container;tab='converter';offset=0;listingOffset=0;
  const header=document.createElement('section');header.className='exp-header';
  header.innerHTML='<h1>Central de Expedição</h1><p>Converta etiquetas, acompanhe os lotes e organize os anúncios.</p><nav class="exp-tabs" aria-label="Central de Expedição"><button type="button" data-exp-tab="converter" aria-pressed="true">Conversor de etiquetas</button><button type="button" data-exp-tab="history" aria-pressed="false">Histórico e métricas</button><button type="button" data-exp-tab="listings" aria-pressed="false">Anúncios e variações</button></nav><p id="exp-status" role="status"></p><button type="button" id="exp-retry" hidden>Tentar salvar histórico</button>';
  container.prepend(header);
  const converter=document.createElement('section');converter.id='exp-converter';
  const account=document.createElement('div');account.className='exp-account';account.innerHTML='<label>Conta da loja deste lote<select id="exp-account"><option value="">Carregando…</option></select></label><button type="button" id="exp-refresh-accounts">Atualizar contas</button><details><summary>Adicionar conta</summary><form id="exp-add-account"><label>Nome da conta<input name="name" required minlength="2" maxlength="80" placeholder="Ex.: Harmony · conta principal"></label><button type="submit">Cadastrar conta</button></form></details><p>Use sempre a mesma conta para reconhecer reimpressões. O PDF continua local; apenas o resumo operacional é salvo no app.</p>';converter.append(account);
  converter.append(container.querySelector('.shipping-labels-loading'),container.querySelector('#shippingLabelsHost'));container.append(converter);
  const dashboard=document.createElement('section');dashboard.id='exp-dashboard';dashboard.hidden=true;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  dashboard.innerHTML='<form id="exp-filters" class="exp-filters"><label>Conta<select id="exp-filter-account"><option value="">Todas as contas</option></select></label><label>Canal<select id="exp-channel"><option value="">Todos</option><option value="mercado-livre">Mercado Livre</option><option value="shopee">Shopee</option></select></label><label>De<input type="date" id="exp-from" required value="'+today.slice(0,8)+'01"></label><label>Até<input type="date" id="exp-to" required value="'+today+'"></label><label>Buscar pedido, envio ou lote<input type="search" id="exp-search" maxlength="100" placeholder="Identificador completo"></label><button type="submit">Atualizar</button></form><div id="exp-results" aria-live="polite"></div>';container.append(dashboard);
  header.querySelectorAll('[data-exp-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.expTab));
  panel.querySelector('#exp-retry').onclick=()=>savePending().catch(()=>{});
  panel.querySelector('#exp-account').onchange=event=>{selectedAccount=event.target.value;};
  panel.querySelector('#exp-refresh-accounts').onclick=loadAccounts;
  panel.querySelector('#exp-add-account').onsubmit=async event=>{event.preventDefault();const form=event.target,b=form.querySelector('button');b.disabled=true;const who=actor();try{const result=await call('account_create',{name:form.elements.name.value.trim()});if(!current()||who!==actor())return;selectedAccount=result.id;form.reset();await loadAccounts();}catch(error){notify(error.message);}finally{b.disabled=false;}};
  panel.querySelector('#exp-filters').onsubmit=event=>{event.preventDefault();offset=0;listingOffset=0;load();};
  panel.querySelector('#exp-retry').hidden=pending.size===0;
  loadAccounts();
 }
 window.addEventListener('beforeunload',event=>{if(pending.size){event.preventDefault();event.returnValue='';}});
 window.HarmonyExpedition=Object.freeze({mount,record,historyAccount,purge});
})();
