// Service worker: serve the app from the phone's cache at once, refresh files in the background.
// Bump VERSION on every deploy so phones pick up the new files on their next open.
const VERSION = 'v5';
const CACHE = 'so-cua-be-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './config.js',
  './firebase.js',
  './manifest.webmanifest',
  './fonts/fonts.css',
  './fonts/lexend-exa-latin-600-normal.woff2',
  './fonts/lexend-exa-latin-700-normal.woff2',
  './fonts/lexend-exa-vietnamese-600-normal.woff2',
  './fonts/lexend-exa-vietnamese-700-normal.woff2',
  './fonts/lexend-latin-400-normal.woff2',
  './fonts/lexend-latin-500-normal.woff2',
  './fonts/lexend-latin-600-normal.woff2',
  './fonts/lexend-vietnamese-400-normal.woff2',
  './fonts/lexend-vietnamese-500-normal.woff2',
  './fonts/lexend-vietnamese-600-normal.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('so-cua-be-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Firebase traffic goes straight to the network
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const refresh = fetch(req, { cache: 'no-cache' }).then(res => {
      if (res && res.ok) return cache.put(req, res.clone()).then(() => res);
      return res;
    }).catch(() => hit);
    event.waitUntil(refresh.catch(() => {}));
    return hit || refresh;
  })());
});
