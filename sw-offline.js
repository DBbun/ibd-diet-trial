// Offline support: cache the app shell. The app never makes other network requests.
const VERSION = 'offline-v12';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/main.js', './js/config.js', './js/dates.js', './js/protocol.js', './js/scoring.js', './js/analysis.js',
  './js/simulate.js', './js/demo.js', './js/store.js', './js/ui.js', './js/sim-results.js', './sim-patients.json', './js/fhir.js',
  './sim.html', './js/sim-page.js', './js/population.js', './js/evaluate.js',
  './js/views/setup.js', './js/views/today.js', './js/views/timeline.js', './js/views/summary.js', './js/views/about.js',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './fonts/ibm-plex-sans-latin.woff2', './fonts/source-serif-4-latin.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so updates show up), falling back to the cache when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // Bypass the HTTP cache so an updated app reaches phones right away.
    fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
