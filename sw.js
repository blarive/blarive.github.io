// ════════════════════════════════════════════════════════
//  SERVICE WORKER — Carnet de Pêche
//  Cache-first pour les assets, network-first pour index.html
// ════════════════════════════════════════════════════════

// ⚠️  CE NOM CHANGE À CHAQUE DÉPLOIEMENT (via GitHub Actions ou manuellement)
//     Changer ce nom invalide l'ancien cache et force le téléchargement
const CACHE_NAME = 'carnet-peche-v20260410190747';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];

// ── Installation : mise en cache des assets statiques ──
self.addEventListener('install', event => {
  // Ne pas attendre — skipWaiting est déclenché par l'utilisateur via le bandeau
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Cache miss:', url, err))
        )
      );
    })
  );
});

// ── Activation : supprimer les anciens caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Suppression ancien cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      // Prendre le contrôle de tous les onglets ouverts
      return self.clients.claim();
    }).then(() => {
      // Notifier tous les clients qu'une nouvelle version est active
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'RELOAD' }));
      });
    })
  );
});

// ── Fetch : stratégies différenciées ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // index.html → Network-first (toujours la version la plus récente)
  if(url.pathname.endsWith('/') || url.pathname.endsWith('index.html')){
    event.respondWith(networkFirst(event.request));
    return;
  }

  // APIs externes (nominatim, météo) → Network only, pas de cache
  if(url.hostname !== self.location.hostname){
    event.respondWith(fetch(event.request).catch(() => Response.error()));
    return;
  }

  // Assets statiques → Cache-first
  event.respondWith(cacheFirst(event.request));
});

// Network-first : essayer le réseau, fallback cache si offline
async function networkFirst(request){
  try {
    const response = await fetch(request);
    if(response.ok){
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch(e) {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

// Cache-first : servir depuis le cache, sinon réseau
async function cacheFirst(request){
  const cached = await caches.match(request);
  if(cached) return cached;
  try {
    const response = await fetch(request);
    if(response.ok){
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch(e) {
    return Response.error();
  }
}

// ── Message SKIP_WAITING depuis l'app (bandeau mise à jour) ──
self.addEventListener('message', event => {
  if(event.data === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});
