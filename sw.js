// ─── Service Worker — Carnet de Pêche V1.0 ──────────────
// La version est envoyée par index.html via BUILD_DATE
// sw.js lui-même n'a jamais besoin d'être modifié

let CACHE_NAME = 'carnet-peche-init';

const STATIC_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
];

// ─── INSTALL ─────────────────────────────────────────────
self.addEventListener('install', event => {
  // skipWaiting immédiat — pas d'attente de fermeture d'onglets
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})))
    )
  );
});

// ─── ACTIVATE ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Purge cache obsolète :', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // GPS / tuiles OSM → réseau direct
  if (
    url.hostname === 'nominatim.openstreetmap.org' ||
    url.hostname.includes('tile.openstreetmap.org')
  ) return;

  // index.html et sw.js → TOUJOURS réseau, jamais mis en cache
  if (
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.includes('sw.js')
  ) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Tout le reste → Cache First (fonts, leaflet, icônes)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => new Response('', { status: 408 }));
    })
  );
});

// ─── MESSAGE ─────────────────────────────────────────────
// Reçoit la version depuis index.html (BUILD_DATE)
// Si la version a changé → purge immédiate de l'ancien cache
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data && event.data.type === 'SET_VERSION') {
    const newCache = `carnet-peche-${event.data.version}`;
    if (newCache !== CACHE_NAME) {
      const oldCache = CACHE_NAME;
      CACHE_NAME = newCache;
      console.log('[SW] Nouvelle version :', newCache, '— purge :', oldCache);
      // Purger l'ancien cache immédiatement
      caches.delete(oldCache).then(() => {
        // Reconstruire le cache avec la nouvelle version
        caches.open(CACHE_NAME).then(cache =>
          Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})))
        );
      });
      // Notifier tous les onglets ouverts → rechargement
      self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'RELOAD' }));
      });
    }
  }
});
