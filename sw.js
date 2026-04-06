const CACHE_NAME = 'wasp-field-log-v1';
const ASSETS = [
  '/field-db/',
  '/field-db/index.html',
  '/field-db/manifest.json',
  '/field-db/icon-192.png',
  '/field-db/icon-512.png',
];

// Install — cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — serve from cache, fall back to network
self.addEventListener('fetch', event => {
  // For Supabase API calls — always try network first, no caching
  if (event.request.url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If network fails (offline), return a custom offline response for API calls
        return new Response(
          JSON.stringify({ error: 'offline', message: 'You are offline. Record saved locally.' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // For everything else — cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Cache new successful responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Listen for sync events (background sync when back online)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-wasp-records') {
    event.waitUntil(syncPendingRecords());
  }
});

async function syncPendingRecords() {
  // This is triggered when back online
  // The main app handles the actual sync via localStorage
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_PENDING' });
  });
}
