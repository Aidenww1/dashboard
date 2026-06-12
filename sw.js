const CACHE = 'dashboard-v13';
const PRECACHE = [
  '/', '/index.html', '/health.html', '/water.html', '/gym.html',
  '/finance.html', '/nutrition.html', '/calendar.html',
  '/habits.html', '/tasks.html', '/export.html', '/reminders.html',
  '/skin.html', '/watch.html', '/usage.html', '/tabbar.js', '/topbar.js', '/bus.js', '/pwa.js',
  '/design.css', '/claude.js', '/body.html', '/mood.html', '/review.html',
  '/lifeos-core.js', '/command.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .catch(() => {}) // don't fail install on cache errors
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Only handle GET requests for same-origin HTML/JS/CSS
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // Network first for API calls; cache first for static assets
  const isStatic = /\.(html|js|css|json|svg|png|jpg|webp|woff2?)$/.test(url.pathname);
  if (isStatic) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

// Push notifications
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Dashboard', {
      body: data.body || '',
      icon: data.icon || '/favicon.ico',
      badge: '/favicon.ico',
      tag: data.tag || 'dashboard',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      const existing = list.find(c => c.url.includes(url) && 'focus' in c);
      return existing ? existing.focus() : clients.openWindow(url);
    })
  );
});
