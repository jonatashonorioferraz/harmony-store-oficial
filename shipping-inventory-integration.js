(()=>{
'use strict';

const state={requests:[],loading:null};
const canPlan=()=>Boolean(S?.profile?.is_ecommerce_manager||S?.profile?.is_primary_admin);
const canConfirm=()=>Boolean(S?.profile?.role==='admin'||S?.profile?.role==='receiver');
const canAccess=()=>canPlan()||canConfirm();
const number=value=>Number(value||0);
const image=path=>path?`${API}/storage/v1/object/public/product-images/${encodedStoragePath(path)}`:'assets/shipping-product-placeholder.svg';
const quantity=value=>number(value).toLocaleString('pt-BR')+' un.';
const requestCode=value=>'#'+String(value||0).padStart(4,'0');
const statusLabel={reserved:'Caixas reservadas',transferred:'Transferência confirmada',cancelled:'Reserva cancelada'};

async function loadRequests(force=false){
  if(!canAccess())return[];
  if(state.loading&&!force)return state.loading;
  state.loading=rpc('list_shipping_inventory_requests',{p_status:null}).then(rows=>{state.requests=(rows||[]).map(row=>row.request||row);return state.requests}).finally(()=>state.loading=null);
  return state.loading;
}

function currentPlan(){
  const root=document.querySelector('#shippingPlanPrint');if(!root)return null;
  const stateValue=window.HarmonyShippingPlanning?.state;
  const itemId=root.querySelector('[data-shipping-detail-item]')?.dataset.shippingDetailItem;
  return stateValue?.plans?.find(plan=>plan.items?.some(item=>item.id===itemId))||null;
}

function requestBadge(item,editable){
  const request=item.inventory_request;
  if(request&&request.status!=='cancelled'){
    const status=request.status||'reserved';
    return `<div class="shipping-inventory-request-badge ${status}"><span><small>INVENTÁRIO DE PRODUÇÃO</small><b>${statusLabel[status]||status} ${requestCode(request.protocol)}</b><em>${number(request.box_count)} caixa(s) · ${quantity(request.selected_quantity)}</em></span>${status==='reserved'&&editable&&canPlan()?`<button type="button" class="outline compact-action" data-cancel-shipping-inventory="${request.id}">Cancelar reserva</button>`:''}${status==='reserved'&&canConfirm()?`<button type="button" class="primary compact-action" data-confirm-shipping-inventory="${request.id}">Confirmar transferência</button>`:''}</div>`;
  }
  if(!editable)return'';
  if(item.item_kind==='exclusive')return '<div class="shipping-inventory-unavailable">Item exclusivo: não possui caixa vinculada ao Inventário de Produção.</div>';
  if(!(item.components||[]).length)return '<div class="shipping-inventory-unavailable">Escolha uma cor oficial simples para vincular este item ao Inventário.</div>';
  return `${request?.status==='cancelled'?`<div class="shipping-inventory-request-badge cancelled"><span><small>RESERVA ANTERIOR</small><b>Reserva cancelada ${requestCode(request.protocol)}</b><em>As caixas foram liberadas para o estoque.</em></span></div>`:''}<button type="button" class="shipping-inventory-request-button" data-request-shipping-inventory="${item.id}">📦 ${request?.status==='cancelled'?'Solicitar caixas novamente':'Solicitar caixas do Inventário de Produção'}</button>`;
}

function enhanceShippingDetail(){
  const plan=currentPlan();if(!plan||!plan.is_full||!canPlan())return;
  const editable=!['archived','cancelled'].includes(plan.status);
  for(const item of plan.items||[]){
    const slot=document.querySelector(`[data-shipping-inventory-slot="${item.id}"]`);if(!slot||slot.dataset.ready)return;
    slot.dataset.ready='true';slot.innerHTML=requestBadge(item,editable);
  }
  document.querySelectorAll('[data-request-shipping-inventory]').forEach(button=>button.onclick=()=>openReservation(button.dataset.requestShippingInventory));
  document.querySelectorAll('[data-cancel-shipping-inventory]').forEach(button=>button.onclick=()=>cancelRequest(button.dataset.cancelShippingInventory));
  document.querySelectorAll('[data-confirm-shipping-inventory]').forEach(button=>button.onclick=()=>confirmRequest(button.dataset.confirmShippingInventory));
}

async function openReservation(itemId){
  const plan=currentPlan(),item=plan?.items?.find(row=>row.id===itemId);if(!item)return;
  const modal=document.querySelector('#modal');modal.innerHTML='<div class="modal"><section class="modal-box large"><div class="loading-inline">Consultando caixas disponíveis…</div></section></div>';
  try{
    const rows=await rpc('list_shipping_inventory_options',{p_plan_item_id:itemId}),components=(rows||[]).map(row=>row.component||row);
    modal.innerHTML=`<div class="modal"><form class="modal-box large shipping-inventory-reservation" id="shippingInventoryReservationForm"><div class="modal-head"><div><p class="eyebrow">PLANO FULL ${requestCode(plan.protocol)}</p><h2>Solicitar caixas do Inventário</h2><span>${esc(item.product_name)} · selecione as caixas físicas exatas.</span></div><button type="button" data-reservation-close>×</button></div><aside class="shipping-inventory-rule"><b>Reserva segura por modelo e cor</b><span>A caixa fica indisponível para outros envios, mas o estoque só é baixado depois da confirmação física por ADM ou Recebimento.</span></aside><div class="shipping-inventory-components">${components.map(component=>componentSelection(component)).join('')}</div><label>Observação para a equipe de recebimento<textarea name="notes" maxlength="1200" placeholder="Opcional: prioridade, localização ou orientação"></textarea></label><div class="form-actions"><button type="button" class="outline" data-reservation-close>Cancelar</button><button class="primary">Reservar caixas selecionadas</button></div></form></div>`;
    const form=document.querySelector('#shippingInventoryReservationForm');document.querySelectorAll('[data-reservation-close]').forEach(button=>button.onclick=()=>document.querySelector('#modal').innerHTML='');
    const update=()=>form.querySelectorAll('[data-reservation-component]').forEach(section=>{const required=number(section.dataset.required),selected=[...section.querySelectorAll('input[type="checkbox"]:checked')].reduce((sum,input)=>sum+number(input.dataset.quantity),0),difference=selected-required,status=difference>=0?'covered':selected?'partial':'empty';section.dataset.coverage=status;section.querySelector('[data-selected-total]').textContent=quantity(selected);section.querySelector('[data-coverage-message]').textContent=difference>=0?`Cobertura completa · sobra física ${quantity(difference)}`:selected?`Ainda faltam ${quantity(Math.abs(difference))}`:`Selecione caixas para cobrir ${quantity(required)}`});
    form.querySelectorAll('input[type="checkbox"]').forEach(input=>input.onchange=update);update();
    form.onsubmit=async event=>{event.preventDefault();const button=event.submitter,selections=[...form.querySelectorAll('[data-reservation-component]')].map(section=>({component_id:section.dataset.componentId,box_ids:[...section.querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value)})).filter(selection=>selection.box_ids.length);if(!selections.length)return alert('Selecione pelo menos uma caixa.');button.disabled=true;try{await rpc('reserve_shipping_inventory_boxes',{p_plan_item_id:itemId,p_selections:selections,p_notes:new FormData(form).get('notes')||null});document.querySelector('#modal').innerHTML='';await reloadShipping('Caixas reservadas com rastreabilidade.')}catch(error){alert(error.message);button.disabled=false}};
  }catch(error){alert(error.message);document.querySelector('#modal').innerHTML=''}
}

function componentSelection(component){
  const boxes=component.boxes||[];
  return `<section data-reservation-component data-component-id="${component.id}" data-required="${number(component.required_quantity)}"><header><img src="${esc(image(component.image_path))}" alt=""><span><b>${esc(component.model_name)}</b><em><i style="--shipping-inventory-color:${esc(component.color_hex)}"></i>${esc(component.color_name)}</em></span><strong><small>NECESSÁRIO</small>${quantity(component.required_quantity)}</strong></header><div class="shipping-inventory-box-options">${boxes.map(box=>`<label><input type="checkbox" value="${box.id}" data-quantity="${number(box.quantity)}"><span><b>${esc(box.box_code)}</b><small>${quantity(box.quantity)} · ${esc(box.location||'Localização não informada')}</small><em>Entrada ${new Date(box.entry_on+'T12:00:00').toLocaleDateString('pt-BR')}</em></span></label>`).join('')||'<p class="empty">Nenhuma caixa disponível para este modelo e cor.</p>'}</div><footer><span>Selecionado: <b data-selected-total>0 un.</b></span><em data-coverage-message></em></footer></section>`;
}

async function reloadShipping(message){
  if(window.HarmonyShippingPlanning?.state)window.HarmonyShippingPlanning.state.loaded=false;
  window.HarmonyShippingPlanning?.open();if(message)toast(message);
}

async function cancelRequest(id){
  const reason=prompt('Informe o motivo para liberar as caixas reservadas:');if(!reason)return;
  try{await rpc('cancel_shipping_inventory_request',{p_request_id:id,p_reason:reason});await loadRequests(true);document.querySelector('#modal').innerHTML='';await reloadShipping('Reserva cancelada. As caixas voltaram a ficar disponíveis.')}catch(error){alert(error.message)}
}

function requestCard(request){
  return `<article class="shipping-inventory-request-card ${request.status}"><header><span><small>SOLICITAÇÃO DO PLANEJAMENTO ${requestCode(request.protocol)}</small><h3>${esc(request.plan_title)}</h3><p>${esc(request.item_name)} · Plano ${requestCode(request.plan_protocol)}</p></span><b>${statusLabel[request.status]||request.status}</b></header><div>${(request.components||[]).map(component=>`<section><img src="${esc(image(component.image_path))}" alt=""><span><b>${esc(component.model_name)}</b><em><i style="--shipping-inventory-color:${esc(component.color_hex)}"></i>${esc(component.color_name)}</em><small>Necessário ${quantity(component.required_quantity)} · reservado ${quantity(component.selected_quantity)}</small></span><div>${(component.boxes||[]).map(box=>`<strong>${esc(box.box_code)} · ${quantity(box.quantity)}</strong>`).join('')}</div></section>`).join('')}</div><footer><span>Solicitado por ${esc(request.requested_by_name)} · ${new Date(request.requested_at).toLocaleString('pt-BR')}</span><div>${request.status==='reserved'?`<button type="button" class="outline compact-action" data-inventory-request-cancel="${request.id}">Cancelar</button>${canConfirm()?`<button type="button" class="primary compact-action" data-inventory-request-confirm="${request.id}">Confirmar transferência física</button>`:''}`:''}</div></footer></article>`;
}

async function injectInventoryRequests(){
  const page=document.querySelector('.production-inventory-page');if(!page||page.querySelector('[data-shipping-inventory-requests-panel]')||!canAccess())return;
  const panel=document.createElement('section');panel.className='card shipping-inventory-requests-panel';panel.dataset.shippingInventoryRequestsPanel='true';panel.innerHTML='<div class="loading-inline">Verificando solicitações do Planejamento de Envios…</div>';
  const tabs=page.querySelector('.production-inventory-tabs');(tabs||page.children[1])?.insertAdjacentElement('beforebegin',panel);
  try{await loadRequests(true);renderInventoryPanel(panel)}catch(error){panel.innerHTML=`<p class="empty">Não foi possível consultar as solicitações: ${esc(error.message)}</p>`}
}

function renderInventoryPanel(panel){
  const pending=state.requests.filter(request=>request.status==='reserved');panel.innerHTML=`<div class="card-head"><div><p class="eyebrow">INTEGRAÇÃO COM PLANEJAMENTO DE ENVIOS</p><h2>Caixas solicitadas para o e-commerce</h2><span>Reservas exatas por modelo e cor, aguardando conferência física.</span></div><b class="shipping-inventory-pending-count">${pending.length} pendente(s)</b></div><div class="shipping-inventory-request-list">${pending.map(requestCard).join('')||'<p class="empty">Nenhuma caixa aguardando transferência.</p>'}</div>`;
  panel.querySelectorAll('[data-inventory-request-confirm]').forEach(button=>button.onclick=()=>confirmRequest(button.dataset.inventoryRequestConfirm,panel));panel.querySelectorAll('[data-inventory-request-cancel]').forEach(button=>button.onclick=()=>cancelRequestFromPanel(button.dataset.inventoryRequestCancel,panel));
}

async function confirmRequest(id,panel){
  if(!canConfirm())return alert('A confirmação física exige perfil ADM ou Recebimento.');
  if(!confirm('Confirmar que todas as caixas desta solicitação foram transferidas completas para o estoque do e-commerce?'))return;
  try{await rpc('confirm_shipping_inventory_request_transfer',{p_request_id:id,p_occurred_on:new Date().toISOString().slice(0,10),p_notes:'Transferência confirmada pelo painel integrado'});await loadRequests(true);if(panel)renderInventoryPanel(panel);else{document.querySelector('#modal').innerHTML='';await reloadShipping('Transferência confirmada e estoque atualizado.')}toast('Caixas transferidas e baixadas do Inventário de Produção.')}catch(error){alert(error.message)}
}

async function cancelRequestFromPanel(id,panel){const reason=prompt('Informe o motivo para cancelar e liberar as caixas:');if(!reason)return;try{await rpc('cancel_shipping_inventory_request',{p_request_id:id,p_reason:reason});await loadRequests(true);renderInventoryPanel(panel);toast('Reserva cancelada e caixas liberadas.')}catch(error){alert(error.message)}}

const observer=new MutationObserver(()=>{enhanceShippingDetail();injectInventoryRequests()});observer.observe(document.body,{childList:true,subtree:true});enhanceShippingDetail();injectInventoryRequests();
window.HarmonyShippingInventory=Object.freeze({loadRequests,openReservation});
})();
