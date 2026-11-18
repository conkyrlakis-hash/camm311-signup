/* CAMM 311 Study - service worker, CLOSED NOTICE (18/11/2026).
   The study app is down until the final exam recap. This worker replaces the app's v2 worker on
   installed phones: it deletes the old app caches (app shell + content) and reloads any open app
   window so the notice shows on the first open. Pages: network-first, cached notice when offline. */
const VERSION = 'camm311-study-closed-1';
const PREFIX = 'camm311-study-';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'img/cut_logo_white.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.indexOf(PREFIX) === 0 && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
    // an app window still showing the old study app: reload it into the notice
    const wins = await self.clients.matchAll({ type: 'window' });
    await Promise.all(wins.map((c) => c.navigate(c.url).catch(() => null)));
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (url.pathname.indexOf(scope.pathname) !== 0) return;

  if (req.mode === 'navigate') {
    event.respondWith(page(req, scope));
  } else {
    event.respondWith(cacheFirst(req));
  }
});

async function page(req, scope) {
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && res.ok) return res;
  } catch (e) { /* offline */ }
  const hit = await caches.match(new URL('index.html', scope).href, { ignoreSearch: true });
  return hit || Response.error();
}

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  return fetch(req);
}
