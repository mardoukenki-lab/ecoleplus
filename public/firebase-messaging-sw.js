// Firebase Cloud Messaging Service Worker for AKPANY SCHOOL
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const firebaseConfig = {
  projectId: "project-89032b5a-6178-4b41-90b",
  appId: "1:894893240654:web:baabc7e1954ee052c36e1f",
  apiKey: "AIzaSyC-CeSNZF7iJQduraqnUrYBoj9DsvyvS0A",
  authDomain: "project-89032b5a-6178-4b41-90b.firebaseapp.com",
  storageBucket: "project-89032b5a-6178-4b41-90b.firebasestorage.app",
  messagingSenderId: "894893240654"
};

try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  console.warn('[firebase-messaging-sw.js] Firebase init warning:', e);
}

try {
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Background FCM message received:', payload);
    const title = payload.notification?.title || payload.data?.title || 'AKPANY SCHOOL';
    const body = payload.notification?.body || payload.data?.body || 'Nouvelle notification concernant votre enfant.';
    const icon = payload.notification?.icon || payload.data?.icon || '/icon.png';
    const tag = payload.data?.tag || 'akpany-fcm-' + Date.now();
    const url = payload.data?.url || '/';

    const notificationOptions = {
      body: body,
      icon: icon,
      badge: '/icon.png',
      tag: tag,
      vibrate: [200, 100, 200, 100, 200],
      data: { url: url },
      actions: [
        { action: 'open', title: 'Ouvrir AKPANY SCHOOL' }
      ]
    };

    return self.registration.showNotification(title, notificationOptions);
  });
} catch (e) {
  console.warn('[firebase-messaging-sw.js] Messaging background handler warning:', e);
}

// Fallback push listener for custom push events
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.notification?.title || data.title || 'AKPANY SCHOOL';
      const body = data.notification?.body || data.body || 'Nouvelle notification reçue';
      const icon = data.notification?.icon || data.icon || '/icon.png';
      const url = data.data?.url || data.url || '/';

      event.waitUntil(
        self.registration.showNotification(title, {
          body,
          icon,
          badge: '/icon.png',
          vibrate: [200, 100, 200],
          data: { url }
        })
      );
    } catch (err) {
      const text = event.data.text();
      event.waitUntil(
        self.registration.showNotification('AKPANY SCHOOL', {
          body: text,
          icon: '/icon.png',
          badge: '/icon.png'
        })
      );
    }
  }
});

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
