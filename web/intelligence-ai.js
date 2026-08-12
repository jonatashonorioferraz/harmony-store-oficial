(()=>{
'use strict';

const AI={active:false,loaded:false,loading:null,error:'',analyses:[],analysis:null,insights:[],usage:null,balance:[],boxes:[],pendingLabels:[],movements:[]};
const isAdmin=()=>S?.profile?.role==='admin';
const n=value=>Number(value||0);
const moneyUsd=value=>'US$ '+n(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4});
const number=value=>n(value).toLocaleString('pt-BR');
const when=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Ainda não realizada';
const ageDays=value=>value?Math.max(0,Math.floor((Date.now()-new Date(value+'T12:00:00').getTime())/86400000)):0;
const priorityLabel={critical:'Crítico',high:'Alta',medium:'Média',low:'Informativo'};
const categoryLabel={stockout_risk:'Risco de falta',slow_stock:'Caixas paradas',overstock:'Excesso de estoque',data_quality:'Qualidade dos dados',production_balance:'Produção planejada',worker_concentration:'Origem da produção',movement_anomaly:'Movimentação atípica',opportunity:'Oportunidade'};
const actionLabel={view_inventory:'Abrir inventário',view_boxes:'Ver caixas',view_movements:'Ver movimentações',view_worker:'Ver por colaboradora',view_production_orders:'Ver ordens de produção'};

async function edgeAnalyze(body){
  await ensureSession();
  const call=()=>apiFetch(API+'/functions/v1/analyze-inventory-intelligence',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+S.session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  let response=await call();if(response.status===401){await refreshSession();response=await call()}return json(response);
}

async function load(force=false){
  if(!isAdmin())return;
  if(AI.loading)return AI.loading;
  if(AI.loaded&&!force)return;
  AI.loading=(async()=>{
    AI.error='';
    try{
      const from=new Date(Date.now()-90*86400000).toISOString().slice(0,10),to=new Date().toISOString().slice(0,10);
      const [usage,analyses,balance,boxes,pendingLabels,movements]=await Promise.all([
        rpc('admin_get_inventory_ai_usage',{}),
        rest('inventory_ai_analyses?select=*&status=eq.completed&order=completed_at.desc&limit=12'),
        rpc('list_production_inventory_balance',{p_query:null,p_color_id:null,p_only_available:false}),
        rpc('list_available_production_inventory_boxes',{}),
        rpc('list_pending_production_inventory_labels',{}),
        rpc('list_production_inventory_movements_v2',{p_from:from,p_to:to,p_worker_id:null,p_model_id:null,p_color_id:null})
      ]);
      AI.usage=Array.isArray(usage)?usage[0]||null:usage;
      AI.analyses=analyses||[];AI.analysis=AI.analyses[0]||null;
      AI.balance=balance||[];AI.boxes=boxes||[];AI.pendingLabels=pendingLabels||[];AI.movements=movements||[];
      AI.insights=AI.analysis?await rest(`inventory_ai_insights?analysis_id=eq.${encodeURIComponent(AI.analysis.id)}&select=*&order=position.asc`):[];
      AI.loaded=true;
    }catch(error){AI.error=error.message||'Não foi possível carregar a Inteligência do Inventário.';AI.loaded=true}
  })().finally(()=>AI.loading=null);
  return AI.loading;
}

function liveMetrics(){
  const boxes=AI.boxes||[],units=AI.balance.reduce((sum,row)=>sum+n(row.quantity),0);
  return {boxes:boxes.length,units,aged:boxes.filter(row=>ageDays(row.entry_on)>45).length,missing:boxes.filter(row=>!String(row.box_reference||'').trim()).length,pending:AI.pendingLabels.length};
}

function costCard(){
  const usage=AI.usage||{},budget=n(usage.monthly_budget_usd),used=n(usage.month_cost_usd),percent=budget>0?Math.min(100,used/budget*100):used?100:0;
  return `<aside class="inventory-ai-cost"><header><span><small>ORÇAMENTO MENSAL</small><b>${moneyUsd(budget)}</b></span><em>${number(usage.month_analysis_count)} análise(s)</em></header><div class="inventory-ai-cost-bar"><i style="width:${percent}%"></i></div><footer><span>Utilizado: <b>${moneyUsd(used)}</b></span><span>Disponível: <b>${moneyUsd(usage.remaining_budget_usd)}</b></span></footer><small>Abrir esta página não gera cobrança. O custo ocorre somente ao gerar uma nova análise.</small></aside>`;
}

function overviewMetrics(){
  const metrics=liveMetrics();
  return `<section class="inventory-ai-live-metrics"><article><i>▣</i><span><small>CAIXAS DISPONÍVEIS</small><b>${number(metrics.boxes)}</b><em>Atualizado pelo inventário</em></span></article><article><i>∑</i><span><small>UNIDADES EM ESTOQUE</small><b>${number(metrics.units)}</b><em>Somente caixas disponíveis</em></span></article><article class="${metrics.aged?'attention':''}"><i>◷</i><span><small>CAIXAS HÁ MAIS DE 45 DIAS</small><b>${number(metrics.aged)}</b><em>Revisar giro do estoque</em></span></article><article class="${metrics.missing?'attention':''}"><i>⌖</i><span><small>SEM LOCALIZAÇÃO</small><b>${number(metrics.missing)}</b><em>${metrics.pending?`${metrics.pending} etiqueta(s) pendente(s)`:'Dados físicos conferidos'}</em></span></article></section>`;
}

function insightCard(item){
  const evidence=Array.isArray(item.evidence)?item.evidence:[],reviewed=Boolean(item.reviewed_at),dismissed=Boolean(item.dismissed_at),action=actionLabel[item.action_type];
  return `<article class="inventory-ai-insight ${esc(item.priority)} ${reviewed?'reviewed':''} ${dismissed?'dismissed':''}" data-ai-insight="${item.id}"><header><span class="inventory-ai-priority">${priorityLabel[item.priority]||'Atenção'}</span><small>${categoryLabel[item.category]||'Análise operacional'}</small>${reviewed?'<em>✓ Conferido</em>':''}</header><h3>${esc(item.title)}</h3><p>${esc(item.explanation)}</p><div class="inventory-ai-recommendation"><b>Recomendação da IA</b><span>${esc(item.recommendation)}</span></div>${evidence.length?`<details><summary>Por que a IA sugeriu isso?</summary><ul>${evidence.map(value=>`<li>${esc(value)}</li>`).join('')}</ul></details>`:''}<footer>${action?`<button class="primary compact-action" data-ai-open="${esc(item.action_type)}" data-model-id="${esc(item.model_id||'')}" data-color-id="${esc(item.color_id||'')}" data-worker-id="${esc(item.worker_id||'')}">${action}</button>`:''}${!reviewed?`<button class="outline compact-action" data-ai-mark="reviewed" data-id="${item.id}">✓ Marcar como conferido</button>`:''}${!dismissed?`<button class="ghost compact-action" data-ai-mark="dismissed" data-id="${item.id}">Ocultar</button>`:''}</footer></article>`;
}

function stockTable(){
  const rows=[...AI.balance].filter(row=>n(row.quantity)>0).sort((a,b)=>n(b.quantity)-n(a.quantity)).slice(0,8);
  const max=Math.max(1,...rows.map(row=>n(row.quantity)));
  return `<section class="card inventory-ai-stock"><div class="card-head"><div><p class="eyebrow">ESTOQUE EM TEMPO REAL</p><h2>Maiores saldos do Inventário</h2><span>Modelo e cor, sem depender da análise da IA.</span></div><button class="outline compact-action" data-ai-open="view_inventory">Abrir inventário</button></div><div>${rows.map(row=>`<article><span><b>${esc(row.model_name)}</b><small><i style="--ai-color:${esc(row.color_hex)}"></i>${esc(row.color_name)} · ${number(row.entry_count)} caixa(s)</small></span><strong>${number(row.quantity)} un.</strong><em><i style="width:${Math.max(4,n(row.quantity)/max*100)}%"></i></em></article>`).join('')||'<div class="empty">Nenhuma caixa disponível no inventário.</div>'}</div></section>`;
}

function flowChart(){
  const groups=new Map();AI.movements.forEach(row=>{const key=String(row.occurred_on||'').slice(0,7),item=groups.get(key)||{key,entry:0,exit:0};if(['entry','adjustment_in'].includes(row.movement_type))item.entry+=n(row.quantity);else item.exit+=n(row.quantity);groups.set(key,item)});
  const rows=[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key)).slice(-4),max=Math.max(1,...rows.flatMap(row=>[row.entry,row.exit]));
  return `<section class="card inventory-ai-flow"><div class="card-head"><div><p class="eyebrow">MOVIMENTAÇÃO</p><h2>Entradas e transferências</h2><span>Últimos meses com movimentação registrada.</span></div><button class="outline compact-action" data-ai-open="view_movements">Ver histórico</button></div><div class="inventory-ai-flow-chart">${rows.map(row=>`<article><span><i class="entry" style="height:${Math.max(4,row.entry/max*100)}%" title="Entradas: ${number(row.entry)}"></i><i class="exit" style="height:${Math.max(4,row.exit/max*100)}%" title="Saídas: ${number(row.exit)}"></i></span><b>${new Date(row.key+'-02T12:00:00').toLocaleDateString('pt-BR',{month:'short'})}</b><small>+${number(row.entry)} / −${number(row.exit)}</small></article>`).join('')||'<div class="empty">Ainda não há movimentações suficientes.</div>'}</div><footer><span><i class="entry"></i> Entradas</span><span><i class="exit"></i> Transferências e ajustes</span></footer></section>`;
}

function history(){
  return `<aside class="card inventory-ai-history"><div class="card-head"><div><p class="eyebrow">HISTÓRICO AUDITÁVEL</p><h2>Análises anteriores</h2></div></div><div>${AI.analyses.map(item=>`<button class="${AI.analysis?.id===item.id?'active':''}" data-ai-analysis="${item.id}"><span><b>${when(item.completed_at)}</b><small>${esc(item.model)} · ${moneyUsd(item.estimated_cost_usd)}</small></span><em class="${esc(item.health_status)}">${item.health_status==='critical'?'Crítico':item.health_status==='attention'?'Atenção':'Estável'}</em></button>`).join('')||'<div class="empty">A primeira análise ainda não foi gerada.</div>'}</div></aside>`;
}

function settings(){
  if(!S.profile?.is_primary_admin||!AI.usage)return'';
  return `<details class="card inventory-ai-settings"><summary>Configuração e limite de segurança</summary><form id="inventoryAiSettings"><label>Orçamento mensal em dólar<input name="budget" type="number" min="0" max="1000" step="0.50" value="${n(AI.usage.monthly_budget_usd)}" required></label><label>Intervalo entre análises manuais<input name="cooldown" type="number" min="1" max="1440" value="${n(AI.usage.manual_cooldown_minutes)||10}" required><small>Em minutos</small></label><label class="inventory-ai-switch"><input name="enabled" type="checkbox" ${AI.usage.enabled?'checked':''}> Inteligência habilitada</label><button class="primary compact-action">Salvar configuração</button></form></details>`;
}

function fullView(){
  const analysis=AI.analysis,visible=AI.insights.filter(item=>!item.dismissed_at),health=analysis?.health_status||'attention';
  if(AI.loading&&!AI.loaded)return'<div class="loading-inline">Preparando os dados seguros do Inventário…</div>';
  if(AI.error)return `<section class="card inventory-ai-unavailable"><p class="eyebrow">INTELIGÊNCIA DO INVENTÁRIO</p><h2>Atualização técnica necessária</h2><p>O restante da aba Inteligência continua funcionando normalmente.</p><small>${esc(AI.error)}</small></section>`;
  return `<div class="inventory-ai-page"><section class="inventory-ai-hero ${health}"><div><p class="eyebrow">INTELIGÊNCIA REAL · GPT-5.6 TERRA</p><h2>O que merece atenção no Inventário?</h2><p>${analysis?esc(analysis.overall_summary):'Gere a primeira análise para relacionar estoque, caixas, movimentações, produção e qualidade dos dados.'}</p><small>${analysis?`Análise de ${analysis.period_days} dias · gerada em ${when(analysis.completed_at)} · números calculados pelo Supabase`:'Os indicadores e gráficos abaixo já usam dados reais; somente a interpretação da IA ainda não foi gerada.'}</small></div><div class="inventory-ai-hero-actions"><span class="inventory-ai-health"><i></i>${analysis?(health==='critical'?'Estado crítico':health==='attention'?'Pontos de atenção':'Operação estável'):'Aguardando análise'}</span><button class="primary" id="runInventoryAi" ${AI.usage&&!AI.usage.enabled?'disabled':''}>✦ Analisar agora com IA</button></div></section>${overviewMetrics()}<div class="inventory-ai-data-grid">${stockTable()}${flowChart()}</div><div class="inventory-ai-main"><section class="inventory-ai-insights"><header><div><p class="eyebrow">INSIGHTS PRIORITÁRIOS</p><h2>Análise e recomendações</h2></div><span>${visible.length} insight(s) visível(is)</span></header>${visible.map(insightCard).join('')||'<div class="card empty">Nenhum insight pendente. Consulte o histórico ou gere uma nova análise.</div>'}</section><div class="inventory-ai-side">${costCard()}${history()}</div></div>${settings()}</div>`;
}

async function chooseAnalysis(id){
  const selected=AI.analyses.find(item=>item.id===id);if(!selected)return;AI.analysis=selected;
  AI.insights=await rest(`inventory_ai_insights?analysis_id=eq.${encodeURIComponent(id)}&select=*&order=position.asc`);renderActive();
}

function openAction(action){
  if(action==='view_production_orders'){S.view='production-orders';renderApp();return}
  const tab=action==='view_boxes'?'boxes':action==='view_movements'?'movements':action==='view_worker'?'workers':'balance';
  if(window.HarmonyProductionInventory?.open)return window.HarmonyProductionInventory.open(tab);
  S.view='production-inventory';renderApp();
}

async function runAnalysis(button){
  const original=button.innerHTML;button.disabled=true;button.innerHTML='<span class="inventory-ai-spinner"></span> Analisando dados…';
  try{await edgeAnalyze({trigger:'manual'});AI.loaded=false;await load(true);renderActive();toast('Nova análise do Inventário concluída com IA.')}catch(error){alert(error.message)}finally{if(document.body.contains(button)){button.disabled=false;button.innerHTML=original}}
}

async function markInsight(id,action,button){
  button.disabled=true;try{await rpc('admin_mark_inventory_ai_insight',{p_insight_id:id,p_action:action});const item=AI.insights.find(row=>row.id===id);if(item){const now=new Date().toISOString();if(action==='reviewed')item.reviewed_at=now;else{item.dismissed_at=now;item.reviewed_at=item.reviewed_at||now}}renderActive();toast(action==='reviewed'?'Insight marcado como conferido.':'Insight ocultado da visão atual.')}catch(error){alert(error.message);button.disabled=false}
}

function bind(){
  document.querySelector('#runInventoryAi')?.addEventListener('click',event=>runAnalysis(event.currentTarget));
  document.querySelectorAll('[data-ai-open]').forEach(button=>button.onclick=()=>openAction(button.dataset.aiOpen));
  document.querySelectorAll('[data-ai-mark]').forEach(button=>button.onclick=()=>markInsight(button.dataset.id,button.dataset.aiMark,button));
  document.querySelectorAll('[data-ai-analysis]').forEach(button=>button.onclick=()=>chooseAnalysis(button.dataset.aiAnalysis));
  const form=document.querySelector('#inventoryAiSettings');if(form)form.onsubmit=async event=>{event.preventDefault();const button=event.submitter,data=new FormData(form);button.disabled=true;try{await requireRecentAdminAuth('alterar o limite financeiro da Inteligência');await rpc('primary_admin_update_inventory_ai_settings',{p_enabled:data.get('enabled')==='on',p_monthly_budget_usd:n(data.get('budget')),p_manual_cooldown_minutes:n(data.get('cooldown'))});AI.loaded=false;await load(true);renderActive();toast('Configuração da Inteligência salva com auditoria.')}catch(error){if(error.message!=='Confirmação cancelada.')alert(error.message);button.disabled=false}};
}

function renderActive(){
  const dashboard=document.querySelector('#inventoryAiDashboard');if(!dashboard)return;
  dashboard.innerHTML=fullView();bind();
}

async function activate(){
  AI.active=true;
  if(S.view!=='intelligence'){S.view='intelligence';renderApp()}
  if(window.HarmonyIntelligence?.state?.tab!=='overview'){window.HarmonyIntelligence?.openTab('overview');return}
  const dashboard=document.querySelector('#inventoryAiDashboard');if(dashboard)dashboard.innerHTML='<div class="loading-inline">Conectando métricas e Inteligência do Inventário…</div>';
  await load();renderActive();
}

function inject(){
  if(!isAdmin()||S.view!=='intelligence')return;
  const dashboard=document.querySelector('#inventoryAiDashboard');if(!dashboard||dashboard.querySelector('.inventory-ai-page,.inventory-ai-unavailable'))return;
  load().then(()=>{if(S.view!=='intelligence'||!document.querySelector('#inventoryAiDashboard'))return;renderActive()});
}

window.HarmonyInventoryAI=Object.freeze({state:AI,load,activate});
new MutationObserver(inject).observe(document.body,{childList:true,subtree:true});inject();
})();
