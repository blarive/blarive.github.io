// ─── Service Worker — Carnet de Pêche ────────────────────
// ⚠️  Une seule chose à changer à chaque déploiement : VERSION
const VERSION = '20260405';
const CACHE = `carnet-peche-${VERSION}`;

const STATIC = [
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
];

// ─── INSTALL ─────────────────────────────────────────────
// skipWaiting immédiat : pas d'attente, le nouveau SW prend
// le contrôle dès qu'il est installé, même onglet ouvert.
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(STATIC.map(url => cache.add(url).catch(() => {})))
    )
  );
});

// ─── ACTIVATE ────────────────────────────────────────────
// Purge tous les caches qui ne correspondent pas à VERSION.
// clients.claim() : le nouveau SW contrôle immédiatement
// tous les onglets sans attendre un rechargement.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => {
            console.log('[SW] Purge :', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Après claim(), notifier les onglets de se recharger
        // pour charger le nouveau index.html depuis le réseau
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      })
      .then(clients => {
        clients.forEach(c => c.postMessage({ type: 'RELOAD' }));
      })
  );
});

// ─── FETCH ───────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // Réseau direct : GPS, tuiles OSM, API météo
  if (
    url.hostname === 'nominatim.openstreetmap.org' ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname === 'api.open-meteo.com'
  ) return;

  // index.html et sw.js : toujours réseau, jamais cache
  // Garantit que la dernière version est toujours servie
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

  // Assets statiques (fonts, leaflet, icônes) : cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.ok) {
          caches.open(CACHE).then(c => c.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => new Response('', { status: 408 }));
    })
  );
});

// ─── MESSAGE ─────────────────────────────────────────────
// Conservé pour compatibilité — plus utilisé activement
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
