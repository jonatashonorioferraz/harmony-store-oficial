(function(){
  'use strict';
  const VIEW='shipping-labels';
  const VERSION='25.129';
  let frame=null,loadingTimer=null;
  // The parent keeps authentication. Only allowlisted operational summaries
  // reach the shared history; source files and tokens stay out of the bridge.
  const canUse=()=>Boolean(S.session&&S.profile?.role==='admin'&&S.profile.status==='active'&&!S.profile.must_change_password&&!sessionDocumentClosed);
  function reset(){
    window.HarmonyExpedition?.purge();
    clearTimeout(loadingTimer);loadingTimer=null;
    const previous=frame;frame=null;
    if(!previous)return;
    try{previous.contentWindow?.HarmonyConverterLifecycle?.dispose();}catch{}
    previous.remove();
  }
  function render(){
    if(!canUse()){reset();S.view='home';return renderApp();}
    const page=document.querySelector('#page');if(!page)return;
    reset();
    page.innerHTML=`<div class="page shipping-labels-page"><div class="shipping-labels-loading" role="status">Carregando a central local…</div><div id="shippingLabelsHost"></div></div>`;
    const created=document.createElement('iframe');frame=created;
    created.className='shipping-labels-frame';
    created.style.visibility='hidden';
    created.title='Conversor de etiquetas e fichas de separação';
    created.setAttribute('sandbox','allow-scripts allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox');
    created.setAttribute('referrerpolicy','no-referrer');
    created.src=`shipping-labels/index.html?v=${VERSION}`;
    function checkReady(timedOut=false){
      if(frame!==created)return;
      if(!canUse()){reset();return;}
      const status=page.querySelector('.shipping-labels-loading');if(!status)return;
      let ready=false;
      try{ready=Boolean(created.contentWindow?.HarmonyConverterLifecycle&&created.contentWindow?.HarmonyLabelsGuide);}catch{}
      status.hidden=ready;
      created.style.visibility=ready?'visible':'hidden';
      if(ready){clearTimeout(loadingTimer);loadingTimer=null;return;}
      status.textContent=timedOut?'O carregamento está demorando mais que o esperado. Confira sua conexão ou tente novamente.':'Não foi possível iniciar o conversor. Confira sua conexão e tente novamente.';
      const retry=document.createElement('button');retry.type='button';retry.className='shipping-labels-retry';retry.textContent='Tentar novamente';
      retry.addEventListener('click',()=>{if(frame===created)render();});status.append(retry);
    }
    created.addEventListener('load',()=>checkReady());
    loadingTimer=setTimeout(()=>checkReady(true),20000);
    document.querySelector('#shippingLabelsHost').append(created);
    window.HarmonyExpedition?.mount(page.querySelector('.shipping-labels-page'));
  }
  window.addEventListener('message',event=>{
    if(!frame||!canUse()||event.source!==frame.contentWindow||event.origin!==location.origin)return;
    if(event.data?.type!=='harmony-labels:height'||!Number.isFinite(event.data.height))return;
    if(event.data.height<=0)return;
    frame.style.height=`${Math.max(320,Math.min(1000000,Math.ceil(event.data.height)+8))}px`;
  });
  window.HarmonyShippingLabels=Object.freeze({canUse,reset,render,
    historyAccount(source){if(!canUse()||source!==frame?.contentWindow)throw Error('Acesso encerrado.');return window.HarmonyExpedition.historyAccount();},
    recordConversion(source,input){if(!canUse()||source!==frame?.contentWindow)throw Error('Acesso encerrado.');return window.HarmonyExpedition.record(input);},open(){if(!canUse())return;S.view=VIEW;renderApp();}});
  new MutationObserver(()=>{if(frame&&(!canUse()||!frame.isConnected||S.view!==VIEW))reset();}).observe(document.body,{childList:true,subtree:true});
})();
