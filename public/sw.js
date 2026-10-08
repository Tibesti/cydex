// Cydex service worker (registered on every visit by src/lib/pwa.ts):
//  - makes the app installable and gives it an offline page
//  - caches the build's versioned files (/assets/*) for faster loads
//  - shows push notifications and opens the right page when one is tapped
// It never caches data (Supabase, Google, Squad): those always go to the network.

const VERSION = 'cydex-v1';
const SHELL = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // data and third parties: straight to the network

  // Pages: always the network; the offline page when there's no connection
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }

  // Versioned build files and icons never change under the same name: cache first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// Need attention straight away: stay on screen until tapped, longer buzz
// (keep in step with src/lib/notificationSound.ts)
const URGENT = ['new_order', 'order_nearby', 'assigned_by_admin', 'payout_request', 'verification_request'];

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Cydex', body: event.data ? event.data.text() : '' };
  }
  const urgent = URGENT.includes(data.type);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // The app is on screen: it plays its own chime, so the notification stays quiet.
      // Otherwise the phone plays its normal notification sound.
      const appOpen = windows.some((w) => w.visibilityState === 'visible');
      return self.registration.showNotification(data.title || 'Cydex', {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-monochrome-512.png',
        tag: data.tag,
        renotify: !!data.tag,
        silent: appOpen,
        vibrate: urgent ? [300, 120, 300, 120, 300] : [200, 100, 200],
        requireInteraction: urgent,
        data: { url: data.url || '/' },
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        open.focus();
        return open.navigate(url);
      }
      return self.clients.openWindow(url);
    }),
  );
});
