const CACHE='harmony-store-v25-11';
const SHELL=['./','./index.html','./styles.css','./intelligence.css','./production-receipts.css','./notifications.css','./product-visibility.css','./internal-supplies.css','./app.js','./product-visibility.js','./pwa.js','./daily-messages.js','./enhancements.js','./intelligence.js','./production-receipts.js','./notifications.js','./internal-supplies.js','./help-center.js','./system-health.js','./CHANGELOG.md','./manifest.webmanifest','./logo.jpg','./brand-mark.png','./mascote-artesa.png','./icon-192-v2.png','./icon-512-v2.png','./apple-touch-icon-v2.png','./notification-badge.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
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
