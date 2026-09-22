const QPC_VERSION = '10.7.0';
const SHELL_CACHE = `qpc-shell-${QPC_VERSION}`;

// App shell mínimo: lo imprescindible para que la app ARRANQUE sin red.
// El resto de estáticos versionados (styles.css?v=, app.bundle.js?v=, …) se
// cachean en runtime la primera vez que se cargan online.
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/favicon-codelpa-c.svg',
  '/assets/favicon-codelpa-c-64.png',
  '/assets/favicon-codelpa-c-180.png',
  '/assets/qpc-icon-192.png',
  '/assets/qpc-icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll falla entero si un recurso da 404; lo hacemos tolerante uno a uno.
    await Promise.all(SHELL_ASSETS.map(async url => {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch (_) { /* opcional */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith('qpc-shell-') && k !== SHELL_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Estrategia de red:
//  - No-GET, o cross-origin (Supabase, CDNs)         -> solo red (nunca se cachea aquí).
//  - Navegaciones (abrir la app)                     -> red primero, si falla -> index.html cacheado.
//  - Estáticos same-origin (css/js/img/manifest…)    -> cache primero (match exacto, respeta ?v=),
//                                                       si no está -> red y se guarda en runtime.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase / CDNs -> red directa

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch (_) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === 'basic') {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (_) {
      // Último recurso: cualquier variante cacheada ignorando el ?v=
      const loose = await cache.match(req, { ignoreSearch: true });
      return loose || Response.error();
    }
  })());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data?.text?.() || '' }; }
  const title = data.title || 'Quality Project Control';
  const notificationId = data.notification_id || '';
  const options = {
    body: data.body || 'Tiene una nueva notificación.',
    icon: '/assets/qpc-icon-192.png',
    badge: '/assets/favicon-codelpa-c-64.png',
    tag: notificationId ? `qpc-${notificationId}` : undefined,
    renotify: true,
    silent: Boolean(data.silent),
    data: {
      notification_id: notificationId,
      action_view: data.action_view || null,
      entity_id: data.entity_id || null,
      url: notificationId ? `/?qpcNotification=${encodeURIComponent(notificationId)}` : '/',
    },
    actions: [{ action: 'open', title: 'Abrir' }],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = new URL(data.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        client.postMessage({ type: 'QPC_NOTIFICATION_OPEN', notification_id: data.notification_id || null });
        await client.focus();
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});
