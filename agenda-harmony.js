(function(){
'use strict';

const AH={tasks:[],system:[],orderStates:[],loadedAt:0,loading:null,month:new Date(),selected:'',homeSelected:'',filter:'open',brief:null,usage:null,boxCount:0};
const openRequestStatuses=new Set(['pending','separating','scheduled']);
const openOrderStatuses=new Set(['sent','viewed','acknowledged']);
const priorityWeight={urgent:0,high:1,normal:2,low:3};
const isAdmin=()=>S?.profile?.role==='admin';
const pad=(value,size=4)=>String(value).padStart(size,'0');
const localKey=value=>{const date=value instanceof Date?value:new Date(value);if(Number.isNaN(date.getTime()))return'';const parts=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const get=type=>parts.find(part=>part.type===type)?.value||'';return`${get('year')}-${get('month')}-${get('day')}`};
const today=()=>localKey(new Date());
const dateAtNoon=value=>value?new Date(`${value}T12:00:00-03:00`):null;
const brDate=value=>value?new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Sem data';
const brWhen=value=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'Sem horário';
const monthTitle=value=>value.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,letter=>letter.toUpperCase());
const isOpen=item=>!['completed','cancelled'].includes(item.status);
const dueKey=item=>localKey(item.due_at||item.starts_at||item.date);
const calendarKey=item=>item.source_type==='manual'?localKey(item.starts_at||item.due_at||item.date):dueKey(item);
const daysBetween=(from,to)=>Math.round((dateAtNoon(to)-dateAtNoon(from))/86400000);
const plural=(count,one,many)=>`${count} ${count===1?one:many}`;
const taskKindLabel={task:'Tarefa',appointment:'Compromisso',follow_up:'Acompanhamento'};
const priorityLabel={low:'Baixa',normal:'Normal',high:'Alta',urgent:'Urgente'};

async function load(force=false){
  if(!isAdmin())return;
  if(AH.loading)return AH.loading;
  if(!force&&AH.loadedAt&&Date.now()-AH.loadedAt<45000)return;
  AH.loading=(async()=>{
    const results=await Promise.allSettled([
      restAll('admin_agenda_tasks?select=*&order=starts_at.asc,created_at.desc,id.desc'),
      restAll('admin_agenda_production_order_states?select=*&order=updated_at.desc'),
      window.HarmonyBills?.load?.(force),
      window.HarmonyInternalSupplies?.load?.(force),
      window.HarmonyProductionOrders?.load?.(force),
      rpc('get_production_inventory_available_box_count',{}),
      rest('admin_agenda_ai_runs?action=eq.daily_briefing&status=eq.completed&select=*&order=completed_at.desc&limit=1'),
      rpc('admin_get_agenda_ai_usage',{})
    ]);
    if(results[0].status==='rejected')throw results[0].reason;
    if(results[1].status==='rejected')throw results[1].reason;
    AH.tasks=results[0].value||[];
    AH.orderStates=results[1].value||[];
    AH.boxCount=results[5].status==='fulfilled'?Number(results[5].value||0):0;
    AH.brief=results[6].status==='fulfilled'?(results[6].value||[])[0]||null:null;
    AH.usage=results[7].status==='fulfilled'?(Array.isArray(results[7].value)?results[7].value[0]:results[7].value)||null:null;
    AH.system=systemItems();
    AH.loadedAt=Date.now();
  })().finally(()=>AH.loading=null);
  return AH.loading;
}

function systemItems(){
  const items=[];
  const orderStateById=new Map(AH.orderStates.map(state=>[state.production_order_id,state]));
  for(const request of S.requests.filter(item=>openRequestStatuses.has(item.status))){
    const requester=S.team.find(person=>person.id===request.requested_by);
    items.push({id:`request:${request.id}`,source_type:'request',source_id:request.id,protocol:request.protocol,title:`Solicitação #${pad(request.protocol)}`,description:`${requester?.full_name||'Solicitante'} · materiais aguardando andamento`,starts_at:request.scheduled_for||request.created_at,due_at:request.scheduled_for,priority:request.scheduled_for&&localKey(request.scheduled_for)<today()?'urgent':'high',status:'pending'});
  }
  for(const bill of (window.HarmonyBills?.state?.items||[]).filter(item=>item.status==='pending')){
    const distance=daysBetween(today(),bill.due_date);
    if(distance>14)continue;
    items.push({id:`bill:${bill.id}`,source_type:'bill',source_id:bill.id,protocol:bill.protocol,title:`Boleto #${pad(bill.protocol)} · ${bill.beneficiary_name}`,description:`Vencimento ${brDate(dateAtNoon(bill.due_date))}`,starts_at:dateAtNoon(bill.due_date)?.toISOString(),due_at:dateAtNoon(bill.due_date)?.toISOString(),priority:distance<0?'urgent':distance<=1?'high':'normal',status:'pending'});
  }
  for(const order of (window.HarmonyProductionOrders?.state?.orders||[]).filter(item=>openOrderStatuses.has(item.status))){
    const worker=S.team.find(person=>person.id===order.worker_id);
    const agendaState=orderStateById.get(order.id);
    items.push({id:`production_order:${order.id}`,source_type:'production_order',source_id:order.id,protocol:order.protocol,title:`Ordem de produção #${pad(order.protocol)}`,description:`${worker?.full_name||'Colaboradora'} · acompanhamento semanal · prazo formal ${brDate(dateAtNoon(order.due_date))}`,starts_at:dateAtNoon(order.due_date)?.toISOString(),due_at:dateAtNoon(order.due_date)?.toISOString(),priority:'normal',status:agendaState?.agenda_status==='completed'?'completed':'pending',agenda_completed_at:agendaState?.completed_at||null});
  }
  for(const request of (window.HarmonyInternalSupplies?.state?.requests||[]).filter(item=>openRequestStatuses.has(item.status))){
    items.push({id:`internal_supply:${request.id}`,source_type:'internal_supply',source_id:request.id,protocol:request.protocol,title:`Compra interna #${pad(request.protocol)}`,description:`${request.requested_by_name||'Solicitante'} · suprimentos do e-commerce`,starts_at:dateAtNoon(request.needed_by)?.toISOString()||request.created_at,due_at:dateAtNoon(request.needed_by)?.toISOString(),priority:request.priority==='urgent'?'urgent':request.needed_by&&request.needed_by<today()?'urgent':'normal',status:'pending'});
  }
  return items;
}

function allItems(){return [...AH.tasks,...AH.system].sort((a,b)=>{
  const aDate=new Date(a.due_at||a.starts_at||0).getTime(),bDate=new Date(b.due_at||b.starts_at||0).getTime();
  return Number(isOpen(b))-Number(isOpen(a))||aDate-bDate||(priorityWeight[a.priority]??2)-(priorityWeight[b.priority]??2);
})}

function addNavigation(){
  if(!isAdmin())return;
  const root=document.querySelector('.sidebar nav'),profile=root?.querySelector('[data-view="profile"]');
  if(!root||root.querySelector('[data-view="agenda-harmony"]'))return;
  const label=document.createElement('small');label.textContent='ORGANIZAÇÃO';
  const button=document.createElement('button');button.className='nav';button.dataset.view='agenda-harmony';button.innerHTML='<i>◫</i><span>Agenda Harmony</span>';
  root.insertBefore(label,profile);root.insertBefore(button,profile);
  button.onclick=()=>{S.view='agenda-harmony';renderApp()};
}

function openSource(item){
  if(item.source_type==='request'){
    const request=S.requests.find(row=>row.id===item.source_id);if(request)return requestModalV2(request);
  }
  if(item.source_type==='bill')return window.HarmonyBills?.open?.(item.source_id);
  if(item.source_type==='internal_supply')return window.HarmonyInternalSupplies?.openRequest?.(item.source_id);
  if(item.source_type==='production_order')return window.HarmonyProductionOrders?.open?.(item.source_id);
  if(item.source_type==='inventory')return window.HarmonyProductionInventory?.open?.('balance');
  return openTask(item.id);
}

function taskTone(item){if(item.source_type==='production_order')return isOpen(item)?'production':'completed';const key=dueKey(item);if(isOpen(item)&&key&&key<today())return'overdue';return item.priority||'normal'}
function sourceLabel(type){return({manual:'Agenda',request:'Solicitação',bill:'Boleto',internal_supply:'Compra interna',production_order:'Ordem de produção',inventory:'Inventário'})[type]||'Agenda'}
function priorityText(item){if(item.source_type==='production_order')return isOpen(item)?'Acompanhamento':'Concluída na Agenda';return priorityLabel[item.priority]||'Normal'}
function itemActions(item){
  const manual=item.source_type==='manual';
  const agendaAction=item.source_type==='production_order'?`<button type="button" class="${isOpen(item)?'agenda-complete':'agenda-reopen'}" data-agenda-order-state="${isOpen(item)?'completed':'open'}" data-agenda-order-id="${esc(item.source_id)}">${isOpen(item)?'✓ Concluir na Agenda':'↻ Reabrir na Agenda'}</button>`:'';
  return `<span class="agenda-item-actions">${agendaAction}<button type="button" class="outline" data-agenda-open="${esc(item.id)}">${manual?'Abrir':'Ir ao módulo'}</button></span>`;
}
function itemCard(item,compact=false){
  return `<article class="agenda-item ${taskTone(item)} ${isOpen(item)?'':'is-closed'}" data-agenda-item="${esc(item.id)}">
    <span class="agenda-item-date"><b>${brDate(item.due_at||item.starts_at).slice(0,5)}</b><small>${item.all_day?'Dia todo':item.due_at||item.starts_at?new Date(item.due_at||item.starts_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}):'—'}</small></span>
    <span class="agenda-item-copy"><small>${sourceLabel(item.source_type)}${item.protocol?` · #${pad(item.protocol)}`:''}</small><strong>${esc(item.title)}</strong>${compact?'':`<p>${esc(item.description||'Sem observações.')}</p>`}</span>
    <span class="agenda-priority ${item.priority}">${priorityText(item)}</span>
    ${itemActions(item)}
  </article>`;
}

function homeAgendaItems(){
  return allItems().filter(item=>isOpen(item)&&['manual','bill'].includes(item.source_type));
}

function homeItemTone(item){
  if(item.source_type==='bill')return'bill';
  if(item.task_kind==='appointment')return'appointment';
  if(item.task_kind==='follow_up')return'follow-up';
  return'task';
}

function homeItemText(item){
  if(item.source_type==='bill')return item.title.replace(/^Boleto\s+#\d+\s+·\s*/i,'Boleto · ');
  const time=item.all_day?'':new Date(item.starts_at||item.due_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
  return`${time?`${time} · `:''}${item.title}`;
}

function homeCalendarWeek(items){
  const start=dateAtNoon(today()),dates=[];
  for(let index=0;index<7;index++){const date=new Date(start);date.setDate(start.getDate()+index);dates.push({date,key:localKey(date)})}
  if(!dates.some(item=>item.key===AH.homeSelected))AH.homeSelected=dates[0].key;
  const cards=dates.map(({date,key},index)=>{
    const dayItems=items.filter(item=>calendarKey(item)===key).sort((a,b)=>(priorityWeight[a.priority]??2)-(priorityWeight[b.priority]??2)||new Date(a.starts_at||a.due_at)-new Date(b.starts_at||b.due_at));
    const rows=dayItems.slice(0,3).map(item=>`<span class="agenda-week-entry ${homeItemTone(item)}"><i aria-hidden="true"></i>${esc(homeItemText(item))}</span>`).join('');
    return `<button type="button" class="agenda-week-card ${index===0?'today':''} ${AH.homeSelected===key?'selected':''}" data-agenda-home-preview-day="${key}" aria-label="Abrir resumo de ${brDate(date)}">
      <span class="agenda-week-date"><small>${date.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}</small><b>${date.getDate()}</b>${index===0?'<em>HOJE</em>':''}</span>
      <span class="agenda-week-entries">${rows||'<span class="agenda-week-empty">Sem compromissos</span>'}${dayItems.length>3?`<strong>+ ${dayItems.length-3} ${dayItems.length-3===1?'item':'itens'}</strong>`:''}</span>
    </button>`;
  }).join('');
  const selected=dates.find(item=>item.key===AH.homeSelected)||dates[0],selectedItems=items.filter(item=>calendarKey(item)===selected.key);
  const mobileRows=selectedItems.slice(0,4).map(item=>`<span class="agenda-week-entry ${homeItemTone(item)}"><i aria-hidden="true"></i>${esc(homeItemText(item))}</span>`).join('')||'<span class="agenda-week-empty">Sem compromissos neste dia.</span>';
  return `<div class="agenda-week"><div class="agenda-week-grid">${cards}</div><div class="agenda-week-progress" aria-hidden="true">${dates.map(item=>`<i class="${item.key===AH.homeSelected?'active':''}"></i>`).join('')}</div><section class="agenda-mobile-day-detail"><div>${mobileRows}</div><button type="button" class="outline" data-agenda-home-day="${selected.key}">Abrir agenda deste dia</button></section></div>`;
}

function homeAiInsights(items){
  const brief=AH.brief?.result||{},insights=[],seen=new Set();
  const add=(text,tone='ai')=>{const clean=String(text||'').replace(/\s+/g,' ').trim();if(!clean||seen.has(clean.toLocaleLowerCase('pt-BR'))||insights.length>=3)return;seen.add(clean.toLocaleLowerCase('pt-BR'));insights.push({text:clean,tone})};
  const bills=items.filter(item=>item.source_type==='bill'),manual=items.filter(item=>item.source_type==='manual'),current=today();
  const billsToday=bills.filter(item=>calendarKey(item)===current).length,billsSoon=bills.filter(item=>{const distance=daysBetween(current,calendarKey(item));return distance>=0&&distance<=7}).length;
  const overdueTasks=manual.filter(item=>calendarKey(item)<current).length,plannedTasks=manual.filter(item=>{const distance=daysBetween(current,calendarKey(item));return distance>=0&&distance<=7}).length;
  if(billsToday)add(plural(billsToday,'boleto vence hoje','boletos vencem hoje'),'bill');
  else if(billsSoon)add(plural(billsSoon,'boleto nos próximos 7 dias','boletos nos próximos 7 dias'),'bill');
  if(overdueTasks)add(plural(overdueTasks,'tarefa planejada está atrasada','tarefas planejadas estão atrasadas'),'attention');
  else if(plannedTasks)add(plural(plannedTasks,'tarefa planejada','tarefas planejadas'),'task');
  const aiCandidates=[...(Array.isArray(brief.priorities)?brief.priorities:[]),...(Array.isArray(brief.risks)?brief.risks:[])].filter(value=>!/(solicita(?:ç|c)[aã]o|ordem de produ(?:ç|c)[aã]o|pedido\s+#)/i.test(String(value||'')));
  if(aiCandidates[0])add(aiCandidates[0],'ai');
  if(insights.length<3)add(`${AH.boxCount.toLocaleString('pt-BR')} ${AH.boxCount===1?'caixa disponível':'caixas disponíveis'} no inventário`,'inventory');
  if(!insights.length)add('Nenhum alerta importante para os próximos dias.','ok');
  return `<section class="agenda-home-intelligence"><header><span><i>✦</i><b>INTELIGÊNCIA DO DIA</b></span><small>Insights atualizados com os dados do aplicativo</small></header><div>${insights.map(item=>`<span class="${item.tone}"><i aria-hidden="true"></i><b>${esc(item.text)}</b></span>`).join('')}</div></section>`;
}

function homePanel(){
  const items=homeAgendaItems(),aiEnabled=AH.usage?.enabled!==false;
  return `<section class="agenda-home card">
    <header class="agenda-home-head"><div><p class="eyebrow">AGENDA HARMONY · VISÃO ADMINISTRATIVA</p><span class="agenda-home-title"><h2>Agenda inteligente</h2><b class="agenda-ai-status ${aiEnabled?'active':'paused'}">✦ ${aiEnabled?'IA ATIVA':'IA PAUSADA'}</b></span><span>A IA organiza tarefas, boletos e compromissos por prioridade.</span></div><div class="agenda-home-actions"><button class="outline compact-action" data-agenda-new>＋ Nova tarefa</button><button class="primary compact-action" data-agenda-page>Ver agenda completa</button></div></header>
    ${homeCalendarWeek(items)}
    ${homeAiInsights(items)}
  </section>`;
}

function mountHome(){
  if(!isAdmin()||S.view!=='home')return;
  const page=document.querySelector('#page .page');if(!page)return;
  page.querySelector('.agenda-home')?.remove();
  const oldDayPanel=page.querySelector('.my-day-panel');
  if(oldDayPanel){oldDayPanel.hidden=true;oldDayPanel.dataset.agendaReplaced='true'}
  for(const selector of ['#adminRequestHub','.home-requests']){
    const element=page.querySelector(selector);if(element){element.hidden=false;delete element.dataset.agendaReplaced}
  }
  const section=document.createElement('div');section.innerHTML=homePanel();const panel=section.firstElementChild;
  const metrics=page.querySelector('.metrics');page.insertBefore(panel,metrics||page.firstChild);
  bindCommon(panel);
  panel.querySelector('[data-agenda-page]').onclick=()=>{S.view='agenda-harmony';renderApp()};
}

function calendar(){
  const month=new Date(AH.month.getFullYear(),AH.month.getMonth(),1),first=(month.getDay()+6)%7,start=new Date(month);start.setDate(1-first);
  const items=allItems(),cells=[];
  for(let index=0;index<42;index++){
    const day=new Date(start);day.setDate(start.getDate()+index);const key=localKey(day),dayItems=items.filter(item=>calendarKey(item)===key),outside=day.getMonth()!==month.getMonth();
    cells.push(`<button type="button" class="agenda-day ${outside?'outside':''} ${key===today()?'today':''} ${AH.selected===key?'selected':''}" data-agenda-day="${key}"><b>${day.getDate()}</b><span>${dayItems.slice(0,3).map(item=>`<i class="${taskTone(item)}" title="${esc(item.title)}">${esc(item.title)}</i>`).join('')}</span>${dayItems.length>3?`<small>+${dayItems.length-3} itens</small>`:''}</button>`);
  }
  return `<section class="card agenda-calendar"><header><button type="button" class="outline" data-month-prev aria-label="Mês anterior">‹</button><div><small>CALENDÁRIO OPERACIONAL</small><h2>${monthTitle(month)}</h2></div><button type="button" class="outline" data-month-next aria-label="Próximo mês">›</button></header><div class="agenda-weekdays">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(day=>`<span>${day}</span>`).join('')}</div><div class="agenda-days">${cells.join('')}</div></section>`;
}

function agendaList(){
  const selected=AH.selected,items=allItems().filter(item=>{
    if(selected&&calendarKey(item)!==selected)return false;
    if(AH.filter==='open')return isOpen(item);
    if(AH.filter==='manual')return item.source_type==='manual';
    if(AH.filter==='system')return item.source_type!=='manual';
    if(AH.filter==='agenda_completed')return item.source_type==='production_order'&&item.status==='completed';
    return true;
  });
  return `<section class="card agenda-list"><header><div><small>${selected?'DATA SELECIONADA':'PRÓXIMOS COMPROMISSOS'}</small><h2>${selected?brDate(dateAtNoon(selected)):'Agenda consolidada'}</h2></div><select data-agenda-filter><option value="open">Em aberto</option><option value="all">Todos</option><option value="manual">Tarefas próprias</option><option value="system">Itens dos módulos</option><option value="agenda_completed">Ordens concluídas na Agenda</option></select></header><div class="agenda-list-scroll">${items.map(item=>itemCard(item)).join('')||'<div class="agenda-empty"><b>Nenhum item nesta visão</b><span>Escolha outra data ou filtro.</span></div>'}</div></section>`;
}

function aiPanel(){
  const result=AH.brief?.result||{},usage=AH.usage||{};
  return `<section class="agenda-ai card"><div><p class="eyebrow">ASSISTENTE DE ROTINA COM IA</p><h2>${result.headline?esc(result.headline):'Análise administrativa sob demanda'}</h2><p>${result.summary?esc(result.summary):'A IA pode priorizar o dia e explicar riscos. Ela não altera boletos, estoque, ordens ou solicitações.'}</p>${Array.isArray(result.priorities)&&result.priorities.length?`<ul>${result.priorities.slice(0,3).map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:''}</div><aside><span><small>ORÇAMENTO MENSAL</small><b>US$ ${Number(usage.monthly_budget_usd||2).toFixed(2).replace('.',',')}</b></span><span><small>UTILIZADO</small><b>US$ ${Number(usage.month_cost_usd||0).toFixed(4).replace('.',',')}</b></span><button class="primary" data-agenda-ai ${usage.enabled===false?'disabled':''}>✦ Analisar meu dia com IA</button>${S.profile?.is_primary_admin?'<button class="outline" data-agenda-ai-settings>Configurar limite da IA</button>':''}<small>A análise só gera custo quando solicitada.</small></aside></section>`;
}

function renderAgenda(page){
  page.innerHTML=`<div class="page agenda-page">${head('ORGANIZAÇÃO','Agenda Harmony','Tarefas, datas e pendências administrativas ligadas aos módulos oficiais.','<button class="primary compact-action" data-agenda-new>＋ Nova tarefa</button>')}<div class="agenda-toolbar"><button class="outline" data-agenda-today>Hoje</button><button class="outline" data-agenda-clear-date ${AH.selected?'':'disabled'}>Limpar data</button><span>Atualizado ${AH.loadedAt?'agora':'—'}</span><button class="outline" data-agenda-refresh>↻ Atualizar dados</button></div>${aiPanel()}<div class="agenda-layout">${calendar()}${agendaList()}</div></div>`;
  bindCommon(page);bindAgenda(page);
}

async function renderPageView(){
  if(!isAdmin()){S.view='home';return renderApp()}
  const page=document.querySelector('#page');page.innerHTML=`<div class="page">${head('ORGANIZAÇÃO','Agenda Harmony','Carregando sua rotina administrativa…')}</div>`;
  try{await load();renderAgenda(page)}catch(error){page.innerHTML=`<div class="page">${head('ORGANIZAÇÃO','Agenda Harmony','Não foi possível carregar a agenda.')}<div class="error">${esc(error.message)}</div></div>`}
}

function bindCommon(root=document){
  root.querySelectorAll('[data-agenda-open]').forEach(button=>button.onclick=()=>{const item=allItems().find(row=>String(row.id)===button.dataset.agendaOpen);if(item)openSource(item)});
  root.querySelectorAll('[data-agenda-order-state]').forEach(button=>button.onclick=async event=>{
    event.preventDefault();event.stopPropagation();
    const status=button.dataset.agendaOrderState,orderId=button.dataset.agendaOrderId;
    const completing=status==='completed';
    const message=completing?'Concluir este acompanhamento somente na Agenda? A ordem de produção e seu histórico continuarão intactos.':'Reabrir este acompanhamento na Agenda?';
    if(!confirm(message))return;
    button.disabled=true;
    try{
      await rpc('admin_set_agenda_production_order_state',{p_order_id:orderId,p_status:status});
      AH.loadedAt=0;await load(true);
      if(S.view==='home')mountHome();else renderAgenda(document.querySelector('#page'));
      toast(completing?'Ordem concluída somente na Agenda. O módulo de produção não foi alterado.':'Ordem reaberta na Agenda.');
    }catch(error){alert(error.message);button.disabled=false}
  });
  root.querySelectorAll('[data-agenda-new]').forEach(button=>button.onclick=()=>taskModal());
  root.querySelectorAll('[data-agenda-home-preview-day]').forEach(button=>button.onclick=()=>{
    const key=button.dataset.agendaHomePreviewDay;
    if(window.matchMedia?.('(max-width:720px)').matches){AH.homeSelected=key;mountHome();return}
    AH.selected=key;AH.month=dateAtNoon(key)||new Date();S.view='agenda-harmony';renderApp();
  });
  root.querySelectorAll('[data-agenda-home-day]').forEach(button=>button.onclick=()=>{AH.selected=button.dataset.agendaHomeDay;AH.month=dateAtNoon(AH.selected)||new Date();S.view='agenda-harmony';renderApp()});
  root.querySelectorAll('[data-agenda-refresh]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{AH.loadedAt=0;await load(true);if(S.view==='home')mountHome();else renderAgenda(document.querySelector('#page'))}catch(error){alert(error.message);button.disabled=false}});
}

function bindAgenda(root){
  root.querySelector('[data-month-prev]').onclick=()=>{AH.month=new Date(AH.month.getFullYear(),AH.month.getMonth()-1,1);renderAgenda(document.querySelector('#page'))};
  root.querySelector('[data-month-next]').onclick=()=>{AH.month=new Date(AH.month.getFullYear(),AH.month.getMonth()+1,1);renderAgenda(document.querySelector('#page'))};
  root.querySelectorAll('[data-agenda-day]').forEach(button=>button.onclick=()=>{AH.selected=AH.selected===button.dataset.agendaDay?'':button.dataset.agendaDay;renderAgenda(document.querySelector('#page'))});
  const filter=root.querySelector('[data-agenda-filter]');filter.value=AH.filter;filter.onchange=()=>{AH.filter=filter.value;renderAgenda(document.querySelector('#page'))};
  root.querySelector('[data-agenda-today]').onclick=()=>{AH.month=new Date();AH.selected=today();renderAgenda(document.querySelector('#page'))};
  root.querySelector('[data-agenda-clear-date]').onclick=()=>{AH.selected='';renderAgenda(document.querySelector('#page'))};
  root.querySelector('[data-agenda-ai]')?.addEventListener('click',event=>generateBrief(event.currentTarget));
  root.querySelector('[data-agenda-ai-settings]')?.addEventListener('click',aiSettingsModal);
}

function aiSettingsModal(){
  if(!S.profile?.is_primary_admin)return;
  const usage=AH.usage||{};
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box agenda-ai-settings" id="agendaAiSettingsForm"><div class="modal-head"><div><p class="eyebrow">CONTROLE FINANCEIRO DA IA</p><h2>Limites da Agenda Harmony</h2></div><button type="button" data-close>×</button></div><div class="form"><label class="check wide"><input type="checkbox" name="enabled" ${usage.enabled===false?'':'checked'}> Permitir análises com IA</label><label>Orçamento mensal (US$)<input type="number" name="budget" min="0" max="1000" step="0.01" value="${Number(usage.monthly_budget_usd||2).toFixed(2)}" required></label><label>Intervalo entre análises (minutos)<input type="number" name="cooldown" min="1" max="1440" step="1" value="${Number(usage.manual_cooldown_minutes||10)}" required></label><div class="wide info"><b>Proteção ativa</b><p>O limite é controlado no servidor. A Agenda continua funcionando normalmente mesmo sem crédito de IA.</p></div></div><div class="form-actions"><button type="button" class="outline" data-close>Cancelar</button><button class="primary">Salvar limites</button></div></form></div>`;
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>document.querySelector('#modal').innerHTML='');
  document.querySelector('#agendaAiSettingsForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter,data=new FormData(event.currentTarget);button.disabled=true;try{await rpc('primary_admin_update_agenda_ai_settings',{p_enabled:data.get('enabled')==='on',p_monthly_budget_usd:Number(data.get('budget')),p_manual_cooldown_minutes:Number(data.get('cooldown'))});document.querySelector('#modal').innerHTML='';AH.loadedAt=0;await load(true);renderAgenda(document.querySelector('#page'));toast('Limites da IA atualizados com auditoria.')}catch(error){alert(error.message);button.disabled=false}};
}

function toLocalInput(value){if(!value)return'';const date=new Date(value),parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date),get=type=>parts.find(part=>part.type===type)?.value;return`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`}
function defaultStart(){const date=new Date();date.setMinutes(0,0,0);date.setHours(Math.max(8,date.getHours()+1));return`${date.getFullYear()}-${pad(date.getMonth()+1,2)}-${pad(date.getDate(),2)}T${pad(date.getHours(),2)}:00`}
function checklistFrom(value){return String(value||'').split('\n').map(text=>text.trim()).filter(Boolean).slice(0,20).map(text=>({text,done:false}))}
function checklistText(value){return(Array.isArray(value)?value:[]).map(item=>typeof item==='string'?item:item.text).filter(Boolean).join('\n')}
function taskPayload(form,aiOrganized=false){const data=new FormData(form),starts=data.get('starts_at'),due=data.get('due_at'),reminder=data.get('reminder_at');return{title:data.get('title').trim(),description:data.get('description').trim()||null,task_kind:data.get('task_kind'),priority:data.get('priority'),starts_at:new Date(starts).toISOString(),due_at:due?new Date(due).toISOString():null,all_day:data.get('all_day')==='on',reminder_at:reminder?new Date(reminder).toISOString():null,source_type:'manual',source_key:null,source_label:null,checklist:checklistFrom(data.get('checklist')),ai_organized:aiOrganized}}

async function requestBrowserNotifications(){
  if(!('Notification' in window))return false;
  if(Notification.permission==='granted')return true;
  if(Notification.permission==='denied')return false;
  return(await Notification.requestPermission())==='granted';
}

function taskModal(task={}){
  const editing=Boolean(task.id),start=toLocalInput(task.starts_at)||defaultStart();
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box agenda-task-modal" id="agendaTaskForm"><div class="modal-head"><div><p class="eyebrow">AGENDA HARMONY</p><h2>${editing?'Editar tarefa':'Nova tarefa ou compromisso'}</h2></div><button type="button" data-close>×</button></div><label class="wide">Anotação rápida<textarea name="raw" placeholder="Ex.: Na sexta confirmar com a fornecedora a entrega das bases brancas"></textarea><small>A IA pode transformar sua anotação em título, prioridade e passos. Você sempre revisa antes de salvar.</small></label><button type="button" class="agenda-organize-ai" data-organize-task>✦ Organizar anotação com IA</button><div class="form"><label class="wide">Título<input name="title" maxlength="160" value="${esc(task.title||'')}" required></label><label>Tipo<select name="task_kind">${Object.entries(taskKindLabel).map(([value,label])=>`<option value="${value}" ${task.task_kind===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Prioridade<select name="priority">${Object.entries(priorityLabel).map(([value,label])=>`<option value="${value}" ${(task.priority||'normal')===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Início<input name="starts_at" type="datetime-local" value="${start}" required></label><label>Prazo final<input name="due_at" type="datetime-local" value="${toLocalInput(task.due_at)}"></label><label>Lembrar em<input name="reminder_at" type="datetime-local" value="${toLocalInput(task.reminder_at)}"></label><label class="check"><input name="all_day" type="checkbox" ${task.all_day?'checked':''}> Compromisso de dia inteiro</label><label class="wide">Descrição<textarea name="description" maxlength="3000">${esc(task.description||'')}</textarea></label><label class="wide">Lista de verificação<textarea name="checklist" placeholder="Um passo por linha">${esc(checklistText(task.checklist))}</textarea></label></div><div class="form-actions"><button type="button" class="outline" data-close>Cancelar</button><button class="primary">${editing?'Salvar alterações':'Criar tarefa'}</button></div></form></div>`;
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>document.querySelector('#modal').innerHTML='');
  const form=document.querySelector('#agendaTaskForm');let organized=Boolean(task.ai_organized);
  form.querySelector('[data-organize-task]').onclick=async event=>{const raw=form.raw.value.trim();if(raw.length<8)return alert('Escreva um pouco mais sobre a tarefa.');const button=event.currentTarget,original=button.textContent;button.disabled=true;button.textContent='✦ Organizando…';try{const result=await agendaEdge({action:'organize_task',text:raw,current_date:today()});const item=result.result||{};if(item.title)form.title.value=item.title;if(item.description)form.description.value=item.description;if(item.priority)form.priority.value=item.priority;if(item.task_kind)form.task_kind.value=item.task_kind;if(item.suggested_starts_at)form.starts_at.value=toLocalInput(item.suggested_starts_at);if(item.suggested_due_at)form.due_at.value=toLocalInput(item.suggested_due_at);if(Array.isArray(item.checklist))form.checklist.value=item.checklist.join('\n');organized=true;toast('Sugestão da IA pronta para sua revisão.')}catch(error){alert(error.message)}finally{button.disabled=false;button.textContent=original}};
  form.onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const payload=taskPayload(form,organized);if(editing)await rpc('admin_update_agenda_task',{p_task_id:task.id,p_task:payload});else await rpc('admin_create_agenda_task',{p_task:payload});if(payload.reminder_at){const allowed=await requestBrowserNotifications();if(!allowed)toast('Tarefa salva. Ative as notificações no perfil para receber o lembrete no celular.')}document.querySelector('#modal').innerHTML='';AH.loadedAt=0;await load(true);if(S.view==='agenda-harmony')renderAgenda(document.querySelector('#page'));else mountHome();toast(editing?'Tarefa atualizada com auditoria.':'Tarefa criada na Agenda Harmony.')}catch(error){alert(error.message);button.disabled=false}};
}

