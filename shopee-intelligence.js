(()=>{
'use strict';

const SH={tab:'overview',loaded:false,loading:null,error:'',data:null,coverage:[],usage:null,analyses:[],analysis:null,insights:[],from:'',to:'',uploading:'',trendMetric:'sales',activeTrendIndex:null,historyCategory:'all',historyFrom:'',historyTo:'',calendarOpen:'',calendarMonth:'',coverageSelected:''};
const ANALYSIS_REQUEST_TIMEOUT_MS=75000;
const reportLabels={shop_stats:'Estatísticas da Loja',product_funnel:'Funil de Produtos',promotions:'Promoções e Descontos'};
const reportDescriptions={shop_stats:'Vendas, pedidos, tráfego e produtos líderes.',product_funnel:'Visitas, carrinho, pedidos realizados e pagos.',promotions:'Campanhas, descontos, combos e desempenho.'};
const priorityLabels={critical:'Crítico',high:'Alta',medium:'Média',low:'Informativo'};
const categoryLabels={sales:'Vendas',conversion:'Conversão',traffic:'Tráfego',product:'Produtos',promotion:'Promoções',cancellation:'Cancelamentos',data_quality:'Qualidade dos dados',opportunity:'Oportunidade'};
const actionLabels={view_overview:'Ver visão geral',view_products:'Ver produtos',view_marketing:'Ver marketing',view_promotions:'Ver promoções',view_imports:'Ver importações'};
const isAdmin=()=>S?.profile?.role==='admin';
const n=value=>Number(value||0);
const number=value=>n(value).toLocaleString('pt-BR',{maximumFractionDigits:2});
const money=value=>n(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const moneyUsd=value=>'US$ '+n(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4});
const percent=value=>(n(value)*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2})+'%';
const date=value=>value?new Date(String(value).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const datetime=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const daysAgo=days=>{const value=new Date();value.setDate(value.getDate()-days);return value.toISOString().slice(0,10)};
SH.from=daysAgo(29);SH.to=new Date().toISOString().slice(0,10);

async function fetchAnalysis(url,opt){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ANALYSIS_REQUEST_TIMEOUT_MS);
  try{return await fetch(url,{...opt,signal:controller.signal})}
  catch(error){if(error?.name==='AbortError')throw Error('A análise com IA demorou mais que o esperado. Tente novamente.');throw error}
  finally{clearTimeout(timer)}
}

async function edge(path,body,form=false){
  await ensureSession();
  const url=API+'/functions/v1/'+path;
  const options={method:'POST',headers:form?{apikey:KEY,Authorization:'Bearer '+S.session.access_token}:{apikey:KEY,Authorization:'Bearer '+S.session.access_token,'Content-Type':'application/json'},body:form?body:JSON.stringify(body)};
  const call=()=>path==='analyze-shopee-intelligence'?fetchAnalysis(url,options):apiFetch(url,options);
  let response=await call();if(response.status===401){await refreshSession();response=await call()}return json(response);
}

async function load(force=false){
  if(!isAdmin())return;
  if(SH.loading)return SH.loading;
  if(SH.loaded&&!force)return;
  SH.loading=(async()=>{
    SH.error='';
    try{
      const [data,usage,analyses,coverage]=await Promise.all([
        rpc('admin_get_shopee_dashboard',{p_from:SH.from||null,p_to:SH.to||null}),
        rpc('admin_get_shopee_ai_usage',{}),
        rest('shopee_ai_analyses?select=*&status=eq.completed&order=completed_at.desc&limit=12'),
        rest('shopee_import_days?select=metric_date,report_type&order=metric_date.asc&limit=5000').catch(()=>[])
      ]);
      SH.data=data||{};SH.coverage=coverage||[];SH.usage=Array.isArray(usage)?usage[0]||null:usage;SH.analyses=analyses||[];SH.analysis=SH.analyses[0]||null;
      SH.insights=SH.analysis?await rest(`shopee_ai_insights?analysis_id=eq.${encodeURIComponent(SH.analysis.id)}&select=*&order=position.asc`):[];
      SH.loaded=true;
    }catch(error){SH.error=error.message||'Não foi possível carregar a Inteligência Shopee.';SH.loaded=true}
  })().finally(()=>SH.loading=null);
  return SH.loading;
}

function sales(type){return (SH.data?.sales||[]).find(item=>item.order_type===type)||{}}
function completeness(){
  const periods=SH.data?.completeness||[];
  if(!periods.length)return{complete:0,total:0,missing:3};
  return{complete:periods.filter(item=>n(item.report_count)===3).length,total:periods.length,missing:Math.max(0,3-n(periods[0]?.report_count))};
}
function coverageRows(){
  if(SH.coverage.length)return SH.coverage;
  return(SH.data?.completeness||[]).flatMap(day=>(day.report_types||[]).map(report_type=>({metric_date:day.period_start,report_type})));
}
function coverageByDay(){
  const map=new Map();
  coverageRows().forEach(row=>{const key=String(row.metric_date||'').slice(0,10);if(!key)return;if(!map.has(key))map.set(key,new Set());map.get(key).add(row.report_type)});
  return map;
}
function localIso(value=new Date()){const offset=value.getTimezoneOffset()*60000;return new Date(value.getTime()-offset).toISOString().slice(0,10)}
function coverageState(iso){
  const map=coverageByDay(),first=[...map.keys()].sort()[0]||SH.from,today=localIso();
  if(iso>=today||iso<first)return{kind:'outside',count:0,reports:new Set(),label:iso>=today?'Dia ainda não encerrado':'Fora do período monitorado'};
  const reports=map.get(iso)||new Set(),count=reports.size;
  if(count===3)return{kind:'complete',count,reports,label:'Dados completos'};
  if(count>0)return{kind:'partial',count,reports,label:'Dados parciais'};
  return{kind:'missing',count,reports,label:'Sem dados'};
}
function missingReports(iso){const reports=coverageState(iso).reports;return Object.entries(reportLabels).filter(([type])=>!reports.has(type)).map(([,label])=>label)}
function monthIso(value){return /^\d{4}-\d{2}$/.test(value||'')?value:localIso().slice(0,7)}
function shiftMonth(value,amount){const [year,month]=monthIso(value).split('-').map(Number),next=new Date(year,month-1+amount,1);return`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`}
function coverageCalendar(){
  const field=SH.calendarOpen||'from',selected=field==='from'?SH.from:SH.to,month=monthIso(SH.calendarMonth||selected?.slice(0,7)),[year,numberMonth]=month.split('-').map(Number),first=new Date(year,numberMonth-1,1),start=new Date(year,numberMonth-1,1-first.getDay()),days=[];
  for(let index=0;index<42;index++){const current=new Date(start);current.setDate(start.getDate()+index);const iso=localIso(current),state=coverageState(iso),sameMonth=current.getMonth()===numberMonth-1,isSelected=iso===selected;days.push(`<button type="button" class="shopee-calendar-day ${state.kind} ${sameMonth?'':'other-month'} ${isSelected?'selected':''}" data-shopee-calendar-day="${iso}" aria-label="${current.toLocaleDateString('pt-BR',{dateStyle:'long'})}: ${state.label}" title="${state.label}"><span>${current.getDate()}</span><i aria-hidden="true">${state.count||''}</i></button>`)}
  const focus=SH.coverageSelected||selected,state=coverageState(focus),missing=missingReports(focus),canImport=['missing','partial'].includes(state.kind);
  return`<section class="shopee-coverage-calendar" role="dialog" aria-label="Calendário de disponibilidade dos dados"><header><button type="button" data-shopee-calendar-month="-1" aria-label="Mês anterior">‹</button><b>${first.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</b><button type="button" data-shopee-calendar-month="1" aria-label="Próximo mês">›</button></header><div class="shopee-calendar-weekdays" aria-hidden="true"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div><div class="shopee-calendar-grid">${days.join('')}</div><div class="shopee-calendar-legend"><span><i class="complete"></i>Completo</span><span><i class="partial"></i>Parcial</span><span><i class="missing"></i>Sem dados</span><span><i class="outside"></i>Não monitorado</span></div><footer class="${state.kind}"><span><b>${date(focus)} · ${state.label}</b><small>${canImport?`Faltam: ${missing.join(', ')}.`:'Use as cores para conferir a cobertura diária.'}</small></span>${canImport?'<button type="button" data-shopee-import-missing>Importar o que falta</button>':'<button type="button" data-shopee-calendar-close>Concluir seleção</button>'}</footer></section>`;
}
function deterministicAlerts(){
  const placed=sales('placed'),paid=sales('paid'),alerts=[];
  const gap=n(placed.sales)-n(paid.sales),gapRate=n(placed.sales)>0?gap/n(placed.sales):0;
  if(gapRate>.08)alerts.push({priority:gapRate>.15?'high':'medium',title:'Diferença entre vendas feitas e pagas',text:`Há ${money(gap)} (${percent(gapRate)}) entre o valor realizado e o pago no período.`,tab:'overview'});
  const cancelRate=n(placed.orders)>0?n(placed.cancelled_orders)/n(placed.orders):0;
  if(cancelRate>.05)alerts.push({priority:cancelRate>.12?'high':'medium',title:'Cancelamentos merecem acompanhamento',text:`Foram ${number(placed.cancelled_orders)} pedidos cancelados, equivalentes a ${percent(cancelRate)} dos pedidos feitos.`,tab:'overview'});
  const funnel=SH.data?.funnel||{},cartToPaid=n(funnel.cart_visitors)>0?n(funnel.paid_buyers)/n(funnel.cart_visitors):0;
  if(n(funnel.cart_visitors)>0)alerts.push({priority:cartToPaid<.15?'medium':'low',title:'Conversão do carrinho em compra paga',text:`Dos visitantes que adicionaram produtos ao carrinho, ${percent(cartToPaid)} concluíram uma compra paga.`,tab:'products'});
  const missing=completeness().missing;
  if(missing)alerts.push({priority:'medium',title:'Dados do dia ainda incompletos',text:`Faltam ${missing} ${missing===1?'tipo de relatório':'tipos de relatório'} para uma leitura completa do dia mais recente.`,tab:'imports'});
  return alerts.slice(0,4);
}

function logo(){return`<span class="shopee-brand-logo"><img src="./assets/platform-shopee.svg" alt="Shopee"></span>`}
function navigation(){
  const tabs=[['overview','Visão geral'],['products','Produtos'],['marketing','Marketing'],['promotions','Promoções'],['imports','Importações']];
  return`<nav class="shopee-tabs" aria-label="Relatórios Shopee" role="tablist">${tabs.map(([id,label])=>`<button type="button" role="tab" aria-selected="${SH.tab===id}" data-shopee-tab="${id}" class="${SH.tab===id?'active':''}">${label}</button>`).join('')}</nav>`;
}
function periodControls(){
  const comp=completeness(),validated=comp.total&&comp.missing===0;
  return`<div class="shopee-header-actions"><div class="shopee-period" aria-label="Período analisado"><input hidden id="shopeeFrom" value="${SH.from}"><input hidden id="shopeeTo" value="${SH.to}"><button type="button" class="shopee-date-trigger" data-shopee-calendar="from" aria-expanded="${SH.calendarOpen==='from'}"><span>De</span><b>${date(SH.from)}</b><i class="${coverageState(SH.from).kind}" aria-hidden="true"></i></button><em>até</em><button type="button" class="shopee-date-trigger" data-shopee-calendar="to" aria-expanded="${SH.calendarOpen==='to'}"><span>Até</span><b>${date(SH.to)}</b><i class="${coverageState(SH.to).kind}" aria-hidden="true"></i></button><button id="applyShopeeFilters" title="Aplicar período" aria-label="Aplicar período">→</button>${SH.calendarOpen?coverageCalendar():''}</div><span class="shopee-validation ${validated?'complete':'attention'}"><b>${validated?'✓':'!'}</b>${validated?'Relatórios validados':`${comp.missing} relatório(s) pendente(s)`}</span><button class="shopee-outline on-orange" id="refreshShopee">↻ Atualizar</button><button class="shopee-primary on-orange" data-shopee-open-imports aria-controls="shopeeUploadCards">⇧ Abrir importação</button></div>`;
}

const compactMoney=value=>{const amount=n(value);return Math.abs(amount)>=1000?`R$ ${(amount/1000).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} mil`:money(amount)};
const trendValue=(row,series)=>n(row[`${series}_${SH.trendMetric}`]);
const trendFormat=value=>SH.trendMetric==='sales'?money(value):`${number(value)} pedidos`;

function trendChart(){
  const rows=SH.data?.trend||[];if(!rows.length)return'<div class="empty">Importe Estatísticas da Loja para visualizar a evolução.</div>';
  const width=820,height=300,pad={left:74,right:22,top:28,bottom:48},values=rows.flatMap(row=>[trendValue(row,'placed'),trendValue(row,'paid')]),max=Math.max(1,...values),plotHeight=height-pad.top-pad.bottom,plotWidth=width-pad.left-pad.right;
  const x=index=>pad.left+plotWidth*(rows.length===1?.5:index/(rows.length-1)),y=value=>pad.top+plotHeight-(plotHeight*n(value)/max),points=series=>rows.map((row,index)=>`${x(index)},${y(trendValue(row,series))}`).join(' '),levels=[1,.75,.5,.25,0],labelStep=Math.max(1,Math.ceil(rows.length/8));
  const activeIndex=Math.max(0,Math.min(rows.length-1,SH.activeTrendIndex??rows.length-1)),active=rows[activeIndex],metricTitle=SH.trendMetric==='sales'?'Faturamento diário':'Quantidade diária de pedidos';
  const dailyButtons=rows.map((row,index)=>`<button class="${index===activeIndex?'active':''}" data-shopee-trend-index="${index}" aria-pressed="${index===activeIndex}"><small>${new Date(row.metric_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</small><b>${SH.trendMetric==='sales'?compactMoney(trendValue(row,'placed')):number(trendValue(row,'placed'))}</b><span>Pago: ${SH.trendMetric==='sales'?compactMoney(trendValue(row,'paid')):number(trendValue(row,'paid'))}</span></button>`).join('');
  return`<div class="shopee-chart-wrap"><header class="shopee-chart-heading"><div><p class="eyebrow">VENDAS AO LONGO DO PERÍODO</p><h2>${metricTitle}</h2><span>Realizado × pago, com valores oficiais por dia</span></div><div class="shopee-chart-toggle" role="group" aria-label="Métrica do gráfico"><button data-shopee-metric="sales" class="${SH.trendMetric==='sales'?'active':''}">Faturamento (R$)</button><button data-shopee-metric="orders" class="${SH.trendMetric==='orders'?'active':''}">Pedidos</button></div></header><div class="shopee-chart-selected" aria-live="polite"><span><small>${date(active.metric_date)}</small><b>${trendFormat(trendValue(active,'placed'))}</b><em>Realizado</em></span><span><small>Valor confirmado</small><b>${trendFormat(trendValue(active,'paid'))}</b><em>Pago</em></span><span><small>Diferença do dia</small><b>${trendFormat(Math.max(0,trendValue(active,'placed')-trendValue(active,'paid')))}</b><em>Acompanhamento</em></span></div><svg class="shopee-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${metricTitle}: vendas realizadas e pagas">${levels.map(level=>{const py=pad.top+plotHeight*(1-level);return`<line class="grid" x1="${pad.left}" x2="${width-pad.right}" y1="${py}" y2="${py}"/><text class="axis-value" x="${pad.left-10}" y="${py+4}" text-anchor="end">${SH.trendMetric==='sales'?compactMoney(max*level):number(max*level)}</text>`}).join('')}<polygon class="paid-area" points="${x(0)},${height-pad.bottom} ${points('paid')} ${x(rows.length-1)},${height-pad.bottom}"/><polyline class="placed" points="${points('placed')}"/><polyline class="paid" points="${points('paid')}"/>${rows.map((row,index)=>{const px=x(index),showDate=index%labelStep===0||index===rows.length-1;return`<g class="trend-point ${index===activeIndex?'active':''}" data-shopee-trend-index="${index}" tabindex="0" role="button" aria-label="${date(row.metric_date)}: realizado ${trendFormat(trendValue(row,'placed'))}, pago ${trendFormat(trendValue(row,'paid'))}"><circle class="placed" cx="${px}" cy="${y(trendValue(row,'placed'))}" r="5"/><circle class="paid" cx="${px}" cy="${y(trendValue(row,'paid'))}" r="5"/>${showDate?`<text class="axis-date" x="${px}" y="${height-15}" text-anchor="middle">${new Date(row.metric_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</text>`:''}</g>`}).join('')}</svg><footer><span><i class="placed"></i>Realizado</span><span><i class="paid"></i>Pago</span><small>Passe o mouse ou toque em um dia para conferir.</small></footer><div class="shopee-daily-values" aria-label="Valores por dia">${dailyButtons}</div></div>`;
}

function aiSummary(){
  const visible=SH.insights.filter(item=>!item.dismissed_at),analysis=SH.analysis;
  const fallback=deterministicAlerts(),items=visible.length?visible.slice(0,3).map(item=>({title:item.title,text:item.recommendation||item.explanation})):fallback.slice(0,3);
  return`<aside class="card shopee-ai-panel ${analysis?.health_status||'attention'}"><header><div><p class="eyebrow">LEITURA INTELIGENTE DO PERÍODO</p><h2>Decisões apoiadas por IA</h2></div><span>IA · ${completeness().missing?'fontes parciais':'3 fontes validadas'}</span></header><p class="shopee-ai-lead">${analysis?esc(analysis.overall_summary):'Os indicadores abaixo são calculados com dados reais. Gere uma análise para relacionar vendas, produtos, marketing e promoções.'}</p><ul>${items.map(item=>`<li><i></i><span><b>${esc(item.title)}</b><small>${esc(item.text)}</small></span></li>`).join('')||'<li><i></i><span><b>Operação sem alertas determinísticos</b><small>Importe os três relatórios para ampliar a leitura.</small></span></li>'}</ul><footer><small>${analysis?`Atualizada em ${datetime(analysis.completed_at)}`:'Abrir o painel não gera cobrança.'}</small><button class="shopee-primary" id="runShopeeAi" ${SH.usage&&!SH.usage.enabled?'disabled':''}>✦ ${analysis?'Atualizar análise':'Analisar com IA'}</button></footer></aside>`;
}

function aiDetails(){
  const visible=SH.insights.filter(item=>!item.dismissed_at);if(!visible.length)return'';
  return`<details class="card shopee-ai-details"><summary><span><b>Análise completa e evidências</b><small>${visible.length} insight(s) da IA disponíveis</small></span><em>Ver detalhes</em></summary><div class="shopee-ai-insights">${visible.map(insight=>`<article class="${esc(insight.priority)}"><header><span>${priorityLabels[insight.priority]||'Atenção'}</span><small>${categoryLabels[insight.category]||'Análise'}</small></header><h3>${esc(insight.title)}</h3><p>${esc(insight.explanation)}</p><b>Recomendação</b><p>${esc(insight.recommendation)}</p>${Array.isArray(insight.evidence)&&insight.evidence.length?`<details><summary>Ver evidências</summary><ul>${insight.evidence.map(value=>`<li>${esc(value)}</li>`).join('')}</ul></details>`:''}<footer>${actionLabels[insight.action_type]?`<button class="shopee-outline" data-shopee-ai-action="${insight.action_type}">${actionLabels[insight.action_type]}</button>`:''}<button class="ghost" data-shopee-insight="${insight.id}">Marcar como conferido</button></footer></article>`).join('')}</div></details>`;
}

function trafficSnapshot(){
  const rows=(SH.data?.traffic||[]).filter(item=>item.order_type==='paid').slice(0,5),total=rows.reduce((sum,row)=>sum+n(row.sales),0),colors=['#ee4d2d','#16988f','#ffb15c','#6f73d9','#9ca2a5'];
  const gradient=rows.length?rows.map((row,index)=>{const before=rows.slice(0,index).reduce((sum,item)=>sum+n(item.sales),0)/Math.max(1,total)*100,after=before+n(row.sales)/Math.max(1,total)*100;return`${colors[index%colors.length]} ${before}% ${after}%`}).join(','):'#eee 0 100%';
  return`<section class="card shopee-snapshot"><header><div><p class="eyebrow">ORIGEM DAS VENDAS PAGAS</p><h2>Tráfego que gera receita</h2></div><button data-shopee-tab="marketing">Ver marketing →</button></header><div class="shopee-mini-donut-layout"><div class="shopee-mini-donut" style="--shopee-donut:${gradient}"><span><b>${money(total)}</b><small>atribuídos</small></span></div><div>${rows.map((row,index)=>`<p><i style="background:${colors[index%colors.length]}"></i><span>${esc(row.source_name)}</span><b>${total?percent(n(row.sales)/total):'0%'}</b></p>`).join('')||'<div class="empty">Importe Estatísticas da Loja para ver os canais.</div>'}</div></div></section>`;
}

function productMovement(){
  const f=SH.data?.funnel||{},conversion=n(f.visitors)>0?n(f.paid_buyers)/n(f.visitors):0;
  return`<section class="card shopee-snapshot"><header><div><p class="eyebrow">MOVIMENTO DE PRODUTOS</p><h2>Da visita ao pagamento</h2></div><button data-shopee-tab="products">Ver produtos →</button></header><div class="shopee-movement-list"><p><i>01</i><span><small>Visitantes de produtos</small><b>${number(f.visitors)}</b></span></p><p><i>02</i><span><small>Unidades no carrinho</small><b>${number(f.cart_units)}</b></span></p><p><i>03</i><span><small>Unidades pagas</small><b>${number(f.paid_units)}</b></span></p><footer><span>Conversão visita → pagamento</span><b>${percent(conversion)}</b></footer></div></section>`;
}

function dataQuality(){
  const comp=completeness(),imports=SH.data?.imports||[],latest=imports[0];
  return`<section class="card shopee-snapshot shopee-quality"><header><div><p class="eyebrow">QUALIDADE DOS DADOS</p><h2>Base confiável</h2></div><button data-shopee-tab="imports">Ver histórico →</button></header><ul><li><b>✓</b><span>${comp.complete} de ${comp.total} dia(s) com os três relatórios</span></li><li><b>✓</b><span>Proteção contra soma duplicada por dia</span></li><li><b>✓</b><span>${imports.length} arquivo(s) no histórico auditável</span></li></ul><footer>${latest?`Última importação: ${datetime(latest.imported_at)}`:'Aguardando primeira importação'}</footer></section>`;
}

function overview(){
  const placed=sales('placed'),paid=sales('paid'),f=SH.data?.funnel||{};
  return`<section class="shopee-kpis"><article><i>↗</i><span><small>VENDAS REALIZADAS</small><b>${money(placed.sales)}</b><em>${number(placed.orders)} pedidos feitos</em></span></article><article><i>✓</i><span><small>VENDAS PAGAS</small><b>${money(paid.sales)}</b><em>${number(paid.orders)} pedidos pagos</em></span></article><article><i>□</i><span><small>UNIDADES PAGAS</small><b>${number(f.paid_units)}</b><em>${number(f.paid_buyers)} compradores pagos</em></span></article><article><i>◎</i><span><small>VISITANTES DE PRODUTOS</small><b>${number(f.visitors)}</b><em>${number(f.page_views)} visualizações</em></span></article></section><div class="shopee-executive-grid"><section class="card shopee-trend-card">${trendChart()}</section><section class="card shopee-funnel-card"><header><p class="eyebrow">FUNIL DE CONVERSÃO</p><h2>Da visita ao pagamento</h2><button data-shopee-tab="products">Analisar produtos →</button></header>${n(f.visitors)?funnelGraphic():'<div class="empty">Importe o Funil de Produtos para visualizar esta jornada.</div>'}</section>${aiSummary()}</div><div class="shopee-support-grid">${trafficSnapshot()}${productMovement()}${dataQuality()}</div>${aiDetails()}`;
}

function funnelGraphic(){
  const f=SH.data?.funnel||{},steps=[['Visitantes',f.visitors],['Adicionaram ao carrinho',f.cart_visitors],['Compradores — pedido feito',f.placed_buyers],['Compradores — pedido pago',f.paid_buyers]],max=Math.max(1,n(f.visitors));
  return`<div class="shopee-funnel">${steps.map(([label,value],index)=>`<article style="--funnel-width:${Math.max(28,n(value)/max*100)}%"><span><small>${label}</small><b>${number(value)}</b></span><em>${index?percent(n(value)/Math.max(1,n(steps[index-1][1]))):'100%'}</em></article>`).join('')}</div>`;
}
function productsView(){
  const rows=(SH.data?.products||[]).filter(item=>item.order_type==='paid'),f=SH.data?.funnel||{};
  return`<section class="shopee-kpis"><article><small>VISITANTES DE PRODUTO</small><b>${number(f.visitors)}</b><span>${number(f.page_views)} visualizações</span></article><article><small>ADICIONARAM AO CARRINHO</small><b>${number(f.cart_visitors)}</b><span>${number(f.cart_units)} unidades</span></article><article><small>COMPRADORES PAGOS</small><b>${number(f.paid_buyers)}</b><span>${number(f.paid_units)} unidades</span></article><article><small>CONVERSÃO PAGA</small><b>${percent(n(f.paid_buyers)/Math.max(1,n(f.visitors)))}</b><span>Visita até pagamento</span></article></section><div class="shopee-products-grid"><section class="card shopee-section"><div class="card-head"><div><p class="eyebrow">FUNIL DE PRODUTOS</p><h2>Da visita ao pagamento</h2></div></div>${n(f.visitors)?funnelGraphic():'<div class="empty">Importe o Funil de Produtos para visualizar esta jornada.</div>'}</section><section class="card shopee-section"><div class="card-head"><div><p class="eyebrow">DESEMPENHO</p><h2>Produtos líderes</h2></div></div><div class="table-wrap"><table class="shopee-table"><thead><tr><th>Produto</th><th>Vendas pagas</th><th>Unidades</th><th>Cliques</th><th>Conversão</th></tr></thead><tbody>${rows.map(row=>`<tr><td><b>${esc(row.product_name)}</b><small>ID ${esc(row.item_id)}</small></td><td>${money(row.sales)}</td><td>${number(row.units)}</td><td>${number(row.clicks)}</td><td>${percent(row.conversion_rate)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Importe Estatísticas da Loja para ver os produtos.</td></tr>'}</tbody></table></div></section></div>`;
}

function marketingView(){
  const rows=(SH.data?.traffic||[]).filter(item=>item.order_type==='paid'),total=rows.reduce((sum,row)=>sum+n(row.sales),0),colors=['#ee4d2d','#ff7b5f','#ffb15c','#2bb2a0','#6f73d9','#e09c25','#8b6b61'];
  const gradient=rows.length?rows.map((row,index)=>{const before=rows.slice(0,index).reduce((sum,item)=>sum+n(item.sales),0)/Math.max(1,total)*100,after=(before+n(row.sales)/Math.max(1,total)*100);return`${colors[index%colors.length]} ${before}% ${after}%`}).join(','):'#eee 0 100%';
  return`<div class="shopee-marketing-grid"><section class="card shopee-section"><div class="card-head"><div><p class="eyebrow">ORIGEM DAS VENDAS PAGAS</p><h2>Canais que geram receita</h2></div></div><div class="shopee-donut-layout"><div class="shopee-donut" style="--shopee-donut:${gradient}"><span><b>${money(total)}</b><small>atribuídos</small></span></div><div>${rows.map((row,index)=>`<article><i style="background:${colors[index%colors.length]}"></i><span><b>${esc(row.source_name)}</b><small>${number(row.clicks)} cliques · ${percent(row.conversion_rate)} conversão</small></span><strong>${money(row.sales)}</strong></article>`).join('')||'<div class="empty">Importe Estatísticas da Loja para ver os canais.</div>'}</div></div></section><section class="card shopee-section"><div class="card-head"><div><p class="eyebrow">EFICIÊNCIA DO TRÁFEGO</p><h2>Comparativo por canal</h2></div></div><div class="table-wrap"><table class="shopee-table"><thead><tr><th>Fonte</th><th>Impressões</th><th>CTR</th><th>Pedidos</th><th>Vendas</th></tr></thead><tbody>${rows.map(row=>`<tr><td><b>${esc(row.source_name)}</b></td><td>${number(row.impressions)}</td><td>${percent(row.ctr)}</td><td>${number(row.orders)}</td><td>${money(row.sales)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Sem dados no período.</td></tr>'}</tbody></table></div></section></div>`;
}

function promotionsView(){
  const metrics=SH.data?.promotions||[],campaigns=SH.data?.campaigns||[],total=metrics.find(item=>normalizeText(item.promotion_type)==='todos')||{},discount=metrics.find(item=>normalizeText(item.promotion_type).includes('desconto'))||{},bundle=metrics.find(item=>normalizeText(item.promotion_type).includes('leve mais'))||{};
  return`<section class="shopee-kpis"><article><small>VENDAS COM PROMOÇÃO</small><b>${money(total.paid_sales)}</b><span>${number(total.paid_orders)} pedidos pagos</span></article><article><small>DESCONTO</small><b>${money(discount.paid_sales)}</b><span>${number(discount.paid_units)} unidades</span></article><article><small>LEVE MAIS POR MENOS</small><b>${money(bundle.paid_sales)}</b><span>${money(n(bundle.paid_sales)/Math.max(1,n(bundle.paid_buyers)))} por comprador</span></article><article><small>COMBOS ATIVOS</small><b>${campaigns.filter(item=>normalizeText(item.promotion_type).includes('combo')&&normalizeText(item.campaign_status).includes('andamento')).length}</b><span>Campanhas em andamento</span></article></section><section class="card shopee-section"><div class="card-head"><div><p class="eyebrow">CAMPANHAS</p><h2>Desempenho por promoção</h2><span>Valores do período das planilhas importadas.</span></div></div><div class="shopee-campaigns">${campaigns.map(item=>`<article><div><span class="shopee-campaign-status ${normalizeText(item.campaign_status).includes('andamento')?'active':'ended'}">${esc(item.campaign_status||'Sem status')}</span><h3>${esc(item.campaign_name)}</h3><small>${esc(item.promotion_type)} · ${esc(item.campaign_period||'Período não informado')}</small></div><dl><div><dt>Vendas pagas</dt><dd>${money(item.paid_sales)}</dd></div><div><dt>Pedidos</dt><dd>${number(item.paid_orders)}</dd></div><div><dt>Unidades</dt><dd>${number(item.paid_units)}</dd></div><div><dt>Por comprador</dt><dd>${money(item.paid_sales_per_buyer)}</dd></div></dl></article>`).join('')||'<div class="empty">Importe Promoções e Descontos para visualizar as campanhas.</div>'}</div></section>`;
}
const normalizeText=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

const reportIcon=type=>type==='shop_stats'?'↗':type==='product_funnel'?'⌁':'%';
const historyCategories={shop_stats:'Visão geral',product_funnel:'Produtos',promotions:'Marketing'};
const importDateValue=item=>Date.parse(`${item?.period_end||item?.period_start||'1900-01-01'}T12:00:00`)||0;
const sortedImports=items=>[...(items||[])].sort((a,b)=>importDateValue(b)-importDateValue(a)||(Date.parse(b?.imported_at||0)||0)-(Date.parse(a?.imported_at||0)||0));
function filteredImports(){
  return sortedImports(SH.data?.imports||[]).filter(item=>{
    if(SH.historyCategory!=='all'&&item.report_type!==SH.historyCategory)return false;
    if(SH.historyFrom&&String(item.period_end||item.period_start||'')<SH.historyFrom)return false;
    if(SH.historyTo&&String(item.period_start||item.period_end||'')>SH.historyTo)return false;
    return true;
  });
}
function newImportCard(type){
  const busy=SH.uploading===type;
  return`<article class="shopee-new-import-card"><header><i>${reportIcon(type)}</i><span><small>NOVA IMPORTAÇÃO</small><h3>${reportLabels[type]}</h3></span></header><p>${reportDescriptions[type]}</p><div class="shopee-new-import-purpose"><b>Para uma data ou período novo</b><small>Os dias que já existem no painel serão reconhecidos e preservados automaticamente.</small></div><input hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-shopee-new-file="${type}"><button class="shopee-primary" data-shopee-new-upload="${type}" ${busy?'disabled':''}>${busy?'Validando e importando…':'⇧ Selecionar nova planilha'}</button>${busy?'<progress class="shopee-progress"></progress>':''}</article>`;
}
function latestImportCard(type){
  const latest=sortedImports(SH.data?.imports||[]).find(item=>item.report_type===type);
  return`<article class="shopee-import-card ${latest?'complete':''}"><header><i>${reportIcon(type)}</i><span><small>${latest?'ÚLTIMO PERÍODO RECEBIDO':'SEM DADOS IMPORTADOS'}</small><h3>${reportLabels[type]}</h3></span>${latest?'<em>✓</em>':''}</header>${latest?`<div class="shopee-import-meta"><span><b>${date(latest.period_start)} a ${date(latest.period_end)}</b><small>${esc(latest.file_name)}</small></span><strong>${number(latest.row_count)} linhas</strong></div>`:'<div class="shopee-import-empty">Envie a primeira planilha na seção “Adicionar novos dados”.</div>'}<small class="shopee-import-status-note">Este cartão é apenas informativo. Correções são feitas pelo histórico abaixo.</small></article>`;
}
function correctionDialog(){
  return`<dialog id="shopeeCorrectionDialog" class="shopee-correction-dialog"><form method="dialog"><button class="shopee-dialog-close" value="cancel" aria-label="Fechar">×</button><p class="eyebrow">CORREÇÃO CONTROLADA</p><h3>Corrigir um período já importado</h3><p>Use esta opção somente quando o arquivo anterior estiver errado. Para enviar uma data nova, utilize “Selecionar nova planilha”.</p><div class="shopee-correction-selection"><span><small>RELATÓRIO</small><b data-correction-report>—</b></span><span><small>PERÍODO QUE SERÁ CORRIGIDO</small><b data-correction-period>—</b></span><span><small>ARQUIVO ATUAL</small><b data-correction-file-name>—</b></span></div><div class="shopee-correction-warning"><b>Proteção ativa</b><small>O arquivo corrigido deverá ter exatamente o mesmo período selecionado. Nenhuma outra data será alterada.</small></div><input hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-shopee-correction-file><footer><button class="shopee-outline" value="cancel">Cancelar</button><button class="shopee-primary" type="button" id="chooseShopeeCorrectionFile">Selecionar arquivo corrigido</button></footer></form></dialog>`;
}
function importsView(){
  const items=filteredImports(),total=(SH.data?.imports||[]).length,filtered=SH.historyCategory!=='all'||SH.historyFrom||SH.historyTo;
  return`<section class="shopee-import-hero"><div>${logo()}<span><p class="eyebrow">CENTRAL DE IMPORTAÇÃO SEGURA</p><h2>Três relatórios, uma leitura completa</h2><p>Novos dados e correções agora possuem fluxos separados, com proteção contra duplicidade e troca do período errado.</p></span></div><aside><b>Sem soma duplicada</b><small>Planilhas diárias e semanais podem ser combinadas. Dias já registrados são preservados.</small></aside></section><section id="shopeeUploadCards" class="shopee-import-upload-region" role="region" aria-label="Adicionar novos dados da Shopee" tabindex="-1"><header><span><small class="shopee-step">ETAPA 1 · USO NORMAL</small><b>Adicionar dados de uma nova data ou período</b><small>Use esta área para o relatório de ontem, de uma nova semana ou de qualquer período ainda não registrado.</small></span><em>Não altera dados anteriores</em></header><div class="shopee-new-import-grid">${Object.keys(reportLabels).map(newImportCard).join('')}</div></section><section class="shopee-import-current" aria-label="Situação atual dos relatórios"><header><span><small class="shopee-step">ETAPA 2 · CONFERÊNCIA</small><b>Últimos períodos recebidos</b><small>Resumo apenas para consulta. Estes cartões não substituem arquivos.</small></span><em>Somente leitura</em></header><div class="shopee-import-grid">${Object.keys(reportLabels).map(latestImportCard).join('')}</div></section><section class="card shopee-section shopee-import-history"><div class="card-head"><div><p class="eyebrow">HISTÓRICO AUDITÁVEL</p><h2>Arquivos importados</h2><span>Os períodos mais recentes aparecem primeiro. Use “Corrigir período” somente quando um arquivo registrado contiver informação errada.</span></div><strong class="shopee-history-total">${items.length} de ${total} arquivo(s)</strong></div><form id="shopeeHistoryFilters" class="shopee-history-filters"><label><span>Categoria</span><select name="category"><option value="all" ${SH.historyCategory==='all'?'selected':''}>Todas as categorias</option><option value="shop_stats" ${SH.historyCategory==='shop_stats'?'selected':''}>Visão geral</option><option value="product_funnel" ${SH.historyCategory==='product_funnel'?'selected':''}>Produtos</option><option value="promotions" ${SH.historyCategory==='promotions'?'selected':''}>Marketing</option></select></label><label><span>Período a partir de</span><input name="from" type="date" value="${SH.historyFrom}"></label><label><span>Período até</span><input name="to" type="date" value="${SH.historyTo}"></label><button class="shopee-primary" type="submit">Aplicar filtros</button><button class="shopee-outline" id="clearShopeeHistoryFilters" type="button" ${filtered?'':'disabled'}>Limpar</button></form><div class="shopee-history-window" role="region" aria-label="Histórico de arquivos importados" tabindex="0"><table class="shopee-table"><thead><tr><th>Categoria</th><th>Período</th><th>Arquivo</th><th>Linhas</th><th>Importado por</th><th>Data</th><th>Ação excepcional</th></tr></thead><tbody>${items.map(item=>`<tr><td><span class="shopee-history-category">${historyCategories[item.report_type]||'Outros'}</span><b>${reportLabels[item.report_type]||esc(item.report_type)}</b></td><td>${date(item.period_start)} a ${date(item.period_end)}</td><td>${esc(item.file_name)}</td><td>${number(item.row_count)}</td><td>${esc(item.imported_by)}</td><td>${datetime(item.imported_at)}</td><td><button class="shopee-correction" data-shopee-correct="${item.report_type}" data-period-start="${esc(item.period_start)}" data-period-end="${esc(item.period_end)}" data-current-file="${esc(item.file_name)}">Corrigir período</button></td></tr>`).join('')||`<tr><td colspan="7" class="empty">${filtered?'Nenhum arquivo corresponde aos filtros selecionados.':'Nenhuma planilha importada.'}</td></tr>`}</tbody></table></div><footer class="shopee-history-footer"><span>Janela com rolagem interna para manter a página organizada.</span><b>Mais recentes → mais antigos</b></footer></section>${correctionDialog()}${settings()}`;
}

function settings(){
  if(!S.profile?.is_primary_admin||!SH.usage)return'';
  const budget=n(SH.usage.monthly_budget_usd),used=n(SH.usage.month_cost_usd),progress=budget?Math.min(100,used/budget*100):0;
  return`<details class="card shopee-settings"><summary>IA, orçamento e proteção de custos</summary><div class="shopee-budget"><span><small>ORÇAMENTO MENSAL</small><b>${moneyUsd(budget)}</b></span><span><small>UTILIZADO</small><b>${moneyUsd(used)}</b></span><span><small>DISPONÍVEL</small><b>${moneyUsd(SH.usage.remaining_budget_usd)}</b></span></div><div class="shopee-budget-bar"><i style="width:${progress}%"></i></div><form id="shopeeSettings"><label>Orçamento mensal em dólar<input name="budget" type="number" min="0" max="1000" step="0.50" value="${budget}" required></label><label>Intervalo entre análises<input name="cooldown" type="number" min="1" max="1440" value="${n(SH.usage.manual_cooldown_minutes)||10}" required><small>Minutos</small></label><label class="check"><input name="enabled" type="checkbox" ${SH.usage.enabled?'checked':''}> IA habilitada</label><button class="shopee-primary">Salvar proteção</button></form></details>`;
}

function shell(){
  if(SH.loading&&!SH.loaded)return'<div class="loading-inline">Conectando os dados oficiais da Shopee…</div>';
  if(SH.error)return`<section class="card shopee-unavailable"><p class="eyebrow">INTELIGÊNCIA SHOPEE</p><h2>Atualização técnica necessária</h2><p>O restante da Central de Inteligência continua funcionando normalmente.</p><small>${esc(SH.error)}</small></section>`;
  const views={overview,products:productsView,marketing:marketingView,promotions:promotionsView,imports:importsView};
  return`<div class="shopee-intelligence"><header class="shopee-header"><div class="shopee-header-brand">${logo()}<span><p class="eyebrow">INTELIGÊNCIA SHOPEE</p><h2>Desempenho da loja</h2><p>Dados oficiais de vendas, produtos, marketing, promoções e IA — sem duplicidade.</p></span></div>${periodControls()}</header>${navigation()}<main>${(views[SH.tab]||overview)()}</main></div>`;
}

function renderActive(){const mount=document.querySelector('#shopeeIntelligenceDashboard');if(!mount)return;mount.innerHTML=shell();bind()}
function openTab(tab){SH.tab=tab;renderActive()}
function openImports(){SH.tab='imports';renderActive();requestAnimationFrame(()=>{const target=document.querySelector('#shopeeUploadCards');target?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});target?.focus({preventScroll:true});target?.classList.add('attention');setTimeout(()=>target?.classList.remove('attention'),1400)})}
async function activate(){if(!isAdmin())return;await load();renderActive()}
function inject(){if(!isAdmin()||S.view!=='intelligence')return;const mount=document.querySelector('#shopeeIntelligenceDashboard');if(!mount||mount.dataset.ready)return;mount.dataset.ready='true';activate()}

async function upload(type,file,button,mode='append',expectedPeriod=null){
  if(!file)return;if(file.size>12*1024*1024)return alert('O arquivo deve ter no máximo 12 MB.');
  SH.uploading=type;renderActive();
  try{const form=new FormData();form.append('report_type',type);form.append('import_mode',mode);if(mode==='replace'&&expectedPeriod){form.append('expected_period_start',expectedPeriod.start);form.append('expected_period_end',expectedPeriod.end)}form.append('file',file,file.name);const response=await edge('process-shopee-report',form,true),result=response.result||{},accepted=n(result.accepted_count),skipped=n(result.skipped_count);SH.from=response.period_start||SH.from;SH.to=response.period_end||SH.to;SH.loaded=false;await load(true);SH.tab='imports';renderActive();const message=mode==='replace'?`O período de ${date(response.period_start)} a ${date(response.period_end)} foi corrigido com segurança.`:result.status==='duplicate'?'Esta planilha já estava importada. Nenhum valor foi duplicado.':result.status==='already_covered'?`Todos os ${skipped} dias desta planilha já estavam registrados e foram preservados.`:result.status==='imported_partial'?`${accepted} dia(s) adicionado(s); ${skipped} dia(s) já existente(s) preservado(s).`:`${accepted||'Todos os'} dia(s) do relatório foram adicionados com sucesso.`;toast(`${message} Exibindo ${date(SH.from)} a ${date(SH.to)}.`)}
  catch(error){SH.uploading='';renderActive();alert(error.message)}
  finally{SH.uploading='';renderActive();if(document.body.contains(button))button.disabled=false}
}
async function runAI(button){
  const original=button.innerHTML;button.disabled=true;button.innerHTML='<span class="shopee-spinner"></span> Analisando os relatórios…';
  try{await edge('analyze-shopee-intelligence',{from:SH.from,to:SH.to});SH.loaded=false;await load(true);renderActive();toast('Nova análise Shopee concluída com IA real.')}catch(error){alert(error.message)}finally{if(document.body.contains(button)){button.disabled=false;button.innerHTML=original}}
}
async function markInsight(id,button){button.disabled=true;try{await rpc('admin_mark_shopee_ai_insight',{p_insight_id:id,p_action:'reviewed'});const item=SH.insights.find(row=>row.id===id);if(item)item.reviewed_at=new Date().toISOString();renderActive();toast('Insight marcado como conferido.')}catch(error){alert(error.message);button.disabled=false}}

function bind(){
  document.querySelectorAll('[data-shopee-tab]').forEach(button=>button.onclick=()=>openTab(button.dataset.shopeeTab));
  document.querySelectorAll('[data-shopee-open-imports]').forEach(button=>button.onclick=openImports);
  document.querySelector('#refreshShopee')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;SH.loaded=false;await load(true);renderActive()});
  document.querySelectorAll('[data-shopee-calendar]').forEach(button=>button.onclick=()=>{const field=button.dataset.shopeeCalendar;SH.calendarOpen=SH.calendarOpen===field?'':field;SH.coverageSelected=field==='from'?SH.from:SH.to;SH.calendarMonth=(SH.coverageSelected||localIso()).slice(0,7);renderActive()});
  document.querySelectorAll('[data-shopee-calendar-month]').forEach(button=>button.onclick=()=>{SH.calendarMonth=shiftMonth(SH.calendarMonth,n(button.dataset.shopeeCalendarMonth));renderActive()});
  document.querySelectorAll('[data-shopee-calendar-day]').forEach(button=>button.onclick=()=>{const value=button.dataset.shopeeCalendarDay;if(SH.calendarOpen==='from'){SH.from=value;if(SH.to<value)SH.to=value}else{SH.to=value;if(SH.from>value)SH.from=value}SH.coverageSelected=value;renderActive()});
  document.querySelector('[data-shopee-calendar-close]')?.addEventListener('click',()=>{SH.calendarOpen='';SH.coverageSelected='';renderActive()});
  document.querySelector('[data-shopee-import-missing]')?.addEventListener('click',()=>{const value=SH.coverageSelected;if(value){SH.from=value;SH.to=value}SH.calendarOpen='';SH.coverageSelected='';openImports()});
  document.querySelector('#applyShopeeFilters')?.addEventListener('click',async event=>{const from=document.querySelector('#shopeeFrom').value,to=document.querySelector('#shopeeTo').value;if(!from||!to||to<from)return alert('Informe um período válido.');SH.from=from;SH.to=to;SH.calendarOpen='';SH.coverageSelected='';event.currentTarget.disabled=true;SH.loaded=false;await load(true);renderActive()});
  document.querySelectorAll('[data-shopee-metric]').forEach(button=>button.onclick=()=>{SH.trendMetric=button.dataset.shopeeMetric;SH.activeTrendIndex=null;renderActive()});
  document.querySelectorAll('[data-shopee-trend-index]').forEach(button=>{const activate=()=>{SH.activeTrendIndex=n(button.dataset.shopeeTrendIndex);renderActive()};button.onclick=activate;button.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate()}}});
  document.querySelectorAll('[data-shopee-alert]').forEach(button=>button.onclick=()=>openTab(button.dataset.shopeeAlert));
  document.querySelectorAll('[data-shopee-new-upload]').forEach(button=>button.onclick=()=>{const input=document.querySelector(`[data-shopee-new-file="${button.dataset.shopeeNewUpload}"]`);input.value='';input.click()});
  document.querySelectorAll('[data-shopee-new-file]').forEach(input=>input.onchange=()=>upload(input.dataset.shopeeNewFile,input.files?.[0],document.querySelector(`[data-shopee-new-upload="${input.dataset.shopeeNewFile}"]`),'append'));
  document.querySelector('#shopeeHistoryFilters')?.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget),from=String(data.get('from')||''),to=String(data.get('to')||'');if(from&&to&&to<from)return alert('A data final do histórico deve ser igual ou posterior à data inicial.');SH.historyCategory=String(data.get('category')||'all');SH.historyFrom=from;SH.historyTo=to;renderActive()});
  document.querySelector('#clearShopeeHistoryFilters')?.addEventListener('click',()=>{SH.historyCategory='all';SH.historyFrom='';SH.historyTo='';renderActive()});
  document.querySelectorAll('[data-shopee-correct]').forEach(button=>button.onclick=()=>{const dialog=document.querySelector('#shopeeCorrectionDialog');dialog.dataset.reportType=button.dataset.shopeeCorrect;dialog.dataset.periodStart=button.dataset.periodStart;dialog.dataset.periodEnd=button.dataset.periodEnd;dialog.querySelector('[data-correction-report]').textContent=reportLabels[button.dataset.shopeeCorrect]||button.dataset.shopeeCorrect;dialog.querySelector('[data-correction-period]').textContent=`${date(button.dataset.periodStart)} a ${date(button.dataset.periodEnd)}`;dialog.querySelector('[data-correction-file-name]').textContent=button.dataset.currentFile;dialog.showModal()});
  document.querySelector('#chooseShopeeCorrectionFile')?.addEventListener('click',()=>{const dialog=document.querySelector('#shopeeCorrectionDialog'),input=dialog.querySelector('[data-shopee-correction-file]');input.value='';input.click()});
  document.querySelector('[data-shopee-correction-file]')?.addEventListener('change',event=>{const dialog=document.querySelector('#shopeeCorrectionDialog'),file=event.currentTarget.files?.[0],type=dialog.dataset.reportType,expectedPeriod={start:dialog.dataset.periodStart,end:dialog.dataset.periodEnd};dialog.close();upload(type,file,null,'replace',expectedPeriod)});
  document.querySelector('#runShopeeAi')?.addEventListener('click',event=>runAI(event.currentTarget));
  document.querySelectorAll('[data-shopee-ai-action]').forEach(button=>button.onclick=()=>openTab(button.dataset.shopeeAiAction.replace('view_','')));
  document.querySelectorAll('[data-shopee-insight]').forEach(button=>button.onclick=()=>markInsight(button.dataset.shopeeInsight,button));
  const form=document.querySelector('#shopeeSettings');if(form)form.onsubmit=async event=>{event.preventDefault();const button=event.submitter,data=new FormData(form);button.disabled=true;try{await requireRecentAdminAuth('alterar o limite financeiro da Inteligência Shopee');await rpc('primary_admin_update_shopee_ai_settings',{p_enabled:data.get('enabled')==='on',p_monthly_budget_usd:n(data.get('budget')),p_manual_cooldown_minutes:n(data.get('cooldown'))});SH.loaded=false;await load(true);renderActive();toast('Proteção de custos da IA salva com auditoria.')}catch(error){if(error.message!=='Confirmação cancelada.')alert(error.message);button.disabled=false}};
}

window.HarmonyShopeeIntelligence=Object.freeze({state:SH,load,activate,openTab});
new MutationObserver(inject).observe(document.body,{childList:true,subtree:true});inject();
})();
