(function(){
'use strict';
const sourceNames={bills:'Boletos',requests:'Solicitações'};
const classificationNames={attention:'Atenção',upcoming:'Próximo vencimento',observation:'Acompanhar',not_evaluated:'Não avaliado'};
const sourceStatusNames={evaluated:'Consultada',unavailable:'Indisponível',invalid:'Dados não verificados',incomplete:'Consulta incompleta'};
const countFields=[['overdue_bills','Boletos vencidos','bills'],['due_today_bills','Vencem hoje','bills'],['due_tomorrow_bills','Vencem amanhã','bills'],['open_requests','Solicitações abertas','requests'],['past_scheduled_requests','Agendamento ultrapassado','requests']];
const state={generation:0,page:null,data:null,error:'',loading:false,family:'all',classification:'all',opening:false,originError:''};
const allowed=()=>S.profile?.role==='admin'&&S.profile.status==='active';
const current=context=>context.generation===state.generation&&context.page===state.page&&context.page===document.querySelector('#page')&&S.view==='operational-central'&&allowed()&&window.HarmonySession.isCurrent(context.session);
const capture=()=>({generation:state.generation,page:state.page,session:window.HarmonySession.capture()});
const assert=context=>{window.HarmonySession.assert(context.session);if(!current(context))throw Object.assign(Error('Consulta encerrada.'),{code:'SESSION_CHANGED'})};
const dateTime=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const sourceComplete=source=>source?.status==='evaluated'&&source.complete===true;

function reset(){state.generation++;Object.assign(state,{page:null,data:null,error:'',loading:false,family:'all',classification:'all',opening:false,originError:''})}
function validResponse(data){
  if(data?.schema_version!=='b0.1'||data.timezone!=='America/Sao_Paulo'||!validDate(data.evaluated_at)||!Array.isArray(data.sources)||data.sources.length!==2||!Array.isArray(data.conditions)||!Array.isArray(data.priorities)||!data.summary?.counts)throw Error('Resposta incompleta. Atualize a consulta.');
  for(const id of Object.keys(sourceNames)){
    const sources=data.sources.filter(source=>source.id===id);
    if(sources.length!==1||!Object.hasOwn(sourceStatusNames,sources[0].status)||typeof sources[0].complete!=='boolean')throw Error('Não foi possível confirmar as fontes desta consulta.');
  }
  const keys=new Set();
  for(const item of data.conditions){
    if(!item||typeof item.key!=='string'||keys.has(item.key)||typeof item.title!=='string'||typeof item.message!=='string'||!['financial','requests','data'].includes(item.family)||!Object.hasOwn(classificationNames,item.classification))throw Error('Não foi possível confirmar as observações desta consulta.');
    keys.add(item.key);
  }
  if(data.priorities.length>3||data.priorities.some(item=>!keys.has(item?.key)))throw Error('Não foi possível confirmar o resumo desta consulta.');
  for(const [key] of countFields)if(data.summary.counts[key]!==null&&(!Number.isSafeInteger(data.summary.counts[key])||data.summary.counts[key]<0))throw Error('Não foi possível confirmar os totais desta consulta.');
  return data;
}

async function evaluate(context){
  await ensureSession();assert(context);
  const request=()=>apiFetch(API+'/functions/v1/operational-central',{method:'POST',timeoutMs:60000,headers:{apikey:KEY,Authorization:'Bearer '+S.session.access_token,'Content-Type':'application/json'},body:'{}'});
  let response=await request();assert(context);
  if(response.status===401){await refreshSession();assert(context);response=await request();assert(context)}
  const data=await response.json().catch(()=>{throw Error('A consulta retornou uma resposta incompleta. Tente novamente.')});assert(context);
  if(!response.ok){
    if(response.status===403)throw Error('Esta consulta está disponível somente para administradores com cadastro ativo.');
    if(response.status===401)throw Error('Não foi possível confirmar sua sessão. Entre novamente.');
    throw Error('Não foi possível consultar os dados agora. Tente atualizar em instantes.');
  }
  return validResponse(data);
}

function factualDetails(item){
  const facts=item.facts||{},parts=[];
  if(item.protocol!==null&&item.protocol!==undefined){const name=item.entity_type==='bill'?'Boleto':'Solicitação';parts.push(name+' #'+String(item.protocol).padStart(4,'0'))}
  if(/^\d{4}-\d{2}-\d{2}$/.test(facts.due_date||'')){const [year,month,day]=facts.due_date.split('-');parts.push('Vencimento: '+day+'/'+month+'/'+year)}
  if(validDate(facts.created_at))parts.push('Criada em '+dateTime(facts.created_at)+' · São Paulo');
  if(validDate(facts.scheduled_for))parts.push('Agendada para '+dateTime(facts.scheduled_for)+' · São Paulo');
  return parts.length?'<p class="oc-facts">'+parts.map(esc).join(' · ')+'</p>':'';
}
function observation(item,compact=false,index=0){
  const view=item.origin?.view,hasOrigin=Object.hasOwn(sourceNames,view);
  return `<article class="oc-observation oc-${item.classification}${compact?' oc-compact':''}">
    <div class="oc-observation-copy"><div class="oc-item-meta">${compact?`<span class="oc-position" aria-hidden="true">${index+1}</span>`:''}<span class="oc-pill">${classificationNames[item.classification]}</span>${hasOrigin?`<span>${sourceNames[view]}</span>`:''}</div>
    <h3>${esc(item.title)}</h3>${factualDetails(item)}<p>${esc(item.message)}</p>${!compact&&validDate(item.source_updated_at)?`<small>Registro atualizado em ${esc(dateTime(item.source_updated_at))} · São Paulo</small>`:''}</div>
    ${hasOrigin?`<button class="outline" type="button" data-oc-origin="${view}" ${state.opening?'disabled':''}>Abrir ${sourceNames[view].toLocaleLowerCase('pt-BR')} <span aria-hidden="true">↗</span></button>`:''}
  </article>`;
}
function coverage(data){
  const complete=data.sources.filter(sourceComplete).length;
  return `<section class="card oc-coverage" aria-labelledby="ocCoverageTitle"><div class="oc-section-title"><div><h2 id="ocCoverageTitle">Fontes desta consulta</h2><p>${complete} de 2 fontes consultadas por completo</p></div><span class="oc-pill">Horário de São Paulo</span></div><div class="oc-source-grid">${data.sources.map(source=>`<article class="oc-source ${sourceComplete(source)?'oc-source-complete':'oc-source-unavailable'}"><div><h3>${sourceNames[source.id]}</h3><span>${sourceStatusNames[source.status]}</span></div><p>${sourceComplete(source)?`${Number.isSafeInteger(source.row_count)?source.row_count+' registros consultados':'Consulta concluída'}.`:'Esta fonte não permite confirmar a situação atual.'}</p>${validDate(source.fetched_at)?`<small>Consultada em ${esc(dateTime(source.fetched_at))}</small>`:''}</article>`).join('')}</div><p class="oc-footnote">As fontes podem refletir instantes diferentes da consulta. Um registro pode mudar enquanto a consulta é realizada. A Central não guarda o histórico destas consultas.</p></section>`;
}
function results(data){
  const complete=data.sources.filter(sourceComplete).length;
  const filtered=data.conditions.filter(item=>(state.family==='all'||item.family===state.family)&&(state.classification==='all'||item.classification===state.classification));
  const counts=countFields.map(([key,label,source])=>{const value=sourceComplete(data.sources.find(item=>item.id===source))?data.summary.counts[key]:null;return `<article class="oc-metric"><strong>${value===null?'—':value}</strong><span>${label}</span>${value===null?'<small>Indisponível nesta consulta</small>':''}</article>`}).join('');
  return `${complete<2?`<div class="oc-warning" role="status"><strong>${complete?'Consulta parcial':'Consulta indisponível'}</strong><p>${complete?'Uma das fontes não pôde ser avaliada por completo. Os números disponíveis se referem apenas à fonte consultada.':'Não foi possível avaliar as fontes nesta consulta. Atualize para tentar novamente.'}</p></div>`:''}
    <section class="oc-summary" aria-label="Resumo da consulta"><p>${esc(data.summary.text||'Confira as observações e a cobertura da consulta abaixo.')}</p><div class="oc-metrics">${counts}</div></section>
    <section class="oc-priorities" aria-labelledby="ocPriorityTitle"><div class="oc-section-title"><div><h2 id="ocPriorityTitle">Comece por aqui</h2><p>Até três observações para conferir. Os botões abrem o módulo; localize o registro pelo número.</p></div></div>${data.priorities.length?`<div class="oc-priority-grid">${data.priorities.map((item,index)=>observation(data.conditions.find(condition=>condition.key===item.key),true,index)).join('')}</div>`:`<div class="oc-empty">${complete===2?'Nenhuma ocorrência encontrada nos dois módulos nesta consulta.':'Sem observações confirmadas. Confira as fontes abaixo.'}</div>`}</section>
    <section class="oc-all" aria-labelledby="ocAllTitle"><div class="oc-section-title"><div><h2 id="ocAllTitle">Todas as observações</h2><p>Uma solicitação pode aparecer por tempo em aberto e por agendamento ultrapassado.</p></div></div><div class="oc-filters"><label>Fonte<select data-oc-family><option value="all">Todas as fontes</option><option value="financial">Boletos</option><option value="requests">Solicitações</option><option value="data">Fontes não avaliadas</option></select></label><label>Situação<select data-oc-classification><option value="all">Todas as situações</option>${Object.entries(classificationNames).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><span role="status">${filtered.length} de ${data.conditions.length} observações</span></div><div class="oc-list">${filtered.map(item=>observation(item)).join('')||'<div class="oc-empty">Nenhuma observação neste filtro.</div>'}</div></section>${coverage(data)}`;
}
function paint(){
  const page=state.page;if(!page||page!==document.querySelector('#page')||S.view!=='operational-central'||!allowed())return;
  const data=state.data;
  page.innerHTML=`<div class="page oc-page"><header class="page-head"><div><p class="eyebrow">ROTINA DA EMPRESA</p><h1>Central Operacional</h1><p class="oc-subtitle">Uma leitura de boletos e solicitações para orientar sua conferência.</p></div><button type="button" class="primary" data-oc-refresh ${state.loading||state.opening?'disabled':''}>${state.loading?'Consultando…':'↻ Atualizar consulta'}</button></header>
    <div class="oc-observation-note"><span class="oc-pill">Em observação</span><p>Consulta atual, sem histórico. As conferências e alterações continuam nos módulos de origem.</p></div>
    <p class="oc-updated" role="status">${data?`Consulta de ${esc(dateTime(data.evaluated_at))} · São Paulo`:'Os dados serão conferidos ao concluir a consulta.'}</p>
    <div class="oc-origin-status" role="status">${state.opening?'Atualizando o módulo de origem…':esc(state.originError)}</div>
    ${state.loading?'<section class="card oc-loading" aria-busy="true" role="status"><span aria-hidden="true">◌</span><h2>Consultando boletos e solicitações</h2><p>Conferindo a situação atual dos dois módulos…</p></section>':state.error?`<section class="card oc-error" role="alert"><h2>Consulta não concluída</h2><p>${esc(state.error)}</p><p>Nenhum total foi confirmado. Use “Atualizar consulta” para tentar novamente.</p></section>`:data?results(data):''}
    </div>`;
  page.querySelector('[data-oc-refresh]').onclick=()=>refresh();
  const family=page.querySelector('[data-oc-family]'),classification=page.querySelector('[data-oc-classification]');
  if(family){family.value=state.family;family.onchange=event=>{state.family=event.target.value;paint();state.page?.querySelector('[data-oc-family]')?.focus()}}
  if(classification){classification.value=state.classification;classification.onchange=event=>{state.classification=event.target.value;paint();state.page?.querySelector('[data-oc-classification]')?.focus()}}
  page.querySelectorAll('[data-oc-origin]').forEach(button=>button.onclick=()=>openOrigin(button.dataset.ocOrigin));
}
async function refresh(){
  if(!allowed()||!state.page||S.view!=='operational-central')return;
  state.generation++;Object.assign(state,{data:null,error:'',loading:true,opening:false,originError:''});
  const context=capture();paint();
  try{const data=await evaluate(context);assert(context);state.data=data}
  catch(error){if(!current(context))return;state.error=error?.code==='SESSION_CHANGED'?'Sua sessão mudou. Entre novamente.':error.message||'Não foi possível consultar os dados agora.'}
  finally{if(current(context)){state.loading=false;paint()}}
}
async function openOrigin(view){
  if(!Object.hasOwn(sourceNames,view)||!allowed()||state.opening)return;
  const context=capture();state.opening=true;state.originError='';paint();
  try{
    assert(context);
    if(view==='bills'){
      if(!window.HarmonyBills?.load)throw Error('O módulo de boletos não está disponível. Recarregue o aplicativo.');
      if(window.HarmonyBills.state?.loading)await window.HarmonyBills.state.loading.catch(()=>{});
      assert(context);await window.HarmonyBills.load(true);assert(context);
    }else{
      const requests=await restAll('requests?select=*&order=created_at.desc,id.desc');assert(context);S.requests=requests;
    }
    S.view=view;reset();renderApp();
  }catch(error){if(current(context)){state.originError=error.message||'Não foi possível atualizar o módulo de origem.';state.opening=false;paint()}}
}
async function render(page){
  reset();if(!allowed()){page.innerHTML='<div class="page"><div class="error" role="alert">Esta área está disponível somente para administradores com cadastro ativo.</div></div>';return}
  state.page=page;await refresh();
}
window.HarmonyOperationalCentral=Object.freeze({render,reset});
})();
