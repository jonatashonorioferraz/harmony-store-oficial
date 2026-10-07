(()=>{
const HUB={filter:'all',order:'oldest',items:[],loading:false,error:'',renderToken:0};
const openStatuses=new Set(['pending','separating','scheduled']);
const statusText={pending:'Pendente',separating:'Em separação',scheduled:'Agendada'};
const typeText={production:'Matéria-prima',ecommerce:'Material do e-commerce',internal:'Suprimento do e-commerce'};
const typeIcon={production:'🧼',ecommerce:'📦',internal:'🧺'};

function submittedTime(value){
  if(!value)return NaN;
  return new Date(value).getTime();
}

function arrivalOrder(a,b){
  const first=submittedTime(a.created_at),second=submittedTime(b.created_at);
  const difference=(Number.isFinite(first)?first:Infinity)-(Number.isFinite(second)?second:Infinity);
  return difference||`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`,'en');
}

function ageText(value){
  const submitted=submittedTime(value);
  if(!Number.isFinite(submitted))return '';
  const elapsed=Date.now()-submitted;
  if(elapsed<0)return 'Data futura';
  const minutes=Math.floor(elapsed/60000),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
  if(days)return days===1?'Há 1 dia':`Há ${days} dias`;
  if(hours)return `Há ${hours} h`;
  return minutes?`Há ${minutes} min`:'Recebida agora';
}

function submissionText(value){
  const submitted=submittedTime(value);
  if(!Number.isFinite(submitted))return 'Data de envio indisponível';
  const date=new Date(submitted);
  return `${date.toLocaleDateString('pt-BR')} · ${date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
}

function classifyRequest(request){
  const requester=S.team.find(person=>person.id===request.requested_by);
  return requester?.role==='receiver'?'ecommerce':'production';
}

async function loadHub(){
  const requests=S.requests.filter(item=>openStatuses.has(item.status));
  await window.HarmonyInternalSupplies?.load?.();
  const standard=requests.map(item=>{
    const requester=S.team.find(person=>person.id===item.requested_by);
    return {...item,kind:classifyRequest(item),requester_name:requester?.full_name||'Solicitante',priority:'normal'};
  });
  const internal=(window.HarmonyInternalSupplies?.state?.requests||[])
    .filter(item=>openStatuses.has(item.status))
    .map(item=>({...item,kind:'internal',requester_name:item.requested_by_name||'Solicitante'}));
  HUB.items=[...standard,...internal].sort(arrivalOrder).map((item,index)=>({
    ...item,queue_position:Number.isFinite(submittedTime(item.created_at))?index+1:null
  }));
}

function counts(){return ['production','ecommerce','internal'].reduce((result,kind)=>(result[kind]=HUB.items.filter(item=>item.kind===kind).length,result),{})}

function card(item){
  const priority=item.priority==='urgent'?'Urgente':item.priority==='important'?'Importante':'';
  const oldest=item.queue_position===1;
  const position=item.queue_position?`${item.queue_position}ª`:'—';
  const positionDescription=item.queue_position?`${position} na ordem geral de chegada`:'Posição indisponível: data de envio ausente ou inválida';
  const submitted=submittedTime(item.created_at);
  const dateText=submissionText(item.created_at);
  const dateMarkup=Number.isFinite(submitted)?`<time datetime="${new Date(submitted).toISOString()}">${dateText}</time>`:`<span>${dateText}</span>`;
  const needed=item.needed_by?new Date(item.needed_by+'T12:00:00'):null;
  const neededText=needed&&Number.isFinite(needed.getTime())?`<em>Necessário até ${needed.toLocaleDateString('pt-BR')}</em>`:'';
  return `<li><button type="button" class="hub-request-card hub-kind-${item.kind}${oldest?' hub-oldest':''}" data-hub-kind="${item.kind}" data-hub-id="${esc(item.id)}" aria-label="${esc(`${positionDescription}. ${typeText[item.kind]}, solicitação ${item.protocol}, ${item.requester_name}. ${dateText}. ${statusText[item.status]||item.status}${priority?`. ${priority}`:''}. Abrir detalhes.`)}">
    <span class="hub-position" title="${positionDescription}" aria-hidden="true"><b>${position}</b><small>na fila</small></span>
    <i aria-hidden="true">${typeIcon[item.kind]}</i>
    <span class="hub-request-main"><small>${typeText[item.kind]} · #${esc(String(item.protocol).padStart(4,'0'))}</small><span class="hub-request-name"><b>${esc(item.requester_name)}</b>${oldest?'<span class="hub-oldest-label">Mais antiga</span>':''}</span>${neededText}</span>
    <span class="hub-received">${dateMarkup}<em>${ageText(item.created_at)}</em></span>
    <span class="hub-request-badges">${priority?`<span class="hub-priority ${item.priority}">${priority}</span>`:''}<span class="badge ${item.status}">${statusText[item.status]||item.status}</span></span>
    <span class="hub-open">Abrir <b aria-hidden="true">›</b></span>
  </button></li>`;
}

function renderHub(host){
  const amount=counts();
  const filtered=HUB.items.filter(item=>HUB.filter==='all'||item.kind===HUB.filter);
  if(HUB.order==='newest')filtered.sort((a,b)=>(b.queue_position??0)-(a.queue_position??0));
  const filters=[
    {kind:'all',icon:'🔔',amount:HUB.items.length,label:'Todas em aberto'},
    {kind:'production',icon:typeIcon.production,amount:amount.production,label:'Matéria-prima'},
    {kind:'ecommerce',icon:typeIcon.ecommerce,amount:amount.ecommerce,label:'Material do e-commerce'},
    {kind:'internal',icon:typeIcon.internal,amount:amount.internal,label:'Suprimentos'}
  ];
  host.innerHTML=`<section class="card admin-request-hub">
    <div class="hub-head"><div><p class="eyebrow">CENTRAL DE PENDÊNCIAS</p><h2>Solicitações que precisam de atenção</h2><span>Todas as solicitações abertas dos ADMs, reunidas em um só lugar.</span></div><button type="button" class="outline compact-action" id="refreshRequestHub">↻ Atualizar</button></div>
    <div class="hub-summary">${filters.map(filter=>`<button type="button" class="${HUB.filter===filter.kind?'active':''}" data-hub-filter="${filter.kind}" aria-pressed="${HUB.filter===filter.kind}"><i aria-hidden="true">${filter.icon}</i><span><b>${filter.amount}</b><small>${filter.label}</small></span></button>`).join('')}</div>
    <div class="hub-queue-toolbar"><div class="hub-queue-heading"><div><h3>Ordem de chegada</h3><span class="hub-free-choice">Atendimento livre</span></div><p>Posição geral da fila. Você pode atender qualquer solicitação.</p></div><label class="hub-sort"><span>Ordenar solicitações</span><select id="hubArrivalOrder"><option value="oldest"${HUB.order==='oldest'?' selected':''}>Mais antigas primeiro</option><option value="newest"${HUB.order==='newest'?' selected':''}>Mais recentes primeiro</option></select></label></div>
    <p class="hub-result-count" role="status">${filtered.length} de ${HUB.items.length} em aberto${HUB.filter!=='all'?' · Numeração geral preservada':''}</p>
    <ul class="hub-list" aria-label="Solicitações em aberto">${filtered.map(card).join('')||'<li class="hub-empty"><i aria-hidden="true">✓</i><div><b>Nenhuma solicitação aberta</b><span>Esta área está em dia.</span></div></li>'}</ul>
  </section>`;
  host.querySelectorAll('[data-hub-filter]').forEach(button=>button.onclick=()=>{
    HUB.filter=button.dataset.hubFilter;renderHub(host);
    host.querySelector(`[data-hub-filter="${HUB.filter}"]`)?.focus();
  });
  host.querySelector('#hubArrivalOrder').onchange=event=>{
    HUB.order=event.target.value==='newest'?'newest':'oldest';renderHub(host);
    host.querySelector('#hubArrivalOrder').focus();
  };
  host.querySelector('#refreshRequestHub').onclick=()=>mount(true);
  host.querySelectorAll('[data-hub-id]').forEach(button=>button.onclick=()=>openItem(button.dataset.hubKind,button.dataset.hubId));
}

async function openItem(kind,id){
  if(kind==='internal')return window.HarmonyInternalSupplies.openRequest(id);
  const request=S.requests.find(item=>item.id===id);
  if(request)requestModalV2(request);
}

async function mount(force=false){
  if(S.profile?.role!=='admin'||S.view!=='home')return;
  const page=document.querySelector('#page .page');if(!page)return;
  let host=page.querySelector('#adminRequestHub');
  if(!host){host=document.createElement('div');host.id='adminRequestHub';const metrics=page.querySelector('.metrics');page.insertBefore(host,metrics||page.firstChild)}
  const token=++HUB.renderToken;
  host.innerHTML='<section class="card hub-loading"><i>✦</i><span>Atualizando solicitações abertas…</span></section>';
  HUB.loading=true;HUB.error='';
  try{
    if(force&&window.HarmonyInternalSupplies?.state)window.HarmonyInternalSupplies.state.loaded=false;
    await loadHub();
    if(token===HUB.renderToken&&S.view==='home')renderHub(host);
  }catch(error){
    HUB.error=error.message||'Não foi possível atualizar a central.';
    if(token===HUB.renderToken){
      host.innerHTML=`<section class="card hub-error"><span>Não foi possível carregar as pendências.</span><button class="outline compact-action" id="retryRequestHub">Tentar novamente</button></section>`;
      host.querySelector('#retryRequestHub').onclick=()=>mount(true);
    }
  }finally{HUB.loading=false}
}

const previousRenderPage=renderPage;
renderPage=async function(){const result=await previousRenderPage();if(S.view==='home'&&S.profile?.role==='admin')await mount();return result};
window.HarmonyRequestHub=Object.freeze({state:HUB,load:loadHub,mount,classifyRequest});
})();
