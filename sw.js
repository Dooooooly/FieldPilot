// ============================================================
// Service Worker - PWA 오프라인 지원 (최적화)
// ============================================================

const CACHE_NAME = 'route-opt-v24';
const BASE_PATH = '/route-optimizer-pwa/';

// 캐시할 파일 목록 (서브 디렉터리 경로 포함)
const ASSETS = [
    BASE_PATH,
    BASE_PATH + 'index.html',
    BASE_PATH + 'app.js',
    BASE_PATH + 'manifest.json'
];

// ===== 설치 =====
self.addEventListener('install', function(event) {
    console.log('🔄 Service Worker 설치 중...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                return cache.addAll(ASSETS)
                    .catch(function(err) {
                        console.warn('⚠️ 캐시 실패 (무시):', err);
                    });
            })
    );
    self.skipWaiting(); // 설치 후 즉시 활성화
});

// ===== 활성화 =====
self.addEventListener('activate', function(event) {
    console.log('🔄 Service Worker 활성화 중...');
    event.waitUntil(
        caches.keys()
            .then(function(cacheNames) {
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

// ===== 네트워크 우선 전략 (외부 요청 분리) =====
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // 외부 요청 (카카오 SDK, 날씨 API 등)은 캐시 없이 네트워크로만 처리
    if (url.origin !== location.origin) {
        event.respondWith(
            fetch(event.request)
                .catch(function() {
                    return new Response('Network error', { status: 503 });
                })
        );
        return;
    }

    // 내부 요청: 네트워크 우선, 실패 시 캐시 사용
    event.respondWith(
        fetch(event.request)
            .then(function(response) {
                var responseClone = response.clone();
                caches.open(CACHE_NAME)
                    .then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                return response;
            })
            .catch(function() {
                return caches.match(event.request)
                    .then(function(response) {
                        return response || caches.match(BASE_PATH + 'index.html');
                    });
            })
    );
});

// ===== 업데이트 확인 메시지 수신 =====
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CHECK_UPDATE') {
        self.skipWaiting();
        self.clients.claim();
    }
});
