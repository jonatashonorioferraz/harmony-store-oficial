(()=>{
'use strict';

const state={requests:[],loading:null};
const ACTIVE=['requested','partially_reserved','reserved','in_transit'];
const LABEL={requested:'Solicitada',partially_reserved:'Reserva parcial',reserved:'Pronta para retirada',in_transit:'Em transferência',received:'Recebida',transferred:'Concluída',cancelled:'Cancelada'};
const canPlan=()=>Boolean(S?.profile?.is_ecommerce_manager||S?.profile?.is_primary_admin);
const canConfirm=()=>Boolean(S?.profile?.role==='admin'||S?.profile?.role==='receiver');
const canAccess=()=>canPlan()||canConfirm();
const number=value=>Number(value||0);
const quantity=value=>number(value).toLocaleString('pt-BR')+' un.';
const requestCode=value=>'#'+String(value||0).padStart(4,'0');
const image=path=>path?`${API}/storage/v1/object/public/product-images/${encodedStoragePath(path)}`:'assets/shipping-product-placeholder.svg';

async function loadRequests(force=false){
  if(!canAccess())return[];
  if(state.loading&&!force)return state.loading;
  state.loading=rpc('list_shipping_inventory_requests',{p_status:null}).then(rows=>{
    state.requests=(rows||[]).map(row=>row.request||row);return state.requests;
  }).finally(()=>state.loading=null);
  return state.loading;
}

function currentPlan(){
  const root=document.querySelector('#shippingPlanPrint');if(!root)return null;
  const itemId=root.querySelector('[data-shipping-detail-item]')?.dataset.shippingDetailItem;
  return window.HarmonyShippingPlanning?.state?.plans?.find(plan=>plan.items?.some(item=>item.id===itemId))||null;
}

function matchingRequest(itemId){
  return state.requests.find(request=>request.plan_item_id===itemId&&ACTIVE.includes(request.status))
    ||state.requests.find(request=>request.plan_item_id===itemId);
}

function badge(item,editable){
  const projected=item.inventory_request,request=matchingRequest(item.id)||projected;
  if(request&&ACTIVE.includes(request.status)){
    return `<div class="shipping-inventory-request-badge ${request.status}"><span><small>CENTRAL DE TRANSFERÊNCIAS</small><b>${LABEL[request.status]} ${requestCode(request.protocol)}</b><em>${number(request.box_count)} caixa(s) · ${quantity(request.selected_quantity)}</em></span><button type="button" class="outline compact-action" data-open-transfer-request="${request.id}">Abrir na Central</button>${canPlan()&&['requested','partially_reserved','reserved'].includes(request.status)?`<button type="button" class="primary compact-action" data-reserve-transfer-request="${request.id}">Selecionar caixas</button>`:''}</div>`;
  }
  if(!editable)return'';
  if(item.item_kind==='exclusive')return '<div class="shipping-inventory-unavailable">Item exclusivo: não possui caixa vinculada ao Inventário de Produção.</div>';
  if(!(item.components||[]).length)return '<div class="shipping-inventory-unavailable">Vincule modelos e cores oficiais para consultar caixas compatíveis.</div>';
  return `${request?.status==='cancelled'?'<div class="shipping-inventory-request-badge cancelled"><span><small>SOLICITAÇÃO ANTERIOR</small><b>Cancelada</b><em>As caixas foram liberadas.</em></span></div>':''}<button type="button" class="shipping-inventory-request-button" data-request-shipping-inventory="${item.id}">📦 Solicitar caixas do Inventário</button>`;
}

async function enhanceShippingDetail(){
  const plan=currentPlan();if(!plan||!plan.is_full||!canPlan())return;
  await loadRequests().catch(()=>{});
  const editable=!['archived','cancelled'].includes(plan.status);
  for(const item of plan.items||[]){
    const slot=document.querySelector(`[data-shipping-inventory-slot="${item.id}"]`);if(!slot||slot.dataset.transferReady)return;
    slot.dataset.transferReady='true';slot.innerHTML=badge(item,editable);
  }
  document.querySelectorAll('[data-request-shipping-inventory]').forEach(button=>button.onclick=()=>openPlanRequest(button.dataset.requestShippingInventory));
  document.querySelectorAll('[data-open-transfer-request]').forEach(button=>button.onclick=()=>window.HarmonyTransferCenter?.openDetail(button.dataset.openTransferRequest));
  document.querySelectorAll('[data-reserve-transfer-request]').forEach(button=>button.onclick=()=>window.HarmonyTransferCenter?.openReservation(button.dataset.reserveTransferRequest));
}

async function openPlanRequest(itemId){
  const button=document.querySelector(`[data-request-shipping-inventory="${itemId}"]`);if(button)button.disabled=true;
  try{
    const id=await window.HarmonyTransferCenter.createFromPlan(itemId);
    await loadRequests(true);
    await window.HarmonyTransferCenter.openReservation(id);
  }catch(error){alert(error.message);if(button)button.disabled=false}
}

function requestCard(request){
  const items=request.components||[];
  return `<article class="shipping-inventory-request-card ${request.status}" data-open-transfer-panel="${request.id}"><header><span><small>${request.source_type==='shipping_plan'?'PLANEJAMENTO FULL':'SOLICITAÇÃO DIRETA'} ${requestCode(request.protocol)}</small><h3>${esc(request.title)}</h3><p>${esc(request.requested_by_name)} · ${new Date(request.requested_at).toLocaleString('pt-BR')}</p></span><b>${LABEL[request.status]||request.status}</b></header><div>${items.map(item=>`<section><img src="${esc(image(item.image_path))}" alt=""><span><b>${esc(item.model_name)}</b><em><i style="--shipping-inventory-color:${esc(item.color_hex)}"></i>${esc(item.color_name)}</em><small>Necessário ${quantity(item.required_quantity)} · reservado ${quantity(item.selected_quantity)}</small></span><div>${(item.boxes||[]).map(box=>`<strong>${esc(box.box_code)} · ${quantity(box.quantity)}</strong>`).join('')}</div></section>`).join('')}</div><footer><span>${number(request.box_count)} caixa(s) vinculada(s)</span><button type="button" class="outline compact-action" data-open-transfer-panel="${request.id}">Abrir solicitação</button></footer></article>`;
}

async function injectInventoryRequests(){
  const page=document.querySelector('.production-inventory-page');
  if(!page||page.querySelector('[data-shipping-inventory-requests-panel]')||!canAccess())return;
  const panel=document.createElement('section');panel.className='card shipping-inventory-requests-panel';panel.dataset.shippingInventoryRequestsPanel='true';panel.innerHTML='<div class="loading-inline">Consultando a Central de Transferências…</div>';
  const tabs=page.querySelector('.production-inventory-tabs');(tabs||page.children[1])?.insertAdjacentElement('beforebegin',panel);
  try{await loadRequests(true);renderPanel(panel)}catch(error){panel.innerHTML=`<p class="empty">Não foi possível consultar as solicitações: ${esc(error.message)}</p>`}
}

function renderPanel(panel){
  const pending=state.requests.filter(request=>ACTIVE.includes(request.status));
  panel.innerHTML=`<div class="card-head"><div><p class="eyebrow">CENTRAL DE TRANSFERÊNCIAS</p><h2>Caixas solicitadas para o e-commerce</h2><span>Solicitações, reservas e transferências em acompanhamento.</span></div><div><b class="shipping-inventory-pending-count">${pending.length} ativa(s)</b><button class="outline compact-action" data-open-transfer-center>Abrir Central</button></div></div><div class="shipping-inventory-request-list">${pending.slice(0,5).map(requestCard).join('')||'<p class="empty">Nenhuma transferência em andamento.</p>'}</div>`;
  panel.querySelector('[data-open-transfer-center]')?.addEventListener('click',()=>window.HarmonyTransferCenter.open());
  panel.querySelectorAll('[data-open-transfer-panel]').forEach(button=>button.onclick=()=>window.HarmonyTransferCenter.openDetail(button.dataset.openTransferPanel));
}

const observer=new MutationObserver(()=>{enhanceShippingDetail();injectInventoryRequests()});
observer.observe(document.body,{childList:true,subtree:true});
enhanceShippingDetail();injectInventoryRequests();
window.HarmonyShippingInventory=Object.freeze({loadRequests,openPlanRequest});
})();
