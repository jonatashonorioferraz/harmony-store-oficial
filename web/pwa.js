const VAPID_PUBLIC_KEY='BO3nbsxNRC1fxbrKCtZXI30JbGz7AJqVFmO5ddksAEAODDFyZM-qF3fLxlqVdBfwd3cAtMvQq5vB3Xu-uXK2kMA';
let deferredInstallPrompt=null;
const installed=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
const appleTouchDevice=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

async function keepPortraitOrientation(){
  if(!installed||!screen.orientation?.lock)return;
  try{await screen.orientation.lock('portrait-primary')}catch{}
}

window.addEventListener('load',keepPortraitOrientation);

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{const registration=await navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'});await registration.update()}catch{}
  });
}

if(!installed){
  const installButton=document.createElement('button');
  installButton.type='button';
  installButton.className='install-app';
  installButton.setAttribute('aria-label','Instalar Harmony Store neste aparelho');
  installButton.innerHTML='<img src="icon-192-v2.png" alt=""><span>Instalar aplicativo</span>';
  const placeInstallButton=()=>{
    const host=document.querySelector('.login-box')||document.body;
    if(installButton.parentElement!==host)host.appendChild(installButton);
  };
  const installPlacementObserver=new MutationObserver(placeInstallButton);
  installPlacementObserver.observe(document.body,{childList:true,subtree:true});
  placeInstallButton();
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event});
  installButton.addEventListener('click',async()=>{
    if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;return}
    alert(appleTouchDevice
      ?'No Safari do iPhone ou iPad, toque em Compartilhar e escolha “Adicionar à Tela de Início”.'
      :'No Chrome do celular ou tablet, abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.');
  });
  window.addEventListener('appinstalled',()=>{installPlacementObserver.disconnect();installButton.remove()});
}

function applicationServerKey(value){
  const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
}

async function currentPushSubscription(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window))return null;
  return (await navigator.serviceWorker.ready).pushManager.getSubscription();
}

async function enablePushNotifications(){
  if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('Este aparelho não oferece suporte a notificações.');
  if(appleTouchDevice&&!installed)throw Error('No iPhone ou iPad, adicione primeiro o aplicativo à Tela de Início e abra pelo ícone.');
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw Error('Permissão não concedida. Ative as notificações nas configurações do aparelho.');
  const registration=await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationServerKey(VAPID_PUBLIC_KEY)});
  const saved=subscription.toJSON();
  await rpc('save_own_push_subscription',{
    p_endpoint:subscription.endpoint,
    p_p256dh:saved.keys?.p256dh,
    p_auth:saved.keys?.auth,
    p_user_agent:navigator.userAgent
  });
  return subscription;
}

async function disablePushNotifications(){
  const subscription=await currentPushSubscription();
  if(!subscription)return;
  await rpc('remove_own_push_subscription',{p_endpoint:subscription.endpoint});
  await subscription.unsubscribe();
}

async function cleanupPushSubscription(){
  const subscription=await currentPushSubscription();
  if(!subscription)return;
  try{await rpc('remove_own_push_subscription',{p_endpoint:subscription.endpoint})}finally{await subscription.unsubscribe()}
}

