// ============================================================
// Service Worker - PWA 오프라인 지원 (최적화)
// ============================================================

const APP_VERSION = '2026.09.04.4';
const CACHE_NAME = 'FieldPilot-' + APP_VERSION;
const BASE_PATH = new URL('.', self.location.href).pathname;

// 캐시할 파일 목록 (서브 디렉터리 경로 포함)
const ASSETS = [
    BASE_PATH,
    BASE_PATH + 'index.html',
    BASE_PATH + 'app.js?v=' + APP_VERSION,
    BASE_PATH + 'manifest.json',
    BASE_PATH + 'src/main.js?v=' + APP_VERSION,
    BASE_PATH + 'src/config.js',
    BASE_PATH + 'src/api.js',
    BASE_PATH + 'src/storage.js',
    BASE_PATH + 'src/offline.js',
    BASE_PATH + 'src/ui.js',
    BASE_PATH + 'src/photo-tools.js?v=' + APP_VERSION
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
                // 404/500 응답을 캐시하면 새로 추가된 모듈도 계속 실패할 수 있다.
                if (response.ok) {
                    var responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(function(cache) {
                            cache.put(event.request, responseClone);
                        });
                }
                return response;
            })
            .catch(function() {
                return caches.match(event.request)
                    .then(function(response) {
                        if (response) return response;
                        // HTML 탐색만 앱 셸로 대체한다. JS 모듈 요청에 index.html을
                        // 반환하면 MIME 오류가 발생해 전체 모듈 로딩이 중단된다.
                        if (event.request.mode === 'navigate') {
                            return caches.match(BASE_PATH + 'index.html');
                        }
                        return new Response('Offline resource unavailable', { status: 503 });
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

// Background Sync는 인증 정보를 서비스 워커에 저장하지 않는다. 대신 열린
// 클라이언트에게 대기열 전송을 요청해 기존 Bearer 인증 흐름을 보존한다.
self.addEventListener('sync', function(event) {
    if (event.tag !== 'fieldpilot-request-sync') return;
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function(clients) {
                clients.forEach(function(client) {
                    client.postMessage({ type: 'FIELD_PILOT_FLUSH_OFFLINE_QUEUE' });
                });
            })
    );
});
