(()=>{
const BI={loaded:false,loading:false,error:'',items:[],suppliers:[],supplierProducts:[],orders:[],orderItems:[],ideas:[],ideaEvents:[],productionOrders:[],productionReceipts:[],productionColors:[],operationalKey:'',tab:'overview',period:'month',from:'',to:'',profileId:'',productId:'',ideaQuery:'',ideaStatus:''};
const n=value=>Number(value||0);
const round=value=>Math.round((n(value)+Number.EPSILON)*1000)/1000;
const qty=(value,unit='')=>`${round(value).toLocaleString('pt-BR',{maximumFractionDigits:3})}${unit?' '+unit:''}`;
const currency=value=>n(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateOnly=value=>new Date(value).toISOString().slice(0,10);
const addDays=(date,days)=>{const result=new Date(date);result.setDate(result.getDate()+days);return result};
const startOfDay=value=>new Date(`${value}T00:00:00`);
const endOfDay=value=>new Date(`${value}T23:59:59.999`);
const ideaStatusLabels={new:'Nova',analysis:'Em análise',approved:'Aprovada',development:'Em desenvolvimento',completed:'Concluída',discarded:'Descartada'};
const ideaPriorityLabels={low:'Baixa',medium:'Média',high:'Alta'};
const ideaAreaLabels={geral:'Geral',solicitacoes:'Solicitações',produtos:'Produtos',producao:'Produção',pagamentos:'Pagamentos',relatorios:'Relatórios',usuarios:'Usuários',inteligencia:'Inteligência',outro:'Outro'};

function setDefaultPeriod(period=BI.period){
  const today=new Date();let from;
  if(period==='week')from=addDays(today,-6);
  else if(period==='year')from=new Date(today.getFullYear(),0,1);
  else from=new Date(today.getFullYear(),today.getMonth(),1);
  BI.from=dateOnly(from);BI.to=dateOnly(today);BI.period=period;
}
setDefaultPeriod();

async function loadOperationalIntelligence(force=false){
  const key=[BI.from,BI.to,BI.profileId].join('|');
  if(!force&&BI.operationalKey===key)return;
  const [productionOrders,productionReceipts,productionColors]=await Promise.all([
    rpc('list_production_orders',{p_from:BI.from||null,p_to:BI.to||null}),
    rpc('list_finished_production_receipts',{p_from:BI.from||null,p_to:BI.to||null,p_worker_id:BI.profileId||null}),
    rpc('list_finished_production_colors',{})
  ]);
  Object.assign(BI,{productionOrders,productionReceipts,productionColors,operationalKey:key});
}

async function loadIntelligence(force=false){
  if(BI.loading||BI.loaded&&!force)return;
  BI.loading=true;BI.error='';
  try{
    const [items,suppliers,supplierProducts,orders,orderItems,ideas,ideaEvents]=await Promise.all([
      restAll('request_items?select=*&order=id.asc'),
      restAll('suppliers?select=*&order=name.asc,id.asc'),
      restAll('supplier_products?select=*&order=created_at.desc,id.desc'),
      restAll('purchase_orders?select=*&order=created_at.desc,id.desc'),
      restAll('purchase_order_items?select=*&order=id.asc'),
      restAll('improvement_ideas?select=*&order=updated_at.desc,id.desc'),
      restAll('improvement_idea_events?select=*&order=created_at.desc,id.desc')
    ]);
    Object.assign(BI,{items,suppliers,supplierProducts,orders,orderItems,ideas,ideaEvents,loaded:true});
    await loadOperationalIntelligence(force);
  }catch(error){BI.error=error.message||'Não foi possível carregar a inteligência de consumo.'}
  finally{BI.loading=false}
}

function filteredRows(){
  const requests=new Map(S.requests.map(request=>[request.id,request]));
  const products=new Map(S.products.map(product=>[product.id,product]));
  const people=new Map(S.team.map(person=>[person.id,person]));
  const from=startOfDay(BI.from),to=endOfDay(BI.to);
  return BI.items.map(item=>{
    const request=requests.get(item.request_id),product=products.get(item.product_id),person=request?people.get(request.requested_by):null;
    return {item,request,product,person};
  }).filter(row=>row.request&&row.product&&row.request.status!=='cancelled'&&new Date(row.request.created_at)>=from&&new Date(row.request.created_at)<=to&&(!BI.profileId||row.request.requested_by===BI.profileId)&&(!BI.productId||row.item.product_id===BI.productId));
}

function preferredLink(productId){
  return BI.supplierProducts.find(link=>link.product_id===productId&&link.is_preferred)||BI.supplierProducts.find(link=>link.product_id===productId)||null;
}

async function productSupplyContext(productId=''){
  const [suppliers,links]=await Promise.all([
    rest('suppliers?select=*&order=name.asc'),
    productId?rest(`supplier_products?product_id=eq.${encodeURIComponent(productId)}&select=*&order=is_preferred.desc,created_at.asc`):Promise.resolve([])
  ]);
  const selected=links.find(link=>link.is_preferred)||links[0]||null;
  return {suppliers:suppliers.filter(supplier=>supplier.active||supplier.id===selected?.supplier_id),links,selectedSupplierId:selected?.supplier_id||''};
}

async function savePreferredSupplier(productId,supplierId){
  const links=await rest(`supplier_products?product_id=eq.${encodeURIComponent(productId)}&select=*`);
  if(links.some(link=>link.is_preferred))await rest(`supplier_products?product_id=eq.${encodeURIComponent(productId)}&is_preferred=eq.true`,{method:'PATCH',body:JSON.stringify({is_preferred:false})});
  if(supplierId){
    await rest('supplier_products?on_conflict=supplier_id,product_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({supplier_id:supplierId,product_id:productId,is_preferred:true})});
  }
  BI.loaded=false;
}

function linksForSupplier(supplierId){
  return BI.supplierProducts.filter(link=>link.supplier_id===supplierId);
}

const managedProductScopes=['production','ecommerce','shared'];
const productMatchesScope=(productScope,scope)=>managedProductScopes.includes(productScope)&&(!scope||productScope===scope||productScope==='shared');
const requestScopeForReport=(person,productScope)=>productScope==='shared'?(person?.role==='receiver'?'ecommerce':'production'):productScope;

function materialReport(rows=filteredRows(),scope=null){
  const days=Math.max(1,Math.floor((startOfDay(BI.to)-startOfDay(BI.from))/86400000)+1),months=Math.max(days/30,1/30);
  const grouped=new Map();
  S.products.forEach(product=>{
    const productScope=product.usage_scope||'production';if(!productMatchesScope(productScope,scope))return;
    if(BI.productId&&product.id!==BI.productId)return;
    grouped.set(product.id,{product,requested:0,delivered:0,entries:0,adjustments:0});
  });
  rows.forEach(({item,request,product,person})=>{
    const productScope=product.usage_scope||'production';
    if(!productMatchesScope(productScope,scope)||scope&&requestScopeForReport(person,productScope)!==scope)return;
    const entry=grouped.get(product.id)||{product,requested:0,delivered:0,entries:0,adjustments:0};
    entry.requested+=n(item.requested_quantity);entry.entries++;
    if(request.status==='delivered'&&!item.removed_by_admin)entry.delivered+=n(item.approved_quantity);
    if(item.removed_by_admin||n(item.approved_quantity)&&n(item.approved_quantity)!==n(item.requested_quantity))entry.adjustments++;
    grouped.set(product.id,entry);
  });
  return [...grouped.values()].map(entry=>{
    const product=entry.product,available=Math.max(0,n(product.physical_stock)-n(product.reserved_stock));
    const monthly=entry.delivered/months,forecast30=monthly,link=preferredLink(product.id);
    const leadDays=n(link?.lead_time_days)||n(product.lead_time_days)||30;
    const safety=n(product.safety_stock)||n(product.minimum_stock);
    const ordered=BI.orderItems.filter(item=>item.product_id===product.id&&BI.orders.some(order=>order.id===item.purchase_order_id&&order.status==='ordered')).reduce((sum,item)=>sum+n(item.quantity),0);
    let suggested=Math.max(0,monthly*(leadDays/30)+safety-available-ordered);
    if(suggested>0&&n(link?.minimum_order_quantity)>suggested)suggested=n(link.minimum_order_quantity);
    suggested=round(suggested);
    const unitCost=n(link?.last_unit_cost)||n(product.unit_cost);
    return {...entry,available,monthly:round(monthly),forecast30:round(forecast30),leadDays,safety,ordered,suggested,unitCost,estimatedCost:suggested*unitCost,coverageDays:monthly>0?round(available/monthly*30):null};
  }).sort((a,b)=>b.delivered-a.delivered||a.product.name.localeCompare(b.product.name));
}

function collaboratorReport(rows=filteredRows()){
  const grouped=new Map();
  S.team.filter(person=>person.role!=='admin').forEach(person=>{if(!BI.profileId||person.id===BI.profileId)grouped.set(person.id,{person,requests:new Set(),deliveries:new Set(),items:0,products:new Map(),last:null})});
  rows.forEach(({item,request,person,product})=>{
    if(!person)return;const entry=grouped.get(person.id)||{person,requests:new Set(),deliveries:new Set(),items:0,products:new Map(),last:null};
    entry.requests.add(request.id);entry.items++;if(request.status==='delivered')entry.deliveries.add(request.id);
    if(request.status==='delivered'&&!item.removed_by_admin)entry.products.set(product.id,(entry.products.get(product.id)||0)+n(item.approved_quantity));
    if(!entry.last||new Date(request.created_at)>new Date(entry.last))entry.last=request.created_at;
    grouped.set(person.id,entry);
  });
  return [...grouped.values()].map(entry=>{
    const top=[...entry.products.entries()].sort((a,b)=>b[1]-a[1])[0],product=S.products.find(item=>item.id===top?.[0]);
    return {...entry,requestCount:entry.requests.size,deliveryCount:entry.deliveries.size,topProduct:product?`${product.name} (${qty(top[1],product.unit)})`:'Sem consumo entregue'};
  }).sort((a,b)=>b.requestCount-a.requestCount||a.person.full_name.localeCompare(b.person.full_name));
}

const normalizedName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function productionPlanReport(){
  const grouped=new Map(),validStatuses=new Set(['sent','viewed','acknowledged','acknowledged_external']);
  const keyFor=(workerId,modelId,color)=>[workerId,modelId,normalizedName(color)].join('|');
  BI.productionOrders.filter(row=>validStatuses.has(row.status)&&(!BI.profileId||row.worker_id===BI.profileId)).forEach(row=>{
    const key=keyFor(row.worker_id,row.model_id,row.color_name),entry=grouped.get(key)||{workerId:row.worker_id,workerName:row.worker_name,modelId:row.model_id,modelName:row.model_name,color:row.color_name,planned:0,received:0,orders:new Set(),receipts:new Set(),dueDate:null};
    entry.planned+=n(row.quantity);entry.orders.add(row.id);
    if(!entry.dueDate||new Date(row.due_date)>new Date(entry.dueDate))entry.dueDate=row.due_date;
    grouped.set(key,entry);
  });
  BI.productionReceipts.filter(row=>!BI.profileId||row.worker_id===BI.profileId).forEach(row=>{
    const key=keyFor(row.worker_id,row.model_id,row.color),entry=grouped.get(key)||{workerId:row.worker_id,workerName:row.worker_name,modelId:row.model_id,modelName:row.model_name,color:row.color,planned:0,received:0,orders:new Set(),receipts:new Set(),dueDate:null};
    entry.received+=n(row.quantity);entry.receipts.add(row.collection_id||row.id);grouped.set(key,entry);
  });
  return [...grouped.values()].map(entry=>{
    const balance=entry.planned-entry.received;
    const status=entry.planned===0&&entry.received>0?'unplanned':entry.received===0?'pending':entry.received<entry.planned?'partial':entry.received===entry.planned?'complete':'above';
    return {...entry,balance,status,orderCount:entry.orders.size,receiptCount:entry.receipts.size};
  }).sort((a,b)=>Math.max(b.balance,0)-Math.max(a.balance,0)||a.workerName.localeCompare(b.workerName)||a.modelName.localeCompare(b.modelName));
}

function dataQualityReport(){
  const activeProducts=S.products.filter(product=>product.active&&managedProductScopes.includes(product.usage_scope||'production'));
  const colorNames=new Set(BI.productionColors.filter(color=>color.active).map(color=>normalizedName(color.name)));
  const issues=[
    {kind:'photos',label:'Produtos ativos sem foto',detail:'Cadastre imagens para facilitar solicitações e separações.',count:activeProducts.filter(product=>!product.image_path).length,target:'products'},
    {kind:'suppliers',label:'Produtos sem fornecedor',detail:'Vincule ao menos um fornecedor para melhorar o planejamento.',count:activeProducts.filter(product=>!BI.supplierProducts.some(link=>link.product_id===product.id)).length,target:'suppliers'},
    {kind:'contacts',label:'Fornecedores sem contato',detail:'Informe telefone, e-mail ou site para agilizar a reposição.',count:BI.suppliers.filter(supplier=>supplier.active&&!supplier.phone&&!supplier.email&&!supplier.website).length,target:'suppliers'},
    {kind:'colors',label:'Recebimentos com cor fora do padrão',detail:'Revise nomes antigos que não pertencem à paleta ativa.',count:BI.productionReceipts.filter(receipt=>!colorNames.has(normalizedName(receipt.color))).length,target:'production'},
    {kind:'differences',label:'Divergências de contagem no período',detail:'Confira caixas cuja quantidade informada difere da oficial.',count:BI.productionReceipts.filter(receipt=>n(receipt.quantity_difference)!==0).length,target:'production'}
  ];
  return issues.sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
}

function filterBar(){
  const scope=BI.tab==='ecommerce'?'ecommerce':BI.tab==='materials'?'production':null,products=S.products.filter(product=>productMatchesScope(product.usage_scope,scope));
  const productFilter=BI.tab==='production'?'':`<label>${scope==='ecommerce'?'Suprimento do e-commerce':'Material'}<select id="intelProduct"><option value="">Todos</option>${products.map(product=>`<option value="${product.id}" ${BI.productId===product.id?'selected':''}>${esc(product.name)}</option>`).join('')}</select></label>`;
  return `<section class="intel-filters card ${BI.tab==='production'?'without-product':''}"><label>Período<select id="intelPeriod"><option value="week" ${BI.period==='week'?'selected':''}>Últimos 7 dias</option><option value="month" ${BI.period==='month'?'selected':''}>Mês atual</option><option value="year" ${BI.period==='year'?'selected':''}>Ano atual</option><option value="custom" ${BI.period==='custom'?'selected':''}>Personalizado</option></select></label><label>De<input id="intelFrom" type="date" value="${BI.from}"></label><label>Até<input id="intelTo" type="date" value="${BI.to}"></label><label>Colaboradora<select id="intelPerson"><option value="">Todas</option>${S.team.filter(person=>person.role!=='admin').map(person=>`<option value="${person.id}" ${BI.profileId===person.id?'selected':''}>${esc(person.full_name)}</option>`).join('')}</select></label>${productFilter}<button class="outline compact-action" id="applyIntel">Aplicar filtros</button></section>`;
}

const operationTabs=new Set(['operations','materials','ecommerce','people','production','quality']);
const supplyTabs=new Set(['purchases','suppliers','planning']);
const areaForTab=tab=>tab==='overview'?'dashboard':tab==='shopee'?'shopee':operationTabs.has(tab)?'operation':supplyTabs.has(tab)?'supply':'ideas';

function tabBar(){
  const area=areaForTab(BI.tab);
  return `<div class="intel-tabs intel-primary-tabs" aria-label="Áreas da Inteligência"><button data-intel-area="dashboard" class="${area==='dashboard'?'active':''}"><i>✦</i><span>Painel inteligente</span></button><button data-intel-area="shopee" class="${area==='shopee'?'active':''}"><i>◉</i><span>Shopee Analytics</span></button><button data-intel-area="operation" class="${area==='operation'?'active':''}"><i>◫</i><span>Operação</span></button><button data-intel-area="supply" class="${area==='supply'?'active':''}"><i>◇</i><span>Compras e parceiros</span></button><button data-intel-area="ideas" class="${area==='ideas'?'active':''}"><i>↗</i><span>Ideias e evolução</span></button></div>`;
}

function subTabBar(){
  const area=areaForTab(BI.tab);
  if(area==='operation')return `<nav class="intel-subtabs" aria-label="Relatórios operacionais"><span>Visualizar</span><div><button data-intel-subtab="operations" class="${BI.tab==='operations'?'active':''}">Resumo</button><button data-intel-subtab="materials" class="${BI.tab==='materials'?'active':''}">Matérias-primas</button><button data-intel-subtab="ecommerce" class="${BI.tab==='ecommerce'?'active':''}">E-commerce</button><button data-intel-subtab="people" class="${BI.tab==='people'?'active':''}">Colaboradoras</button><button data-intel-subtab="production" class="${BI.tab==='production'?'active':''}">Planejado × recebido</button><button data-intel-subtab="quality" class="${BI.tab==='quality'?'active':''}">Qualidade dos dados</button></div></nav>`;
  if(area==='supply')return `<nav class="intel-subtabs" aria-label="Compras e fornecedores"><span>Visualizar</span><div><button data-intel-subtab="purchases" class="${BI.tab==='purchases'?'active':''}">Pedidos de compra</button><button data-intel-subtab="suppliers" class="${BI.tab==='suppliers'?'active':''}">Fornecedores</button><button data-intel-subtab="planning" class="${BI.tab==='planning'?'active':''}">Planejamento</button></div></nav>`;
  return'';
}

function overviewView(){
  return `<div id="inventoryAiDashboard" class="inventory-ai-dashboard" aria-live="polite"><div class="loading-inline">Conectando estatísticas reais e Inteligência do Inventário…</div></div>`;
}

function shopeeView(){
  return `<div id="shopeeIntelligenceDashboard" class="shopee-intelligence-dashboard" aria-live="polite"><div class="loading-inline">Conectando relatórios oficiais, gráficos e Inteligência Shopee…</div></div>`;
}

function operationOverviewView(){
  const rows=filteredRows(),materials=materialReport(rows),requestCount=new Set(rows.map(row=>row.request.id)).size,deliveredCount=new Set(rows.filter(row=>row.request.status==='delivered').map(row=>row.request.id)).size;
  const adjustments=rows.filter(row=>row.item.removed_by_admin||n(row.item.approved_quantity)&&n(row.item.approved_quantity)!==n(row.item.requested_quantity)).length;
  const collaborators=new Set(rows.map(row=>row.person?.id).filter(Boolean)).size,max=Math.max(...materials.map(item=>item.delivered),1);
  return `<div class="intel-kpis"><article><small>SOLICITAÇÕES</small><b>${requestCount}</b><span>No período selecionado</span></article><article><small>ENTREGAS</small><b>${deliveredCount}</b><span>Concluídas no período</span></article><article><small>AJUSTES</small><b>${adjustments}</b><span>Itens alterados ou removidos</span></article><article><small>COLABORADORAS</small><b>${collaborators}</b><span>Com movimentação no período</span></article></div><section class="card intel-section"><div class="card-head"><div><p class="eyebrow">CONSUMO REAL</p><h2>Matérias-primas mais enviadas</h2><span>Resumo operacional sem repetir os indicadores do Inventário.</span></div><div class="actions"><button class="outline compact-action" id="exportIntel">Exportar Excel</button><button class="outline compact-action" id="printIntel">Salvar em PDF</button></div></div><div class="consumption-chart">${materials.filter(item=>item.delivered>0).slice(0,10).map(item=>`<div class="chart-row"><div><b>${esc(item.product.name)}</b><small>${qty(item.delivered,item.product.unit)}</small></div><i><span style="width:${Math.max(3,item.delivered/max*100)}%"></span></i></div>`).join('')||'<div class="empty">Ainda não há entregas concluídas no período.</div>'}</div></section>`;
}

function purchasePlanningView(){
  const suggestions=materialReport(filteredRows()).filter(item=>item.product.usage_scope!=='ecommerce'&&item.suggested>0);
  return `<section class="card intel-section purchase-suggestion"><div class="card-head"><div><p class="eyebrow">PLANEJAMENTO</p><h2>Sugestões para próxima compra</h2><span>Recomendação calculada; o estoque só muda após aprovação e recebimento do ADM.</span></div><div class="actions"><button class="outline compact-action" id="exportIntel">Exportar Excel</button><button class="outline compact-action" id="printIntel">Salvar em PDF</button><button class="primary compact-action" id="newSuggestedPurchase">Criar pedido</button></div></div>${materialTable(suggestions,true)}</section>`;
}

function productionPlanView(){
  const rows=productionPlanReport(),planned=rows.reduce((sum,row)=>sum+row.planned,0),received=rows.reduce((sum,row)=>sum+row.received,0),pending=rows.reduce((sum,row)=>sum+Math.max(row.balance,0),0),complete=rows.filter(row=>['complete','above'].includes(row.status)).length;
  const labels={pending:'Pendente',partial:'Recebimento parcial',complete:'Completo',above:'Acima do planejado',unplanned:'Recebido sem ordem no período'};
  return `<section class="card intel-section production-plan"><div class="card-head"><div><p class="eyebrow">PLANEJADO × RECEBIDO</p><h2>Acompanhamento da produção</h2><span>Comparativo por colaboradora, modelo e cor dentro do período selecionado. Não interfere no pagamento.</span></div><div class="actions"><button class="outline compact-action" id="exportProductionPlan">Exportar Excel</button><button class="ghost compact-action" id="openProductionOrders">Ver ordens</button></div></div><div class="production-plan-summary"><div><small>PLANEJADO</small><b>${planned.toLocaleString('pt-BR')} un.</b></div><div><small>RECEBIDO</small><b>${received.toLocaleString('pt-BR')} un.</b></div><div><small>SALDO PENDENTE</small><b>${pending.toLocaleString('pt-BR')} un.</b></div><div><small>LINHAS COMPLETAS</small><b>${complete} de ${rows.length}</b></div></div><div class="table-wrap"><table class="intel-table"><thead><tr><th>Colaboradora</th><th>Modelo e cor</th><th>Planejado</th><th>Recebido</th><th>Saldo</th><th>Situação</th><th>Prazo</th></tr></thead><tbody>${rows.map(row=>`<tr><td><b>${esc(row.workerName)}</b><small>${row.orderCount} ${row.orderCount===1?'ordem':'ordens'} · ${row.receiptCount} ${row.receiptCount===1?'coleta':'coletas'}</small></td><td><b>${esc(row.modelName)}</b><small>${esc(row.color)}</small></td><td>${row.planned.toLocaleString('pt-BR')} un.</td><td>${row.received.toLocaleString('pt-BR')} un.</td><td><strong class="plan-balance-${row.status}">${Math.abs(row.balance).toLocaleString('pt-BR')} un.${row.balance<0?' acima':''}</strong></td><td><span class="badge plan-status-${row.status}">${labels[row.status]}</span></td><td>${row.dueDate?new Date(`${row.dueDate}T12:00:00`).toLocaleDateString('pt-BR'):'—'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nenhuma ordem ou coleta encontrada no período.</td></tr>'}</tbody></table></div></section>`;
}

function dataQualityView(){
  const issues=dataQualityReport(),total=issues.reduce((sum,item)=>sum+item.count,0);
  return `<section class="card intel-section data-quality"><div class="card-head"><div><p class="eyebrow">QUALIDADE DOS DADOS</p><h2>${total?`${total} pontos para revisar`:'Dados essenciais em ordem'}</h2><span>Estes avisos não alteram registros automaticamente; servem como checklist para manter os relatórios confiáveis.</span></div></div><div class="data-quality-grid">${issues.map(issue=>`<button type="button" class="data-quality-item ${issue.count?'has-issue':'is-ok'}" data-quality-target="${issue.target}"><i>${issue.count?'!':'✓'}</i><span><b>${esc(issue.label)}</b><small>${esc(issue.detail)}</small></span><strong>${issue.count}</strong></button>`).join('')}</div></section>`;
}

function materialTable(materials=materialReport(),compact=false){
  return `<div class="table-wrap"><table class="intel-table"><thead><tr><th>Matéria-prima</th><th>Solicitado</th><th>Enviado</th><th>Disponível</th><th>Média mensal</th><th>Previsão 30 dias</th><th>Compra sugerida</th><th>Custo estimado</th>${compact?'':'<th>Ação</th>'}</tr></thead><tbody>${materials.map(item=>`<tr><td><b>${esc(item.product.name)}</b><small>${esc(item.product.unit)} · prazo ${item.leadDays} dias${item.product.usage_scope==='shared'?' · Uso compartilhado':''}</small></td><td>${qty(item.requested,item.product.unit)}</td><td>${qty(item.delivered,item.product.unit)}</td><td>${qty(item.available,item.product.unit)}</td><td>${qty(item.monthly,item.product.unit)}</td><td>${qty(item.forecast30,item.product.unit)}</td><td><strong class="${item.suggested>0?'need-buy':''}">${qty(item.suggested,item.product.unit)}</strong></td><td>${currency(item.estimatedCost)}</td>${compact?'':`<td><button class="ghost compact-action" data-plan-product="${item.product.id}">Configurar</button></td>`}</tr>`).join('')||'<tr><td colspan="9" class="empty">Nenhum material encontrado.</td></tr>'}</tbody></table></div>`;
}

function peopleView(){
  const people=collaboratorReport();
  return `<section class="card intel-section"><div class="card-head"><div><p class="eyebrow">EQUIPE</p><h2>Consumo por colaboradora</h2></div><div class="actions"><button class="outline compact-action" id="exportPeople">Exportar Excel</button><button class="outline compact-action" id="printPeople">Salvar em PDF</button></div></div><div class="table-wrap"><table class="intel-table"><thead><tr><th>Colaboradora</th><th>Solicitações</th><th>Entregas</th><th>Itens solicitados</th><th>Material mais utilizado</th><th>Última solicitação</th><th></th></tr></thead><tbody>${people.map(entry=>`<tr><td><b>${esc(entry.person.full_name)}</b><small>${esc(entry.person.department||'Produção')}</small></td><td>${entry.requestCount}</td><td>${entry.deliveryCount}</td><td>${entry.items}</td><td>${esc(entry.topProduct)}</td><td>${entry.last?new Date(entry.last).toLocaleDateString('pt-BR'):'—'}</td><td><button class="ghost compact-action" data-person-detail="${entry.person.id}">Detalhar</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nenhuma colaboradora encontrada.</td></tr>'}</tbody></table></div></section>`;
}

function materialsView(){const scope=BI.tab==='ecommerce'?'ecommerce':'production',label=scope==='ecommerce'?'SUPRIMENTOS DO E-COMMERCE':'MATÉRIAS-PRIMAS';return `<section class="card intel-section"><div class="card-head"><div><p class="eyebrow">${label}</p><h2>Consumo, estoque e previsão</h2></div><div class="actions"><button class="outline compact-action" id="exportMaterials">Exportar Excel</button><button class="outline compact-action" id="printMaterials">Salvar em PDF</button></div></div>${materialTable(materialReport(filteredRows(),scope))}</section>`}

function suppliersView(){
  return `<section class="intel-supplier-head"><div><p class="eyebrow">FORNECEDORES</p><h2>Parceiros de abastecimento</h2><span>Custos, prazos e materiais fornecidos.</span></div><div class="actions"><button class="outline" id="newSupplierProduct">Vincular produto</button><button class="primary" id="newSupplier">＋ Novo fornecedor</button></div></section><div class="supplier-grid">${BI.suppliers.map(supplier=>{const links=BI.supplierProducts.filter(link=>link.supplier_id===supplier.id);return `<article class="card supplier-card"><div><span class="badge ${supplier.active?'active':'inactive'}">${supplier.active?'Ativo':'Inativo'}</span><h3>${esc(supplier.name)}</h3><p>${esc(supplier.contact_name||'Contato não informado')}</p></div><dl><div><dt>Prazo médio</dt><dd>${supplier.lead_time_days} dias</dd></div><div><dt>Pedido mínimo</dt><dd>${currency(supplier.minimum_order_value)}</dd></div><div><dt>Materiais</dt><dd>${links.length}</dd></div></dl><small>${esc(supplier.phone||supplier.email||supplier.website||'Sem contato cadastrado')}</small><div class="actions"><button class="ghost compact-action" data-edit-supplier="${supplier.id}">Editar</button><button class="danger compact-action" data-delete-supplier="${supplier.id}">Excluir</button></div></article>`}).join('')||'<div class="empty">Nenhum fornecedor cadastrado.</div>'}</div><section class="card intel-section"><div class="card-head"><h2>Produtos por fornecedor</h2></div><div class="table-wrap"><table class="intel-table"><thead><tr><th>Fornecedor</th><th>Produto</th><th>Último custo</th><th>Quantidade mínima</th><th>Prazo</th><th>Preferencial</th><th></th></tr></thead><tbody>${BI.supplierProducts.map(link=>{const supplier=BI.suppliers.find(item=>item.id===link.supplier_id),product=S.products.find(item=>item.id===link.product_id);return `<tr><td>${esc(supplier?.name||'—')}</td><td><b>${esc(product?.name||'—')}</b><small>${esc(link.supplier_sku||'Sem código')}</small></td><td>${currency(link.last_unit_cost)}</td><td>${qty(link.minimum_order_quantity,product?.unit)}</td><td>${link.lead_time_days||supplier?.lead_time_days||30} dias</td><td>${link.is_preferred?'★ Sim':'Não'}</td><td><div class="actions"><button class="ghost compact-action" data-edit-supplier-product="${link.id}">Editar</button><button class="danger compact-action" data-delete-supplier-product="${link.id}">Excluir</button></div></td></tr>`}).join('')||'<tr><td colspan="7" class="empty">Nenhum produto vinculado.</td></tr>'}</tbody></table></div></section>`;
}

function purchasesView(){
  const labels={draft:'Rascunho',ordered:'Enviado ao fornecedor',received:'Recebido',cancelled:'Cancelado'};
  return `<section class="card intel-section"><div class="card-head"><div><p class="eyebrow">COMPRAS</p><h2>Pedidos aos fornecedores</h2></div><button class="primary" id="newPurchase">＋ Novo pedido</button></div><div class="purchase-list">${BI.orders.map(order=>{const supplier=BI.suppliers.find(item=>item.id===order.supplier_id),items=BI.orderItems.filter(item=>item.purchase_order_id===order.id);return `<article><div><small>PEDIDO</small><b>#${String(order.protocol).padStart(4,'0')}</b></div><div><strong>${esc(supplier?.name||'Fornecedor')}</strong><small>${items.length} materiais · ${currency(order.total_value)}</small></div><div><small>PREVISÃO</small><b>${order.expected_at?new Date(order.expected_at).toLocaleDateString('pt-BR'):'Não definida'}</b></div><span class="badge purchase-${order.status}">${labels[order.status]||order.status}</span><div class="actions">${order.status==='draft'?`<button class="outline compact-action" data-order-purchase="${order.id}">Enviar pedido</button>`:''}${order.status==='ordered'?`<button class="primary compact-action" data-receive-purchase="${order.id}">Confirmar recebimento</button>`:''}${['draft','ordered'].includes(order.status)?`<button class="danger compact-action" data-cancel-purchase="${order.id}">Cancelar</button>`:''}</div></article>`}).join('')||'<div class="empty">Nenhum pedido de compra registrado.</div>'}</div></section>`;
}

function ideaAuthor(idea){return S.team.find(person=>person.id===idea.created_by)?.full_name||'Administradora'}
function ideaEventText(event){
  if(event.event_type==='created')return'Ideia criada';
  if(event.event_type==='status_changed')return`Status alterado de ${ideaStatusLabels[event.from_status]||event.from_status||'—'} para ${ideaStatusLabels[event.to_status]||event.to_status}`;
  return'Informações atualizadas';
}
function buildIdeaPrompt(idea){
  return `Analise esta proposta de melhoria para o Harmony Store. Verifique impacto nas funcionalidades existentes, segurança, banco de dados, experiência no celular, riscos e apresente um plano antes de implementar.

IDEIA #${String(idea.protocol).padStart(4,'0')} — ${idea.title}
Área: ${ideaAreaLabels[idea.area]||idea.area}
Prioridade: ${ideaPriorityLabels[idea.priority]||idea.priority}
Status atual: ${ideaStatusLabels[idea.status]||idea.status}

Descrição:
${idea.description}

Problema que pretende resolver:
${idea.problem||'Não informado.'}

Observações da análise:
${idea.review_notes||'Nenhuma observação registrada.'}

Antes de qualquer alteração:
1. Preserve todas as funcionalidades e regras que já estão corretas.
2. Avalie arquitetura, Supabase, permissões, segurança, desempenho e responsividade.
3. Liste benefícios, riscos e possíveis efeitos sobre outros módulos.
4. Apresente um plano por fases e os testes necessários.
5. Só implemente depois da aprovação do plano.`;
}

function ideasView(){
  return `<section class="idea-hero card"><div><p class="eyebrow">LABORATÓRIO HARMONY</p><h2>Ideias e Evolução</h2><p>Registre melhorias, acompanhe decisões e prepare cada proposta para uma análise organizada no Codex.</p></div><button class="primary" id="newIdea">＋ Registrar ideia</button></section><section class="idea-toolbar card"><label><span>Buscar</span><input id="ideaSearch" type="search" list="ideaSearchSuggestions" enterkeyhint="search" autocomplete="off" placeholder="Título, descrição, área ou autora" value="${esc(BI.ideaQuery)}"><datalist id="ideaSearchSuggestions">${BI.ideas.map(idea=>`<option value="${esc(idea.title)}"></option>`).join('')}</datalist></label><label><span>Status</span><select id="ideaStatus"><option value="">Todos</option>${Object.entries(ideaStatusLabels).map(([value,label])=>`<option value="${value}" ${BI.ideaStatus===value?'selected':''}>${label}</option>`).join('')}</select></label><small id="ideaResultCount" aria-live="polite"></small></section><div class="idea-grid">${BI.ideas.map(idea=>`<article class="card idea-card" data-idea-card="${idea.id}" data-idea-status="${idea.status}"><div class="idea-card-top"><span class="idea-number">#${String(idea.protocol).padStart(4,'0')}</span><div><span class="badge idea-status-${idea.status}">${ideaStatusLabels[idea.status]||idea.status}</span><span class="badge idea-priority-${idea.priority}">${ideaPriorityLabels[idea.priority]||idea.priority}</span></div></div><small>${esc(ideaAreaLabels[idea.area]||idea.area)} · ${esc(ideaAuthor(idea))}</small><h3>${esc(idea.title)}</h3><p>${esc(idea.description)}</p>${idea.attachment_path?'<span class="idea-attachment-label">📎 Imagem anexada</span>':''}<footer><time>${fmt(idea.updated_at)}</time><div class="actions"><button class="ghost compact-action" data-view-idea="${idea.id}">Visualizar</button><button class="outline compact-action" data-edit-idea="${idea.id}">Editar</button><button class="primary compact-action" data-prepare-idea="${idea.id}">Preparar para o Codex</button></div></footer></article>`).join('')||'<div class="empty card">Nenhuma ideia registrada. Use este espaço para construir as próximas evoluções do aplicativo.</div>'}</div>`;
}

function filterIdeaCards(){
  const input=document.querySelector('#ideaSearch'),select=document.querySelector('#ideaStatus'),count=document.querySelector('#ideaResultCount');
  if(!input||!select||!count)return;
  BI.ideaQuery=input.value;BI.ideaStatus=select.value;
  const term=String(input.value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();let visible=0;
  document.querySelectorAll('[data-idea-card]').forEach(card=>{
    const text=String(card.textContent||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    card.hidden=Boolean(term&&!text.includes(term)||select.value&&card.dataset.ideaStatus!==select.value);
    if(!card.hidden)visible++;
  });
  count.textContent=`${visible} ${visible===1?'ideia':'ideias'}`;
}

async function uploadIdeaAttachment(file){
  if(!file)return'';
  const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'},extension=types[file.type];
  if(!extension)throw Error('Envie uma imagem JPG, PNG ou WEBP.');
  if(file.size>3145728)throw Error('A imagem deve ter no máximo 3 MB.');
  const token=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path=`${S.profile.id}/${token}.${extension}`;
  const response=await storageFetch('/storage/v1/object/idea-attachments/'+encodedStoragePath(path),{method:'POST',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});
  if(!response.ok)throw Error('Não foi possível enviar a imagem da ideia.');
  return path;
}

async function deleteIdeaAttachment(path){
  if(!path)return;
  const response=await storageFetch('/storage/v1/object/idea-attachments/'+encodedStoragePath(path),{method:'DELETE'});
  if(!response.ok)throw Error('Não foi possível remover a imagem anterior.');
}

async function openIdeaAttachment(path,title){
  try{
    const response=await storageFetch('/storage/v1/object/authenticated/idea-attachments/'+encodedStoragePath(path));
    if(!response.ok)throw Error('Não foi possível abrir a imagem.');
    const url=URL.createObjectURL(await response.blob()),viewer=document.createElement('div');
    viewer.className='photo-lightbox';viewer.innerHTML=`<button type="button" aria-label="Fechar imagem">×</button><img src="${esc(url)}" alt="Anexo da ideia ${esc(title)}"><small>${esc(title)}</small>`;
    document.querySelector('#modal .modal')?.appendChild(viewer);
    viewer.querySelector('button').onclick=()=>{URL.revokeObjectURL(url);viewer.remove()};
    viewer.onclick=event=>{if(event.target===viewer){URL.revokeObjectURL(url);viewer.remove()}};
  }catch(error){alert(error.message)}
}

function ideaModal(idea={}){
  const editing=Boolean(idea.id);
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box large" id="ideaForm"><div class="modal-head"><div><p class="eyebrow">IDEIAS E EVOLUÇÃO</p><h2>${editing?'Editar ideia':'Registrar nova ideia'}</h2></div><button type="button" data-intel-close>×</button></div><div class="form idea-form"><label class="wide">Título da ideia<input name="title" maxlength="120" value="${esc(idea.title||'')}" placeholder="Ex.: Mostrar foto na separação do material" required></label><label>Área<select name="area">${Object.entries(ideaAreaLabels).map(([value,label])=>`<option value="${value}" ${(idea.area||'geral')===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Prioridade<select name="priority">${Object.entries(ideaPriorityLabels).map(([value,label])=>`<option value="${value}" ${(idea.priority||'medium')===value?'selected':''}>${label}</option>`).join('')}</select></label>${editing?`<label>Status<select name="status">${Object.entries(ideaStatusLabels).map(([value,label])=>`<option value="${value}" ${idea.status===value?'selected':''}>${label}</option>`).join('')}</select></label>`:''}<label class="wide">Descrição<textarea name="description" maxlength="5000" placeholder="Explique como a melhoria deve funcionar e para quem ela será útil." required>${esc(idea.description||'')}</textarea></label><label class="wide">Problema que pretende resolver<textarea name="problem" maxlength="3000" placeholder="O que acontece hoje e por que precisa melhorar?">${esc(idea.problem||'')}</textarea></label><label class="wide">Observações da análise<textarea name="review_notes" maxlength="3000" placeholder="Decisões, cuidados, dependências ou motivo da aprovação.">${esc(idea.review_notes||'')}</textarea></label><label class="wide idea-file">Imagem ou print<input name="attachment" type="file" accept="image/jpeg,image/png,image/webp"><small>Opcional · JPG, PNG ou WEBP · máximo de 3 MB</small></label>${idea.attachment_path?`<div class="wide current-idea-attachment"><span>📎 Esta ideia já possui uma imagem.</span><div class="actions"><button type="button" class="ghost" id="viewCurrentIdeaAttachment">Visualizar</button><label class="check"><input name="remove_attachment" type="checkbox">Remover ao salvar</label></div></div>`:''}<div class="form-actions"><button type="button" class="outline" data-intel-close>Cancelar</button><button class="primary">Salvar ideia</button></div></div></form></div>`;
  modalClose();
  const view=document.querySelector('#viewCurrentIdeaAttachment');if(view)view.onclick=()=>openIdeaAttachment(idea.attachment_path,idea.title);
  document.querySelector('#ideaForm').onsubmit=async event=>{
    event.preventDefault();const button=event.submitter,f=new FormData(event.target),file=event.target.attachment.files[0],remove=f.get('remove_attachment')==='on';let uploaded='';
    const data={title:String(f.get('title')||'').trim(),description:String(f.get('description')||'').trim(),problem:String(f.get('problem')||'').trim()||null,area:f.get('area'),priority:f.get('priority'),status:editing?f.get('status'):'new',review_notes:String(f.get('review_notes')||'').trim()||null,attachment_path:remove?null:idea.attachment_path||null};
    if(data.title.length<3||data.description.length<10)return alert('Informe um título e descreva a ideia com pelo menos 10 caracteres.');
    button.disabled=true;
    try{
      if(file){uploaded=await uploadIdeaAttachment(file);data.attachment_path=uploaded}
      if(!editing)data.created_by=S.profile.id;
      await rest(editing?'improvement_ideas?id=eq.'+idea.id:'improvement_ideas',{method:editing?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(data)});
      if(idea.attachment_path&&(remove||uploaded))await deleteIdeaAttachment(idea.attachment_path).catch(()=>{});
      await refreshIntelligence(editing?'Ideia atualizada.':'Ideia registrada.');
    }catch(error){if(uploaded)await deleteIdeaAttachment(uploaded).catch(()=>{});alert(error.message);button.disabled=false}
  };
}

function ideaDetailModal(idea){
  const events=BI.ideaEvents.filter(event=>event.idea_id===idea.id);
  document.querySelector('#modal').innerHTML=`<div class="modal"><div class="modal-box large"><div class="modal-head"><div><p class="eyebrow">IDEIA #${String(idea.protocol).padStart(4,'0')}</p><h2>${esc(idea.title)}</h2></div><button type="button" data-intel-close>×</button></div><div class="idea-detail"><section><div class="idea-detail-badges"><span class="badge idea-status-${idea.status}">${ideaStatusLabels[idea.status]}</span><span class="badge idea-priority-${idea.priority}">Prioridade ${ideaPriorityLabels[idea.priority]}</span><span>${esc(ideaAreaLabels[idea.area])}</span></div><h3>Como deve funcionar</h3><p>${esc(idea.description)}</p><h3>Problema que pretende resolver</h3><p>${esc(idea.problem||'Não informado.')}</p><h3>Observações da análise</h3><p>${esc(idea.review_notes||'Nenhuma observação registrada.')}</p>${idea.attachment_path?'<button class="outline" id="viewIdeaAttachment">📎 Visualizar imagem anexada</button>':''}<div class="actions idea-detail-actions"><button class="outline" id="editIdeaFromDetail">Editar ideia</button><button class="primary" id="prepareIdeaFromDetail">Preparar para o Codex</button></div></section><aside class="idea-history"><p class="eyebrow">HISTÓRICO</p>${events.map(event=>`<article><i></i><div><b>${esc(ideaEventText(event))}</b><small>${esc(S.team.find(person=>person.id===event.actor_id)?.full_name||'Sistema')} · ${fmt(event.created_at)}</small>${event.note?`<p>${esc(event.note)}</p>`:''}</div></article>`).join('')||'<div class="empty">Nenhum evento registrado.</div>'}</aside></div></div></div>`;
  modalClose();
  const attachment=document.querySelector('#viewIdeaAttachment');if(attachment)attachment.onclick=()=>openIdeaAttachment(idea.attachment_path,idea.title);
  document.querySelector('#editIdeaFromDetail').onclick=()=>ideaModal(idea);
  document.querySelector('#prepareIdeaFromDetail').onclick=()=>prepareIdeaModal(idea);
}

async function copyIdeaPrompt(text){
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return}
  const area=document.querySelector('#codexIdeaPrompt');area.focus();area.select();document.execCommand('copy');
}

function prepareIdeaModal(idea){
  const prompt=buildIdeaPrompt(idea);
  document.querySelector('#modal').innerHTML=`<div class="modal"><div class="modal-box codex-preparation"><div class="modal-head"><div><p class="eyebrow">PRONTO PARA ANÁLISE</p><h2>Ideia preparada para o Codex</h2></div><button type="button" data-intel-close>×</button></div><p>O texto abaixo reúne a ideia, os cuidados do projeto e o pedido de planejamento antes da implementação.</p><textarea id="codexIdeaPrompt" readonly>${esc(prompt)}</textarea><div class="info" id="codexCopyStatus">Copiando o texto para você…</div><div class="form-actions"><button type="button" class="outline" id="copyIdeaPrompt">Copiar novamente</button><button type="button" class="primary" id="openCodex">Abrir o Codex</button></div></div></div>`;
  modalClose();
  const copy=async()=>{try{await copyIdeaPrompt(prompt);document.querySelector('#codexCopyStatus').textContent='✓ Texto copiado. Agora é só colar na conversa do Codex.'}catch{document.querySelector('#codexCopyStatus').textContent='Selecione o texto e use a opção Copiar.'}};
  document.querySelector('#copyIdeaPrompt').onclick=copy;
  document.querySelector('#openCodex').onclick=()=>window.open('https://chatgpt.com/codex','_blank','noopener,noreferrer');
  copy();
}

async function renderIntelligence(){
  const page=document.querySelector('#page');if(!page||S.view!=='intelligence')return;
  page.dataset.intelligence='true';
  page.innerHTML='<div class="loading-inline">Preparando relatórios e métricas…</div>';
  await loadIntelligence();
  if(S.view!=='intelligence')return;
  if(BI.error){page.innerHTML=`<div class="page">${head('INTELIGÊNCIA','Relatórios e planejamento','A nova área está isolada das funções atuais.')}<section class="card intelligence-error"><h2>Atualização do banco necessária</h2><p>Execute primeiro o arquivo <b>008_consumption_intelligence.sql</b> no SQL Editor do Supabase. O restante do aplicativo continua funcionando normalmente.</p><small>${esc(BI.error)}</small></section></div>`;return}
  const area=areaForTab(BI.tab),headings={dashboard:['CENTRAL DE INTELIGÊNCIA','Decisões guiadas por dados reais','Estatísticas ao vivo, gráficos do Inventário e recomendações da IA em uma única visão.'],shopee:['INTELIGÊNCIA DE E-COMMERCE','Shopee Analytics','Relatórios oficiais, funil, marketing, promoções e IA sem misturar os cadastros operacionais.'],operation:['INTELIGÊNCIA OPERACIONAL','Relatórios organizados por assunto','Consulte consumo, equipe, produção e qualidade sem misturar informações.'],supply:['COMPRAS E PARCEIROS','Planejamento de abastecimento','Pedidos, fornecedores e sugestões de reposição em um só lugar.'],ideas:['INTELIGÊNCIA E EVOLUÇÃO','Um espaço para construir o futuro','Registre, analise e acompanhe melhorias sem perder nenhuma decisão.']};
  const [eyebrow,title,description]=headings[area];
  const filters=['operations','materials','ecommerce','people','production'].includes(BI.tab);
  const view=BI.tab==='overview'?overviewView():BI.tab==='shopee'?shopeeView():BI.tab==='operations'?operationOverviewView():BI.tab==='people'?peopleView():['materials','ecommerce'].includes(BI.tab)?materialsView():BI.tab==='production'?productionPlanView():BI.tab==='quality'?dataQualityView():BI.tab==='suppliers'?suppliersView():BI.tab==='purchases'?purchasesView():BI.tab==='planning'?purchasePlanningView():ideasView();
  page.innerHTML=`<div class="page intelligence-page">${head(eyebrow,title,description)}${tabBar()}${subTabBar()}${filters?filterBar():''}<div id="intelContent">${view}</div></div>`;
  bindIntelligence();
}

function rerender(){const page=document.querySelector('#page');if(page)delete page.dataset.intelligence;renderIntelligence()}

function bindIntelligence(){
  document.querySelectorAll('[data-intel-area]').forEach(button=>button.onclick=()=>{const area=button.dataset.intelArea;if(area==='dashboard')BI.tab='overview';else if(area==='shopee')BI.tab='shopee';else if(area==='operation'&&!operationTabs.has(BI.tab))BI.tab='operations';else if(area==='supply'&&!supplyTabs.has(BI.tab))BI.tab='purchases';else if(area==='ideas')BI.tab='ideas';rerender()});
  document.querySelectorAll('[data-intel-subtab]').forEach(button=>button.onclick=()=>{const tab=button.dataset.intelSubtab;if(['materials','ecommerce'].includes(tab)&&tab!==BI.tab)BI.productId='';BI.tab=tab;rerender()});
  const newIdea=document.querySelector('#newIdea');if(newIdea)newIdea.onclick=()=>ideaModal();
  document.querySelectorAll('[data-view-idea]').forEach(button=>button.onclick=()=>ideaDetailModal(BI.ideas.find(idea=>idea.id===button.dataset.viewIdea)));
  document.querySelectorAll('[data-edit-idea]').forEach(button=>button.onclick=()=>ideaModal(BI.ideas.find(idea=>idea.id===button.dataset.editIdea)));
  document.querySelectorAll('[data-prepare-idea]').forEach(button=>button.onclick=()=>prepareIdeaModal(BI.ideas.find(idea=>idea.id===button.dataset.prepareIdea)));
  const ideaSearch=document.querySelector('#ideaSearch'),ideaStatus=document.querySelector('#ideaStatus');
  if(ideaSearch){ideaSearch.oninput=filterIdeaCards;ideaSearch.onsearch=filterIdeaCards;ideaSearch.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();filterIdeaCards()}};ideaStatus.onchange=filterIdeaCards;filterIdeaCards()}
  const apply=document.querySelector('#applyIntel');if(apply)apply.onclick=async()=>{const period=document.querySelector('#intelPeriod').value;if(period!=='custom')setDefaultPeriod(period);else{BI.period='custom';BI.from=document.querySelector('#intelFrom').value;BI.to=document.querySelector('#intelTo').value}BI.profileId=document.querySelector('#intelPerson').value;BI.productId=document.querySelector('#intelProduct')?.value||'';apply.disabled=true;try{await loadOperationalIntelligence(true);rerender()}catch(error){alert(error.message);apply.disabled=false}};
  document.querySelectorAll('[data-person-detail]').forEach(button=>button.onclick=()=>{BI.profileId=button.dataset.personDetail;BI.tab='operations';rerender()});
  document.querySelectorAll('[data-plan-product]').forEach(button=>button.onclick=()=>productPlanningModal(S.products.find(product=>product.id===button.dataset.planProduct)));
  document.querySelectorAll('[data-edit-supplier]').forEach(button=>button.onclick=()=>supplierModal(BI.suppliers.find(item=>item.id===button.dataset.editSupplier)));
  document.querySelectorAll('[data-delete-supplier]').forEach(button=>button.onclick=()=>deleteSupplier(button.dataset.deleteSupplier));
  document.querySelectorAll('[data-edit-supplier-product]').forEach(button=>button.onclick=()=>supplierProductModal(BI.supplierProducts.find(item=>item.id===button.dataset.editSupplierProduct)));
  document.querySelectorAll('[data-delete-supplier-product]').forEach(button=>button.onclick=()=>deleteSupplierProduct(button.dataset.deleteSupplierProduct));
  document.querySelectorAll('[data-order-purchase]').forEach(button=>button.onclick=()=>changePurchase('admin_mark_purchase_order_ordered',button.dataset.orderPurchase,'Pedido enviado ao fornecedor.'));
  document.querySelectorAll('[data-receive-purchase]').forEach(button=>button.onclick=()=>receivePurchase(button.dataset.receivePurchase));
  document.querySelectorAll('[data-cancel-purchase]').forEach(button=>button.onclick=()=>cancelPurchase(button.dataset.cancelPurchase));
  const newSupplier=document.querySelector('#newSupplier');if(newSupplier)newSupplier.onclick=()=>supplierModal();
  const newSupplierProduct=document.querySelector('#newSupplierProduct');if(newSupplierProduct)newSupplierProduct.onclick=()=>supplierProductModal();
  const newPurchase=document.querySelector('#newPurchase');if(newPurchase)newPurchase.onclick=()=>purchaseModal();
  const suggested=document.querySelector('#newSuggestedPurchase');if(suggested)suggested.onclick=()=>purchaseModal(materialReport(filteredRows()).filter(item=>item.product.usage_scope!=='ecommerce'&&item.suggested>0));
  const openOrders=document.querySelector('#openProductionOrders');if(openOrders)openOrders.onclick=()=>{S.view='production-orders';renderApp()};
  document.querySelectorAll('[data-quality-target]').forEach(button=>button.onclick=()=>{const target=button.dataset.qualityTarget;if(target==='suppliers'){BI.tab='suppliers';rerender();return}if(target==='production'){BI.tab='production';rerender();return}S.view=target;renderApp()});
  ['exportIntel','exportMaterials'].forEach(id=>{const button=document.querySelector('#'+id);if(button)button.onclick=()=>exportMaterials()});
  const exportProduction=document.querySelector('#exportProductionPlan');if(exportProduction)exportProduction.onclick=()=>exportProductionPlan();
  const exportPeople=document.querySelector('#exportPeople');if(exportPeople)exportPeople.onclick=()=>exportCollaborators();
  ['printIntel','printMaterials','printPeople'].forEach(id=>{const button=document.querySelector('#'+id);if(button)button.onclick=()=>window.HarmonyPrint.printCurrentDocument('intelligence-printing')});
}

async function refreshIntelligence(message){BI.loaded=false;await loadIntelligence(true);document.querySelector('#modal').innerHTML='';rerender();if(message)toast(message)}

function modalClose(){document.querySelectorAll('[data-intel-close]').forEach(button=>button.onclick=()=>document.querySelector('#modal').innerHTML='')}

function supplierModal(supplier={}){
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box" id="supplierForm"><div class="modal-head"><div><p class="eyebrow">FORNECEDOR</p><h2>${supplier.id?'Editar fornecedor':'Novo fornecedor'}</h2></div><button type="button" data-intel-close>×</button></div><div class="form"><label>Nome da empresa<input name="name" value="${esc(supplier.name||'')}" required></label><label>CNPJ/CPF<input name="document" value="${esc(supplier.document||'')}"></label><label>Contato<input name="contact_name" value="${esc(supplier.contact_name||'')}"></label><label>Telefone<input name="phone" value="${esc(supplier.phone||'')}"></label><label>E-mail<input name="email" type="email" value="${esc(supplier.email||'')}"></label><label>Site<input name="website" value="${esc(supplier.website||'')}"></label><label>Prazo médio (dias)<input name="lead_time_days" type="number" min="1" max="365" value="${supplier.lead_time_days||30}" required></label><label>Pedido mínimo (R$)<input name="minimum_order_value" type="number" min="0" step=".01" value="${supplier.minimum_order_value||0}"></label><label class="check"><input name="active" type="checkbox" ${supplier.active!==false?'checked':''}>Fornecedor ativo</label><label class="wide">Observações<textarea name="notes">${esc(supplier.notes||'')}</textarea></label><div class="form-actions"><button type="button" class="outline" data-intel-close>Cancelar</button><button class="primary">Salvar fornecedor</button></div></div></form></div>`;
  modalClose();document.querySelector('#supplierForm').onsubmit=async event=>{event.preventDefault();const f=new FormData(event.target),data={name:f.get('name').trim(),document:f.get('document')||null,contact_name:f.get('contact_name')||null,phone:f.get('phone')||null,email:f.get('email')||null,website:f.get('website')||null,lead_time_days:n(f.get('lead_time_days')),minimum_order_value:n(f.get('minimum_order_value')),notes:f.get('notes')||null,active:f.get('active')==='on'};if(!supplier.id)data.created_by=S.profile.id;try{await rest(supplier.id?'suppliers?id=eq.'+supplier.id:'suppliers',{method:supplier.id?'PATCH':'POST',body:JSON.stringify(data)});await refreshIntelligence('Fornecedor salvo.')}catch(error){alert(error.message)}};
}

async function deleteSupplier(id){if(!confirm('Excluir este fornecedor?'))return;try{await rest('suppliers?id=eq.'+id,{method:'DELETE'});await refreshIntelligence('Fornecedor excluído.')}catch(error){alert('Não é possível excluir um fornecedor vinculado a compras. Você pode deixá-lo inativo. '+error.message)}}

function supplierProductModal(link={}){
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box" id="supplierProductForm"><div class="modal-head"><div><p class="eyebrow">ABASTECIMENTO</p><h2>Produto do fornecedor</h2></div><button type="button" data-intel-close>×</button></div><div class="form"><label>Fornecedor<select name="supplier_id" required><option value="">Selecione</option>${BI.suppliers.filter(item=>item.active||item.id===link.supplier_id).map(item=>`<option value="${item.id}" ${item.id===link.supplier_id?'selected':''}>${esc(item.name)}</option>`).join('')}</select></label><label>Matéria-prima<select name="product_id" required><option value="">Selecione</option>${S.products.map(item=>`<option value="${item.id}" ${item.id===link.product_id?'selected':''}>${esc(item.name)} (${esc(item.unit)})</option>`).join('')}</select></label><label>Código no fornecedor<input name="supplier_sku" value="${esc(link.supplier_sku||'')}"></label><label>Último custo unitário<input name="last_unit_cost" type="number" min="0" step=".0001" value="${link.last_unit_cost||0}"></label><label>Quantidade mínima<input name="minimum_order_quantity" type="number" min="0" step=".001" value="${link.minimum_order_quantity||0}"></label><label>Prazo específico (dias)<input name="lead_time_days" type="number" min="1" max="365" value="${link.lead_time_days||''}"></label><label class="check"><input name="is_preferred" type="checkbox" ${link.is_preferred?'checked':''}>Fornecedor preferencial deste produto</label><div class="form-actions"><button type="button" class="outline" data-intel-close>Cancelar</button><button class="primary">Salvar vínculo</button></div></div></form></div>`;
  modalClose();document.querySelector('#supplierProductForm').onsubmit=async event=>{event.preventDefault();const f=new FormData(event.target),data={supplier_id:f.get('supplier_id'),product_id:f.get('product_id'),supplier_sku:f.get('supplier_sku')||null,last_unit_cost:n(f.get('last_unit_cost')),minimum_order_quantity:n(f.get('minimum_order_quantity')),lead_time_days:f.get('lead_time_days')?n(f.get('lead_time_days')):null,is_preferred:f.get('is_preferred')==='on'};try{if(data.is_preferred)await rest('supplier_products?product_id=eq.'+data.product_id,{method:'PATCH',body:JSON.stringify({is_preferred:false})});await rest(link.id?'supplier_products?id=eq.'+link.id:'supplier_products?on_conflict=supplier_id,product_id',{method:link.id?'PATCH':'POST',headers:link.id?{}:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(data)});await refreshIntelligence('Produto vinculado ao fornecedor.')}catch(error){alert(error.message)}};
}

async function deleteSupplierProduct(id){if(!confirm('Remover este vínculo de fornecimento?'))return;try{await rest('supplier_products?id=eq.'+id,{method:'DELETE'});await refreshIntelligence('Vínculo removido.')}catch(error){alert(error.message)}}

function productPlanningModal(product){
  if(!product)return;document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box" id="planningForm"><div class="modal-head"><div><p class="eyebrow">PLANEJAMENTO</p><h2>${esc(product.name)}</h2></div><button type="button" data-intel-close>×</button></div><div class="form"><label>Estoque de segurança (${esc(product.unit)})<input name="safety_stock" type="number" min="0" step=".001" value="${product.safety_stock||product.minimum_stock||0}"></label><label>Prazo padrão de reposição (dias)<input name="lead_time_days" type="number" min="1" max="365" value="${product.lead_time_days||30}"></label><label>Custo unitário de referência<input name="unit_cost" type="number" min="0" step=".0001" value="${product.unit_cost||0}"></label><div class="form-actions"><button type="button" class="outline" data-intel-close>Cancelar</button><button class="primary">Salvar parâmetros</button></div></div></form></div>`;modalClose();document.querySelector('#planningForm').onsubmit=async event=>{event.preventDefault();const f=new FormData(event.target);try{await rpc('admin_update_product_planning',{p_product_id:product.id,p_safety_stock:n(f.get('safety_stock')),p_lead_time_days:n(f.get('lead_time_days')),p_unit_cost:n(f.get('unit_cost'))});await loadData();await refreshIntelligence('Parâmetros de planejamento salvos.')}catch(error){alert(error.message)}};
}

function purchaseModal(suggestions=[]){
  const suggestedMap=new Map(suggestions.map(item=>[item.product.id,item]));
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box large" id="purchaseForm"><div class="modal-head"><div><p class="eyebrow">PEDIDO DE COMPRA</p><h2>Novo pedido ao fornecedor</h2></div><button type="button" data-intel-close>×</button></div><div class="form"><label>Fornecedor<select name="supplier_id" required><option value="">Selecione</option>${BI.suppliers.filter(item=>item.active).map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select><small class="field-help">A lista abaixo mostrará somente as matérias-primas vinculadas.</small></label><label>Previsão de entrega<input name="expected_at" type="date"></label><label class="wide">Observações<textarea name="notes" placeholder="Condições, orçamento ou referência do fornecedor"></textarea></label></div><div class="purchase-builder"><div class="purchase-builder-head"><b>Matéria-prima</b><b>Quantidade</b><b>Custo unitário</b></div><div class="empty" id="purchaseSupplierHint">Selecione um fornecedor para carregar suas matérias-primas.</div>${S.products.filter(product=>product.active).map(product=>{const suggestion=suggestedMap.get(product.id),link=preferredLink(product.id),cost=n(link?.last_unit_cost)||n(product.unit_cost);return `<label class="purchase-builder-row" data-buy-row="${product.id}" hidden><span><input type="checkbox" data-buy-check="${product.id}"><b>${esc(product.name)}</b><small>${esc(product.unit)}</small></span><input data-buy-qty="${product.id}" type="number" min="0" step=".001" value="${suggestion?.suggested||0}"><input data-buy-cost="${product.id}" type="number" min="0" step=".0001" value="${cost}"></label>`}).join('')}</div><div class="form-actions"><button type="button" class="outline" data-intel-close>Cancelar</button><button class="primary">Salvar rascunho</button></div></form></div>`;
  const form=document.querySelector('#purchaseForm'),supplierSelect=form.querySelector('[name="supplier_id"]'),hint=document.querySelector('#purchaseSupplierHint');
  const filterProducts=()=>{const supplierId=supplierSelect.value,links=linksForSupplier(supplierId),allowed=new Map(links.map(link=>[link.product_id,link]));let visible=0;document.querySelectorAll('[data-buy-row]').forEach(row=>{const productId=row.dataset.buyRow,link=allowed.get(productId),show=Boolean(link);row.hidden=!show;const check=row.querySelector('[data-buy-check]');if(!show){check.checked=false;return}visible++;check.checked=suggestedMap.has(productId);const cost=row.querySelector('[data-buy-cost]'),product=S.products.find(item=>item.id===productId);cost.value=n(link.last_unit_cost)||n(product?.unit_cost)});hint.hidden=Boolean(visible);hint.textContent=supplierId?'Nenhuma matéria-prima está vinculada a este fornecedor. Edite o produto ou crie o vínculo na aba Fornecedores.':'Selecione um fornecedor para carregar suas matérias-primas.'};
  supplierSelect.onchange=filterProducts;filterProducts();
  modalClose();form.onsubmit=async event=>{event.preventDefault();const f=new FormData(event.target),items=[...document.querySelectorAll('[data-buy-check]:checked')].map(check=>({product_id:check.dataset.buyCheck,quantity:n(document.querySelector(`[data-buy-qty="${check.dataset.buyCheck}"]`).value),unit_cost:n(document.querySelector(`[data-buy-cost="${check.dataset.buyCheck}"]`).value)})).filter(item=>item.quantity>0);if(!items.length)return alert('Este fornecedor não possui materiais selecionados com quantidade maior que zero.');try{await rpc('admin_create_purchase_order',{p_supplier_id:f.get('supplier_id'),p_expected_at:f.get('expected_at')||null,p_notes:f.get('notes')||null,p_items:items});await refreshIntelligence('Rascunho de compra criado.')}catch(error){alert(error.message)}};
}

async function changePurchase(functionName,id,message){try{await rpc(functionName,{p_order_id:id});await refreshIntelligence(message)}catch(error){alert(error.message)}}
async function receivePurchase(id){if(!confirm('Confirmar o recebimento? As quantidades serão adicionadas ao estoque físico.'))return;await changePurchase('admin_receive_purchase_order',id,'Compra recebida e estoque atualizado.')}
async function cancelPurchase(id){if(!confirm('Cancelar este pedido de compra?'))return;await changePurchase('admin_cancel_purchase_order',id,'Pedido de compra cancelado.')}

function downloadCsv(name,headers,rows){const clean=value=>`"${String(value??'').replaceAll('"','""')}"`,content='\ufeff'+[headers,...rows].map(row=>row.map(clean).join(';')).join('\r\n'),url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=name;link.hidden=true;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function exportMaterials(){const scope=BI.tab==='ecommerce'?'ecommerce':'production',rows=materialReport(filteredRows(),scope);downloadCsv(`harmony-${scope}-${BI.from}-${BI.to}.csv`,['Material','Unidade','Solicitado','Enviado','Disponível','Média mensal','Previsão 30 dias','Compra sugerida','Custo estimado'],rows.map(item=>[item.product.name,item.product.unit,round(item.requested),round(item.delivered),item.available,item.monthly,item.forecast30,item.suggested,item.estimatedCost.toFixed(2)]))}
function exportCollaborators(){const rows=collaboratorReport();downloadCsv(`harmony-colaboradoras-${BI.from}-${BI.to}.csv`,['Colaboradora','Solicitações','Entregas','Itens','Material mais utilizado','Última solicitação'],rows.map(item=>[item.person.full_name,item.requestCount,item.deliveryCount,item.items,item.topProduct,item.last?new Date(item.last).toLocaleDateString('pt-BR'):'']))}
function exportProductionPlan(){const rows=productionPlanReport();downloadCsv(`harmony-planejado-recebido-${BI.from}-${BI.to}.csv`,['Colaboradora','Modelo','Cor','Planejado','Recebido','Saldo','Situação','Prazo'],rows.map(item=>[item.workerName,item.modelName,item.color,item.planned,item.received,item.balance,item.status,item.dueDate||'']))}

function ensureIntelligenceNav(){
  if(!S?.profile||S.profile.role!=='admin')return;
  const nav=document.querySelector('.sidebar nav'),profileButton=nav?.querySelector('[data-view="profile"]');if(!nav||!profileButton)return;
  let button=nav.querySelector('[data-view="intelligence"]');
  if(!button){button=document.createElement('button');button.className='nav';button.dataset.view='intelligence';button.innerHTML='<i>📊</i>Inteligência';profileButton.parentNode.insertBefore(button,profileButton);button.onclick=()=>{S.view='intelligence';renderApp()}}
  button.classList.toggle('active',S.view==='intelligence');
  if(S.view==='intelligence'){const page=document.querySelector('#page');if(page&&!page.dataset.intelligence)renderIntelligence()}
}

new MutationObserver(ensureIntelligenceNav).observe(document.body,{childList:true,subtree:true});
ensureIntelligenceNav();
window.HarmonyIntelligence=Object.freeze({state:BI,materialReport,collaboratorReport,productionPlanReport,dataQualityReport,filteredRows,setDefaultPeriod,productSupplyContext,savePreferredSupplier,linksForSupplier,buildIdeaPrompt,openTab:tab=>{BI.tab=tab;rerender()}});
})();
