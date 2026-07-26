(function(){
'use strict';
const MD={loading:null,loadedAt:0};
const openRequestStatuses=new Set(['pending','separating','scheduled']);
const activeOrderStatuses=new Set(['sent','viewed']);
const role=()=>S?.profile?.role;
const firstName=()=>String(S?.profile?.full_name||'').split(' ')[0];
const preferenceKey=()=>`harmony-my-day-expanded:${S?.profile?.id||'anonymous'}`;
const isExpanded=()=>{try{return localStorage.getItem(preferenceKey())==='true'}catch{return false}};
const setExpanded=value=>{try{localStorage.setItem(preferenceKey(),String(value))}catch{}};
const isOverdue=value=>Boolean(value&&new Date(value).getTime()<Date.now());
const orderDue=order=>Boolean(order.due_date&&order.due_date<new Date().toISOString().slice(0,10));
const plural=(count,singular,pluralForm)=>`${count} ${count===1?singular:pluralForm}`;

async function load(force=false){
  if(MD.loading)return MD.loading;
  if(!force&&MD.loadedAt&&Date.now()-MD.loadedAt<60000)return;
  MD.loading=Promise.allSettled([
    window.HarmonyNotifications?.load?.(force),
    window.HarmonyProductionOrders?.load?.(force),
    role()==='admin'?window.HarmonyBills?.load?.(force):Promise.resolve(),
    role()==='admin'?window.HarmonyInternalSupplies?.load?.():Promise.resolve()
  ]).finally(()=>{MD.loadedAt=Date.now();MD.loading=null});
  return MD.loading;
}

function adminTasks(){
  const requests=S.requests.filter(item=>openRequestStatuses.has(item.status));
  const overdue=requests.filter(item=>isOverdue(item.scheduled_for));
  const low=S.products.filter(item=>item.active&&Number(item.physical_stock)-Number(item.reserved_stock)<=Number(item.minimum_stock));
  const orders=(window.HarmonyProductionOrders?.state?.orders||[]).filter(item=>activeOrderStatuses.has(item.status));
  const lateOrders=orders.filter(orderDue);
  const internal=(window.HarmonyInternalSupplies?.state?.requests||[]).filter(item=>openRequestStatuses.has(item.status));
  const bills=(window.HarmonyBills?.state?.items||[]).filter(item=>item.status==='pending'&&window.HarmonyBills.dueState(item)!=='pending');
  const tasks=[];
  if(bills.length){
    const overdue=bills.filter(item=>window.HarmonyBills.dueState(item)==='overdue').length;
    tasks.push({tone:overdue?'urgent':'gold',icon:'💳',label:overdue?'BOLETO ATRASADO':'CONTAS A PAGAR',title:overdue?plural(overdue,'boleto atrasado','boletos atrasados'):plural(bills.length,'boleto próximo do vencimento','boletos próximos do vencimento'),text:overdue?'Regularize ou registre o pagamento.':'Há boleto vencendo hoje ou amanhã.',action:'bills',button:'Ver boletos'});
  }
  if(overdue.length)tasks.push({tone:'urgent',icon:'⏰',label:'ATRASADAS',title:plural(overdue.length,'solicitação atrasada','solicitações atrasadas'),text:'Precisam de uma decisão ou conclusão.',action:'requests',button:'Resolver agora'});
  if(requests.length)tasks.push({tone:'rose',icon:'📋',label:'SOLICITAÇÕES',title:plural(requests.length,'solicitação aberta','solicitações abertas'),text:'Separar, programar ou concluir materiais.',action:'requests',button:'Ver pendências'});
  if(lateOrders.length)tasks.push({tone:'urgent',icon:'⚠️',label:'PRODUÇÃO',title:plural(lateOrders.length,'ordem fora do prazo','ordens fora do prazo'),text:'Acompanhe as colaboradoras e reorganize os prazos.',action:'production-orders',button:'Ver ordens'});
  else if(orders.length)tasks.push({tone:'blue',icon:'🧼',label:'PRODUÇÃO',title:plural(orders.length,'ordem aguardando confirmação','ordens aguardando confirmação'),text:'Confira quem já visualizou e quem ainda precisa confirmar.',action:'production-orders',button:'Acompanhar'});
  if(low.length)tasks.push({tone:'gold',icon:'📦',label:'ESTOQUE',title:plural(low.length,'produto com estoque baixo','produtos com estoque baixo'),text:'Confira os materiais antes que faltem na produção.',action:'products',button:'Ver estoque'});
  if(internal.length)tasks.push({tone:'violet',icon:'🧺',label:'COMPRAS',title:plural(internal.length,'solicitação interna aberta','solicitações internas abertas'),text:'Existem itens aguardando compra ou andamento.',action:'internal-supplies',button:'Abrir compras'});
  return tasks;
}

function workerTasks(){
  const requests=S.requests.filter(item=>openRequestStatuses.has(item.status));
  const notifications=window.HarmonyNotifications?.unread?.()||0;
  const orders=(window.HarmonyProductionOrders?.state?.orders||[]).filter(item=>activeOrderStatuses.has(item.status));
  const tasks=[];
  if(notifications)tasks.push({tone:'urgent',icon:'🔔',label:'AVISOS',title:plural(notifications,'aviso não lido','avisos não lidos'),text:'Leia as orientações enviadas pela Harmony.',action:'notifications',button:'Ler avisos'});
  orders.slice(0,2).forEach(order=>tasks.push({tone:orderDue(order)?'urgent':'blue',icon:'🧼',label:orderDue(order)?'PRAZO DE PRODUÇÃO':'ORDEM DE PRODUÇÃO',title:`Ordem #${String(order.protocol).padStart(4,'0')}`,text:`${order.items.length} ${order.items.length===1?'item':'itens'} · entrega até ${new Date(order.due_date+'T12:00:00').toLocaleDateString('pt-BR')}`,action:`production-order:${order.id}`,button:order.status==='sent'?'Ver e confirmar':'Continuar'}));
  requests.slice(0,3).forEach(request=>tasks.push({tone:isOverdue(request.scheduled_for)?'urgent':'rose',icon:'📋',label:'SUA SOLICITAÇÃO',title:`Pedido #${String(request.protocol).padStart(4,'0')}`,text:request.status==='pending'?'Aguardando a equipe iniciar a separação.':request.status==='separating'?'Materiais em separação.':'Entrega ou coleta já programada.',action:`request:${request.id}`,button:'Acompanhar'}));
  return tasks;
}

function taskCard(item){
  return `<article class="my-day-task ${item.tone}">
    <i class="my-day-task-icon" aria-hidden="true">${item.icon}</i>
    <span><small>${item.label}</small><strong>${esc(item.title)}</strong><p>${esc(item.text)}</p></span>
    <button class="outline" type="button" data-my-day-action="${esc(item.action)}">${item.button}<b aria-hidden="true">›</b></button>
  </article>`;
}

function summaryItem(item){
  return `<span class="my-day-summary-item ${item.tone}"><i aria-hidden="true">${item.icon}</i><b>${esc(item.title)}</b></span>`;
}

function openAction(action){
  if(action.startsWith('request:')){
    const request=S.requests.find(item=>item.id===action.slice(8));
    if(request)return requestModalV2(request);
  }
  if(action.startsWith('production-order:'))return window.HarmonyProductionOrders?.open?.(action.slice(17));
  S.view=action;
  renderApp();
}

function render(){
  const page=document.querySelector('#page .page');
  if(!page||S.view!=='home')return;
  document.querySelector('.my-day-panel')?.remove();
  const tasks=role()==='admin'?adminTasks():workerTasks();
  const details=role()==='admin'?tasks.filter(item=>item.action!=='requests'):tasks;
  const urgent=tasks.filter(item=>item.tone==='urgent').length;
  const expanded=isExpanded();
  const section=document.createElement('section');
  section.className=`my-day-panel${expanded?' is-expanded':''}`;
  section.innerHTML=`<header class="my-day-compact">
    <div class="my-day-identity"><span class="my-day-kicker">✦ MEU DIA NA HARMONY</span><strong>${tasks.length?`${tasks.length} ${tasks.length===1?'ação':'ações'} hoje`:`Tudo em ordem, ${esc(firstName())}!`}</strong></div>
    ${tasks.length?`<div class="my-day-summary" aria-label="Resumo do seu dia">${tasks.slice(0,6).map(summaryItem).join('')}</div>`:'<span class="my-day-clear">✓ Nenhuma pendência agora</span>'}
    <button class="my-day-toggle" type="button" data-toggle-my-day aria-expanded="${expanded}">${expanded?'Recolher':'Ver meu dia'} <i aria-hidden="true">⌄</i></button>
  </header>
  <div class="my-day-details" ${expanded?'':'hidden'}>
    <div class="my-day-details-head"><div><h2>Prioridades além das solicitações</h2><p>A Central de Pendências abaixo continua reunindo os pedidos em aberto.</p></div><span class="my-day-score ${urgent?'attention':'clear'}">${urgent?'!':'✓'} ${tasks.length}</span></div>
    ${details.length?`<div class="my-day-list">${details.slice(0,6).map(taskCard).join('')}</div>`:'<div class="my-day-empty"><i>🌷</i><span><b>Seu dia está organizado</b><small>As solicitações continuam disponíveis na Central de Pendências.</small></span></div>'}
    <footer><span>Atualizado agora com os dados permitidos para o seu perfil.</span><button type="button" data-refresh-my-day>↻ Atualizar</button></footer>
  </div>`;
  const anchor=page.querySelector('#adminRequestHub,.home-notifications,.metrics');
  page.insertBefore(section,anchor||page.firstChild);
  section.querySelectorAll('[data-my-day-action]').forEach(button=>button.onclick=()=>openAction(button.dataset.myDayAction));
  section.querySelector('[data-toggle-my-day]').onclick=()=>{setExpanded(!expanded);render()};
  section.querySelector('[data-refresh-my-day]')?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{await load(true);render()}catch(error){alert(error.message);button.disabled=false}
  });
}

async function mount(force=false){
  if(!S?.profile||S.view!=='home')return;
  try{await load(force);if(S.view==='home')render()}catch{}
}

const previousRenderPage=renderPage;
renderPage=async function(){const result=await previousRenderPage();if(S.view==='home')await mount();return result};
window.HarmonyMyDay=Object.freeze({state:MD,load,mount});
})();
