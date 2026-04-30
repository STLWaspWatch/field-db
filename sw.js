const CACHE_NAME = 'wasp-field-log-v2';
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

  // Never intercept Supabase or external APIs — let them go straight to network
  if (event.request.url.includes('supabase.co')) return;
  if (event.request.url.includes('nominatim.openstreetmap.org')) return;

  // Cache-first for everything else (your app shell)
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response.status === 200 && event.request.url.startsWith(self.location.origin)) {
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
