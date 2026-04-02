// ─── Service Worker — Carnet de Pêche V1.1 ──────────────
// Architecture scindée : index.html, style.css, app.js
// La version est envoyée par app.js via BUILD_DATE

let CACHE_NAME = 'carnet-peche-init';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];

// ─── INSTALL ─────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installation...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => 
        cache.add(url).catch(err => console.warn('[SW] Échec cache:', url, err))
      ))
    )
  );
});

// ─── ACTIVATE ────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activation...');
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

  // Seulement les requêtes GET
  if (event.request.method !== 'GET') return;

  // Exclure les appels API externes (GPS, tuiles OSM)
  if (
    url.hostname === 'nominatim.openstreetmap.org' ||
    url.hostname.includes('tile.openstreetmap.org')
  ) return;

  // sw.js lui-même → toujours réseau, jamais cache
  if (url.pathname.includes('sw.js')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // index.html → réseau d'abord, fallback cache (pour offline)
  if (url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Tout le reste → Cache First avec fallback réseau
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Rafraîchissement en arrière-plan pour les assets statiques
        if (STATIC_ASSETS.some(asset => url.pathname.endsWith(asset) || url.href.includes(asset))) {
          fetch(event.request).then(response => {
            if (response && response.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, response));
            }
          }).catch(() => {});
        }
        return cached;
      }
      
      return fetch(event.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback ultime pour les pages
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});

// ─── MESSAGE ─────────────────────────────────────────────
// Reçoit la version depuis app.js (BUILD_DATE)
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
          Promise.allSettled(STATIC_ASSETS.map(url => 
            cache.add(url).catch(() => {})
          ))
        );
      });
      
      // Notifier tous les onglets ouverts → rechargement
      self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'RELOAD' }));
      });
    }
  }
});