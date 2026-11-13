/* Service worker mínimo: serve só para exibir as notificações de alerta (inclusive com a página em segundo plano)
 * e trazer o app de volta ao tocar nelas. Não guarda nada em cache. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
    for (const j of janelas) { if ('focus' in j) return j.focus(); }
    return self.clients.openWindow('./#alertas');
  }));
});
