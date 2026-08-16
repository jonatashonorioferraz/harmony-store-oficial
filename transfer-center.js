(()=>{
'use strict';

const TC={loaded:false,loading:null,requests:[],catalog:{models:[],colors:[]},query:'',status:'active'};
const ACTIVE=['requested','partially_reserved','reserved','in_transit'];
const STATUS={
  requested:['Solicitada','requested'],partially_reserved:['Reserva parcial','partial'],reserved:['Pronta para retirada','ready'],
  in_transit:['Em transferência','transit'],received:['Recebida','received'],transferred:['Concluída','received'],cancelled:['Cancelada','cancelled']
};
const PURPOSE={full_shipping:'Envio FULL',routine_restock:'Abastecimento de rotina',campaign:'Campanha',ad_hoc:'Demanda avulsa',shipping_plan:'Planejamento de envio'};
const PRIORITY={low:'Baixa',normal:'Normal',high:'Alta',urgent:'Urgente'};
const canPlan=()=>Boolean(S?.profile?.is_ecommerce_manager||S?.profile?.is_primary_admin);
const canDispatch=()=>Boolean(S?.profile?.role==='admin'||S?.profile?.role==='receiver');
const canAccess=()=>canPlan()||canDispatch();
const num=value=>Number(value||0);
const code=value=>'#'+String(value||0).padStart(4,'0');
const qty=value=>num(value).toLocaleString('pt-BR')+' un.';
const date=value=>value?new Date(String(value).length===10?value+'T12:00:00':value).toLocaleDateString('pt-BR'):'Sem prazo';
const datetime=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const image=path=>path?`${API}/storage/v1/object/public/product-images/${encodedStoragePath(path)}`:'assets/shipping-product-placeholder.svg';
const statusInfo=status=>STATUS[status]||[status,'requested'];
const active=request=>ACTIVE.includes(request.status);

async function load(force=false){
  if(!canAccess())return;
  if(TC.loaded&&!force)return;
  if(TC.loading)return TC.loading;
  TC.loading=(async()=>{
    const tasks=[rpc('list_shipping_inventory_requests',{p_status:null})];
    if(canPlan())tasks.push(rpc('list_transfer_center_catalog',{}));
    const [rows,catalogRows]=await Promise.all(tasks);
    TC.requests=(rows||[]).map(row=>row.request||row);
    TC.catalog=(catalogRows?.[0]?.catalog||catalogRows?.[0]||TC.catalog);
    TC.loaded=true;
  })().finally(()=>TC.loading=null);
  return TC.loading;
}

function reset(){Object.assign(TC,{loaded:false,loading:null,requests:[],catalog:{models:[],colors:[]},query:'',status:'active'})}

function injectNav(){
  const nav=document.querySelector('.sidebar nav');if(!nav)return;
  let button=nav.querySelector('[data-view="transfer-center"]');
  if(!canAccess()){button?.remove();return}
  if(!button){
    button=document.createElement('button');button.className='nav';button.dataset.view='transfer-center';
    button.innerHTML='<i aria-hidden="true">↔</i>Central de Transferências';
    button.onclick=()=>open();
    const shipping=nav.querySelector('[data-view="shipping-planning"]'),inventory=nav.querySelector('[data-view="production-inventory"]');
    (shipping||inventory)?.insertAdjacentElement('afterend',button);
    if(!button.isConnected)nav.appendChild(button);
  }
  button.classList.toggle('active',S.view==='transfer-center');
  window.HarmonyIcons?.apply?.();
}

function hero(){
  return `<section class="transfer-hero"><div class="transfer-route" aria-hidden="true"><i></i><i></i><i></i></div><div class="transfer-hero-copy"><p>CENTRAL LOGÍSTICA HARMONY</p><h1>Operação em movimento</h1><span>Solicite, reserve e acompanhe caixas completas do Inventário de Produção até o recebimento no e-commerce.</span><div><b>Rastreabilidade total</b><b>Caixas exatas</b><b>Sem saldo fictício</b></div></div><img src="assets/peugeot-expert-harmony.png" alt="Peugeot Expert branca da operação Harmony"><div class="transfer-boxes" aria-hidden="true"><i>H</i><i>H</i><i>H</i></div></section>`;
}

function metrics(){
  const openRows=TC.requests.filter(active),partial=openRows.filter(row=>row.status==='partially_reserved'),ready=openRows.filter(row=>row.status==='reserved'),transit=openRows.filter(row=>row.status==='in_transit');
  return `<section class="transfer-metrics"><article><i>01</i><span><small>SOLICITAÇÕES ATIVAS</small><b>${openRows.length}</b><em>Demandas em acompanhamento</em></span></article><article class="attention"><i>02</i><span><small>RESERVA PARCIAL</small><b>${partial.length}</b><em>Ainda faltam caixas</em></span></article><article class="ready"><i>03</i><span><small>PRONTAS PARA RETIRADA</small><b>${ready.length}</b><em>Separação completa</em></span></article><article class="transit"><i>04</i><span><small>EM TRANSFERÊNCIA</small><b>${transit.length}</b><em>Aguardando recebimento</em></span></article></section>`;
}

function filtered(){
  const query=TC.query.toLocaleLowerCase('pt-BR').trim();
  return TC.requests.filter(request=>{
    if(TC.status==='active'&&!active(request))return false;
    if(TC.status==='history'&&active(request))return false;
    return !query||[request.protocol,request.title,request.requested_by_name,request.plan_title,...(request.components||[]).flatMap(item=>[item.model_name,item.color_name])].join(' ').toLocaleLowerCase('pt-BR').includes(query);
  });
}

function coverage(request){
  const items=request.components||[],required=items.reduce((sum,item)=>sum+num(item.required_quantity),0),selected=items.reduce((sum,item)=>sum+num(item.selected_quantity),0);
  return {required,selected,pct:required?Math.min(100,Math.round(selected*100/required)):0};
}

function requestCard(request){
  const [label,klass]=statusInfo(request.status),cover=coverage(request),items=request.components||[];
  return `<article class="transfer-card ${klass}" data-transfer-open="${request.id}" tabindex="0" role="button"><header><span><small>${request.source_type==='shipping_plan'?'PLANEJAMENTO FULL':'SOLICITAÇÃO DIRETA'} ${code(request.protocol)}</small><h3>${esc(request.title)}</h3><p>${esc(PURPOSE[request.purpose]||request.purpose)} · ${date(request.needed_on)}</p></span><b>${label}</b></header><div class="transfer-card-products">${items.slice(0,3).map(item=>`<span><img src="${esc(image(item.image_path))}" alt=""><i style="--transfer-color:${esc(item.color_hex)}"></i><em><b>${esc(item.model_name)}</b><small>${esc(item.color_name)} · ${qty(item.required_quantity)}</small></em></span>`).join('')}${items.length>3?`<strong>+${items.length-3}</strong>`:''}</div><div class="transfer-progress"><span><i style="width:${cover.pct}%"></i></span><b>${cover.pct}%</b></div><footer><span>${num(request.box_count)} caixa(s) selecionada(s)</span><em>${esc(PRIORITY[request.priority]||request.priority)}</em><strong>Abrir ›</strong></footer></article>`;
}

function recentMovements(){
  const rows=TC.requests.filter(row=>['in_transit','received','transferred','cancelled'].includes(row.status)).sort((a,b)=>new Date(b.received_at||b.dispatched_at||b.cancelled_at)-new Date(a.received_at||a.dispatched_at||a.cancelled_at)).slice(0,20);
  return `<details class="card transfer-movements"><summary><span><small>MOVIMENTAÇÕES RECENTES</small><b>Histórico operacional</b><em>${rows.length} registro(s) disponíveis</em></span><strong><i>＋</i> Expandir lista</strong></summary><div class="transfer-movement-window"><table><thead><tr><th>Data e hora</th><th>Solicitação</th><th>Origem</th><th>Movimentação</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(row=>{const [label,klass]=statusInfo(row.status);return`<tr><td>${datetime(row.received_at||row.dispatched_at||row.cancelled_at)}</td><td>${code(row.protocol)}</td><td>${esc(row.source_type==='shipping_plan'?'Planejamento FULL':'Solicitação direta')}</td><td>${num(row.box_count)} caixa(s) · ${qty(row.selected_quantity)}</td><td><span class="${klass}">${label}</span></td><td><button data-transfer-open="${row.id}">›</button></td></tr>`}).join('')||'<tr><td colspan="6">Nenhuma movimentação concluída.</td></tr>'}</tbody></table></div></details>`;
}

function reports(){
  const completed=TC.requests.filter(row=>['received','transferred'].includes(row.status)),boxes=completed.reduce((sum,row)=>sum+num(row.box_count),0),units=completed.reduce((sum,row)=>sum+num(row.selected_quantity),0);
  const lead=completed.map(row=>(new Date(row.received_at)-new Date(row.requested_at))/86400000).filter(value=>Number.isFinite(value)&&value>=0);
  const avg=lead.length?(lead.reduce((a,b)=>a+b,0)/lead.length).toFixed(1):'0,0';
  const demand=new Map();for(const request of TC.requests)for(const item of request.components||[]){const key=`${item.model_name} · ${item.color_name}`;demand.set(key,(demand.get(key)||0)+num(item.required_quantity))}
  const top=[...demand].sort((a,b)=>b[1]-a[1]).slice(0,5);
  return `<section class="card transfer-reports"><div class="card-head"><div><p class="eyebrow">INDICADORES AUDITÁVEIS</p><h2>Demanda e movimentação</h2><span>Dados calculados somente pelas solicitações, reservas e transferências registradas.</span></div><button class="outline" id="exportTransferReport">Exportar CSV</button></div><div class="transfer-report-metrics"><span><small>TRANSFERÊNCIAS CONCLUÍDAS</small><b>${completed.length}</b></span><span><small>CAIXAS MOVIMENTADAS</small><b>${boxes}</b></span><span><small>UNIDADES TRANSFERIDAS</small><b>${units.toLocaleString('pt-BR')}</b></span><span><small>TEMPO MÉDIO</small><b>${String(avg).replace('.',',')} dias</b></span></div><div class="transfer-demand"><h3>Produtos mais solicitados</h3>${top.map(([name,value],index)=>`<div><b>${index+1}</b><span>${esc(name)}</span><strong>${qty(value)}</strong></div>`).join('')||'<p class="empty">Os indicadores surgirão após as primeiras solicitações.</p>'}</div></section>`;
}

async function render(){
  const page=document.querySelector('#page');if(!page||S.view!=='transfer-center'||!canAccess())return;
  page.innerHTML='<div class="loading-inline">Organizando a Central de Transferências…</div>';
  try{
    await load();if(S.view!=='transfer-center')return;
    page.innerHTML=`<div class="page transfer-center-page">${hero()}${metrics()}<section class="card transfer-toolbar"><label>Localizar solicitação<input id="transferSearch" type="search" placeholder="Número, produto, cor ou solicitante" value="${esc(TC.query)}"></label><label>Situação<select id="transferStatus"><option value="active" ${TC.status==='active'?'selected':''}>Em andamento</option><option value="history" ${TC.status==='history'?'selected':''}>Concluídas e canceladas</option><option value="all" ${TC.status==='all'?'selected':''}>Todas</option></select></label>${canPlan()?'<button class="primary" id="newTransferRequest">＋ Nova solicitação</button>':''}<button class="outline" id="refreshTransferCenter">↻ Atualizar</button></section><section class="transfer-board">${filtered().map(requestCard).join('')||'<div class="card empty">Nenhuma solicitação corresponde aos filtros.</div>'}</section>${reports()}${recentMovements()}</div>`;
    bind();
  }catch(error){page.innerHTML=`<div class="page"><section class="card intelligence-error"><h2>Não foi possível abrir a Central de Transferências</h2><p>${esc(error.message)}</p><button class="primary" onclick="HarmonyTransferCenter.open()">Tentar novamente</button></section></div>`}
}

function bind(){
  const search=document.querySelector('#transferSearch');if(search)search.oninput=()=>{TC.query=search.value;document.querySelector('.transfer-board').innerHTML=filtered().map(requestCard).join('')||'<div class="card empty">Nenhuma solicitação corresponde aos filtros.</div>';bindOpen()};
  document.querySelector('#transferStatus')?.addEventListener('change',event=>{TC.status=event.target.value;render()});
  document.querySelector('#newTransferRequest')?.addEventListener('click',openCreate);
  document.querySelector('#refreshTransferCenter')?.addEventListener('click',async()=>{TC.loaded=false;await render();toast('Central atualizada.')});
  document.querySelector('#exportTransferReport')?.addEventListener('click',exportCsv);
  document.querySelector('.transfer-movements')?.addEventListener('toggle',event=>{const strong=event.currentTarget.querySelector('summary strong');strong.innerHTML=event.currentTarget.open?'<i>−</i> Recolher lista':'<i>＋</i> Expandir lista'});
  bindOpen();
}
function bindOpen(){document.querySelectorAll('[data-transfer-open]').forEach(node=>{const action=()=>openDetail(node.dataset.transferOpen);node.onclick=action;node.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();action()}}})}

