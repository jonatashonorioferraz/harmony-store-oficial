(()=>{
'use strict';

const SH={tab:'overview',loaded:false,loading:null,error:'',data:null,usage:null,analyses:[],analysis:null,insights:[],from:'',to:'',uploading:''};
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

async function edge(path,body,form=false){
  await ensureSession();
  const call=()=>apiFetch(API+'/functions/v1/'+path,{method:'POST',headers:form?{apikey:KEY,Authorization:'Bearer '+S.session.access_token}:{apikey:KEY,Authorization:'Bearer '+S.session.access_token,'Content-Type':'application/json'},body:form?body:JSON.stringify(body)});
  let response=await call();if(response.status===401){await refreshSession();response=await call()}return json(response);
}

async function load(force=false){
  if(!isAdmin())return;
  if(SH.loading)return SH.loading;
  if(SH.loaded&&!force)return;
  SH.loading=(async()=>{
    SH.error='';
    try{
      const [data,usage,analyses]=await Promise.all([
        rpc('admin_get_shopee_dashboard',{p_from:SH.from||null,p_to:SH.to||null}),
        rpc('admin_get_shopee_ai_usage',{}),
        rest('shopee_ai_analyses?select=*&status=eq.completed&order=completed_at.desc&limit=12')
      ]);
      SH.data=data||{};SH.usage=Array.isArray(usage)?usage[0]||null:usage;SH.analyses=analyses||[];SH.analysis=SH.analyses[0]||null;
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
function deterministicAlerts(){
  const placed=sales('placed'),paid=sales('paid'),alerts=[];
  const gap=n(placed.sales)-n(paid.sales),gapRate=n(placed.sales)>0?gap/n(placed.sales):0;
  if(gapRate>.08)alerts.push({priority:gapRate>.15?'high':'medium',title:'Diferença entre vendas feitas e pagas',text:`Há ${money(gap)} (${percent(gapRate)}) entre o valor realizado e o pago no período.`,tab:'overview'});
  const cancelRate=n(placed.orders)>0?n(placed.cancelled_orders)/n(placed.orders):0;
  if(cancelRate>.05)alerts.push({priority:cancelRate>.12?'high':'medium',title:'Cancelamentos merecem acompanhamento',text:`Foram ${number(placed.cancelled_orders)} pedidos cancelados, equivalentes a ${percent(cancelRate)} dos pedidos feitos.`,tab:'overview'});
  const funnel=SH.data?.funnel||{},cartToPaid=n(funnel.cart_visitors)>0?n(funnel.paid_buyers)/n(funnel.cart_visitors):0;
  if(n(funnel.cart_visitors)>0)alerts.push({priority:cartToPaid<.15?'medium':'low',title:'Conversão do carrinho em compra paga',text:`Dos visitantes que adicionaram produtos ao carrinho, ${percent(cartToPaid)} concluíram uma compra paga.`,tab:'products'});
  const missing=completeness().missing;
  if(missing)alerts.push({priority:'medium',title:'Semana ainda incompleta',text:`Faltam ${missing} ${missing===1?'tipo de relatório':'tipos de relatório'} para uma leitura completa da semana mais recente.`,tab:'imports'});
  return alerts.slice(0,4);
}

function logo(){return`<span class="shopee-mark" aria-hidden="true"><i>S</i></span>`}
function navigation(){
  const tabs=[['overview','Visão geral'],['products','Produtos'],['marketing','Marketing'],['promotions','Promoções'],['imports','Importações']];
  return`<nav class="shopee-tabs" aria-label="Relatórios Shopee">${tabs.map(([id,label])=>`<button data-shopee-tab="${id}" class="${SH.tab===id?'active':''}">${label}</button>`).join('')}</nav>`;
}
function filters(){return`<section class="card shopee-filters"><label>De<input id="shopeeFrom" type="date" value="${SH.from}"></label><label>Até<input id="shopeeTo" type="date" value="${SH.to}"></label><button class="shopee-outline" id="applyShopeeFilters">Aplicar período</button><span>Dados oficiais importados das planilhas da Shopee</span></section>`}

function trendChart(){
  const rows=SH.data?.trend||[];if(!rows.length)return'<div class="empty">Importe Estatísticas da Loja para visualizar a evolução.</div>';
  const values=rows.flatMap(row=>[n(row.placed_sales),n(row.paid_sales)]),max=Math.max(1,...values),width=720,height=220,pad=24;
  const points=key=>rows.map((row,index)=>`${pad+(width-pad*2)*(rows.length===1?.5:index/(rows.length-1))},${height-pad-(height-pad*2)*n(row[key])/max}`).join(' ');
  return`<div class="shopee-chart-wrap"><svg class="shopee-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução diária de vendas feitas e pagas"><defs><linearGradient id="shopeeArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ee4d2d" stop-opacity=".24"/><stop offset="1" stop-color="#ee4d2d" stop-opacity="0"/></linearGradient></defs><polyline class="placed" points="${points('placed_sales')}"/><polyline class="paid" points="${points('paid_sales')}"/>${rows.map((row,index)=>{const x=pad+(width-pad*2)*(rows.length===1?.5:index/(rows.length-1));return`<text x="${x}" y="214" text-anchor="middle">${new Date(row.metric_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</text>`}).join('')}</svg><footer><span><i class="placed"></i>Pedidos feitos</span><span><i class="paid"></i>Pedidos pagos</span></footer></div>`;
}

function aiSummary(){
  const visible=SH.insights.filter(item=>!item.dismissed_at),analysis=SH.analysis;
  return`<section class="shopee-ai-summary ${analysis?.health_status||'attention'}"><div><p class="eyebrow">INTELIGÊNCIA REAL · GPT-5.6 TERRA</p><h2>${analysis?'Leitura executiva da operação Shopee':'Transforme números em decisões'}</h2><p>${analysis?esc(analysis.overall_summary):'Os gráficos já usam dados reais. Quando você solicitar, a IA relacionará vendas, funil, tráfego, produtos e campanhas sem alterar nenhum registro.'}</p><small>${analysis?`Análise de ${date(analysis.period_start)} a ${date(analysis.period_end)} · ${datetime(analysis.completed_at)}`:'Abrir esta página não gera cobrança.'}</small></div><div><span class="shopee-ai-status">${analysis?'✦ '+(analysis.health_status==='critical'?'Crítico':analysis.health_status==='attention'?'Atenção':'Estável'):'IA aguardando análise'}</span><button class="shopee-primary" id="runShopeeAi" ${SH.usage&&!SH.usage.enabled?'disabled':''}>✦ Analisar agora com IA</button></div></section>${visible.length?`<div class="shopee-ai-insights">${visible.slice(0,4).map(insight=>`<article class="${esc(insight.priority)}"><header><span>${priorityLabels[insight.priority]||'Atenção'}</span><small>${categoryLabels[insight.category]||'Análise'}</small></header><h3>${esc(insight.title)}</h3><p>${esc(insight.explanation)}</p><b>Recomendação</b><p>${esc(insight.recommendation)}</p>${Array.isArray(insight.evidence)&&insight.evidence.length?`<details><summary>Ver evidências</summary><ul>${insight.evidence.map(value=>`<li>${esc(value)}</li>`).join('')}</ul></details>`:''}<footer>${actionLabels[insight.action_type]?`<button class="shopee-outline" data-shopee-ai-action="${insight.action_type}">${actionLabels[insight.action_type]}</button>`:''}<button class="ghost" data-shopee-insight="${insight.id}">Marcar como conferido</button></footer></article>`).join('')}</div>`:''}`;
}

function overview(){
  const placed=sales('placed'),paid=sales('paid'),gap=n(placed.sales)-n(paid.sales),alerts=deterministicAlerts(),comp=completeness();
  return`${aiSummary()}<section class="shopee-kpis"><article><small>VENDAS PAGAS</small><b>${money(paid.sales)}</b><span>${number(paid.orders)} pedidos pagos</span></article><article><small>VENDAS REALIZADAS</small><b>${money(placed.sales)}</b><span>${number(placed.orders)} pedidos feitos</span></article><article class="${gap>0?'attention':''}"><small>DIFERENÇA</small><b>${money(gap)}</b><span>Feito × pago</span></article><article><small>COMPRADORES</small><b>${number(paid.buyers)}</b><span>${number(paid.new_buyers)} novos</span></article></section><div class="shopee-overview-grid"><section class="card shopee-section"><div class="card-head"><div><p class="eyebrow">VENDAS AO LONGO DO PERÍODO</p><h2>Pedidos feitos × pagos</h2></div></div>${trendChart()}</section><aside class="card shopee-alerts"><div class="card-head"><div><p class="eyebrow">PONTOS PARA AGIR</p><h2>Leitura automática</h2></div></div>${alerts.map(item=>`<button data-shopee-alert="${item.tab}" class="${item.priority}"><i></i><span><b>${esc(item.title)}</b><small>${esc(item.text)}</small></span><em>Ver</em></button>`).join('')||'<div class="empty">Nenhum alerta calculado no período.</div>'}<footer>${comp.complete} de ${comp.total} semana(s) com os três relatórios</footer></aside></div>`;
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

function importCard(type){
  const latest=(SH.data?.imports||[]).find(item=>item.report_type===type),busy=SH.uploading===type;
  return`<article class="shopee-import-card ${latest?'complete':''}"><header><i>${type==='shop_stats'?'↗':type==='product_funnel'?'⌁':'%'}</i><span><small>${latest?'ÚLTIMO ARQUIVO VALIDADO':'AGUARDANDO IMPORTAÇÃO'}</small><h3>${reportLabels[type]}</h3></span>${latest?'<em>✓</em>':''}</header><p>${reportDescriptions[type]}</p>${latest?`<div class="shopee-import-meta"><span><b>${date(latest.period_start)} a ${date(latest.period_end)}</b><small>${esc(latest.file_name)}</small></span><strong>${number(latest.row_count)} linhas</strong></div>`:'<div class="shopee-import-empty">Nenhum arquivo deste tipo no período selecionado.</div>'}<input hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-shopee-file="${type}"><button class="${latest?'shopee-outline':'shopee-primary'}" data-shopee-upload="${type}" ${busy?'disabled':''}>${busy?'Validando e importando…':latest?'Substituir por arquivo corrigido':'Selecionar planilha .xlsx'}</button>${busy?'<progress class="shopee-progress"></progress>':''}</article>`;
}
function importsView(){
  const items=SH.data?.imports||[];
  return`<section class="shopee-import-hero"><div>${logo()}<span><p class="eyebrow">CENTRAL DE IMPORTAÇÃO SEGURA</p><h2>Três relatórios, uma leitura completa</h2><p>Escolha o tipo antes de enviar. O sistema valida estrutura, período e duplicidade antes de registrar qualquer métrica.</p></span></div><aside><b>Sem soma duplicada</b><small>Arquivos repetidos são reconhecidos pelo conteúdo.</small></aside></section><div class="shopee-import-grid">${Object.keys(reportLabels).map(importCard).join('')}</div><section class="card shopee-section"><div class="card-head"><div><p class="eyebrow">HISTÓRICO AUDITÁVEL</p><h2>Arquivos importados</h2></div></div><div class="table-wrap"><table class="shopee-table"><thead><tr><th>Tipo</th><th>Período</th><th>Arquivo</th><th>Linhas</th><th>Importado por</th><th>Data</th></tr></thead><tbody>${items.map(item=>`<tr><td><b>${reportLabels[item.report_type]||esc(item.report_type)}</b></td><td>${date(item.period_start)} a ${date(item.period_end)}</td><td>${esc(item.file_name)}</td><td>${number(item.row_count)}</td><td>${esc(item.imported_by)}</td><td>${datetime(item.imported_at)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Nenhuma planilha importada neste período.</td></tr>'}</tbody></table></div></section>${settings()}`;
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
  return`<div class="shopee-intelligence"><header class="shopee-header"><div>${logo()}<span><p class="eyebrow">HARMONY COMMERCE INTELLIGENCE</p><h2>Shopee Analytics</h2><p>Vendas, produtos, marketing, promoções e IA em uma visão segura.</p></span></div><button class="shopee-outline" id="refreshShopee">↻ Atualizar dados</button></header>${navigation()}${filters()}<main>${(views[SH.tab]||overview)()}</main></div>`;
}

function renderActive(){const mount=document.querySelector('#shopeeIntelligenceDashboard');if(!mount)return;mount.innerHTML=shell();bind()}
function openTab(tab){SH.tab=tab;renderActive()}
async function activate(){if(!isAdmin())return;await load();renderActive()}
function inject(){if(!isAdmin()||S.view!=='intelligence')return;const mount=document.querySelector('#shopeeIntelligenceDashboard');if(!mount||mount.dataset.ready)return;mount.dataset.ready='true';activate()}

async function upload(type,file,button){
  if(!file)return;if(file.size>12*1024*1024)return alert('O arquivo deve ter no máximo 12 MB.');
  SH.uploading=type;renderActive();
  try{const form=new FormData();form.append('report_type',type);form.append('file',file,file.name);const result=await edge('process-shopee-report',form,true);SH.loaded=false;await load(true);SH.tab='imports';renderActive();toast(result.result?.status==='duplicate'?'Esta planilha já estava importada. Nenhum valor foi duplicado.':`${reportLabels[type]} importado e validado com sucesso.`)}
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
  document.querySelector('#refreshShopee')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;SH.loaded=false;await load(true);renderActive()});
  document.querySelector('#applyShopeeFilters')?.addEventListener('click',async event=>{const from=document.querySelector('#shopeeFrom').value,to=document.querySelector('#shopeeTo').value;if(!from||!to||to<from)return alert('Informe um período válido.');SH.from=from;SH.to=to;event.currentTarget.disabled=true;SH.loaded=false;await load(true);renderActive()});
  document.querySelectorAll('[data-shopee-alert]').forEach(button=>button.onclick=()=>openTab(button.dataset.shopeeAlert));
  document.querySelectorAll('[data-shopee-upload]').forEach(button=>button.onclick=()=>document.querySelector(`[data-shopee-file="${button.dataset.shopeeUpload}"]`).click());
  document.querySelectorAll('[data-shopee-file]').forEach(input=>input.onchange=()=>upload(input.dataset.shopeeFile,input.files?.[0],document.querySelector(`[data-shopee-upload="${input.dataset.shopeeFile}"]`)));
  document.querySelector('#runShopeeAi')?.addEventListener('click',event=>runAI(event.currentTarget));
  document.querySelectorAll('[data-shopee-ai-action]').forEach(button=>button.onclick=()=>openTab(button.dataset.shopeeAiAction.replace('view_','')));
  document.querySelectorAll('[data-shopee-insight]').forEach(button=>button.onclick=()=>markInsight(button.dataset.shopeeInsight,button));
  const form=document.querySelector('#shopeeSettings');if(form)form.onsubmit=async event=>{event.preventDefault();const button=event.submitter,data=new FormData(form);button.disabled=true;try{await requireRecentAdminAuth('alterar o limite financeiro da Inteligência Shopee');await rpc('primary_admin_update_shopee_ai_settings',{p_enabled:data.get('enabled')==='on',p_monthly_budget_usd:n(data.get('budget')),p_manual_cooldown_minutes:n(data.get('cooldown'))});SH.loaded=false;await load(true);renderActive();toast('Proteção de custos da IA salva com auditoria.')}catch(error){if(error.message!=='Confirmação cancelada.')alert(error.message);button.disabled=false}};
}

window.HarmonyShopeeIntelligence=Object.freeze({state:SH,load,activate,openTab});
new MutationObserver(inject).observe(document.body,{childList:true,subtree:true});inject();
})();