function openTask(id){
  const task=AH.tasks.find(item=>item.id===id);if(!task)return;
  document.querySelector('#modal').innerHTML=`<div class="modal"><section class="modal-box agenda-task-detail"><div class="modal-head"><div><p class="eyebrow">TAREFA #${pad(task.protocol)}</p><h2>${esc(task.title)}</h2></div><button type="button" data-close>×</button></div><div class="agenda-task-status ${taskTone(task)}"><span><small>INÍCIO</small><b>${brWhen(task.starts_at)}</b></span><span><small>PRAZO</small><b>${brWhen(task.due_at)}</b></span><em>${priorityLabel[task.priority]}</em></div><p>${esc(task.description||'Sem observações.')}</p>${task.checklist?.length?`<div class="agenda-checklist"><small>LISTA DE VERIFICAÇÃO</small>${task.checklist.map(item=>`<span>${item.done?'✓':'○'} ${esc(item.text||item)}</span>`).join('')}</div>`:''}<div class="form-actions">${isOpen(task)?`<button class="outline" data-edit-task>Editar</button><button class="outline" data-start-task>Em andamento</button><button class="primary" data-complete-task>✓ Concluir</button><button class="danger" data-cancel-task>Cancelar</button>`:`<button class="primary" data-reopen-task>Reabrir tarefa</button>`}</div></section></div>`;
  const close=()=>document.querySelector('#modal').innerHTML='';document.querySelector('[data-close]').onclick=close;
  document.querySelector('[data-edit-task]')?.addEventListener('click',()=>taskModal(task));
  const change=async status=>{await rpc('admin_set_agenda_task_status',{p_task_id:task.id,p_status:status});close();AH.loadedAt=0;await load(true);if(S.view==='agenda-harmony')renderAgenda(document.querySelector('#page'));else mountHome();toast('Situação da tarefa atualizada.')};
  document.querySelector('[data-start-task]')?.addEventListener('click',()=>change('in_progress').catch(error=>alert(error.message)));
  document.querySelector('[data-complete-task]')?.addEventListener('click',()=>change('completed').catch(error=>alert(error.message)));
  document.querySelector('[data-cancel-task]')?.addEventListener('click',()=>confirm('Cancelar esta tarefa mantendo o histórico?')&&change('cancelled').catch(error=>alert(error.message)));
  document.querySelector('[data-reopen-task]')?.addEventListener('click',()=>change('pending').catch(error=>alert(error.message)));
}

