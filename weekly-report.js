(()=>{
'use strict';

let weekOffset=0;
const allowed=()=>S.profile?.role==='admin';
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const number=value=>Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
const day=value=>value.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
const stamp=value=>new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
const rowDate=value=>new Date(value).toLocaleDateString('pt-BR');
const empty=message=>`<p class="weekly-empty">${esc(message)}</p>`;

function bounds(){
  const monday=new Date();
  monday.setHours(0,0,0,0);
  monday.setDate(monday.getDate()-((monday.getDay()+6)%7)-7*(weekOffset+1));
  const end=new Date(monday);
  end.setDate(end.getDate()+7);
  return {start:monday,end};
}

function period(path,column,start,end){
  return `${path}&${column}=gte.${encodeURIComponent(start.toISOString())}&${column}=lt.${encodeURIComponent(end.toISOString())}`;
}

async function requestItemsFor(requests){
  const items=[];
  for(let index=0;index<requests.length;index+=30){
    const ids=requests.slice(index,index+30).map(item=>item.id).join(',');
    items.push(...await restAll(`request_items?select=request_id,product_id,requested_quantity,approved_quantity,removed_by_admin&request_id=in.(${ids})`));
  }
  return items;
}

async function loadReport(start,end){
  const [requests,products,shortages,replenishments,movements,bills,receipts]=await Promise.all([
    restAll(period('requests?select=id,protocol,requested_by,status,created_at','created_at',start,end)),
    restAll('products?select=id,name,unit,physical_stock,reserved_stock,minimum_stock,usage_scope,active'),
    restAll(period('stock_discrepancies?select=product_id,discrepancy_type,recorded_at&discrepancy_type=eq.out_of_stock','recorded_at',start,end)),
    restAll('stock_replenishment_requests?select=product_id,requested_quantity,replenishment_type,status&status=in.(open,in_progress)'),
    restAll(period('stock_movements?select=product_id,movement_type,quantity,created_at','created_at',start,end)),
    restAll(period('bills?select=protocol,beneficiary_name,amount,paid_at,status&status=eq.paid','paid_at',start,end)),
    restAll(period('internal_purchase_receipts?select=protocol,merchant_name,total_value,purchased_at,status&status=eq.confirmed','purchased_at',start,end))
  ]);
  const items=await requestItemsFor(requests);
  return {requests,products,shortages,replenishments,movements,bills,receipts,items};
}

function reportHtml(data,start,end){
  const byId=new Map(data.products.map(product=>[String(product.id),product]));
  const inScope=id=>{const product=byId.get(String(id));return product&&product.usage_scope!=='ecommerce'};
  const items=data.items.filter(item=>inScope(item.product_id));
  const requestIds=new Set(items.map(item=>item.request_id));
  const requests=data.requests.filter(request=>requestIds.has(request.id));
  const shortages=data.shortages.filter(item=>inScope(item.product_id));
  const movements=data.movements.filter(item=>inScope(item.product_id));
  const replenishments=data.replenishments.filter(item=>inScope(item.product_id));
  const low=data.products.filter(product=>product.active&&product.usage_scope!=='ecommerce'&&Number(product.physical_stock)-Number(product.reserved_stock)<=Number(product.minimum_stock));
  const demand=new Map();
  for(const item of items)demand.set(String(item.product_id),(demand.get(String(item.product_id))||0)+Number(item.requested_quantity));
  const missing=new Map();
  for(const item of shortages)missing.set(String(item.product_id),(missing.get(String(item.product_id))||0)+1);
  const ranked=[...demand].sort((a,b)=>b[1]-a[1]);
  const missingRanked=[...missing].sort((a,b)=>b[1]-a[1]);
  const paidTotal=data.bills.reduce((sum,item)=>sum+Number(item.amount),0);
  const purchaseTotal=data.receipts.reduce((sum,item)=>sum+Number(item.total_value),0);
  const movementCounts=new Map();
  for(const item of movements)movementCounts.set(item.movement_type,(movementCounts.get(item.movement_type)||0)+1);
  const endDay=new Date(end);endDay.setDate(endDay.getDate()-1);
  const topDemand=ranked[0];
  const topShortage=missingRanked[0];
  const movementTypes=[['entry','Entradas'],['reserve','Reservas'],['release','Liberações'],['delivery','Entregas'],['adjustment','Ajustes']];
  const productName=id=>byId.get(String(id))?.name||'Produto não encontrado';
  const unit=id=>byId.get(String(id))?.unit||'';
  return `<div class='page weekly-report'>
    <header class='weekly-hero'><div class='weekly-hero-main'><p class='weekly-kicker'>HARMONY STORE · INTELIGÊNCIA OPERACIONAL</p><h1>Relatório da <em>semana.</em></h1><p class='weekly-period'>${day(start)} — ${day(endDay)}</p><p class='weekly-updated'>Leitura atualizada em ${stamp(Date.now())}</p></div><div class='weekly-hero-side'><div class='weekly-priority'><span>FOCO DA SEMANA</span><strong>${topShortage?esc(productName(topShortage[0])):low.length?`${number(low.length)} produtos para repor`:'Sem alertas de falta'}</strong><small>${topShortage?`${number(topShortage[1])} ocorrência(s) de falta registradas`:low.length?'Estoque abaixo do mínimo atual':'Nenhuma falta registrada na separação'}</small></div><div class='weekly-controls'><button class='outline' id='weeklyOlder'>← Semana anterior</button><button class='outline' id='weeklyNewer' ${weekOffset===0?'disabled':''}>Semana seguinte →</button></div></div></header>
    <div class='weekly-section-heading'><div><p>PAINEL EXECUTIVO</p><h2>O que importa nesta semana</h2></div><span>Abra uma área para consultar os registros detalhados.</span></div>
    <div class='weekly-dashboard-grid'>
      <section class='weekly-group weekly-group--production' data-weekly-group='production' role='button' tabindex='0' aria-label='Abrir detalhes de produção e solicitações'><div class='weekly-group-head'><span>01 / PRODUÇÃO</span><span class='weekly-group-arrow'>↗</span></div><h3>Solicitações & demanda</h3><div class='weekly-group-focus'><strong>${number(requests.length)}</strong><span>solicitações na semana</span></div><div class='weekly-group-insight'><small>PRODUTO MAIS SOLICITADO</small><b>${topDemand?esc(productName(topDemand[0])):'Sem solicitações'}</b><span>${topDemand?`${number(topDemand[1])} ${esc(unit(topDemand[0]))} solicitada(s)`:'Nenhum produto de produção no período'}</span></div><div class='weekly-group-footer'>Abrir solicitações e produtos pedidos <span>↗</span></div></section>
      <section class='weekly-group weekly-group--stock' data-weekly-group='stock' role='button' tabindex='0' aria-label='Abrir detalhes de estoque e faltas'><div class='weekly-group-head'><span>02 / ESTOQUE</span><span class='weekly-group-arrow'>↗</span></div><h3>Faltas & reposição</h3><div class='weekly-stock-metrics'><div><strong>${number(missingRanked.length)}</strong><span>produtos com falta na semana</span></div><div><strong>${number(low.length)}</strong><span>produtos para repor agora</span></div></div><div class='weekly-group-footer'>Abrir faltas, estoque e reposições <span>↗</span></div></section>
      <section class='weekly-group weekly-group--movement' data-weekly-group='movement' role='button' tabindex='0' aria-label='Abrir detalhes das movimentações de estoque'><div class='weekly-group-head'><span>03 / FLUXO</span><span class='weekly-group-arrow'>↗</span></div><h3>Movimentações de estoque</h3><div class='weekly-group-focus'><strong>${number(movements.length)}</strong><span>eventos na semana</span></div><div class='weekly-flow-track'>${movementTypes.map(([key])=>`<i style='width:${movements.length?Math.round((movementCounts.get(key)||0)/movements.length*100):0}%'></i>`).join('')}</div><div class='weekly-flow-legend'>${movementTypes.map(([key,label])=>`<span>${label} <b>${number(movementCounts.get(key)||0)}</b></span>`).join('')}</div><div class='weekly-group-footer'>Abrir histórico de movimentos <span>↗</span></div></section>
      <section class='weekly-group weekly-group--finance' data-weekly-group='finance' role='button' tabindex='0' aria-label='Abrir detalhes financeiros'><div class='weekly-group-head'><span>04 / FINANCEIRO</span><span class='weekly-group-arrow'>↗</span></div><h3>Pagamentos & compras</h3><div class='weekly-finance-summary'><div><small>BOLETOS PAGOS</small><strong>${money(paidTotal)}</strong><span>${number(data.bills.length)} pagamento(s)</span></div><div><small>COMPRAS REGISTRADAS</small><strong>${money(purchaseTotal)}</strong><span>${number(data.receipts.length)} cupom(ns)</span></div></div><p class='weekly-finance-caveat'>Compras registradas não comprovam quitação e não são somadas aos boletos.</p><div class='weekly-group-footer'>Abrir boletos e compras <span>↗</span></div></section>
    </div>
    <div class='weekly-disclosure'><span>COMO LER ESTE PAINEL</span><p>Marketplace não integra o relatório. Estoque e reposição mostram a situação atual, não uma fotografia histórica. Outras despesas ainda não possuem cadastro estruturado no app e não são estimadas como zero.</p></div>
    <dialog class='weekly-detail-dialog' id='weeklyDetail'><div class='weekly-detail-head'><div><span>VISÃO DETALHADA</span><h2 id='weeklyDetailTitle'></h2><p id='weeklyDetailNote'></p></div><button type='button' id='weeklyDetailClose' aria-label='Fechar detalhes'>×</button></div><div class='weekly-detail-tabs' id='weeklyDetailTabs' role='tablist'></div><div class='weekly-detail-body' id='weeklyDetailBody'></div></dialog>
  </div>`;
}

function weeklyDetailHtml(data,key){
  const byId=new Map(data.products.map(product=>[String(product.id),product]));
  const inScope=id=>{const product=byId.get(String(id));return product&&product.usage_scope!=='ecommerce'};
  const productName=id=>byId.get(String(id))?.name||'Produto não encontrado';
  const unit=id=>byId.get(String(id))?.unit||'';
  const scopedItems=data.items.filter(item=>inScope(item.product_id));
  const requestIds=new Set(scopedItems.map(item=>item.request_id));
  const requests=data.requests.filter(item=>requestIds.has(item.id));
  const text=value=>String(value??'');
  const table=(headers,rows)=>`<div class='weekly-detail-scroll'><table class='weekly-detail-table'><thead><tr>${headers.map(header=>`<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(cells=>`<tr>${cells.map(cell=>`<td>${esc(text(cell))}</td>`).join('')}</tr>`).join(''):`<tr><td colspan='${headers.length}'>Nenhum registro disponível neste período.</td></tr>`}</tbody></table></div>`;
  let title='';
  let note='';
  let headers=[];
  let rows=[];
  if(key==='requests'){
    title='Solicitações de produção';
    note='Inclui canceladas; marketplace não integra esta visão.';
    headers=['Solicitação','Data','Status','Produtos'];
    rows=requests.map(request=>['#'+text(request.protocol).padStart(4,'0'),rowDate(request.created_at),labels[request.status]||request.status,scopedItems.filter(item=>item.request_id===request.id).map(item=>productName(item.product_id)).join(', ')]);
  }else if(key==='demand'){
    title='Produtos solicitados';
    note='Quantidade solicitada por produto; unidades diferentes não são diretamente comparáveis.';
    headers=['Produto','Quantidade pedida','Unidade','Ocorrências de falta'];
    const totals=new Map();
    for(const item of scopedItems)totals.set(String(item.product_id),(totals.get(String(item.product_id))||0)+Number(item.requested_quantity));
    const missing=new Map();
    for(const item of data.shortages.filter(item=>inScope(item.product_id)))missing.set(String(item.product_id),(missing.get(String(item.product_id))||0)+1);
    rows=[...totals].sort((a,b)=>b[1]-a[1]).map(([id,qty])=>[productName(id),number(qty),unit(id),number(missing.get(id)||0)]);
  }else if(key==='shortages'){
    title='Faltas registradas';
    note='Cada linha corresponde a uma ocorrência registrada durante a separação.';
    headers=['Produto','Data da falta'];
    rows=data.shortages.filter(item=>inScope(item.product_id)).map(item=>[productName(item.product_id),rowDate(item.recorded_at)]);
  }else if(key==='stock'){
    title='Estoque para repor';
    note='Saldo disponível e mínimo consultados agora; não são dados históricos.';
    headers=['Produto','Físico','Reservado','Disponível','Mínimo'];
    rows=data.products.filter(product=>product.active&&product.usage_scope!=='ecommerce'&&Number(product.physical_stock)-Number(product.reserved_stock)<=Number(product.minimum_stock)).sort((a,b)=>Number(a.physical_stock)-Number(a.reserved_stock)-Number(a.minimum_stock)-(Number(b.physical_stock)-Number(b.reserved_stock)-Number(b.minimum_stock))).map(product=>[product.name,number(product.physical_stock)+' '+unit(product.id),number(product.reserved_stock)+' '+unit(product.id),number(Number(product.physical_stock)-Number(product.reserved_stock))+' '+unit(product.id),number(product.minimum_stock)+' '+unit(product.id)]);
  }else if(key==='replenishments'){
    title='Pedidos de reposição';
    note='Solicitações ainda abertas ou em andamento, conforme situação atual.';
    headers=['Produto','Quantidade pedida','Tipo','Status'];
    rows=data.replenishments.filter(item=>inScope(item.product_id)).map(item=>[productName(item.product_id),number(item.requested_quantity)+' '+unit(item.product_id),item.replenishment_type,item.status]);
  }else if(key==='movements'){
    title='Movimentações de estoque';
    note='Eventos registrados na semana; não representam valores financeiros.';
    headers=['Data','Tipo','Produto','Quantidade'];
    const names={entry:'Entrada',reserve:'Reserva',release:'Liberação',delivery:'Entrega',adjustment:'Ajuste'};
    rows=data.movements.filter(item=>inScope(item.product_id)).map(item=>[rowDate(item.created_at),names[item.movement_type]||item.movement_type,productName(item.product_id),number(item.quantity)+' '+unit(item.product_id)]);
  }else if(key==='bills'){
    title='Boletos pagos';
    note='Somente pagamentos marcados como confirmados na semana.';
    headers=['Boleto','Beneficiário','Pago em','Valor'];
    rows=data.bills.map(item=>['#'+text(item.protocol).padStart(4,'0'),item.beneficiary_name,rowDate(item.paid_at),money(item.amount)]);
  }else if(key==='receipts'){
    title='Compras internas registradas';
    note='Cupom registrado não comprova pagamento.';
    headers=['Compra','Fornecedor','Data','Valor'];
    rows=data.receipts.map(item=>['#'+text(item.protocol).padStart(4,'0'),item.merchant_name,rowDate(item.purchased_at),money(item.total_value)]);
  }
  return {title,note,html:table(headers,rows)};
}

async function renderReport(page){
  if(!allowed()){page.innerHTML='<div class="page"><div class="error">Acesso negado.</div></div>';return}
  const {start,end}=bounds();
  page.innerHTML='<div class="page weekly-report"><p class="eyebrow">RELATÓRIO SEMANAL</p><h1>Preparando a semana...</h1><p>Consultando dados administrativos, sem alterar registros.</p></div>';
  try{
    const data=await loadReport(start,end);
    if(!page.isConnected||S.view!=='weekly-report')return;
    page.innerHTML=reportHtml(data,start,end);
    page.querySelector('#weeklyOlder').onclick=()=>{weekOffset++;renderReport(page)};
    page.querySelector('#weeklyNewer').onclick=()=>{if(weekOffset>0){weekOffset--;renderReport(page)}};
    const dialog=page.querySelector('#weeklyDetail');
    const groups={
      production:[['requests','Solicitações'],['demand','Produtos pedidos']],
      stock:[['shortages','Faltas'],['stock','Estoque para repor'],['replenishments','Pedidos de reposição']],
      movement:[['movements','Movimentações']],
      finance:[['bills','Boletos pagos'],['receipts','Compras internas']]
    };
    const showDetail=(group,key)=>{
      const detail=weeklyDetailHtml(data,key);
      dialog.dataset.weeklyGroup=group;
      dialog.querySelector('#weeklyDetailTitle').textContent=detail.title;
      dialog.querySelector('#weeklyDetailNote').textContent=detail.note;
      dialog.querySelector('#weeklyDetailTabs').innerHTML=groups[group].map(([id,label])=>`<button type='button' role='tab' data-weekly-tab='${id}' aria-selected='${id===key}'>${label}</button>`).join('');
      dialog.querySelector('#weeklyDetailBody').innerHTML=detail.html;
      if(!dialog.open)dialog.showModal();
    };
    page.onclick=event=>{
      if(event.target.closest('#weeklyDetailClose')||event.target===dialog){dialog.close();return}
      const tab=event.target.closest('[data-weekly-tab]');
      if(tab){showDetail(dialog.dataset.weeklyGroup,tab.dataset.weeklyTab);return}
      const card=event.target.closest('[data-weekly-group]');
      if(card&&page.contains(card))showDetail(card.dataset.weeklyGroup,groups[card.dataset.weeklyGroup][0][0]);
    };
    page.onkeydown=event=>{
      if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-weekly-group]')){event.preventDefault();event.target.click()}
    };
  }catch(error){
    if(!page.isConnected||S.view!=='weekly-report')return;
    page.innerHTML=`<div class="page weekly-report"><p class="eyebrow">RELATÓRIO SEMANAL</p><h1>Não foi possível carregar</h1><div class="error">${esc(error.message)}</div><p>Nenhum dado foi interpretado como zero.</p><button class="outline" id="weeklyRetry">Tentar novamente</button></div>`;
    page.querySelector('#weeklyRetry').onclick=()=>renderReport(page);
  }
}

const previousRenderApp=renderApp;
renderApp=function(){
  const result=previousRenderApp();
  if(allowed()){
    const accountHeading=[...document.querySelectorAll('.sidebar nav small')].find(item=>item.textContent.trim()==='CONTA');
    if(accountHeading){
      accountHeading.insertAdjacentHTML('beforebegin',`<small>RELATÓRIOS</small>${nav('weekly-report','▥','Relatório semanal')}`);
      accountHeading.previousElementSibling.onclick=()=>{S.view='weekly-report';renderApp()};
    }
  }
  return result;
};
const previousRenderPage=renderPage;
renderPage=async function(){if(S.view==='weekly-report')return renderReport(document.querySelector('#page'));return previousRenderPage()};
})();
