// Retired worker. Earlier versions registered this file and could keep serving old cached files.
// It now removes itself and its caches, then reloads open pages so they get the current app.
// Offline support for the deployed https site lives in sw-offline.js.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
