(()=>{
const IS={loaded:false,loading:false,error:'',tab:'dashboard',products:[],requests:[],requestItems:[],receipts:[],receiptItems:[],suppliers:[],aiRuns:[],cart:{},from:'',to:''};
const allowed=()=>['admin','receiver'].includes(S.profile?.role);
const isAdmin=()=>S.profile?.role==='admin';
const num=value=>Number(value||0);
const money=value=>num(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const quantity=(value,unit='')=>`${num(value).toLocaleString('pt-BR',{maximumFractionDigits:3})}${unit?' '+unit:''}`;
const isoDate=value=>{const date=new Date(value);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`};
const monthBounds=()=>{const now=new Date();return {from:isoDate(new Date(now.getFullYear(),now.getMonth(),1)),to:isoDate(now)}};
Object.assign(IS,monthBounds());
const statusText={pending:'Aguardando compra',separating:'Compra parcial',scheduled:'Compra agendada',delivered:'Compra concluída',cancelled:'Cancelada'};
const priorityText={normal:'Normal',important:'Importante',urgent:'Urgente'};
const productBy=id=>IS.products.find(item=>item.id===id);
const requestItems=id=>IS.requestItems.filter(item=>item.request_id===id);
const receiptItems=id=>IS.receiptItems.filter(item=>item.receipt_id===id);

async function receiptEdge(body){
  await ensureSession();
  let call=()=>fetch(API+'/functions/v1/analyze-internal-receipt',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+S.session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)}),response=await call();
  if(response.status===401){await refreshSession();response=await call()}
  return json(response);
}

async function loadInternal(force=false){
  if(IS.loading||IS.loaded&&!force)return;
  IS.loading=true;IS.error='';
  try{
    const calls=[
      rest('internal_supply_requests?select=*&order=created_at.desc'),
      rest('internal_supply_request_items?select=*'),
      rest('internal_purchase_receipts?select=*&order=purchased_at.desc'),
      rest('internal_purchase_receipt_items?select=*')
    ];
    if(isAdmin())calls.push(rest('suppliers?select=*&order=name.asc'),rest('internal_receipt_ai_runs?select=*&order=created_at.desc&limit=500'));
    const [requests,requestItemsData,receipts,receiptItemsData,suppliers=[],aiRuns=[]]=await Promise.all(calls);
    Object.assign(IS,{products:S.products.filter(product=>product.usage_scope==='internal'),requests,requestItems:requestItemsData,receipts,receiptItems:receiptItemsData,suppliers,aiRuns,loaded:true});
  }catch(error){IS.error=error.message||'Não foi possível carregar os suprimentos internos.'}
  finally{IS.loading=false}
}

function nav(){
  if(!allowed())return;
  const root=document.querySelector('.sidebar nav'),profile=root?.querySelector('[data-view="profile"]');
  if(!root||!profile)return;
  let button=root.querySelector('[data-view="internal-supplies"]');
  if(!button){
    const marker=document.createElement('small');marker.dataset.internalSupplyMarker='true';marker.textContent='OPERAÇÃO INTERNA';
    button=document.createElement('button');button.className='nav';button.dataset.view='internal-supplies';button.innerHTML='<i>🧺</i><span>Suprimentos e Compras</span>';
    profile.parentNode.insertBefore(marker,profile);profile.parentNode.insertBefore(button,profile);
    button.onclick=()=>{S.view='internal-supplies';renderApp()};
  }
  button.classList.toggle('active',S.view==='internal-supplies');
  if(S.view==='internal-supplies'){
    const page=document.querySelector('#page');if(page&&!page.dataset.internalSupplies)renderInternal(page);
  }
}

function tabs(){
  const options=[['dashboard','📊','Painel'],['new','📝','Solicitar'],['requests','📋','Solicitações']];
  if(isAdmin())options.push(['receipts','🧾','Compras e cupons'],['reports','📈','Relatórios'],['catalog','🧺','Catálogo']);
  return `<div class="supply-tabs">${options.map(([key,icon,label])=>`<button class="${IS.tab===key?'active':''}" data-supply-tab="${key}"><i>${icon}</i>${label}</button>`).join('')}</div>`;
}

function periodRows(){
  const from=new Date(IS.from+'T00:00:00'),to=new Date(IS.to+'T23:59:59');
  const receipts=IS.receipts.filter(item=>item.status==='confirmed'&&new Date(item.purchased_at)>=from&&new Date(item.purchased_at)<=to);
  const requests=IS.requests.filter(item=>item.status==='delivered'&&new Date(item.closed_at||item.updated_at)>=from&&new Date(item.closed_at||item.updated_at)<=to);
  return {receipts,requests};
}

function productReport(){
  const {receipts}=periodRows(),receiptIds=new Set(receipts.map(item=>item.id)),receiptMap=new Map(receipts.map(item=>[item.id,item])),reportEnd=new Date(IS.to+'T23:59:59');
  const map=new Map(IS.products.map(product=>[product.id,{product,purchased:0,spent:0,consumed:0,purchaseCount:0,prices:[]}])) ;
  IS.receiptItems.filter(item=>receiptIds.has(item.receipt_id)).forEach(item=>{
    const row=map.get(item.product_id),receipt=receiptMap.get(item.receipt_id);if(!row||!receipt)return;
    const amount=num(item.quantity),total=num(item.total_price),unitPrice=num(item.unit_price)||(amount?total/amount:0);
    row.purchased+=amount;row.spent+=total;row.purchaseCount++;
    if(receipt.purchase_origin==='requested')row.consumed+=amount;
    if(unitPrice>0)row.prices.push({value:unitPrice,date:new Date(receipt.purchased_at),receiptId:receipt.id});
  });
  const historicalReceipts=new Map(IS.receipts.filter(item=>item.status==='confirmed'&&new Date(item.purchased_at)<=reportEnd).map(item=>[item.id,item]));
  const history=new Map(IS.products.map(product=>[product.id,[]]));
  IS.receiptItems.forEach(item=>{const receipt=historicalReceipts.get(item.receipt_id),amount=num(item.quantity),price=num(item.unit_price)||(amount?num(item.total_price)/amount:0);if(receipt&&price>0&&history.has(item.product_id))history.get(item.product_id).push({value:price,date:new Date(receipt.purchased_at)})});
  return [...map.values()].map(row=>{
    row.prices.sort((a,b)=>a.date-b.date);
    const timeline=history.get(row.product.id).sort((a,b)=>a.date-b.date),current=timeline.at(-1)?.value||0,previous=timeline.at(-2)?.value||0,variation=previous?current-previous:0,variationPct=previous?variation/previous*100:0;
    return {...row,currentPrice:current,previousPrice:previous,variation,variationPct,minPrice:row.prices.length?Math.min(...row.prices.map(item=>item.value)):0,maxPrice:row.prices.length?Math.max(...row.prices.map(item=>item.value)):0,averagePrice:row.purchased?row.spent/row.purchased:0};
  }).sort((a,b)=>b.spent-a.spent||b.consumed-a.consumed||a.product.name.localeCompare(b.product.name));
}

function dashboard(){
  const {receipts,requests}=periodRows(),spent=receipts.reduce((sum,item)=>sum+num(item.total_value),0),low=IS.products.filter(item=>item.active&&num(item.physical_stock)-num(item.reserved_stock)<=num(item.minimum_stock)).length;
  const reports=productReport(),top=reports.filter(item=>item.spent>0).slice(0,6),max=Math.max(...top.map(item=>item.spent),1);
  if(!isAdmin())return `<div class="supply-kpis receiver-kpis"><article><i>📝</i><small>SOLICITAÇÕES ABERTAS</small><b>${IS.requests.filter(item=>!['delivered','cancelled'].includes(item.status)).length}</b><span>Aguardando compra</span></article><article><i>✅</i><small>COMPRAS CONCLUÍDAS</small><b>${IS.requests.filter(item=>item.status==='delivered').length}</b><span>Itens já adquiridos</span></article><article><i>🧺</i><small>ITENS DISPONÍVEIS</small><b>${IS.products.filter(item=>item.active).length}</b><span>Catálogo interno</span></article></div><section class="card supply-section"><div class="card-head"><div><p class="eyebrow">FLUXO SIMPLES</p><h2>Peça somente o que está faltando</h2></div></div><p class="supply-guidance">Abra <b>Solicitar</b>, marque os produtos necessários e envie. A administração registrará a compra e o cupom fiscal.</p></section>`;
  return `<div class="supply-kpis"><article><i>🧾</i><small>COMPRAS NO PERÍODO</small><b>${receipts.length}</b><span>${money(spent)}</span></article><article><i>📦</i><small>COMPRAS VINCULADAS</small><b>${requests.length}</b><span>Solicitações concluídas</span></article><article><i>⏳</i><small>EM ANDAMENTO</small><b>${IS.requests.filter(item=>!['delivered','cancelled'].includes(item.status)).length}</b><span>Solicitações internas</span></article><article class="${low?'attention':''}"><i>⚠️</i><small>ESTOQUE BAIXO</small><b>${low}</b><span>Suprimentos para repor</span></article></div>
  <div class="supply-grid"><section class="card supply-section"><div class="card-head"><div><p class="eyebrow">COMPRAS</p><h2>Produtos com maior gasto</h2></div></div><div class="supply-chart">${top.map(item=>`<div><span><b>${esc(item.product.name)}</b><small>${money(item.spent)}</small></span><i><em style="width:${Math.max(4,item.spent/max*100)}%"></em></i></div>`).join('')||'<div class="empty">Nenhuma compra confirmada neste período.</div>'}</div></section>
  <section class="card supply-section"><div class="card-head"><div><p class="eyebrow">ATENÇÃO</p><h2>Reposição necessária</h2></div></div><div class="supply-alerts">${IS.products.filter(item=>item.active&&num(item.physical_stock)-num(item.reserved_stock)<=num(item.minimum_stock)).slice(0,8).map(item=>`<article><i>!</i><span><b>${esc(item.name)}</b><small>${quantity(num(item.physical_stock)-num(item.reserved_stock),item.unit)} disponível</small></span></article>`).join('')||'<div class="supply-ok">✓ Estoque interno equilibrado</div>'}</div></section></div>`;
}

function requestForm(editId=''){
  const edit=IS.requests.find(item=>item.id===editId),existing=edit?requestItems(edit.id):[];
  if(edit&&!Object.keys(IS.cart).length)existing.forEach(item=>IS.cart[item.product_id]=num(item.requested_quantity));
  const selected=IS.products.filter(item=>num(IS.cart[item.id])>0);
  return `<section class="supply-request-layout"><div><div class="supply-product-grid">${IS.products.filter(item=>item.active).map(item=>`<article class="supply-product ${IS.cart[item.id]?'is-selected':''}" data-toggle-supply="${item.id}"><div class="supply-product-icon">${item.image_path?`<img src="${API}/storage/v1/object/public/product-images/${esc(item.image_path)}" alt="">`:'🧴'}</div><div><small>SUPRIMENTO INTERNO</small><h3>${esc(item.name)}</h3><p>${esc(item.description||'Produto de uso interno')}</p></div><button type="button" class="supply-select-button">${IS.cart[item.id]?'✓ Adicionado':'＋ Adicionar'}</button></article>`).join('')||'<div class="empty">O ADM precisa cadastrar os suprimentos internos antes da primeira solicitação.</div>'}</div></div>
  <aside class="card supply-summary"><p class="eyebrow">SOLICITAÇÃO INTERNA</p><h2>${selected.length} ${selected.length===1?'item':'itens'}</h2>${selected.map(item=>`<div><span>${esc(item.name)}</span><b>Solicitar</b></div>`).join('')}<p class="supply-no-quantity">Você só precisa informar quais itens estão faltando. A quantidade e os valores serão registrados pelo cupom fiscal da compra.</p><label>Prioridade<select id="supplyPriority"><option value="normal" ${!edit||edit.priority==='normal'?'selected':''}>Normal</option><option value="important" ${edit?.priority==='important'?'selected':''}>Importante</option><option value="urgent" ${edit?.priority==='urgent'?'selected':''}>Urgente</option></select></label><label>Preciso até<input id="supplyNeeded" type="date" min="${isoDate(new Date())}" value="${edit?.needed_by||''}"></label><label>Observações<textarea id="supplyNotes" placeholder="Ex.: acabou o café do escritório">${esc(edit?.notes||'')}</textarea></label><button class="primary full" id="saveSupplyRequest" ${selected.length?'':'disabled'}>${edit?'Salvar alterações':'Enviar solicitação'}</button>${edit?'<button class="outline full" id="cancelSupplyEdit">Cancelar edição</button>':''}</aside></section>`;
}

function requestList(){
  return `<div class="supply-list">${IS.requests.map(item=>`<article class="supply-request" data-internal-request="${item.id}"><div><small>SOLICITAÇÃO INTERNA</small><b>#${String(item.protocol).padStart(4,'0')}</b></div><div><strong>${esc(item.requested_by_name)}</strong><small>${fmt(item.created_at)}</small></div><div><small>PRIORIDADE</small><b class="priority-${item.priority}">${priorityText[item.priority]}</b></div><div><small>NECESSÁRIO ATÉ</small><b>${item.needed_by?new Date(item.needed_by+'T12:00:00').toLocaleDateString('pt-BR'):'Não informado'}</b></div><span class="badge ${item.status}">${statusText[item.status]}</span></article>`).join('')||'<div class="empty">Nenhuma solicitação interna registrada.</div>'}</div>`;
}

function receipts(){
  return `<section class="supply-receipt-head"><div><p class="eyebrow">COMPRAS INTERNAS</p><h2>Cupons fiscais e entradas</h2><span>Registre aqui uma compra que não nasceu de solicitação. Para compras solicitadas, abra a própria solicitação.</span></div><button class="primary" id="newReceipt">📷 Registrar compra direta</button></section><div class="receipt-list">${IS.receipts.map(item=>`<article class="receipt-card ${item.status==='cancelled'?'is-cancelled':''}" data-internal-receipt="${item.id}"><div class="receipt-symbol">🧾</div><div><small>${item.purchase_origin==='requested'?'COMPRA VINCULADA':'COMPRA DIRETA'} #${String(item.protocol).padStart(4,'0')}</small><h3>${esc(item.merchant_name)}</h3><p>${new Date(item.purchased_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</p></div><div><small>ITENS</small><b>${receiptItems(item.id).length}</b></div><div><small>VALOR TOTAL</small><b>${money(item.total_value)}</b></div><span class="badge ${item.status==='confirmed'?'delivered':'cancelled'}">${item.status==='confirmed'?'Confirmada':'Cancelada'}</span></article>`).join('')||'<div class="empty">Nenhum cupom fiscal registrado.</div>'}</div>`;
}

function reports(){
  const rows=productReport(),{receipts,requests}=periodRows(),spent=receipts.reduce((sum,item)=>sum+num(item.total_value),0),ai=IS.aiRuns.filter(item=>new Date(item.created_at)>=new Date(IS.from+'T00:00:00')&&new Date(item.created_at)<=new Date(IS.to+'T23:59:59')),aiCost=ai.reduce((sum,item)=>sum+num(item.estimated_cost_usd),0);
  return `<section class="card supply-filters"><label>De<input id="supplyFrom" type="date" value="${IS.from}"></label><label>Até<input id="supplyTo" type="date" value="${IS.to}"></label><button class="outline" id="applySupplyPeriod">Aplicar período</button><button class="outline" id="exportSupplyCsv">Exportar Excel</button><button class="primary" id="printSupplyReport">Salvar em PDF</button></section><div class="supply-report-summary"><article><small>TOTAL COMPRADO</small><b>${money(spent)}</b><span>${receipts.length} compras</span></article><article><small>COMPRAS SOLICITADAS</small><b>${requests.length}</b><span>Consumo confirmado</span></article><article><small>ITENS MONITORADOS</small><b>${rows.filter(item=>item.purchaseCount).length}</b><span>Com histórico no período</span></article>${isAdmin()?`<article><small>LEITURAS POR IA</small><b>${ai.length}</b><span>Estimativa US$ ${aiCost.toFixed(4)}</span></article>`:''}</div><section class="card table-wrap"><table class="supply-table price-history-table"><thead><tr><th>Produto</th><th>Comprado</th><th>Valor gasto</th><th>Consumo solicitado</th><th>Preço anterior</th><th>Preço atual</th><th>Variação</th><th>Médio</th><th>Menor / maior</th><th>Saldo</th></tr></thead><tbody>${rows.map(item=>{const direction=item.variation>0?'up':item.variation<0?'down':'stable',symbol=item.variation>0?'↑':item.variation<0?'↓':'•';return `<tr><td><b>${esc(item.product.name)}</b><small>${esc(item.product.unit)}</small></td><td>${quantity(item.purchased,item.product.unit)}</td><td>${money(item.spent)}</td><td>${quantity(item.consumed,item.product.unit)}</td><td>${item.previousPrice?money(item.previousPrice):'—'}</td><td>${item.currentPrice?money(item.currentPrice):'—'}</td><td><span class="price-variation ${direction}">${item.previousPrice?`${symbol} ${money(Math.abs(item.variation))} (${Math.abs(item.variationPct).toLocaleString('pt-BR',{maximumFractionDigits:1})}%)`:'Sem comparação'}</span></td><td>${item.averagePrice?money(item.averagePrice):'—'}</td><td>${item.minPrice?`${money(item.minPrice)} / ${money(item.maxPrice)}`:'—'}</td><td>${quantity(num(item.product.physical_stock)-num(item.product.reserved_stock),item.product.unit)}</td></tr>`}).join('')||'<tr><td colspan="10" class="empty">Nenhum dado no período.</td></tr>'}</tbody></table></section>`;
}

function catalog(){
  return `<section class="supply-receipt-head"><div><p class="eyebrow">CATÁLOGO INTERNO</p><h2>Produtos de consumo e operação</h2><span>Estes produtos não aparecem para as colaboradoras de produção.</span></div><button class="primary" id="newSupplyProduct">＋ Cadastrar suprimento</button></section><div class="supply-catalog">${IS.products.map(item=>`<article class="card"><div class="supply-product-icon">🧴</div><div><span class="badge ${item.active?'active':'inactive'}">${item.active?'Ativo':'Inativo'}</span><h3>${esc(item.name)}</h3><p>${esc(item.description||item.unit)}</p></div><dl><div><dt>Estoque</dt><dd>${quantity(item.physical_stock,item.unit)}</dd></div><div><dt>Mínimo</dt><dd>${quantity(item.minimum_stock,item.unit)}</dd></div></dl><button class="ghost" data-edit-supply-product="${item.id}">Editar</button></article>`).join('')||'<div class="empty">Nenhum suprimento interno cadastrado.</div>'}</div>`;
}

async function renderInternal(page){
  page.dataset.internalSupplies='true';
  page.innerHTML=`<div class="page">${head('OPERAÇÃO INTERNA','Suprimentos e Compras','Solicitações, estoque, cupons fiscais e consumo mensal em um só lugar.')}<section class="card supply-loading">Carregando suprimentos internos…</section></div>`;
  await loadInternal();
  if(IS.error){page.innerHTML=`<div class="page">${head('OPERAÇÃO INTERNA','Suprimentos e Compras','Não foi possível carregar este módulo.')}<div class="error">${esc(IS.error)}</div></div>`;return}
  const content=IS.tab==='dashboard'?dashboard():IS.tab==='new'?requestForm(IS.editRequest||''):IS.tab==='requests'?requestList():IS.tab==='receipts'?receipts():IS.tab==='reports'?reports():catalog();
  page.innerHTML=`<div class="page internal-supplies-page">${head('OPERAÇÃO INTERNA','Suprimentos e Compras','Solicitações, compras e consumo mensal com dados confiáveis.','<button class="outline compact-action" id="refreshInternal">↻ Atualizar</button>')}${tabs()}<div class="supply-content">${content}</div></div>`;
  bind(page);
}

function bind(page){
  page.querySelectorAll('[data-supply-tab]').forEach(button=>button.onclick=()=>{IS.tab=button.dataset.supplyTab;IS.cart={};renderInternal(page)});
  page.querySelector('#refreshInternal').onclick=async()=>{IS.loaded=false;await loadData();renderInternal(page)};
  page.querySelectorAll('[data-toggle-supply]').forEach(card=>card.onclick=()=>{const id=card.dataset.toggleSupply;IS.cart[id]=IS.cart[id]?0:1;renderInternal(page)});
  const save=page.querySelector('#saveSupplyRequest');if(save)save.onclick=()=>saveRequest(save);
  page.querySelector('#cancelSupplyEdit')?.addEventListener('click',()=>{IS.cart={};IS.editRequest='';renderInternal(page)});
  page.querySelectorAll('[data-internal-request]').forEach(card=>card.onclick=()=>requestModal(IS.requests.find(item=>item.id===card.dataset.internalRequest)));
  page.querySelector('#newReceipt')?.addEventListener('click',()=>receiptUploadModal(''));
  page.querySelectorAll('[data-internal-receipt]').forEach(card=>card.onclick=()=>receiptDetail(IS.receipts.find(item=>item.id===card.dataset.internalReceipt)));
  page.querySelector('#newSupplyProduct')?.addEventListener('click',()=>productModal());
  page.querySelectorAll('[data-edit-supply-product]').forEach(button=>button.onclick=()=>productModal(productBy(button.dataset.editSupplyProduct)));
  page.querySelector('#applySupplyPeriod')?.addEventListener('click',()=>{IS.from=page.querySelector('#supplyFrom').value;IS.to=page.querySelector('#supplyTo').value;renderInternal(page)});
  page.querySelector('#exportSupplyCsv')?.addEventListener('click',exportCsv);
  page.querySelector('#printSupplyReport')?.addEventListener('click',printReport);
}

async function saveRequest(button){
  const items=IS.products.filter(item=>num(IS.cart[item.id])>0).map(item=>({product_id:item.id}));
  button.disabled=true;
  try{
    const body={p_priority:document.querySelector('#supplyPriority').value,p_needed_by:document.querySelector('#supplyNeeded').value||null,p_notes:document.querySelector('#supplyNotes').value,p_items:items};
    if(IS.editRequest)await rpc('update_own_internal_supply_request',{p_request_id:IS.editRequest,...body});else await rpc('create_internal_supply_request',body);
    IS.cart={};IS.editRequest='';IS.loaded=false;await loadInternal(true);IS.tab='requests';renderInternal(document.querySelector('#page'));toast('Solicitação interna salva com sucesso.');
  }catch(error){alert(error.message);button.disabled=false}
}

function requestModal(item){
  if(!item)return;const items=requestItems(item.id),own=item.requested_by===S.profile.id;
  const linked=IS.receipts.filter(receipt=>receipt.request_id===item.id&&receipt.status==='confirmed');
  document.querySelector('#modal').innerHTML=`<div class="modal"><section class="modal-box supply-modal"><div class="modal-head"><div><p class="eyebrow">SOLICITAÇÃO INTERNA #${String(item.protocol).padStart(4,'0')}</p><h2>${esc(item.requested_by_name)}</h2></div><button data-close>×</button></div><div class="supply-detail-meta"><span><small>Status</small><b class="badge ${item.status}">${statusText[item.status]}</b></span><span><small>Prioridade</small><b>${priorityText[item.priority]}</b></span><span><small>Necessário até</small><b>${item.needed_by?new Date(item.needed_by+'T12:00:00').toLocaleDateString('pt-BR'):'Não informado'}</b></span></div><div class="supply-detail-items">${items.map(row=>{const product=productBy(row.product_id),bought=linked.some(receipt=>receiptItems(receipt.id).some(receiptItem=>receiptItem.product_id===row.product_id));return `<article><div><b>${esc(product?.name||'Produto')}</b><small>${esc(product?.description||'Item solicitado')}</small></div><span class="request-item-state ${bought?'bought':'waiting'}">${bought?'✓ Comprado':'Aguardando compra'}</span></article>`}).join('')}</div>${item.notes?`<div class="supply-note"><small>OBSERVAÇÃO</small><p>${esc(item.notes)}</p></div>`:''}${linked.length?`<div class="linked-receipts"><small>CUPONS VINCULADOS</small>${linked.map(receipt=>`<span>🧾 #${String(receipt.protocol).padStart(4,'0')} · ${esc(receipt.merchant_name)} · ${money(receipt.total_value)}</span>`).join('')}</div>`:''}<div class="form-actions supply-actions">${own&&item.status==='pending'?'<button class="outline" id="editInternalRequest">Editar</button><button class="danger" id="cancelOwnInternal">Cancelar</button>':''}${isAdmin()&&['pending','separating'].includes(item.status)?'<button class="primary" id="attachInternalReceipt">📷 Anexar cupom da compra</button>':''}${isAdmin()&&!['delivered','cancelled'].includes(item.status)?'<button class="danger" id="adminCancelInternal">Cancelar solicitação</button>':''}</div></section></div>`;
  document.querySelector('[data-close]').onclick=closeModal;
  document.querySelector('#editInternalRequest')?.addEventListener('click',()=>{closeModal();IS.editRequest=item.id;IS.cart={};IS.tab='new';renderInternal(document.querySelector('#page'))});
  document.querySelector('#cancelOwnInternal')?.addEventListener('click',async()=>{if(!confirm('Cancelar esta solicitação interna?'))return;await action(()=>rpc('cancel_own_internal_supply_request',{p_request_id:item.id}),'Solicitação cancelada.')});
  document.querySelector('#attachInternalReceipt')?.addEventListener('click',()=>receiptUploadModal(item.id));
  document.querySelector('#adminCancelInternal')?.addEventListener('click',async()=>{const reason=prompt('Informe o motivo do cancelamento:');if(reason===null)return;await action(()=>rpc('admin_cancel_internal_supply_request',{p_request_id:item.id,p_reason:reason}),'Solicitação cancelada.')});
}

function prepareModal(item,items){
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box supply-modal" id="prepareInternalForm"><div class="modal-head"><div><p class="eyebrow">SEPARAÇÃO</p><h2>Aprovar quantidades</h2></div><button type="button" data-close>×</button></div><div class="supply-approval-list">${items.map(row=>{const product=productBy(row.product_id);return `<article><div><b>${esc(product?.name||'Produto')}</b><small>Solicitado: ${quantity(row.requested_quantity,product?.unit)}</small></div><label>Aprovado<input name="quantity_${row.product_id}" type="number" min="0" max="${row.requested_quantity}" step=".001" value="${row.approved_quantity??row.requested_quantity}"></label><label>Observação<input name="note_${row.product_id}" value="${esc(row.admin_note||'')}"></label></article>`}).join('')}</div><label>Observação geral<textarea name="admin_notes">${esc(item.admin_notes||'')}</textarea></label><button class="primary full">Salvar separação</button></form></div>`;
  document.querySelector('[data-close]').onclick=closeModal;
  document.querySelector('#prepareInternalForm').onsubmit=async event=>{event.preventDefault();const form=new FormData(event.target),payload=items.map(row=>({product_id:row.product_id,approved_quantity:num(form.get('quantity_'+row.product_id)),admin_note:String(form.get('note_'+row.product_id)||'')}));await action(()=>rpc('admin_prepare_internal_supply_request',{p_request_id:item.id,p_items:payload,p_admin_notes:String(form.get('admin_notes')||'')}),'Separação salva.');const updated=IS.requests.find(row=>row.id===item.id);scheduleModal(updated||item)};
}

function scheduleModal(item){
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box compact-modal" id="scheduleInternalForm"><div class="modal-head"><div><p class="eyebrow">AGENDAMENTO</p><h2>Definir entrega</h2></div><button type="button" data-close>×</button></div><label>Data e horário<input name="scheduled_for" type="datetime-local" required></label><button class="primary full">Agendar entrega</button></form></div>`;
  document.querySelector('[data-close]').onclick=closeModal;document.querySelector('#scheduleInternalForm').onsubmit=async event=>{event.preventDefault();await action(()=>rpc('admin_schedule_internal_supply_request',{p_request_id:item.id,p_scheduled_for:new Date(event.target.scheduled_for.value).toISOString()}),'Entrega agendada.')};
}

function completeModal(item){
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box compact-modal" id="completeInternalForm"><div class="modal-head"><div><p class="eyebrow">CONCLUSÃO</p><h2>Confirmar entrega</h2></div><button type="button" data-close>×</button></div><label>Quem entregou<input name="delivered_by" required></label><label>Quem recebeu<input name="received_by" required></label><button class="primary full">Concluir e baixar estoque</button></form></div>`;
  document.querySelector('[data-close]').onclick=closeModal;document.querySelector('#completeInternalForm').onsubmit=async event=>{event.preventDefault();await action(()=>rpc('admin_complete_internal_supply_request',{p_request_id:item.id,p_delivered_by:event.target.delivered_by.value,p_received_by:event.target.received_by.value}),'Entrega concluída e estoque atualizado.')};
}

async function action(operation,message){try{await operation();closeModal();IS.loaded=false;await loadData();await loadInternal(true);renderInternal(document.querySelector('#page'));toast(message)}catch(error){alert(error.message)}}
function closeModal(){document.querySelector('#modal').innerHTML=''}

function productModal(product={}){
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box" id="internalProductForm"><div class="modal-head"><div><p class="eyebrow">SUPRIMENTO INTERNO</p><h2>${product.id?'Editar produto':'Novo produto'}</h2></div><button type="button" data-close>×</button></div><div class="form"><label>Nome<input name="name" value="${esc(product.name||'')}" required></label><label>Unidade<select name="unit">${['unidade','quilo','cm','metro','rolo','garrafa','caixa'].map(unit=>`<option ${product.unit===unit?'selected':''}>${unit}</option>`).join('')}</select></label><label>Estoque físico<input name="physical_stock" type="number" min="0" step=".001" value="${product.physical_stock||0}" required></label><label>Estoque mínimo<input name="minimum_stock" type="number" min="0" step=".001" value="${product.minimum_stock||0}" required></label><label>Fornecedor preferencial<select name="supplier_id"><option value="">Não definido</option>${IS.suppliers.filter(item=>item.active).map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select></label><label class="check"><input name="active" type="checkbox" ${product.active!==false?'checked':''}>Produto ativo</label><label class="wide">Descrição<textarea name="description">${esc(product.description||'')}</textarea></label><div class="form-actions"><button type="button" class="outline" data-close>Cancelar</button><button class="primary">Salvar suprimento</button></div></div></form></div>`;
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=closeModal);
  document.querySelector('#internalProductForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter,form=new FormData(event.target);button.disabled=true;try{await rpc('admin_save_internal_supply_product',{p_product_id:product.id||null,p_name:String(form.get('name')),p_unit:String(form.get('unit')),p_description:String(form.get('description')||''),p_minimum_stock:num(form.get('minimum_stock')),p_physical_stock:num(form.get('physical_stock')),p_supplier_id:form.get('supplier_id')||null,p_active:form.get('active')==='on'});closeModal();IS.loaded=false;await loadData();await loadInternal(true);renderInternal(document.querySelector('#page'));toast('Suprimento salvo.')}catch(error){alert(error.message);button.disabled=false}};
}

async function compressImage(file){
  if(!file.type.startsWith('image/')||file.size<=1200000)return file;
  try{const bitmap=await createImageBitmap(file),max=2400,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return await new Promise(resolve=>canvas.toBlob(blob=>resolve(blob||file),'image/jpeg',.84))}catch{return file}
}
async function uploadReceipt(file){
  const compressed=await compressImage(file);if(compressed.size>5242880)throw Error('A foto deve ter no máximo 5 MB.');
  const extension=compressed.type==='image/png'?'png':compressed.type==='image/webp'?'webp':'jpg',path=`${S.profile.id}/${crypto.randomUUID()}.${extension}`;
  const response=await storageFetch('/storage/v1/object/internal-receipts/'+encodedStoragePath(path),{method:'POST',headers:{'Content-Type':compressed.type||'image/jpeg','x-upsert':'false'},body:compressed});
  if(!response.ok)throw Error('Não foi possível enviar a foto do cupom.');return path;
}

function receiptUploadModal(requestId=''){
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box receipt-upload" id="receiptUploadForm"><div class="modal-head"><div><p class="eyebrow">NOVO CUPOM</p><h2>Fotografar ou escolher imagem</h2></div><button type="button" data-close>×</button></div><label class="receipt-drop"><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><i>📷</i><b>Selecionar foto do cupom fiscal</b><span>Use boa luz, enquadre todo o cupom e evite sombras.</span></label><div class="receipt-ai-info"><i>✨</i><p><b>Leitura inteligente com conferência</b><span>Os dados serão preenchidos automaticamente, mas nada será salvo antes da sua revisão.</span></p></div><div class="form-actions"><button type="button" class="outline" id="manualReceipt">Preencher manualmente</button><button class="primary" id="analyzeReceipt">Ler cupom automaticamente</button></div></form></div>`;
  document.querySelector('[data-close]').onclick=closeModal;
  document.querySelector('#manualReceipt').onclick=()=>receiptReview({merchant_name:'',merchant_document:'',fiscal_access_key:'',receipt_number:'',purchased_at:new Date().toISOString(),total_value:0,payment_method:'',confidence:0,warnings:[],items:[{description:'',quantity:1,unit:'unidade',unit_price:0,total_price:0,confidence:0}]},'',false,'',{},requestId);
  document.querySelector('#analyzeReceipt').onclick=async event=>{event.preventDefault();const button=event.currentTarget,file=document.querySelector('#receiptUploadForm [name="photo"]').files[0];if(!file)return alert('Selecione a foto do cupom.');button.disabled=true;button.textContent='Analisando cupom…';try{const path=await uploadReceipt(file),result=await receiptEdge({image_path:path});receiptReview(result.extraction,path,true,result.model,result.usage,requestId)}catch(error){alert(error.message);button.disabled=false;button.textContent='Ler cupom automaticamente'}};
}

function bestProduct(description){const term=normalizeSearch(description);if(!term)return'';const words=term.split(/\s+/).filter(word=>word.length>2);return IS.products.map(product=>({id:product.id,score:words.filter(word=>normalizeSearch(product.name).includes(word)).length})).sort((a,b)=>b.score-a.score)[0]?.score?IS.products.map(product=>({id:product.id,score:words.filter(word=>normalizeSearch(product.name).includes(word)).length})).sort((a,b)=>b.score-a.score)[0].id:''}
function receiptItemRow(item,index,requestId=''){const requested=requestId?requestItems(requestId).map(row=>productBy(row.product_id)).filter(Boolean):[],match=bestProduct(item.description)||requested.find(product=>normalizeSearch(item.description).includes(normalizeSearch(product.name)))?.id||'';return `<article class="receipt-review-item" data-receipt-row="${index}"><label class="wide">Descrição lida<input name="description" value="${esc(item.description||'')}" required></label><label class="wide">Produto correspondente<select name="product_id"><option value="__new__" ${match?'':'selected'}>＋ Criar novo produto automaticamente</option>${requested.length?`<optgroup label="Itens desta solicitação">${requested.map(product=>`<option value="${product.id}" ${match===product.id?'selected':''}>${esc(product.name)}</option>`).join('')}</optgroup>`:''}<optgroup label="Catálogo interno">${IS.products.filter(product=>product.active&&!requested.some(item=>item.id===product.id)).map(product=>`<option value="${product.id}" ${match===product.id?'selected':''}>${esc(product.name)}</option>`).join('')}</optgroup></select></label><label>Quantidade comprada<input name="quantity" type="number" min=".001" step=".001" value="${item.quantity||1}" required></label><label>Unidade<input name="unit" value="${esc(item.unit||'unidade')}"></label><label>Valor unitário<input name="unit_price" type="number" min="0" step=".0001" value="${item.unit_price||0}"></label><label>Total do item<input name="total_price" type="number" min="0" step=".01" value="${item.total_price||0}"></label><input name="confidence" type="hidden" value="${item.confidence||0}"><button type="button" class="danger" data-remove-receipt-row="${index}">Remover</button></article>`}

function receiptReview(extraction,imagePath,aiUsed,model,usage={},requestId=''){
  const data={...extraction,items:Array.isArray(extraction.items)&&extraction.items.length?extraction.items:[{description:'',quantity:1,unit:'unidade',unit_price:0,total_price:0,confidence:0}]};
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box receipt-review" id="receiptReviewForm"><div class="modal-head"><div><p class="eyebrow">${aiUsed?'✨ CONFERÊNCIA DA LEITURA':'REGISTRO MANUAL'}</p><h2>${requestId?'Compra vinculada à solicitação':'Compra direta'}</h2></div><button type="button" data-close>×</button></div>${requestId?`<div class="receipt-link-banner">🔗 Este cupom será vinculado à solicitação interna #${String(IS.requests.find(item=>item.id===requestId)?.protocol||'').padStart(4,'0')}.</div>`:''}${data.warnings?.length?`<div class="receipt-warnings"><b>Confira com atenção:</b>${data.warnings.map(item=>`<span>• ${esc(item)}</span>`).join('')}</div>`:''}<div class="form receipt-main-fields"><label>Estabelecimento<input name="merchant_name" value="${esc(data.merchant_name||'')}" required></label><label>CNPJ/CPF<input name="merchant_document" value="${esc(data.merchant_document||'')}"></label><label>Data e hora<input name="purchased_at" type="datetime-local" value="${new Date(data.purchased_at||Date.now()).toISOString().slice(0,16)}" required></label><label>Valor total<input name="total_value" type="number" min="0" step=".01" value="${data.total_value||0}" required></label><label>Número do cupom<input name="receipt_number" value="${esc(data.receipt_number||'')}"></label><label>Chave fiscal<input name="fiscal_access_key" value="${esc(data.fiscal_access_key||'')}"></label><label>Forma de pagamento<input name="payment_method" value="${esc(data.payment_method||'')}"></label><label>Fornecedor cadastrado<select name="supplier_id"><option value="">Não vinculado</option>${IS.suppliers.filter(item=>item.active).map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select></label></div><div class="receipt-review-head"><div><p class="eyebrow">ITENS DO CUPOM</p><h3>Confira ou crie novos produtos</h3></div><button type="button" class="outline" id="addReceiptRow">＋ Adicionar item</button></div><div id="receiptReviewItems">${data.items.map((item,index)=>receiptItemRow(item,index,requestId)).join('')}</div><div class="receipt-auto-create-note">Quando um item não existir no catálogo, mantenha a opção <b>Criar novo produto automaticamente</b>.</div><div class="receipt-cost-note">${aiUsed?`Leitura automática concluída · custo estimado US$ ${num(usage.estimated_cost_usd).toFixed(4)}`:'Preenchimento manual sem custo de inteligência.'}</div><button class="primary full">Confirmar compra e registrar os dados</button></form></div>`;
  document.querySelector('[data-close]').onclick=closeModal;
  const bindRows=()=>document.querySelectorAll('[data-remove-receipt-row]').forEach(button=>button.onclick=()=>{button.closest('.receipt-review-item').remove()});bindRows();
  document.querySelector('#addReceiptRow').onclick=()=>{const host=document.querySelector('#receiptReviewItems'),index=host.children.length;host.insertAdjacentHTML('beforeend',receiptItemRow({description:'',quantity:1,unit:'unidade',unit_price:0,total_price:0,confidence:0},index,requestId));bindRows()};
  document.querySelector('#receiptReviewForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter,form=new FormData(event.target),items=[...document.querySelectorAll('.receipt-review-item')].map(row=>{const selected=row.querySelector('[name="product_id"]').value;return {product_id:selected==='__new__'?null:selected,raw_description:row.querySelector('[name="description"]').value,quantity:num(row.querySelector('[name="quantity"]').value),unit:row.querySelector('[name="unit"]').value,unit_price:num(row.querySelector('[name="unit_price"]').value),total_price:num(row.querySelector('[name="total_price"]').value),confidence:num(row.querySelector('[name="confidence"]').value)}});if(!items.length)return alert('Adicione ao menos um item.');button.disabled=true;try{await rpc('confirm_internal_purchase_receipt',{p_receipt:{request_id:requestId||null,supplier_id:form.get('supplier_id')||null,merchant_name:form.get('merchant_name'),merchant_document:form.get('merchant_document'),fiscal_access_key:form.get('fiscal_access_key'),receipt_number:form.get('receipt_number'),purchased_at:new Date(form.get('purchased_at')).toISOString(),total_value:num(form.get('total_value')),payment_method:form.get('payment_method'),image_path:imagePath,ai_used:aiUsed,ai_model:model,ai_confidence:num(data.confidence),extraction:data},p_items:items});closeModal();IS.loaded=false;await loadData();await loadInternal(true);IS.tab=requestId?'requests':'receipts';renderInternal(document.querySelector('#page'));toast(requestId?'Cupom vinculado e solicitação atualizada.':'Compra direta registrada com sucesso.')}catch(error){alert(error.message);button.disabled=false}};
}

function receiptDetail(item){
  const items=receiptItems(item.id);document.querySelector('#modal').innerHTML=`<div class="modal"><section class="modal-box supply-modal"><div class="modal-head"><div><p class="eyebrow">COMPRA #${String(item.protocol).padStart(4,'0')}</p><h2>${esc(item.merchant_name)}</h2></div><button data-close>×</button></div><div class="supply-detail-meta"><span><small>Data</small><b>${fmt(item.purchased_at)}</b></span><span><small>Total</small><b>${money(item.total_value)}</b></span><span><small>Registro</small><b>${item.ai_used?'✨ Leitura inteligente':'Manual'}</b></span></div><div class="supply-detail-items">${items.map(row=>`<article><div><b>${esc(productBy(row.product_id)?.name||row.raw_description)}</b><small>${esc(row.raw_description)}</small></div><span>${quantity(row.quantity,row.unit)}</span><span><b>${money(row.total_price)}</b></span></article>`).join('')}</div>${item.image_path?'<button class="outline full" id="viewReceiptImage">Visualizar foto original</button>':''}${isAdmin()&&item.status==='confirmed'?'<button class="danger full" id="reverseReceipt">Cancelar compra e estornar estoque</button>':''}</section></div>`;
  document.querySelector('[data-close]').onclick=closeModal;document.querySelector('#viewReceiptImage')?.addEventListener('click',()=>viewReceiptImage(item.image_path));document.querySelector('#reverseReceipt')?.addEventListener('click',async()=>{const reason=prompt('Informe o motivo do cancelamento:');if(reason===null)return;await action(()=>rpc('admin_reverse_internal_purchase_receipt',{p_receipt_id:item.id,p_reason:reason}),'Compra cancelada e estoque estornado.')});
}
async function viewReceiptImage(path){try{const response=await storageFetch('/storage/v1/object/authenticated/internal-receipts/'+encodedStoragePath(path));if(!response.ok)throw Error();const url=URL.createObjectURL(await response.blob()),win=window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);if(!win)alert('Permita a abertura da imagem no navegador.')}catch{alert('Não foi possível abrir a foto do cupom.')}}

function exportCsv(){const rows=productReport(),lines=[['Produto','Unidade','Comprado','Valor gasto','Consumo solicitado','Preço anterior','Preço atual','Variação R$','Variação %','Preço médio','Menor preço','Maior preço','Saldo disponível'],...rows.map(item=>[item.product.name,item.product.unit,item.purchased,item.spent,item.consumed,item.previousPrice||'',item.currentPrice||'',item.previousPrice?item.variation:'',item.previousPrice?item.variationPct:'',item.averagePrice||'',item.minPrice||'',item.maxPrice||'',num(item.product.physical_stock)-num(item.product.reserved_stock)])],csv='\ufeff'+lines.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(';')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`suprimentos-${IS.from}-${IS.to}.csv`;link.click();URL.revokeObjectURL(url)}
function printReport(){window.print()}

const before=renderPage;renderPage=async function(){if(S.view==='internal-supplies'&&allowed())return renderInternal(document.querySelector('#page'));return before()};
new MutationObserver(nav).observe(document.body,{childList:true,subtree:true});nav();
window.HarmonyInternalSupplies={load:loadInternal,report:productReport};
})();
