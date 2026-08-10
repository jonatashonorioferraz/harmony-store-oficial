(function(){
'use strict';

const viewLabels={
  home:'Preparando seu painel',requests:'Carregando solicitações',new:'Abrindo nova solicitação',
  products:'Carregando produtos',categories:'Carregando categorias',team:'Carregando colaboradoras',
  fields:'Carregando configurações',audit:'Carregando auditoria',profile:'Abrindo seu perfil',
  intelligence:'Carregando inteligência','internal-supplies':'Carregando suprimentos',
  'production-orders':'Carregando ordens de produção',production:'Carregando recebimentos',
  'production-inventory':'Carregando inventário',notifications:'Carregando notificações',
  bills:'Carregando boletos','collaborator-timeline':'Carregando histórico',help:'Abrindo a central de ajuda',
  health:'Verificando a saúde do sistema'
};

let overlay=null,activeLoads=0,showTimer=0,hideTimer=0,visibleAt=0;

function ensureOverlay(){
  if(overlay?.isConnected)return overlay;
  overlay=document.createElement('div');
  overlay.id='harmonyModuleLoader';
  overlay.className='harmony-module-loader';
  overlay.hidden=true;
  overlay.setAttribute('role','status');
  overlay.setAttribute('aria-live','polite');
  overlay.setAttribute('aria-atomic','true');
  overlay.innerHTML=`<div class="harmony-module-loader__card"><span class="harmony-module-loader__mark"><img src="icon-192-v2.png" alt="" aria-hidden="true"></span><span class="harmony-module-loader__copy"><b>Harmony Store</b><small>Organizando sua tela…</small></span><i aria-hidden="true"></i></div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function loadingLabel(){
  const view=typeof S!=='undefined'?S?.view:'';
  return viewLabels[view]||'Organizando sua tela';
}

function beginPageLoad(){
  activeLoads+=1;
  clearTimeout(hideTimer);
  const element=ensureOverlay(),copy=element.querySelector('small');
  if(copy)copy.textContent=loadingLabel()+'…';
  document.querySelector('#app')?.setAttribute('aria-busy','true');
  if(activeLoads===1){
    clearTimeout(showTimer);
    showTimer=setTimeout(()=>{
      if(!activeLoads)return;
      element.hidden=false;
      visibleAt=performance.now();
      requestAnimationFrame(()=>element.classList.add('is-visible'));
    },120);
  }
}

function endPageLoad(){
  activeLoads=Math.max(0,activeLoads-1);
  if(activeLoads)return;
  clearTimeout(showTimer);
  document.querySelector('#app')?.removeAttribute('aria-busy');
  if(!overlay||overlay.hidden)return;
  const remaining=Math.max(0,220-(performance.now()-visibleAt));
  hideTimer=setTimeout(()=>{
    if(activeLoads||!overlay)return;
    overlay.classList.remove('is-visible');
    setTimeout(()=>{if(!activeLoads&&overlay)overlay.hidden=true},170);
  },remaining);
}

const progressStages={
  upload:{value:5,cap:24,label:'Enviando o arquivo com segurança',detail:'Protegendo e preparando o documento.'},
  prepare:{value:27,cap:36,label:'Preparando a leitura',detail:'Ajustando o arquivo para a análise.'},
  reading:{value:39,cap:84,label:'A inteligência está lendo os dados',detail:'Identificando textos, datas, valores e itens.'},
  validate:{value:88,cap:96,label:'Conferindo as informações encontradas',detail:'Organizando os dados para sua revisão.'},
  done:{value:100,cap:100,label:'Leitura concluída',detail:'Tudo pronto para você conferir.'}
};

function createAIProgress(host,options={}){
  if(!host)return null;
  const name=options.name||'documento';
  host.hidden=true;
  host.className='harmony-ai-progress';
  host.innerHTML=`<div class="harmony-ai-progress__head"><span class="harmony-ai-progress__spark" aria-hidden="true">✦</span><div><b data-ai-progress-label>Preparando a leitura</b><small data-ai-progress-detail>Você poderá conferir tudo antes de salvar.</small></div><strong data-ai-progress-percent>0%</strong></div><div class="harmony-ai-progress__track" role="progressbar" aria-label="Progresso da leitura do ${name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-ai-progress-bar></i></div><div class="harmony-ai-progress__steps" aria-hidden="true"><span data-ai-step="upload">Envio</span><span data-ai-step="reading">Leitura</span><span data-ai-step="validate">Conferência</span></div><small class="harmony-ai-progress__note">O percentual acompanha as etapas concluídas e é estimado durante a interpretação.</small>`;
  let value=0,timer=0,current='';
  const label=host.querySelector('[data-ai-progress-label]'),detail=host.querySelector('[data-ai-progress-detail]'),percent=host.querySelector('[data-ai-progress-percent]'),bar=host.querySelector('[data-ai-progress-bar]'),track=host.querySelector('[role="progressbar"]');
  const paint=next=>{
    value=Math.max(0,Math.min(100,Math.round(next)));
    percent.textContent=value+'%';bar.style.width=value+'%';track.setAttribute('aria-valuenow',String(value));
  };
  const stop=()=>{clearInterval(timer);timer=0};
  const activate=stage=>{
    host.querySelectorAll('[data-ai-step]').forEach(item=>item.classList.toggle('is-active',item.dataset.aiStep===stage||stage==='prepare'&&item.dataset.aiStep==='upload'));
  };
  const phase=stage=>{
    const config=progressStages[stage];if(!config)return;
    stop();current=stage;host.hidden=false;host.classList.remove('is-error','is-complete');
    label.textContent=config.label;detail.textContent=config.detail;paint(Math.max(value,config.value));activate(stage);
    if(config.cap>value)timer=setInterval(()=>{if(value>=config.cap)return stop();paint(value+Math.max(1,Math.ceil((config.cap-value)/18)))},180);
  };
  const start=()=>{value=0;paint(0);phase('upload')};
  const complete=()=>new Promise(resolve=>{
    phase('done');stop();host.classList.add('is-complete');activate('validate');
    setTimeout(resolve,320);
  });
  const fail=()=>{
    stop();host.hidden=false;host.classList.add('is-error');host.classList.remove('is-complete');
    label.textContent='Não foi possível concluir a leitura';
    detail.textContent='Seu arquivo continua selecionado. Tente novamente ou escolha outro.';
    host.querySelectorAll('[data-ai-step]').forEach(item=>item.classList.remove('is-active'));
  };
  const reset=()=>{stop();current='';value=0;paint(0);host.hidden=true;host.classList.remove('is-error','is-complete')};
  return Object.freeze({start,phase,complete,fail,reset,get value(){return value},get phaseName(){return current}});
}

if(typeof renderPage==='function'){
  const previousRenderPage=renderPage;
  renderPage=async function(...args){
    beginPageLoad();
    try{return await previousRenderPage.apply(this,args)}finally{endPageLoad()}
  };
}

window.HarmonyExperience=Object.freeze({createAIProgress,beginPageLoad,endPageLoad});
})();
