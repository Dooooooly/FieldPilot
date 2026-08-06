const CACHE_NAME = 'route-opt-v1';
const ASSETS = [
    '/route-optimizer-pwa/',
    '/route-optimizer-pwa/index.html',
    '/route-optimizer-pwa/app.js',
    '/route-optimizer-pwa/manifest.json',
    'https://dapi.kakao.com/v2/maps/sdk.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request)
            .then(response => response || fetch(e.request))
            .catch(() => caches.match('/'))
    );
});
