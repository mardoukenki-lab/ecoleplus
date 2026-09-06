// Service Worker for AKPANY SCHOOL PWA - Offline Data & SW Cache Manager

const CACHE_NAME = 'akpany-school-v2';
const DATA_CACHE_NAME = 'akpany-school-data-v2';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon.png',
  '/pwa-192.png',
  '/pwa-512.png',
  '/pwa-maskable-512.png'
];

// Offline dataset store inside SW
let offlineDataStore = {
  studentsCount: 0,
  schedulesCount: 0,
  lastUpdated: null
};

// Install Event - Pre-cache core shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('PWA SW: Pre-caching core application shell');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('PWA Service Worker: Cache addAll warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== DATA_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Message Listener - Store offline data payloads from application
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'CACHE_OFFLINE_DATA') {
    const { dataType, count, timestamp } = event.data;
    if (dataType === 'students') {
      offlineDataStore.studentsCount = count;
    } else if (dataType === 'schedules') {
      offlineDataStore.schedulesCount = count;
    }
    offlineDataStore.lastUpdated = timestamp || Date.now();

    // Persist a cache response in DATA_CACHE_NAME for offline API requests
    caches.open(DATA_CACHE_NAME).then((cache) => {
      const metadata = new Response(JSON.stringify(offlineDataStore), {
        headers: { 'Content-Type': 'application/json' }
      });
      cache.put('/offline-metadata.json', metadata);
    });

    console.log(`[PWA SW] Offline dataset updated: ${dataType} (${count} elements)`);
  }
});

// Fetch Handler: Cache-First / Network-First with Fallback
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Ignore non-GET or external database endpoints
  if (
    request.method !== 'GET' ||
    request.url.includes('firestore.googleapis.com') ||
    request.url.includes('identitytoolkit.googleapis.com') ||
    request.url.includes('chrome-extension')
  ) {
    return;
  }

  // Navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          // Serve cached root index.html when offline
          const cache = await caches.open(CACHE_NAME);
          const cachedRoot = await cache.match('/') || await cache.match('/index.html');
          if (cachedRoot) return cachedRoot;

          return new Response(
            '<html><body><h1>AKPANY SCHOOL — Mode Hors-Ligne</h1><p>Application disponible hors-ligne. Veuillez ré-essayer.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // Assets (JS, CSS, Images, Fonts) -> Cache-First or Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Handle incoming push messages
self.addEventListener('push', (event) => {
  let data = { title: 'AKPANY SCHOOL', body: 'Nouvelle alerte scolaire', icon: '/pwa-192.png' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/pwa-192.png',
    badge: '/pwa-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [{ action: 'open', title: 'Ouvrir l\'application' }]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