async function agendaEdge(body){
  await ensureSession();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try{const response=await fetch(API+'/functions/v1/analyze-admin-agenda',{method:'POST',signal:controller.signal,headers:{apikey:KEY,Authorization:'Bearer '+S.session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});return await json(response)}catch(error){if(error.name==='AbortError')throw Error('A análise demorou mais que o esperado. Tente novamente.');throw error}finally{clearTimeout(timer)}
}

async function generateBrief(button){
  const original=button.textContent;button.disabled=true;button.textContent='✦ Analisando prioridades…';
  try{await agendaEdge({action:'daily_briefing'});AH.loadedAt=0;await load(true);renderAgenda(document.querySelector('#page'));toast('Análise administrativa atualizada com IA.')}catch(error){alert(error.message);button.disabled=false;button.textContent=original}
}

const previousRenderApp=renderApp;renderApp=function(){const result=previousRenderApp();addNavigation();return result};
const previousRenderPage=renderPage;renderPage=async function(){if(S.view==='agenda-harmony'&&isAdmin())return renderPageView();const result=await previousRenderPage();if(S.view==='home'&&isAdmin()){await load().catch(()=>{});mountHome()}return result};
window.HarmonyAgenda=Object.freeze({state:AH,load,open:()=>{if(!isAdmin())return;S.view='agenda-harmony';renderApp()},newTask:taskModal});
async function handleAgendaRoute(){
  const url=new URL(location.href);if(url.searchParams.get('view')!=='agenda-harmony'||!isAdmin())return;
  url.searchParams.delete('view');history.replaceState({},'',url.pathname+(url.searchParams.toString()?`?${url.searchParams}`:'')+url.hash);
  if(S.view!=='agenda-harmony'){S.view='agenda-harmony';renderApp()}
}
new MutationObserver(handleAgendaRoute).observe(document.body,{childList:true,subtree:true});handleAgendaRoute();
})();
