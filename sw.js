// ============================================================
// Service Worker - PWA 오프라인 지원 (CORS 문제 해결)
// ============================================================

const CACHE_NAME = 'route-opt-v15';
const ASSETS = [
    '/route-optimizer-pwa/',
    '/route-optimizer-pwa/index.html',
    '/route-optimizer-pwa/app.js',
    '/route-optimizer-pwa/manifest.json'
    // ⭐ 외부 URL(카카오 SDK)은 캐싱에서 제외 (CORS 문제 방지)
];

const CACHE_NAME = 'route-opt-v6';

// 🔥 설치: 캐시하지 않고 바로 활성화 (skipWaiting)
self.addEventListener('install', function(event) {
    console.log('🔄 Service Worker 설치 중...');
    self.skipWaiting(); // 설치 후 즉시 활성화
});

// 🔥 활성화: 이전 캐시 삭제
self.addEventListener('activate', function(event) {
    console.log('🔄 Service Worker 활성화 중...');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ 이전 캐시 삭제:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // 모든 탭에서 새 버전 사용
});

// 🔥 네트워크 우선 전략 (항상 최신 파일 사용)
self.addEventListener('fetch', function(event) {
    event.respondWith(
        fetch(event.request)
            .then(function(response) {
                // 🔥 네트워크 응답을 캐시에 저장 (최신 유지)
                var responseClone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(function() {
                // 🔥 네트워크 실패 시 캐시에서 제공
                return caches.match(event.request);
            })
    );
});

// 🔥 메시지 수신 (업데이트 확인)
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CHECK_UPDATE') {
        self.skipWaiting();
        self.clients.claim();
    }
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

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll([
                '/',
                '/index.html',
                '/app.js',
                '/manifest.json'
            ]);
        })
    );
    // 🔥 새 Service Worker가 설치되면 즉시 활성화
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // 🔥 기존 클라이언트를 새 버전으로 제어
    return self.clients.claim();
});
