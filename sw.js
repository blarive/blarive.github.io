// ─── Service Worker — Carnet de Pêche ───────────────────
// La version est envoyée dynamiquement par index.html
// Pas besoin de modifier ce fichier à chaque déploiement

let CACHE_NAME = 'carnet-peche-auto';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

// ─── INSTALL ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(SHELL.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('carnet-peche-') && k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Suppression ancien cache :', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.hostname === 'nominatim.openstreetmap.org') return;
  if (url.hostname === 'tile.openstreetmap.org') return;

  // index.html et sw.js → Network First (toujours la dernière version)
  if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('sw.js')) {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Autres fichiers → Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => new Response('', { status: 408 }));
    })
  );
});

// ─── MESSAGE ─────────────────────────────────────────────
// Reçoit la version depuis index.html — purge automatique si nouvelle version
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SET_VERSION') {
    const newCache = `carnet-peche-${event.data.version}`;
    if (newCache !== CACHE_NAME) {
      const oldCache = CACHE_NAME;
      CACHE_NAME = newCache;
      caches.delete(oldCache).then(() => {
        console.log('[SW] Nouveau cache activé :', newCache);
        caches.open(CACHE_NAME).then(cache =>
          Promise.allSettled(SHELL.map(url => cache.add(url).catch(() => {})))
        );
      });
      // Notifie tous les onglets
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'UPDATE_READY' }))
      );
    }
  }
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
