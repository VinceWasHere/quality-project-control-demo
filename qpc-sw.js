const QPC_VERSION = '10.5.0';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

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
