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
const table=(headers,rows)=>`<div class="weekly-table-wrap"><table class="weekly-table"><thead><tr>${headers.map(label=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

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
  const byId=new Map(data.products.map(product=>[product.id,product]));
  const inScope=id=>{const product=byId.get(id);return product&&product.usage_scope!=='ecommerce'};
  const items=data.items.filter(item=>inScope(item.product_id));
  const requestIds=new Set(items.map(item=>item.request_id));
  const requests=data.requests.filter(request=>requestIds.has(request.id));
  const shortages=data.shortages.filter(item=>inScope(item.product_id));
  const movements=data.movements.filter(item=>inScope(item.product_id));
  const replenishments=data.replenishments.filter(item=>inScope(item.product_id));
  const low=data.products.filter(product=>product.active&&product.usage_scope!=='ecommerce'&&Number(product.physical_stock)-Number(product.reserved_stock)<=Number(product.minimum_stock));
  const demand=new Map();
  for(const item of items)demand.set(item.product_id,(demand.get(item.product_id)||0)+Number(item.requested_quantity));
  const missing=new Map();
  for(const item of shortages)missing.set(item.product_id,(missing.get(item.product_id)||0)+1);
  const ranked=[...demand].sort((a,b)=>b[1]-a[1]).slice(0,12);
  const missingRanked=[...missing].sort((a,b)=>b[1]-a[1]);
  const paidTotal=data.bills.reduce((sum,item)=>sum+Number(item.amount),0);
  const purchaseTotal=data.receipts.reduce((sum,item)=>sum+Number(item.total_value),0);
  const movementCounts=new Map();
  for(const item of movements)movementCounts.set(item.movement_type,(movementCounts.get(item.movement_type)||0)+1);
  const endDay=new Date(end);endDay.setDate(endDay.getDate()-1);
  const metric=(value,label,note)=>`<article class="weekly-metric"><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(note)}</small></article>`;
  const productName=id=>byId.get(id)?.name||'Produto não encontrado';
  return `<div class="page weekly-report">
    <div class="weekly-hero"><div><p class="eyebrow">RELATÓRIO OPERACIONAL</p><h1>Uma semana, uma visão clara.</h1><p>De ${day(start)} a ${day(endDay)}. Dados consultados em ${stamp(Date.now())}.</p></div><div class="weekly-controls"><button class="outline" id="weeklyOlder">Semana anterior</button><button class="outline" id="weeklyNewer" ${weekOffset===0?'disabled':''}>Semana seguinte</button></div></div>
    <div class="weekly-note">Somente dados administrativos de produção e suprimentos internos. Marketplace não integra este relatório. Estoque e pedidos de reposição refletem a situação atual, não uma fotografia histórica.</div>
    <div class="weekly-metrics">${metric(number(requests.length),'Solicitações recebidas','Produção, inclusive canceladas')}${metric(number(missingRanked.length),'Produtos com falta','Ocorrências registradas na semana')}${metric(money(paidTotal),'Boletos pagos',`${data.bills.length} pagamento(s) confirmado(s)`)}${metric(money(purchaseTotal),'Compras internas',`${data.receipts.length} registro(s), não quitação`)}</div>
    <div class="weekly-grid">
      <section class="card weekly-panel"><div class="weekly-panel-head"><h2>Mais solicitados</h2><small>Quantidade pedida na semana</small></div>${ranked.length?table(['Produto','Quantidade','Faltas'],ranked.map(([id,qty])=>`<tr><td>${esc(productName(id))}</td><td>${number(qty)} ${esc(byId.get(id)?.unit||'')}</td><td>${number(missing.get(id)||0)}</td></tr>`)):empty('Nenhum material de produção solicitado nesta semana.')}</section>
      <section class="card weekly-panel weekly-alert"><div class="weekly-panel-head"><h2>Solicitados e em falta</h2><small>Faltas registradas durante a separação</small></div>${missingRanked.length?table(['Produto','Ocorrências','Solicitado'],missingRanked.map(([id,count])=>`<tr><td>${esc(productName(id))}</td><td>${number(count)}</td><td>${number(demand.get(id)||0)} ${esc(byId.get(id)?.unit||'')}</td></tr>`)):empty('Nenhuma falta registrada nesta semana.')}</section>
      <section class="card weekly-panel"><div class="weekly-panel-head"><h2>Estoque para repor</h2><small>Saldo disponível atual versus mínimo</small></div>${low.length?table(['Produto','Disponível','Mínimo'],low.sort((a,b)=>Number(a.physical_stock)-Number(a.reserved_stock)-Number(a.minimum_stock)-(Number(b.physical_stock)-Number(b.reserved_stock)-Number(b.minimum_stock))).map(product=>`<tr><td>${esc(product.name)}</td><td>${number(Number(product.physical_stock)-Number(product.reserved_stock))} ${esc(product.unit)}</td><td>${number(product.minimum_stock)}</td></tr>`)):empty('Nenhum produto abaixo do mínimo no momento.')}${replenishments.length?`<p class="weekly-footnote">${number(replenishments.length)} pedido(s) de reposição ainda aberto(s) ou em andamento.</p>`:''}</section>
      <section class="card weekly-panel"><div class="weekly-panel-head"><h2>Movimentação de estoque</h2><small>Registros criados nesta semana</small></div>${movements.length?table(['Tipo','Registros'],[['entry','Entradas'],['reserve','Reservas'],['release','Liberações'],['delivery','Entregas'],['adjustment','Ajustes']].map(([key,label])=>`<tr><td>${label}</td><td>${number(movementCounts.get(key)||0)}</td></tr>`)):empty('Nenhuma movimentação registrada nesta semana.')}<p class="weekly-footnote">Contagens de eventos, não valores financeiros nem saldo histórico.</p></section>
      <section class="card weekly-panel"><div class="weekly-panel-head"><h2>Solicitações da semana</h2><small>${number(requests.length)} registros de produção</small></div>${requests.length?table(['Solicitação','Data','Status','Itens'],requests.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(request=>`<tr><td>#${esc(String(request.protocol).padStart(4,'0'))}</td><td>${rowDate(request.created_at)}</td><td>${esc(labels[request.status]||request.status)}</td><td>${esc(items.filter(item=>item.request_id===request.id).map(item=>productName(item.product_id)).join(', '))}</td></tr>`)):empty('Nenhuma solicitação de produção nesta semana.')}</section>
      <section class="card weekly-panel"><div class="weekly-panel-head"><h2>Boletos pagos</h2><small>Pagamento marcado como confirmado na semana</small></div>${data.bills.length?table(['Boleto','Beneficiário','Pago em','Valor'],data.bills.map(item=>`<tr><td>#${esc(String(item.protocol).padStart(4,'0'))}</td><td>${esc(item.beneficiary_name)}</td><td>${rowDate(item.paid_at)}</td><td>${money(item.amount)}</td></tr>`)):empty('Nenhum boleto pago nesta semana.')}</section>
      <section class="card weekly-panel"><div class="weekly-panel-head"><h2>Compras internas registradas</h2><small>Cupons confirmados pela data da compra</small></div>${data.receipts.length?table(['Compra','Fornecedor','Data','Valor'],data.receipts.map(item=>`<tr><td>#${esc(String(item.protocol).padStart(4,'0'))}</td><td>${esc(item.merchant_name)}</td><td>${rowDate(item.purchased_at)}</td><td>${money(item.total_value)}</td></tr>`)):empty('Nenhuma compra interna registrada nesta semana.')}<p class="weekly-footnote">Cupom registrado não comprova que a compra foi paga. Este valor não é somado aos boletos para evitar dupla contagem.</p></section>
      <section class="card weekly-panel weekly-pending"><div class="weekly-panel-head"><h2>Outras despesas</h2><small>Integração financeira pendente</small></div><p>O app ainda não possui um cadastro estruturado para demais gastos da empresa. Por isso, este relatório não os estima nem os apresenta como zero.</p></section>
    </div>
  </div>`;
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
