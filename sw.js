// ============================================================
// Service Worker - PWA 오프라인 지원 (CORS 문제 해결)
// ============================================================

const CACHE_NAME = 'route-opt-v2';
const ASSETS = [
    '/route-optimizer-pwa/',
    '/route-optimizer-pwa/index.html',
    '/route-optimizer-pwa/app.js',
    '/route-optimizer-pwa/manifest.json'
    // ⭐ 외부 URL(카카오 SDK)은 캐싱에서 제외 (CORS 문제 방지)
];

self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('✅ Service Worker: 캐시 저장 중...');
                return cache.addAll(ASSETS);
            })
            .then(function() {
                return self.skipWaiting();
            })
            .catch(function(err) {
                console.warn('⚠️ 캐시 저장 실패 (일부 파일 누락 가능):', err);
            })
    );
});

self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(key) {
                    return key !== CACHE_NAME;
                }).map(function(key) {
                    return caches.delete(key);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(e) {
    // ⭐ 외부 URL(카카오, 날씨 API 등)은 캐시 없이 네트워크에서 직접 가져오기
    var url = new URL(e.request.url);
    if (url.origin !== location.origin) {
        // 외부 요청은 캐시 없이 네트워크로만 처리
        e.respondWith(fetch(e.request).catch(function() {
            return new Response('Network error', { status: 503 });
        }));
        return;
    }
    
    // 내부 요청은 캐시 우선
    e.respondWith(
        caches.match(e.request)
            .then(function(response) {
                return response || fetch(e.request);
            })
            .catch(function() {
                return caches.match('/route-optimizer-pwa/');
            })
    );
});
