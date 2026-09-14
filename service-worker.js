const CACHE='harmony-store-v25-99-r2';
const PUBLIC_MEDIA_CACHE='harmony-public-media-v1';
const PUBLIC_MEDIA_TTL=24*60*60*1000;
const PUBLIC_MEDIA_MAX_BYTES=48*1024*1024;
const PUBLIC_MEDIA_MAX_ITEMS=80;
const publicMediaPending=new Map();
let publicMediaMaintenance=Promise.resolve();

const SHELL=['./','./index.html','./styles.css?v=25.67','./harmony-icons.css?v=25.92','./intelligence.css?v=25.96','./intelligence-ai.css?v=25.74','./shopee-intelligence.css?v=25.95','./production-receipts.css?v=25.49','./production-orders.css?v=25.49','./production-inventory.css?v=25.72','./production-order-color-picker.css?v=25.33','./production-order-confirmation.css?v=25.46','./notifications.css?v=25.27','./notifications-inbox.css?v=25.51','./separation-checkup.css?v=25.52','./product-visibility.css?v=25.30','./internal-supplies.css?v=25.66','./request-hub.css?v=25.25','./app-usage.css?v=25.36','./bills.css?v=25.49','./my-day.css?v=25.39','./collaborator-timeline.css?v=25.50','./document-capture.css?v=25.49','./harmony-experience.css?v=25.62','./pdf-print-isolation.css?v=25.49','./media-optimization.js?v=25.100','./app.js?v=25.100','./product-visibility.js?v=25.98','./pwa.js?v=25.27','./daily-messages.js','./enhancements.js?v=25.69','./intelligence.js?v=25.84.1','./intelligence-ai.js?v=25.74','./shopee-intelligence.js?v=25.95','./production-receipts.js?v=25.100','./production-orders.js?v=25.100','./vendor/qrcode-generator-2.0.4.js?v=2.0.4','./thermal-label-pdf.js?v=25.71','./production-inventory.js?v=25.73','./notifications.js?v=25.51','./separation-checkup.js?v=25.52','./internal-supplies.js?v=25.98','./help-center.js?v=25.98','./system-health.js?v=25.50','./request-hub.js?v=25.25','./app-usage.js?v=25.37','./bills.js?v=25.100','./my-day.js?v=25.39','./collaborator-timeline.js?v=25.54','./harmony-experience.js?v=25.61','./harmony-icons.js?v=25.92','./manifest.webmanifest','./logo.jpg','./mascote-artesa.png','./icon-192-v2.png','./icon-512-v2.png','./apple-touch-icon-v2.png','./notification-badge.svg'];

SHELL.push('./individual-product-stock.css?v=25.63','./individual-product-stock.js?v=25.63');
SHELL.push('./agenda-harmony.css?v=25.91','./agenda-harmony.js?v=25.91','./shipping-planning.css?v=25.83','./shipping-planning.js?v=25.100','./transfer-center.css?v=25.94','./transfer-center.js?v=25.100','./shipping-inventory-integration.js?v=25.98','./assets/platform-mercado-livre.svg','./assets/platform-shopee.svg','./assets/shipping-product-placeholder.svg','./assets/peugeot-expert-harmony.png');

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key!==PUBLIC_MEDIA_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

function publicMediaRequest(request,url){
  if(request.method!=='GET'||url.origin!=='https://tyzfznwvjzmudxtcbbaf.supabase.co')return false;
  if(request.headers.has('authorization')||request.headers.has('range'))return false;
  if(['reload','no-store','no-cache'].includes(request.cache))return false;
  if(!/^\/storage\/v1\/(?:object\/public|render\/image\/public)\/(?:product-images|shipping-planning-images)\/.+/.test(url.pathname))return false;
  // Persistent reuse is only safe for versioned, publicly readable objects.
  if(!/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(url.pathname))return false;
  for(const key of url.searchParams.keys())if(!['width','height','quality','resize','format'].includes(key))return false;
  return true;
}

