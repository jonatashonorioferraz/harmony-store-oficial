(function(){
  'use strict';
  const VIEW='shipping-labels';
  const VERSION='25.115';
  let frame=null;
  // This tool has no server records or elevated APIs. The existing signed-in
  // profile controls its app entry point; no session/token enters the frame.
  const canUse=()=>Boolean(S.session&&S.profile?.role==='admin'&&S.profile.status==='active'&&!S.profile.must_change_password&&!sessionDocumentClosed);
  function reset(){
    const previous=frame;frame=null;
    if(!previous)return;
    try{previous.contentWindow?.HarmonyConverterLifecycle?.dispose();}catch{}
    previous.remove();
  }
  function render(){
    if(!canUse()){reset();S.view='home';return renderApp();}
    const page=document.querySelector('#page');if(!page)return;
    reset();
    page.innerHTML=`<div class="page shipping-labels-page">${head('EXPEDIÇÃO · EXCLUSIVO PARA ADMS','Conversor de etiquetas','Selecione as etiquetas e as notas do lote. Gere um PDF com cada etiqueta seguida das fichas, com até 4 produtos por folha de 10 × 15 cm.')}<p class="shipping-labels-privacy">Conversão no navegador · os arquivos dos pedidos não são enviados ao servidor.</p><div class="shipping-labels-loading" role="status">Carregando o conversor local…</div><div id="shippingLabelsHost"></div></div>`;
    const created=document.createElement('iframe');frame=created;
    created.className='shipping-labels-frame';
    created.title='Conversor de etiquetas e fichas de separação';
    created.setAttribute('sandbox','allow-scripts allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox');
    created.setAttribute('referrerpolicy','no-referrer');
    created.src=`shipping-labels/index.html?v=${VERSION}`;
    created.addEventListener('load',()=>{
      if(frame!==created)return;
      if(!canUse()){reset();return;}
      const status=page.querySelector('.shipping-labels-loading');if(!status)return;
      let ready=false;
      try{ready=Boolean(created.contentWindow?.HarmonyConverterLifecycle);}catch{}
      status.hidden=ready;
      if(!ready)status.textContent='Não foi possível carregar o conversor. Atualize o aplicativo conectado à internet e abra esta aba novamente.';
    });
    document.querySelector('#shippingLabelsHost').append(created);
  }
  window.addEventListener('message',event=>{
    if(!frame||!canUse()||event.source!==frame.contentWindow||event.origin!==location.origin)return;
    if(event.data?.type!=='harmony-labels:height'||!Number.isFinite(event.data.height))return;
    frame.style.height=`${Math.max(600,Math.min(6500,Math.ceil(event.data.height)+8))}px`;
  });
  window.HarmonyShippingLabels=Object.freeze({canUse,reset,render,open(){if(!canUse())return;S.view=VIEW;renderApp();}});
  new MutationObserver(()=>{if(frame&&(!canUse()||!frame.isConnected||S.view!==VIEW))reset();}).observe(document.body,{childList:true,subtree:true});
})();
