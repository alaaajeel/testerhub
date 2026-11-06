const CACHE='testerhub-original-ui-v17';
const SHELL=['./','./index.html','./admin.html','./src/admin.js','./splash.css','./legal.css','./privacy.html','./terms.html','./src/services/accounts.js','./src/services/deletion.js','./src/services/push.js','./src/help/content.js','./help/index.html','./firebase-config.js','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable-512.png','./assets/icon-180.png','./assets/brand-icon.svg','./assets/brand-lockup.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const url=new URL(e.request.url);if(url.origin!==self.location.origin)return;
 const shellURLs=new Set(SHELL.map(path=>new URL(path,self.registration.scope).href));
 if(!shellURLs.has(url.href))return;
 e.respondWith(fetch(e.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});}return response;})
 .catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));});
// The push job sends data-only FCM messages, so this handler alone decides what is shown.
self.addEventListener('push',e=>{
 let data={};
 try{data=e.data.json().data||{}}catch{}
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
  // On screen, the app's live listeners have already told the user.
  if(list.some(c=>c.visibilityState==='visible'))return;
  return self.registration.showNotification(data.title||'TesterHub',{body:data.body||'',icon:'./assets/icon-192.png',badge:'./assets/icon-192.png',tag:data.tag||'testerhub-push',lang:'ar',dir:'rtl'});
 }));
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window'}).then(cs=>cs.length?cs[0].focus():self.clients.openWindow('./index.html')))});