async function sendNotificationEvent(event,requestId){
  if(!requestId||!S?.session?.access_token)return;
  try{
    await ensureSession();
    await json(await fetch(API+'/functions/v1/send-push',{
      method:'POST',
      headers:{apikey:KEY,Authorization:'Bearer '+S.session.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({event,request_id:requestId})
    }));
  }catch{}
}

async function updateNotificationButton(button){
  const active=Notification.permission==='granted'&&!!(await currentPushSubscription());
  button.textContent=active?'🔔 Notificações ativas':'🔔 Ativar notificações';
  button.dataset.active=active?'true':'false';
  const testButton=document.querySelector('#testPushNotification');
  if(testButton)testButton.hidden=!active;
}

async function showHarmonyTestNotification(){
  if(Notification.permission!=='granted')throw Error('Ative as notificações antes de fazer o teste.');
  const registration=await navigator.serviceWorker.ready;
  await registration.showNotification('Harmony Store • Notificação personalizada',{
    body:'Pronto! As notificações deste aparelho estão usando a identidade da Harmony Store.',
    icon:new URL('./icon-192-v2.png',location.href).href,
    badge:new URL('./notification-badge.svg',location.href).href,
    tag:'harmony-brand-test',renotify:true,vibrate:[90,45,90],
    actions:[{action:'open',title:'Abrir aplicativo'}],data:{url:'./',event:'brand_test'}
  });
}

function addNotificationControl(){
  if(!S?.profile)return;
  const actions=document.querySelector('.profile .actions');
  if(!actions||document.querySelector('#pushNotifications'))return;
  const button=document.createElement('button');
  button.type='button';button.id='pushNotifications';button.className='outline';button.textContent='🔔 Verificando notificações…';
  actions.prepend(button);
  const testButton=document.createElement('button');
  testButton.type='button';testButton.id='testPushNotification';testButton.className='ghost';testButton.textContent='✨ Testar notificação';testButton.hidden=true;
  button.insertAdjacentElement('afterend',testButton);
  testButton.onclick=async()=>{testButton.disabled=true;try{await showHarmonyTestNotification();toast('Notificação de teste enviada para este aparelho.')}catch(error){alert(error.message)}finally{testButton.disabled=false}};
  updateNotificationButton(button).catch(()=>{button.textContent='🔔 Ativar notificações'});
  button.onclick=async()=>{
    button.disabled=true;
    try{
      if(button.dataset.active==='true'){
        if(confirm('Desativar as notificações neste aparelho?')){await disablePushNotifications();toast('Notificações desativadas neste aparelho.')}
      }else{await enablePushNotifications();toast('Notificações ativadas neste aparelho.')}
      await updateNotificationButton(button);
    }catch(error){alert(error.message)}finally{button.disabled=false}
  };
}

function requestFromOpenModal(){
  const protocol=Number(document.querySelector('.modal .eyebrow')?.textContent.match(/\d+/)?.[0]);
  return S.requests.find(request=>Number(request.protocol)===protocol);
}

function wrapRequestAction(selector,eventName){
  const button=document.querySelector(selector);
  if(!button||button.dataset.pushWrapped==='true'||typeof button.onclick!=='function')return;
  button.dataset.pushWrapped='true';
  const original=button.onclick;
  button.onclick=async event=>{
    const beforeRequest=selector==='#sendReq'?null:requestFromOpenModal();
    const beforeIds=new Set(S.requests.map(request=>request.id));
    const beforeStatus=beforeRequest?.status,beforeUpdated=beforeRequest?.updated_at;
    await original.call(button,event);
    let changedRequest=beforeRequest&&S.requests.find(request=>request.id===beforeRequest.id);
    if(selector==='#sendReq')changedRequest=S.requests.find(request=>!beforeIds.has(request.id)&&request.requested_by===S.profile.id);
    const succeeded=selector==='#sendReq'
      ?!!changedRequest
      :eventName==='status_changed'
        ?changedRequest&&changedRequest.status!==beforeStatus
        :changedRequest&&changedRequest.updated_at!==beforeUpdated;
    if(succeeded)await sendNotificationEvent(eventName,changedRequest.id);
  };
}

function enhanceNotificationFeatures(){
  addNotificationControl();
  wrapRequestAction('#sendReq','request_created');
  wrapRequestAction('#saveOwnRequest','request_updated');
  wrapRequestAction('#prepareReq','status_changed');
  wrapRequestAction('#scheduleReq','status_changed');
  wrapRequestAction('#completeReq','status_changed');
  wrapRequestAction('#cancelReq','status_changed');
}

new MutationObserver(enhanceNotificationFeatures).observe(document.body,{childList:true,subtree:true});
