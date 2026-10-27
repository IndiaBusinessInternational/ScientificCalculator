/* IBI Scientific Calculator v1.0 — service worker. Makes the app installable and fully usable offline.
 * Network-first for this site's own files (the live version online; the cache only when offline).
 * Other sites (fonts, KaTeX) are not touched. Bump CACHE with every release. */
const CACHE = 'ibi-scicalc-v1-0';
const PREFIX = 'ibi-scicalc-';
const SHELL = ['./', 'index.html', 'app.css?v=1.0', 'app.js?v=1.0', 'tools.js?v=1.0', 'ibi-share.js?v=1.0', 'lib/math-15.2.0.min.js', 'manifest.json', 'icons/icon-192.png', 'icons/favicon-64.png'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).catch(() => {})); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k.startsWith(PREFIX)).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res && res.status === 200 && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((r) => r || (req.mode === 'navigate' ? caches.match('./') : undefined)).then((r) => r || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))));
});
