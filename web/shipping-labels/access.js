(function(){
  'use strict';
  let denied=false;
  function allowed(){
    let valid=false;
    try{valid=window.parent!==window&&window.parent.location.origin===location.origin&&window.parent.HarmonyShippingLabels?.canUse()===true;}catch{}
    if(valid&&!denied)return true;
    if(!denied){
      denied=true;window.HarmonyConverterLifecycle?.dispose();
      document.body.replaceChildren();
      const box=document.createElement('section');box.className='access-denied';
      const message=document.createElement('p');message.textContent='Abra esta ferramenta pelo menu “Etiquetas → Conversor de etiquetas” do aplicativo com uma conta ADM.';
      const link=document.createElement('a');link.href='../index.html';link.target='_top';link.textContent='Voltar ao aplicativo';
      box.append(message,link);document.body.append(box);
    }
    return false;
  }
  window.HarmonyConverterAccess=Object.freeze({allowed});
  if(!allowed())return;
  // Only layout dimensions cross the frame boundary, never labels, invoices,
  // file names, PDF bytes, extracted product data or authentication tokens.
  function size(){if(allowed())window.parent.postMessage({type:'harmony-labels:height',height:document.body.getBoundingClientRect().height},location.origin);}
  if(typeof ResizeObserver==='function')new ResizeObserver(size).observe(document.body);
  window.addEventListener('load',size);
  const timer=setInterval(()=>{if(!allowed())clearInterval(timer);},1000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
