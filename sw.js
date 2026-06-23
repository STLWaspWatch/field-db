// Bumped to v3: changing this string is what makes the browser re-install the
// service worker and purge the stale v2 cache that held the old index.html.
const CACHE_NAME = 'wasp-field-log-v3';
const ASSETS = [
  '/field-db/',
  '/field-db/index.html',
  '/field-db/manifest.json',
  '/field-db/icon-192.png',
  '/field-db/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only intercept GETs
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  // Never intercept Supabase or external APIs - let them go straight to network
  if (url.includes('supabase.co')) return;
  if (url.includes('nominatim.openstreetmap.org')) return;

  // NETWORK-FIRST for the app shell HTML. When online, always fetch the latest
  // index.html so a new GitHub Pages deploy is picked up on the next open.
  // When offline, fall back to the cached copy so the field app still works.
  const isHTML =
    event.request.mode === 'navigate' ||
    url.endsWith('/field-db/') ||
    url.endsWith('/field-db/index.html');

  if (isHTML) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(c => c || caches.match('/field-db/index.html'))
        )
    );
    return;
  }

  // CACHE-FIRST for everything else (icons, manifest, and CDN libs once seen).
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response.status === 200 && url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-wasp-records') {
    event.waitUntil(syncPendingRecords());
  }
});

async function syncPendingRecords() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_PENDING' }));
}
