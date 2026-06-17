const CACHE = 'lac-v3';
const STATIC = [
  '/index.html',
  '/css/style.css',
  '/js/nav.js',
  '/js/auth.js',
  '/js/chat.js',
  '/js/toast.js',
  '/js/palette.js',
  '/js/emails.js',
  '/manifest.json',
  '/favicon.jpg',
  '/icon-192.png',
  '/icon-512.png',
];

// Cache static shell on install
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Drop old caches on activate
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for API calls, cache-first for static assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept cross-origin requests (API, Ollama, etc.)
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML pages (always get fresh auth state)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for static assets (CSS, JS, images)
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
