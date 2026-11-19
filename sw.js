const CACHE = 'servilucar-fichajes-pwa-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const scope = self.registration.scope;
const staticUrls = new Set(ASSETS.map(asset => new URL(asset, scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match('./'))));
  } else if (staticUrls.has(request.url)) {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match(request))));
  }
});
