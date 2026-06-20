const CACHE = 'lac-v11';
const STATIC = [
  '/index.html',
  '/css/style.css',
  '/js/nav.js',
  '/js/auth.js',
  '/js/chat.js',
  '/js/toast.js',
  '/js/palette.js',
  '/js/emails.js',
  '/js/financials.js',
  '/financials.html',
  '/manifest.json',
  '/favicon.jpg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const p = url.pathname;
  const needsFresh = p.endsWith('.html') || p.endsWith('.js') || p.endsWith('.css')
                     || e.request.mode === 'navigate';

  if (needsFresh) {
    // Network-first for all code files — always picks up deployments immediately.
    // Falls back to cache only when offline.
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first only for truly static assets (images, icons, manifest)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
