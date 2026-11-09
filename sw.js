const CACHE_NAME = 'mesachef-matrix-v10.4.1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/base.css',
    './manifest.json',
];

// Instalar el Service Worker y forzar activación inmediata
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activar el Service Worker y purgar absolutamente todas las cachés antiguas
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Purgando caché antigua:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Estrategia de Carga: Network First para TODO con fallback a caché
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    // Network First para asegurar que siempre se carga la versión más reciente
    event.respondWith(
        fetch(event.request, { cache: 'no-cache' })
            .then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