function publicMediaResponse(response,status){
  const headers=new Headers(response.headers);
  headers.set('x-harmony-media-source',status);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function prunePublicMedia(cache){
  const records=[];
  let bytes=0;
  for(const request of await cache.keys()){
    const response=await cache.match(request);
    const at=Number(response?.headers.get('x-harmony-media-at'));
    const size=Number(response?.headers.get('x-harmony-media-bytes'));
    if(!at||!Number.isFinite(size)||size<=0||Date.now()-at>=PUBLIC_MEDIA_TTL){await cache.delete(request);continue}
    records.push({request,at,size});bytes+=size;
  }
  records.sort((a,b)=>a.at-b.at);
  let count=records.length;
  for(const item of records){
    if(count<=PUBLIC_MEDIA_MAX_ITEMS&&bytes<=PUBLIC_MEDIA_MAX_BYTES)break;
    await cache.delete(item.request);count--;bytes-=item.size;
  }
}

async function readPublicMedia(request){
  let cache;
  try{
    cache=await caches.open(PUBLIC_MEDIA_CACHE);
    const cached=await cache.match(request);
    const at=Number(cached?.headers.get('x-harmony-media-at'));
    if(cached&&at&&Date.now()-at<PUBLIC_MEDIA_TTL)return publicMediaResponse(cached,'local-cache');
  }catch(_){return fetch(request)}

  let response;
  try{response=await fetch(new Request(request,{mode:'cors',credentials:'omit'}))}
  catch(_){return fetch(request)}
  if(response.status!==200||response.redirected||response.type==='opaque'||
    !/^image\/(?:jpeg|png|webp|avif)(?:;|$)/i.test(response.headers.get('content-type')||''))return response;

  try{
    const body=await response.clone().arrayBuffer();
    if(!body.byteLength||body.byteLength>3*1024*1024)return response;
    const headers=new Headers(response.headers);
    // Separate negotiated representations: image requests can prefer WebP.
    const vary=headers.get('vary')||'';
    if(vary.split(',').some(value=>value.trim()==='*'))return response;
    if(!vary.split(',').some(value=>value.trim().toLowerCase()==='accept'))headers.set('vary',vary?vary+', Accept':'Accept');
    headers.set('x-harmony-media-at',String(Date.now()));
    headers.set('x-harmony-media-bytes',String(body.byteLength));
    const stored=new Response(body,{status:200,headers});
    const maintenance=publicMediaMaintenance.then(async()=>{
      await cache.put(request,stored.clone());
      await prunePublicMedia(cache);
    });
    publicMediaMaintenance=maintenance.catch(()=>{});
    await maintenance;
    return publicMediaResponse(stored,'network');
  }catch(_){return response}
}

async function servePublicMedia(request){
  const key=request.url+'\n'+(request.headers.get('accept')||'');
  let pending=publicMediaPending.get(key);
  if(!pending){
    pending=readPublicMedia(request);
    publicMediaPending.set(key,pending);
    const cleanup=()=>{if(publicMediaPending.get(key)===pending)publicMediaPending.delete(key)};
    pending.then(cleanup,cleanup);
  }
  return (await pending).clone();
}

self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(publicMediaRequest(request,url)){event.respondWith(servePublicMedia(request));return}
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  event.respondWith(
    fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
      return response;
    }).catch(async()=>await caches.match(request)||(request.mode==='navigate'?caches.match('./index.html'):Response.error()))
  );
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?.json()||{}}catch{data={body:event.data?.text()||'Há uma atualização no sistema.'}}
  const asset=path=>new URL(path,self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(data.title||'Harmony Store Oficial',{
    body:data.body||'Há uma atualização no sistema.',
    icon:asset(data.icon||'./icon-192-v2.png'),
    badge:asset(data.badge||'./notification-badge.svg'),
    tag:data.tag||'harmony-notification',
    renotify:true,
    requireInteraction:data.priority==='urgent',
    vibrate:data.priority==='urgent'?[180,70,180,70,260]:[90,45,90],
    timestamp:Date.now(),
    actions:[{action:'open',title:'Abrir aplicativo'}],
    data:{url:data.url||'./',event:data.event||'update'}
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'./',self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
    for(const client of windows){if('focus' in client){await client.focus();if('navigate' in client)await client.navigate(target);return;}}
    if(clients.openWindow)return clients.openWindow(target);
  }));
});