function modelOptions(value=''){return `<option value="">Selecione o modelo</option>${(TC.catalog.models||[]).map(row=>`<option value="${row.id}" ${row.id===value?'selected':''}>${esc(row.name)}</option>`).join('')}`}
function colorOptions(value=''){return `<option value="">Selecione a cor</option>${(TC.catalog.colors||[]).map(row=>`<option value="${row.id}" ${row.id===value?'selected':''}>${esc(row.name)}</option>`).join('')}`}
function createRow(){return `<div class="transfer-create-row"><label>Modelo<select data-transfer-model required>${modelOptions()}</select></label><label>Cor<select data-transfer-color required>${colorOptions()}</select></label><label>Quantidade<input data-transfer-quantity type="number" min="1" step="1" required></label><label>Observação<input data-transfer-item-notes maxlength="500" placeholder="Opcional"></label><button type="button" class="danger" data-transfer-remove aria-label="Remover produto">Remover</button></div>`}
function openCreate(){
  const modal=document.querySelector('#modal');modal.innerHTML=`<div class="modal"><form class="modal-box large transfer-create" id="transferCreateForm"><div class="modal-head"><div><p class="eyebrow">NOVA DEMANDA LOGÍSTICA</p><h2>Solicitar caixas do Inventário</h2><span>Informe a necessidade. A reserva física será feita depois, usando caixas completas.</span></div><button type="button" data-transfer-close>×</button></div><div class="transfer-create-meta"><label>Título<input name="title" maxlength="140" required placeholder="Ex.: Abastecimento para campanha de agosto"></label><label>Finalidade<select name="purpose"><option value="routine_restock">Abastecimento de rotina</option><option value="campaign">Campanha</option><option value="ad_hoc">Demanda avulsa</option></select></label><label>Necessário até<input name="needed_on" type="date"></label><label>Prioridade<select name="priority"><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baixa</option></select></label></div><section class="transfer-create-items"><header><span><b>Produtos necessários</b><small>Cadastros oficiais do Inventário de Produção</small></span><button type="button" class="outline" id="addTransferItem">＋ Adicionar produto</button></header><div id="transferCreateRows">${createRow()}</div></section><label>Orientações para a equipe<textarea name="notes" maxlength="1200" placeholder="Opcional: contexto, prioridade ou instruções"></textarea></label><div class="form-actions"><button type="button" class="outline" data-transfer-close>Cancelar</button><button class="primary">Criar solicitação</button></div></form></div>`;
  document.querySelectorAll('[data-transfer-close]').forEach(button=>button.onclick=()=>modal.innerHTML='');
  const rows=document.querySelector('#transferCreateRows');document.querySelector('#addTransferItem').onclick=()=>{rows.insertAdjacentHTML('afterbegin',createRow());bindCreateRows()};bindCreateRows();
  document.querySelector('#transferCreateForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter,form=event.currentTarget,data=new FormData(form),items=[...form.querySelectorAll('.transfer-create-row')].map(row=>({model_id:row.querySelector('[data-transfer-model]').value,color_id:row.querySelector('[data-transfer-color]').value,required_quantity:num(row.querySelector('[data-transfer-quantity]').value),notes:row.querySelector('[data-transfer-item-notes]').value.trim()||null}));if(items.some(item=>!item.model_id||!item.color_id||item.required_quantity<1))return alert('Preencha modelo, cor e quantidade de todos os produtos.');button.disabled=true;try{const id=await rpc('create_transfer_center_request',{p_plan_item_id:null,p_title:data.get('title'),p_purpose:data.get('purpose'),p_needed_on:data.get('needed_on')||null,p_priority:data.get('priority'),p_notes:data.get('notes')||null,p_items:items});modal.innerHTML='';TC.loaded=false;await load(true);await openReservation(id);toast('Solicitação criada com rastreabilidade.')}catch(error){alert(error.message);button.disabled=false}};
}
function bindCreateRows(){document.querySelectorAll('[data-transfer-remove]').forEach(button=>button.onclick=()=>{const rows=document.querySelectorAll('.transfer-create-row');if(rows.length===1)return alert('Mantenha pelo menos um produto.');button.closest('.transfer-create-row').remove()})}

async function createFromPlan(planItemId){
  const id=await rpc('create_transfer_center_request',{p_plan_item_id:planItemId,p_title:null,p_purpose:'full_shipping',p_needed_on:null,p_priority:'normal',p_notes:null,p_items:[]});
  TC.loaded=false;await load(true);return id;
}

async function openReservation(requestId){
  const modal=document.querySelector('#modal');modal.innerHTML='<div class="modal"><section class="modal-box large"><div class="loading-inline">Consultando caixas compatíveis…</div></section></div>';
  try{
    const rows=await rpc('list_transfer_center_options',{p_request_id:requestId}),items=(rows||[]).map(row=>row.item||row),request=TC.requests.find(row=>row.id===requestId);
    modal.innerHTML=`<div class="modal"><form class="modal-box large transfer-reservation" id="transferReservationForm"><div class="modal-head"><div><p class="eyebrow">RESERVA FÍSICA ${request?code(request.protocol):''}</p><h2>Selecionar caixas exatas</h2><span>As caixas mais antigas aparecem primeiro. Cada caixa permanece inteira.</span></div><button type="button" data-transfer-close>×</button></div><aside><b>Proteção contra dupla reserva</b><span>Ao confirmar, as caixas escolhidas ficam indisponíveis para outras solicitações.</span></aside><div>${items.map(reservationItem).join('')}</div><label>Observação da reserva<textarea name="notes" maxlength="1200" placeholder="Opcional"></textarea></label><div class="form-actions"><button type="button" class="outline" data-transfer-close>Voltar</button><button class="primary">Reservar caixas selecionadas</button></div></form></div>`;
    document.querySelectorAll('[data-transfer-close]').forEach(button=>button.onclick=()=>modal.innerHTML='');
    const form=document.querySelector('#transferReservationForm');const update=()=>form.querySelectorAll('[data-transfer-reservation-item]').forEach(section=>{const required=num(section.dataset.required),already=num(section.dataset.already),added=[...section.querySelectorAll('input:checked')].reduce((sum,input)=>sum+num(input.dataset.quantity),0),total=already+added,pct=Math.min(100,required?Math.round(total*100/required):0);section.querySelector('[data-transfer-selected]').textContent=qty(total);section.querySelector('[data-transfer-coverage]').style.width=pct+'%';section.dataset.covered=total>=required});form.querySelectorAll('input[type="checkbox"]').forEach(input=>input.onchange=update);update();
    form.onsubmit=async event=>{event.preventDefault();const button=event.submitter,selections=[...form.querySelectorAll('[data-transfer-reservation-item]')].map(section=>({item_id:section.dataset.itemId,box_ids:[...section.querySelectorAll('input:checked')].map(input=>input.value)})).filter(row=>row.box_ids.length);if(!selections.length)return alert('Selecione pelo menos uma caixa nova.');button.disabled=true;try{await rpc('reserve_transfer_center_boxes',{p_request_id:requestId,p_selections:selections,p_notes:new FormData(form).get('notes')||null});modal.innerHTML='';TC.loaded=false;await load(true);if(S.view==='transfer-center')await render();toast('Caixas reservadas com segurança.')}catch(error){alert(error.message);button.disabled=false}};
  }catch(error){alert(error.message);modal.innerHTML=''}
}
function reservationItem(item){const missing=Math.max(0,num(item.required_quantity)-num(item.selected_quantity));return `<section class="transfer-reservation-item" data-transfer-reservation-item data-item-id="${item.id}" data-required="${num(item.required_quantity)}" data-already="${num(item.selected_quantity)}"><header><img src="${esc(image(item.image_path))}" alt=""><span><b>${esc(item.model_name)}</b><em><i style="--transfer-color:${esc(item.color_hex)}"></i>${esc(item.color_name)}</em></span><strong><small>NECESSÁRIO</small>${qty(item.required_quantity)}<em>Faltam ${qty(missing)}</em></strong></header><div class="transfer-box-options">${(item.boxes||[]).map(box=>`<label><input type="checkbox" value="${box.id}" data-quantity="${num(box.quantity)}"><span><b>${esc(box.box_code)}</b><small>${qty(box.quantity)}</small><em>Entrada ${date(box.entry_on)} · ${esc(box.location||'Sem localização')}</em></span></label>`).join('')||'<p class="empty">Nenhuma caixa compatível disponível no momento.</p>'}</div><footer><span>Total após a seleção: <b data-transfer-selected>${qty(item.selected_quantity)}</b></span><i><em data-transfer-coverage></em></i></footer></section>`}

function openDetail(id){
  const request=TC.requests.find(row=>row.id===id);if(!request)return;const [label,klass]=statusInfo(request.status),cover=coverage(request);
  document.querySelector('#modal').innerHTML=`<div class="modal"><section class="modal-box large transfer-detail"><div class="modal-head"><div><p class="eyebrow">CENTRAL DE TRANSFERÊNCIAS ${code(request.protocol)}</p><h2>${esc(request.title)}</h2><span>${esc(PURPOSE[request.purpose]||request.purpose)} · solicitado por ${esc(request.requested_by_name)}</span></div><button type="button" data-transfer-close>×</button></div><div class="transfer-detail-status"><b class="${klass}">${label}</b><span>Prioridade: <strong>${esc(PRIORITY[request.priority]||request.priority)}</strong></span><span>Prazo: <strong>${date(request.needed_on)}</strong></span><span>Origem: <strong>${request.source_type==='shipping_plan'?'Planejamento FULL':'Solicitação direta'}</strong></span></div><div class="transfer-detail-progress"><span><i style="width:${cover.pct}%"></i></span><b>${cover.pct}% reservado · ${qty(cover.selected)} de ${qty(cover.required)}</b></div><div class="transfer-detail-items">${(request.components||[]).map(detailItem).join('')}</div>${request.notes?`<aside><small>ORIENTAÇÕES</small><p>${esc(request.notes)}</p></aside>`:''}<div class="transfer-audit"><span><small>SOLICITADA</small><b>${datetime(request.requested_at)}</b><em>${esc(request.requested_by_name)}</em></span><span><small>DESPACHADA</small><b>${datetime(request.dispatched_at)}</b><em>${esc(request.dispatched_by_name||'Aguardando')}</em></span><span><small>RECEBIDA</small><b>${datetime(request.received_at)}</b><em>${esc(request.received_by_name||'Aguardando')}</em></span></div><div class="form-actions">${['requested','partially_reserved','reserved'].includes(request.status)?'<button class="danger" data-transfer-cancel>Cancelar</button>':''}${canPlan()&&['requested','partially_reserved','reserved'].includes(request.status)?'<button class="outline" data-transfer-reserve>Selecionar mais caixas</button>':''}${canDispatch()&&request.status==='reserved'?'<button class="primary" data-transfer-dispatch>Confirmar expedição</button>':''}${canAccess()&&request.status==='in_transit'?'<button class="primary success" data-transfer-receive>Confirmar recebimento</button>':''}</div></section></div>`;
  document.querySelector('[data-transfer-close]').onclick=()=>document.querySelector('#modal').innerHTML='';
  document.querySelector('[data-transfer-reserve]')?.addEventListener('click',()=>openReservation(id));
  document.querySelector('[data-transfer-cancel]')?.addEventListener('click',()=>cancelRequest(id));
  document.querySelector('[data-transfer-dispatch]')?.addEventListener('click',()=>dispatchRequest(id));
  document.querySelector('[data-transfer-receive]')?.addEventListener('click',()=>receiveRequest(id));
}
function detailItem(item){return `<article><img src="${esc(image(item.image_path))}" alt=""><span><b>${esc(item.model_name)}</b><em><i style="--transfer-color:${esc(item.color_hex)}"></i>${esc(item.color_name)}</em><small>Solicitado ${qty(item.required_quantity)} · reservado ${qty(item.selected_quantity)}</small></span><div>${(item.boxes||[]).map(box=>`<strong>${esc(box.box_code)}<small>${qty(box.quantity)} · ${date(box.entry_on)}</small></strong>`).join('')||'<em>Nenhuma caixa reservada</em>'}</div></article>`}

async function cancelRequest(id){const reason=prompt('Informe o motivo do cancelamento:');if(!reason)return;try{await rpc('cancel_shipping_inventory_request',{p_request_id:id,p_reason:reason});document.querySelector('#modal').innerHTML='';TC.loaded=false;await load(true);if(S.view==='transfer-center')await render();toast('Solicitação cancelada e caixas liberadas.')}catch(error){alert(error.message)}}
async function dispatchRequest(id){if(!confirm('Confirmar a saída física de todas as caixas reservadas? Elas serão baixadas integralmente do Inventário de Produção.'))return;try{await rpc('dispatch_transfer_center_request',{p_request_id:id,p_occurred_on:new Date().toISOString().slice(0,10),p_notes:'Expedição confirmada na Central de Transferências'});document.querySelector('#modal').innerHTML='';TC.loaded=false;await load(true);if(S.view==='transfer-center')await render();toast('Expedição registrada. Transferência em andamento.')}catch(error){alert(error.message)}}
async function receiveRequest(id){const notes=prompt('Observação do recebimento (opcional):')||null;try{await rpc('receive_transfer_center_request',{p_request_id:id,p_notes:notes});document.querySelector('#modal').innerHTML='';TC.loaded=false;await load(true);if(S.view==='transfer-center')await render();toast('Recebimento confirmado e histórico atualizado.')}catch(error){alert(error.message)}}

function exportCsv(){const header=['Protocolo','Título','Origem','Finalidade','Status','Prioridade','Prazo','Solicitado por','Data da solicitação','Caixas','Unidades reservadas'];const rows=TC.requests.map(row=>[code(row.protocol),row.title,row.source_type,PURPOSE[row.purpose]||row.purpose,statusInfo(row.status)[0],PRIORITY[row.priority]||row.priority,row.needed_on||'',row.requested_by_name,row.requested_at,num(row.box_count),num(row.selected_quantity)]);const csv=[header,...rows].map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(';')).join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));link.download=`central-transferencias-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}

function open(){if(!canAccess())return;TC.loaded=false;S.view='transfer-center';renderApp()}
const previousRenderPage=renderPage;renderPage=async function(){if(S.view==='transfer-center'){if(!canAccess()){S.view='home';return renderApp()}return render()}return previousRenderPage()};
new MutationObserver(injectNav).observe(document.body,{childList:true,subtree:true});injectNav();
window.HarmonyTransferCenter=Object.freeze({state:TC,open,load,reset,render,createFromPlan,openReservation,openDetail});
})();
