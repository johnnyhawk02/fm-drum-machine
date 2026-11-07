// fm/dm service worker: cache the page so it works offline. Bump VER to refresh.
const VER = 'fmdm-@VER@';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first for the page (so updates arrive), cache fallback offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // the page itself always comes fresh from the network when online (never the browser's HTTP cache)
  const page = e.request.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(e.request.url).pathname);
  e.respondWith(
    fetch(e.request, page ? { cache: 'no-store' } : {}).then((r) => {
      const copy = r.clone();
      if (r.ok && new URL(e.request.url).origin === location.origin) caches.open(VER).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
