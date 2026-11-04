const CACHE = 'testerhub-__VERSION__';
const SHELL = __SHELL__;
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // Hashed bundles never change; everything else prefers the network so releases arrive at once.
  if (url.pathname.includes('/build/')) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
    return;
  }
  e.respondWith(fetch(e.request).then(response => {
    if (response.ok && response.type === 'basic') { const copy = response.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); }
    return response;
  }).catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
// The reminder job sends data-only FCM messages, so this handler alone decides what is shown.
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data.json().data || {}; } catch {}
  const title = data.title || 'TesterHub', body = data.body || '', url = data.url || './#/home';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    const open = list.find(c => c.focused);
    if (open) return open.postMessage({type: 'testerhub-reminder', title, body});
    return self.registration.showNotification(title, {body, icon: './assets/icon-192.png', badge: './assets/icon-192.png', tag: 'testerhub-daily', lang: 'ar', dir: 'rtl', data: {url}});
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './index.html', self.registration.scope);
  if (url.origin !== self.location.origin) return;
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    const open = list[0];
    if (!open) return self.clients.openWindow(url.href);
    // navigate() rejects for a window this worker does not control yet; opening it is still better than nothing.
    return Promise.resolve(e.notification.data?.url ? open.navigate(url.href).catch(() => open) : open).then(c => (c || open).focus());
  }));
});
