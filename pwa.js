let deferredInstallPrompt=null;
const installed=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
}

if(!installed){
  const installButton=document.createElement('button');
  installButton.type='button';
  installButton.className='install-app';
  installButton.innerHTML='<img src="icon-192.png" alt=""><span>Instalar aplicativo</span>';
  document.body.appendChild(installButton);

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredInstallPrompt=event;
  });

  installButton.addEventListener('click',async()=>{
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt=null;
      return;
    }
    const apple=/iphone|ipad|ipod/i.test(navigator.userAgent);
    alert(apple
      ?'No Safari, toque no botão Compartilhar e escolha “Adicionar à Tela de Início”.'
      :'No Chrome, abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.');
  });

  window.addEventListener('appinstalled',()=>installButton.remove());
}
