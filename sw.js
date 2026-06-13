const CACHE = 'dashboard-v23';
const SHARE_CACHE = 'share-target-v1';
const PRECACHE = [
  '/', '/index.html', '/health.html', '/water.html', '/gym.html',
  '/finance.html', '/nutrition.html', '/calendar.html',
  '/habits.html', '/tasks.html', '/export.html', '/reminders.html',
  '/skin.html', '/watch.html', '/usage.html', '/tabbar.js', '/topbar.js', '/bus.js', '/pwa.js',
  '/design.css', '/claude.js', '/body.html', '/mood.html', '/review.html',
  '/lifeos-core.js', '/command.js', '/mail.html', '/radar.html', '/share.html',
];

// Action buttons shown per notification kind (set via data.kind).
function actionsFor(kind) {
  switch (kind) {
    case 'supplement':     return [{ action: 'taken', title: 'Taken' }, { action: 'skip', title: 'Skip' }];
    case 'order':          return [{ action: 'received', title: 'Mark received' }, { action: 'open', title: 'Open order' }];
    case 'email':          return [{ action: 'draft', title: 'Draft reply' }, { action: 'snooze', title: 'Snooze' }];
    case 'progress-photo': return [{ action: 'photo', title: 'Take photo' }, { action: 'snooze', title: 'Snooze' }];
    case 'skin-photo':     return [{ action: 'photo', title: 'Take photo' }, { action: 'snooze', title: 'Snooze' }];
    case 'briefing':       return [{ action: 'open', title: 'Open' }, { action: 'snooze', title: 'Later' }];
    default:               return [];
  }
}

// Where a clicked action should land. Deep-link params (?na=, ?qa=) let the
// target page perform the action; snooze/skip just dismiss.
function routeFor(kind, action, data) {
  data = data || {};
  var id = data.id ? '&id=' + encodeURIComponent(data.id) : '';
  if (action === 'snooze' || action === 'skip') return null; // dismiss only
  switch (kind) {
    case 'supplement':     return '/reminders.html?na=supp-taken' + id;
    case 'order':          return action === 'received' ? '/mail.html?na=order-received' + id : (data.url || '/mail.html?qa=orders');
    case 'email':          return action === 'draft' ? '/mail.html?na=draft' + id : (data.url || '/mail.html');
    case 'progress-photo': return '/body.html?qa=photo';
    case 'skin-photo':     return '/skin.html?qa=photo';
    case 'briefing':       return data.url || '/index.html?qa=briefing';
    default:               return data.url || '/';
  }
}

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
      Promise.all(keys.filter(k => k !== CACHE && k !== SHARE_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Share target: a shared photo/text is POSTed to /share.html. Stash the
  // payload in a cache, then redirect to share.html (GET) which reads it.
  if (e.request.method === 'POST' && url.pathname === '/share.html') {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const file = form.get('media');
        const cache = await caches.open(SHARE_CACHE);
        const meta = {
          title: form.get('title') || '',
          text: form.get('text') || '',
          url: form.get('url') || '',
          hasFile: !!(file && file.size),
          fileType: file && file.type || '',
          fileName: (file && file.name) || '',
          at: Date.now(),
        };
        await cache.put('/__share/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
        if (meta.hasFile) {
          await cache.put('/__share/file', new Response(file, { headers: { 'Content-Type': meta.fileType || 'application/octet-stream' } }));
        } else {
          await cache.delete('/__share/file');
        }
      } catch (_) {}
      return Response.redirect('/share.html?shared=1', 303);
    })());
    return;
  }

  // Only handle GET requests for same-origin HTML/JS/CSS beyond this point
  if (e.request.method !== 'GET') return;
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

// Show a notification with the right action buttons for its kind.
function showKindNotif(data) {
  data = data || {};
  return self.registration.showNotification(data.title || 'Life OS', {
    body: data.body || '',
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || data.kind || 'lifeos',
    renotify: !!data.renotify,
    requireInteraction: !!data.requireInteraction,
    actions: actionsFor(data.kind),
    data: { kind: data.kind || '', id: data.id || '', url: data.url || '/' },
  });
}

// Push notifications (from a push service, if/when a server is wired up)
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(showKindNotif(data));
});

// Pages ask the SW to show an action notification while open / in background.
self.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'show-notif') {
    e.waitUntil(showKindNotif(m.payload || {}));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  const target = routeFor(d.kind, e.action, d);
  if (!target) return; // snooze / skip — just dismiss
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Reuse an open window: focus it and tell it to run the deep-link action.
      const open = list.find(c => 'focus' in c);
      if (open) {
        open.postMessage({ type: 'notif-action', url: target, kind: d.kind, action: e.action, id: d.id });
        return open.focus();
      }
      return clients.openWindow(target);
    })
  );
});
