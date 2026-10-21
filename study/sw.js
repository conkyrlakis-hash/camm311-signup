/* CAMM 311 Study - service worker.
   Shell: cache-first. content_*.json: stale-while-revalidate. Cross-origin (Supabase) is never touched. */
const VERSION = 'camm311-study-v2';
const PREFIX = 'camm311-study-';

const SHELL = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'manifest.webmanifest',
  'img/cut_logo_white.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];
const CONTENT = ['content_en.json', 'content_gr.json'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // 'reload' skips the HTTP cache so a new version never precaches stale files
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    // content may not be published yet: never let that fail the install
    await Promise.all(CONTENT.map(async (u) => {
      try {
        const res = await fetch(new Request(u, { cache: 'reload' }));
        if (res.ok) await cache.put(u, res);
      } catch (e) { /* ignore */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.indexOf(PREFIX) === 0 && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;               // never intercept Supabase etc.
  const scope = new URL(self.registration.scope);
  if (url.pathname.indexOf(scope.pathname) !== 0) return;

  const file = url.pathname.split('/').pop();
  if (/^content_[a-z]+\.json$/.test(file)) {
    event.respondWith(staleWhileRevalidate(event, req));
  } else if (req.mode === 'navigate') {
    event.respondWith(navigation(req, scope));
  } else {
    event.respondWith(cacheFirst(req));
  }
});

async function navigation(req, scope) {
  const hit = await caches.match(new URL('index.html', scope).href, { ignoreSearch: true });
  if (hit) return hit;
  try { return await fetch(req); } catch (e) { return Response.error(); }
}

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok && res.type === 'basic') {
    const cache = await caches.open(VERSION);
    cache.put(req, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  const refresh = fetch(req, { cache: 'no-cache' })
    .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) || Response.error();
}
