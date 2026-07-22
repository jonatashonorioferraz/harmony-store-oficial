(()=>{
const HUB={filter:'all',items:[],loading:false,error:'',renderToken:0};
const openStatuses=new Set(['pending','separating','scheduled']);
const statusText={pending:'Pendente',separating:'Em separação',scheduled:'Agendada'};
const typeText={production:'Matéria-prima',ecommerce:'Material do e-commerce',internal:'Suprimento do e-commerce'};
const typeIcon={production:'🧼',ecommerce:'📦',internal:'🧺'};

const ageText=value=>{
  const created=new Date(value),today=new Date();
  const days=Math.max(0,Math.floor((today-created)/86400000));
  return days===0?'Recebida hoje':days===1?'Há 1 dia':`Há ${days} dias`;
};

async function standardItems(requests){
  if(!requests.length)return [];
  const ids=requests.map(item=>item.id).join(',');
  return rest(`request_items?request_id=in.(${ids})&select=request_id,product_id`);
}

function classifyRequest(request,items){
  const rows=items.filter(item=>item.request_id===request.id);
  const hasEcommerce=rows.some(item=>S.products.find(product=>product.id===item.product_id)?.hidden_from_collaborators===true);
  const hasProduction=rows.some(item=>S.products.find(product=>product.id===item.product_id)?.hidden_from_collaborators!==true);
  return hasEcommerce&&!hasProduction?'ecommerce':hasEcommerce?'ecommerce':'production';
}

async function loadHub(){
  const requests=S.requests.filter(item=>openStatuses.has(item.status));
  const [items]=await Promise.all([
    standardItems(requests),
    window.HarmonyInternalSupplies?.load?.()
  ]);
  const standard=requests.map(item=>{
    const requester=S.team.find(person=>person.id===item.requested_by);
    return {...item,kind:classifyRequest(item,items),requester_name:requester?.full_name||'Solicitante',priority:'normal'};
  });
  const internal=(window.HarmonyInternalSupplies?.state?.requests||[])
    .filter(item=>openStatuses.has(item.status))
    .map(item=>({...item,kind:'internal',requester_name:item.requested_by_name||'Solicitante'}));
  const weight={urgent:0,important:1,normal:2};
  HUB.items=[...standard,...internal].sort((a,b)=>(weight[a.priority]??2)-(weight[b.priority]??2)||new Date(a.created_at)-new Date(b.created_at));
}

function counts(){return ['production','ecommerce','internal'].reduce((result,kind)=>(result[kind]=HUB.items.filter(item=>item.kind===kind).length,result),{})}

function card(item){
  const priority=item.priority==='urgent'?'Urgente':item.priority==='important'?'Importante':'';
  return `<button class="hub-request-card hub-kind-${item.kind}" data-hub-kind="${item.kind}" data-hub-id="${item.id}"><i aria-hidden="true">${typeIcon[item.kind]}</i><span class="hub-request-main"><small>${typeText[item.kind]} · #${String(item.protocol).padStart(4,'0')}</small><b>${esc(item.requester_name)}</b><em>${ageText(item.created_at)}${item.needed_by?` · Necessário até ${new Date(item.needed_by+'T12:00:00').toLocaleDateString('pt-BR')}`:''}</em></span>${priority?`<span class="hub-priority ${item.priority}">${priority}</span>`:''}<span class="badge ${item.status}">${statusText[item.status]||item.status}</span><span class="hub-open">Abrir <b>›</b></span></button>`;
}

function renderHub(host){
  const amount=counts(),filtered=HUB.filter==='all'?HUB.items:HUB.items.filter(item=>item.kind===HUB.filter);
  host.innerHTML=`<section class="card admin-request-hub"><div class="hub-head"><div><p class="eyebrow">CENTRAL DE PENDÊNCIAS</p><h2>Solicitações que precisam de atenção</h2><span>Todas as solicitações abertas dos ADMs, reunidas em um só lugar.</span></div><button class="outline compact-action" id="refreshRequestHub">↻ Atualizar</button></div><div class="hub-summary"><button class="${HUB.filter==='all'?'active':''}" data-hub-filter="all"><i>🔔</i><span><b>${HUB.items.length}</b><small>Todas em aberto</small></span></button><button class="${HUB.filter==='production'?'active':''}" data-hub-filter="production"><i>${typeIcon.production}</i><span><b>${amount.production}</b><small>Matéria-prima</small></span></button><button class="${HUB.filter==='ecommerce'?'active':''}" data-hub-filter="ecommerce"><i>${typeIcon.ecommerce}</i><span><b>${amount.ecommerce}</b><small>Material do e-commerce</small></span></button><button class="${HUB.filter==='internal'?'active':''}" data-hub-filter="internal"><i>${typeIcon.internal}</i><span><b>${amount.internal}</b><small>Suprimentos</small></span></button></div><div class="hub-list">${filtered.map(card).join('')||'<div class="hub-empty"><i>✓</i><div><b>Nenhuma solicitação aberta</b><span>Esta área está em dia.</span></div></div>'}</div></section>`;
  host.querySelectorAll('[data-hub-filter]').forEach(button=>button.onclick=()=>{HUB.filter=button.dataset.hubFilter;renderHub(host)});
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
    if(token===HUB.renderToken)host.innerHTML=`<section class="card hub-error"><span>Não foi possível carregar as pendências.</span><button class="outline compact-action" id="retryRequestHub">Tentar novamente</button></section>`,host.querySelector('#retryRequestHub').onclick=()=>mount(true);
  }finally{HUB.loading=false}
}

const previousRenderPage=renderPage;
renderPage=async function(){const result=await previousRenderPage();if(S.view==='home'&&S.profile?.role==='admin')await mount();return result};
window.HarmonyRequestHub=Object.freeze({state:HUB,load:loadHub,mount,classifyRequest});
})();
