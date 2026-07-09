const CACHE_NAME = 'cricket-strike-v8';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.v10.css',
  '/app.v10.js',
  '/sounds/cricket_bat.mp3',
  '/sounds/ball_hitting_stumps.mp3',
  '/sounds/crowd_cheering.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Never intercept API calls or SSE streams
  if (event.request.url.includes('/api/') || event.request.url.includes('/events')) return;

  // Network-first strategy: always try network, fall back to cache if offline.
  // This means any newly deployed CSS/JS is immediately visible without bumping the SW version.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Update the cache with the fresh response
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      })
      .catch(() => {
        // Network unavailable — serve from cache as fallback
        return caches.match(event.request);
      })
  );
});
