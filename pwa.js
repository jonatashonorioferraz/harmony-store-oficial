const VAPID_PUBLIC_KEY='BO3nbsxNRC1fxbrKCtZXI30JbGz7AJqVFmO5ddksAEAODDFyZM-qF3fLxlqVdBfwd3cAtMvQq5vB3Xu-uXK2kMA';
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
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event});
  installButton.addEventListener('click',async()=>{
    if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;return}
    const apple=/iphone|ipad|ipod/i.test(navigator.userAgent);
    alert(apple
      ?'No Safari, toque no botão Compartilhar e escolha “Adicionar à Tela de Início”.'
      :'No Chrome, abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.');
  });
  window.addEventListener('appinstalled',()=>installButton.remove());
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
  if(/iphone|ipad|ipod/i.test(navigator.userAgent)&&!installed)throw Error('No iPhone, adicione primeiro o aplicativo à Tela de Início e abra pelo ícone.');
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
}

function addNotificationControl(){
  if(!S?.profile)return;
  const actions=document.querySelector('.profile .actions');
  if(!actions||document.querySelector('#pushNotifications'))return;
  const button=document.createElement('button');
  button.type='button';button.id='pushNotifications';button.className='outline';button.textContent='🔔 Verificando notificações…';
  actions.prepend(button);
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
