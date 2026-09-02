// ============================================================
// 경로 최적화 PWA - app.js (수정 완료)
// ============================================================

// --- 저장소 키 ---
const STORAGE_KEY_PREFIX = 'places_';
const SELECTED_REGION_KEY = 'selectedRegion';
const SETTINGS_KEY = 'app_settings';
const OPTIMIZE_MODE_KEY = 'optimizeMode';
const PRESETS_KEY = 'route_presets';
const ROUTE_API_KEY = 'routeApi';
// 지도 SDK 키는 서버의 /api/public-config에서 런타임에 받는다.
// (카카오 개발자 콘솔에서 허용 도메인도 반드시 제한해야 합니다.)
let KAKAO_JAVASCRIPT_KEY = '';

// ============================================================
// 서버 프록시 공용 헬퍼 (경로최적화/주소변환/날씨는 전부 노트북 서버 경유)
// server-config.js에서 window.FIELD_SERVER_URL을 설정함
// ============================================================
function serverBase() {
    return String(window.FIELD_SERVER_URL || '').trim().replace(/\/+$/, '');
}

async function serverGet(pathAndQuery) {
    let base = serverBase();

    if (!base) {
        throw new Error(
            '서버 주소(FIELD_SERVER_URL)가 설정되지 않았습니다.'
        );
    }

    const headers = {};

    const token = getAuthToken();

    if (token) {
        headers.Authorization = 'Bearer ' + token;
    }

    let res = await fetch(
        base + pathAndQuery,
        {
            method: 'GET',
            headers
        }
    );

    if (res.status === 401) {
        handleAuthExpired();
        throw new Error('인가가 필요합니다.');
    }

    if (res.status === 403) {
        throw new Error('해당 지역에 접근할 권한이 없습니다.');
    }

    if (!res.ok) {
        let errBody = null;

        try {
            errBody = await res.json();
        } catch (e) {}

        throw new Error(
            (errBody && (errBody.message || errBody.error)) ||
            ('서버 오류 ' + res.status)
        );
    }

    return res.json();
}
async function serverPost(pathAndQuery, data) {
    const base = serverBase();

    if (!base) {
        throw new Error(
            '서버 주소(FIELD_SERVER_URL)가 설정되지 않았습니다.'
        );
    }

    const headers = {
        'Content-Type': 'application/json'
    };

    const token = getAuthToken();

    if (token) {
        headers.Authorization = 'Bearer ' + token;
    }

    const res = await fetch(
        base + pathAndQuery,
        {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        }
    );

    if (res.status === 401) {
        handleAuthExpired();
        throw new Error('인가가 필요합니다.');
    }

    if (res.status === 403) {
        throw new Error(
            '해당 지역에 접근할 권한이 없습니다.'
        );
    }

    if (!res.ok) {
        let errBody = null;

        try {
            errBody = await res.json();
        } catch (e) {}

        throw new Error(
            (errBody &&
                (errBody.message || errBody.error)) ||
            ('서버 오류 ' + res.status)
        );
    }

    return res.json();
}

// --- 지역별 중심 좌표 ---
const REGION_CENTERS = {
    '강남구': { lat: 37.5172, lng: 127.0473 },
    '강동구': { lat: 37.5301, lng: 127.1238 },
    '강북구': { lat: 37.6396, lng: 127.0257 },
    '강서구': { lat: 37.5482, lng: 126.8517 },
    '관악구': { lat: 37.4754, lng: 126.9538 },
    '광진구': { lat: 37.5357, lng: 127.0845 },
    '구로구': { lat: 37.4927, lng: 126.8896 },
    '금천구': { lat: 37.4491, lng: 126.9042 },
    '노원구': { lat: 37.6515, lng: 127.0584 },
    '도봉구': { lat: 37.6658, lng: 127.0495 },
    '동대문구': { lat: 37.5716, lng: 127.0421 },
    '동작구': { lat: 37.5097, lng: 126.9416 },
    '마포구': { lat: 37.5607, lng: 126.9105 },
    '서대문구': { lat: 37.5764, lng: 126.9389 },
    '서초구': { lat: 37.4808, lng: 127.0348 },
    '성동구': { lat: 37.5606, lng: 127.0390 },
    '성북구': { lat: 37.5864, lng: 127.0203 },
    '송파구': { lat: 37.5145, lng: 127.1058 },
    '양천구': { lat: 37.5170, lng: 126.8665 },
    '영등포구': { lat: 37.5264, lng: 126.8960 },
    '용산구': { lat: 37.5326, lng: 126.9900 },
    '은평구': { lat: 37.6027, lng: 126.9291 },
    '종로구': { lat: 37.5730, lng: 126.9794 },
    '중구': { lat: 37.5637, lng: 126.9975 },
    '중랑구': { lat: 37.5953, lng: 127.0939 },
    '서울': { lat: 37.5665, lng: 126.9780 },
    '부산': { lat: 35.1796, lng: 129.0756 },
    '제주': { lat: 33.4996, lng: 126.5312 },
    '수원': { lat: 37.2636, lng: 127.0286 },
    '인천': { lat: 37.4563, lng: 126.7052 },
    '대전': { lat: 36.3504, lng: 127.3845 },
    '대구': { lat: 35.8714, lng: 128.6014 },
    '광주': { lat: 35.1595, lng: 126.8526 },
    '울산': { lat: 35.5384, lng: 129.3114 },
    '세종': { lat: 36.4801, lng: 127.2890 }
};

// ============================================================
// 전역 색상 배열
// ============================================================
const COLORS = [
    '#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB', '#0ABDE3',
    '#10AC84', '#EE5A24', '#5F27CD', '#1DD1A1', '#F368E0',
    '#00D2D3', '#54A0FF', '#FF9FF3', '#F368E0'
];
// ============================================================
// 인증 상태
// ============================================================
const AUTH_STORAGE_KEY = 'fieldPilotAuth';

let fieldPilotAuth = {
    authorized: false,
    role: '',
    region: '',
    token: '',
    expiresAt: 0,
    kakaoWorkUserId: '',
    kakaoWorkUserName: ''
};

function getAuthToken() {
    return fieldPilotAuth?.token || '';
}

function isAuthorized() {
    return !!(
        fieldPilotAuth &&
        fieldPilotAuth.authorized &&
        fieldPilotAuth.token
    );
}

function isMaster() {
    return isAuthorized() &&
        fieldPilotAuth.role === 'master';
}

function isRegionUser() {
    return isAuthorized() &&
        fieldPilotAuth.role === 'region';
}

// --- 상태 변수 ---
let currentRegion = localStorage.getItem(SELECTED_REGION_KEY) || '';
let places = [];
let waypoints = [];
let routeResult = null;
let kakaoMap = null;
let kakaoPolyline = null;
let startPoint = null;
let settings = {};
let optimizeMode = localStorage.getItem(OPTIMIZE_MODE_KEY) || 'Nearest';
let currentSort = 'name-asc';
let multiSelectMode = false;
let selectedWaypoints = [];
let presets = [];
let currentPlaceId = null;
let favFilterActive = false;
let pendingUpload = null;
let originalRouteCost = null;
let routeApi = localStorage.getItem(ROUTE_API_KEY) || 'kakao';
let weatherRetryCount = 0;
const MAX_WEATHER_RETRY = 3;
let userGpsCoords = null;      // ★ GPS 좌표 저장 (날씨용)
let weatherInterval = null;    // ★ 날씨 주기 갱신 타이머
let tempSettings = {};
let routeObjective = 'distance';
let useRoadOptimization = true;
let useDirectionHint = true;

// --- 통계 관련 ---
const STATS_KEY_PREFIX = 'stats_';
let currentStats = null;

// --- 작업 기록 관련 ---
const WORK_KEY_PREFIX = 'work_';
let currentWork = null;
let workerName = localStorage.getItem('workerName') || '';
let workCalendarYear = new Date().getFullYear();
let workCalendarMonth = new Date().getMonth();
let selectedWorkDate = '';
let pendingWorkUpload = false;

// --- 마커/검색 상태 ---
let startMarker = null;
let routeMarkers = [];
let placeMarkers = [];
let nearbyPlaceClusterer = null;
let nearbyClustersEnabled = localStorage.getItem('nearbyPlaceClusters') !== 'off';
let mapAddressSearchOverlay = null;
let singlePlaceMarker = null;
let singlePlaceInfoWindow = null;
let autoSyncTimer = null;
let sdkLoading = false;
let isShowingRouteMarkers = false;
let pendingMapCenter = null;
let pendingOptimizedMapView = null;
let routeMapFocusToken = 0;
let frameStartIndex = 0;
let frameEndIndex = 9; // 기본 10개 (출발지 포함)
let isFrameDragging = false;

const searchIndexState = {
    selected: -1,
    waypoint: -1,
    addr: -1
};

// ============================================================
// 1. 유틸리티 함수 (이모티콘 깨짐 방지)
// ============================================================
function escapeHtml(str) {
    if (str == null) return '';
    let div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

// HTML 속성/인라인 onclick 등에 사용할 안전한 문자열 이스케이프
function escapeJsString(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function haversineKm(lat1, lng1, lat2, lng2) {
    let R = 6371;
    let dLat = (lat2 - lat1) * Math.PI / 180;
    let dLng = (lng2 - lng1) * Math.PI / 180;
    let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shortenAddress(address) {
    if (!address) return '';
    let parts = address.split(' ');
    let result = [];
    let skipWords = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', 
                     '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
                     '시', '도', '군', '구'];
    for (let i = 0; i < parts.length; i++) {
        let part = parts[i];
        if (skipWords.some(function(w) { return part === w || part.endsWith(w); })) {
            continue;
        }
        result.push(part);
    }
    return result.join(' ') || address;
}

function getRegionCenter(region) {
    if (REGION_CENTERS[region]) return REGION_CENTERS[region];
    for (let key in REGION_CENTERS) {
        if (region.includes(key) || key.includes(region)) return REGION_CENTERS[key];
    }
    return { lat: 37.5665, lng: 126.9780 };
}

function getStorageKey(region) { return STORAGE_KEY_PREFIX + region; }

function normalizeName(name) { return name.trim().toLowerCase(); }

function isMobile() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// ============================================================
// 2. 탭 전환
// ============================================================
// popstate에 의한 호출인지 구분하기 위한 플래그
let isPopState = false;

function switchTab(tabId, updateHistory = true) {
    if (!tabId) return;
    let target = document.getElementById(tabId);
    if (!target) return;
    document.querySelectorAll('.tab-content').forEach(function(el) {
        el.classList.remove('active');
    });
    target.classList.add('active');
    
    document.querySelectorAll('.bottom-tab').forEach(function(btn) {
        let isActive = btn.getAttribute('data-tab') === tabId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
    
   // ============================================================
// 지도 탭 진입 시에만 지도 활성화
// ============================================================
if (tabId === 'tab-route') {
    requestAnimationFrame(function() {
        setTimeout(function() {
            if (kakaoMap) {
                try {
                    kakaoMap.relayout();
                    enableMapInteraction();
                } catch (e) {
                    console.warn('[MAP] relayout 실패:', e);
                }
            } else if (!sdkLoading) {
                initMap();
            }
        }, 150);
    });
}
    
    if (tabId === 'tab-list' && typeof renderPlaces === 'function') {
    renderPlaces();
    if (typeof autoFillDong === 'function') {
        autoFillDong();
    }
}
    if (tabId === 'tab-stats' && typeof autoSyncStats === 'function') {
    autoSyncStats();
}
if (tabId === 'tab-work' && typeof autoSyncWork === 'function') {
    autoSyncWork();
}
    // ============================================================
// 설정 탭 진입 시 설정 화면 갱신
// ============================================================
if (
    tabId === 'tab-settings' &&
    typeof refreshSettingsTab === 'function'
) {
    refreshSettingsTab();
}
    
    if (window.innerWidth < 700) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    // ★ 브라우저 히스토리에 탭 상태 기록 (뒤로가기 지원)
    if (updateHistory && !isPopState) {
        history.pushState({ tab: tabId }, '', '#' + tabId);
    }
}
// ============================================================
// 3. 설정 관리 (API 키 인코딩)
// ============================================================
function encodeKey(val) {
    if (!val) return '';
    try { return btoa(val); } catch(e) { return val; }
}
function decodeKey(val) {
    if (!val) return '';
    try { return atob(val); } catch(e) { return val; }
}

function loadSettings() {
    let saved = localStorage.getItem(SETTINGS_KEY);

    if (saved) {
        try {
            let parsed = JSON.parse(saved);

            settings.githubToken =
                decodeKey(parsed.githubToken || '');

            // 구버전 데이터 호환
            settings.kakaoJsKey =
                decodeKey(parsed.kakaoJsKey || '');

            settings.kakaoRestKey =
                decodeKey(parsed.kakaoRestKey || '');

            settings.kakaoChatbotKey =
                decodeKey(parsed.kakaoChatbotKey || '');

            settings.kakaoChatbotUserId =
                decodeKey(parsed.kakaoChatbotUserId || '');

        } catch (e) {
            console.warn(
                '⚠️ 설정 복원 오류:',
                e
            );

            settings = {
                githubToken: '',
                kakaoJsKey: '',
                kakaoRestKey: '',
                kakaoChatbotKey: '',
                kakaoChatbotUserId: ''
            };
        }

    } else {

        settings = {
            githubToken: '',
            kakaoJsKey: '',
            kakaoRestKey: '',
            kakaoChatbotKey: '',
            kakaoChatbotUserId: ''
        };
    }

    // 작업자 이름
    let workerInput =
        document.getElementById('workerName');

    if (workerInput) {
        workerInput.value =
            workerName || '';
    }

    updateWorkerNameStatus();
    updateSettingsStatus();
    updateSettingsConnectionUI();
    updateAuthorizationUI();
}
// ============================================================
// 현장처리 서버 연결 확인 (설정 탭 "🔄 서버 연결 확인" 버튼)
// ============================================================
async function testPhotoServer() {
    let statusEl = document.getElementById('photoServerStatus');
    let base = serverBase();
    if (!base) {
        if (statusEl) { statusEl.textContent = '⚠️ FIELD_SERVER_URL이 설정되지 않았습니다'; statusEl.className = 'badge badge-fail'; }
        return;
    }
    if (statusEl) { statusEl.textContent = '⏳ 확인 중...'; statusEl.className = 'badge badge-wait'; }
    try {
        let data = await serverGet('/api/health');
        let parts = [];
        parts.push(data.kakaoRestKeyConfigured ? '카카오키✅' : '카카오키❌');
        parts.push(data.openWeatherKeyConfigured ? '날씨키✅' : '날씨키❌');
        parts.push(data.appKeyConfigured ? '봇키✅' : '봇키❌');
        if (statusEl) {
            statusEl.textContent = '✅ 서버 연결됨 (' + parts.join(' ') + ')';
            statusEl.className = 'badge badge-ok';
        }
    } catch (e) {
        if (statusEl) {
            statusEl.textContent = '❌ 서버에 연결할 수 없습니다: ' + e.message;
            statusEl.className = 'badge badge-fail';
        }
    }
}


// ============================================================
// 작업자 이름
// ============================================================

function saveWorkerName() {
    const input = document.getElementById('workerName');

    if (!input) return;

    workerName = input.value.trim();

    localStorage.setItem(
        'workerName',
        workerName
    );

    updateWorkerNameStatus();
    updateWorkWorkerDisplay();

    showTabStatus(
        'tab-settings',
        workerName
            ? '✅ 작업자 이름이 저장되었습니다.'
            : '⚠️ 이름이 비어 있습니다.',
        workerName
            ? 'ok'
            : 'warning'
    );
}


function updateWorkerNameStatus() {
    const status =
        document.getElementById('workerNameStatus');

    const display =
        document.getElementById(
            'settingsWorkerNameDisplay'
        );

    if (workerName) {

        if (status) {
            status.textContent =
                '✅ ' + workerName;

            status.className =
                'badge badge-ok';
        }

        if (display) {
            display.textContent =
                workerName;
        }

    } else {

        if (status) {
            status.textContent =
                '⏳ 이름 미설정';

            status.className =
                'badge badge-wait';
        }

        if (display) {
            display.textContent =
                '미설정';
        }
    }
}


function updateWorkWorkerDisplay() {
    const el =
        document.getElementById(
            'workWorkerDisplay'
        );

    if (!el) return;

    el.textContent =
        workerName
            ? '👤 ' + workerName
            : '👤 미설정';
}


// ============================================================
// 설정 저장
// ============================================================

function saveSettings() {

    if (!settings) {
        settings = {
            githubToken: '',
            kakaoJsKey: '',
            kakaoRestKey: '',
            kakaoChatbotKey: '',
            kakaoChatbotUserId: ''
        };
    }

    const encoded = {

        githubToken:
            encodeKey(
                settings.githubToken || ''
            ),

        kakaoJsKey:
            encodeKey(
                settings.kakaoJsKey || ''
            ),

        kakaoRestKey:
            encodeKey(
                settings.kakaoRestKey || ''
            ),

        kakaoChatbotKey:
            encodeKey(
                settings.kakaoChatbotKey || ''
            ),

        kakaoChatbotUserId:
            encodeKey(
                settings.kakaoChatbotUserId || ''
            )
    };

    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(encoded)
    );

    updateSettingsStatus();
}


// ============================================================
// 설정 상태 전체 갱신
// ============================================================

function updateSettingsStatus() {

    updateWorkerNameStatus();

    updateSettingsConnectionUI();

    updateAuthorizationUI();
}


// ============================================================
// GitHub 토큰 저장
// ============================================================

function saveGitHubToken() {

    const input =
        document.getElementById(
            'githubToken'
        );

    if (!input) {

        console.warn(
            'githubToken 입력창이 없습니다. ' +
            '관리자 서버 설정을 사용하십시오.'
        );

        return;
    }

    settings.githubToken =
        input.value.trim();

    saveSettings();

    showTabStatus(
        'tab-settings',
        '✅ GitHub 설정 저장됨',
        'ok'
    );
}


// ============================================================
// 카카오 설정 저장
// ============================================================

function saveKakaoKeys() {

    const jsInput =
        document.getElementById(
            'kakaoJsKey'
        );

    const restInput =
        document.getElementById(
            'kakaoRestKey'
        );

    if (jsInput) {
        settings.kakaoJsKey =
            jsInput.value.trim();
    }

    if (restInput) {
        settings.kakaoRestKey =
            restInput.value.trim();
    }

    saveSettings();

    showTabStatus(
        'tab-settings',
        '✅ 카카오 설정이 저장되었습니다.',
        'ok'
    );

    // 구버전 설정 UI가 실제로 존재할 때만
    // 지도 SDK를 다시 로드한다.
    if (jsInput) {

        const container =
            document.getElementById('map');

        if (container) {

            container.innerHTML =
                '<div style="' +
                'display:flex;' +
                'justify-content:center;' +
                'align-items:center;' +
                'height:100%;' +
                'color:#d69e2e;' +
                'font-size:14px;' +
                'background:#fffff0;' +
                'border-radius:12px;' +
                '">' +
                '⏳ 카카오 지도 재로딩 중...' +
                '</div>';
        }

        kakaoMap = null;

        setTimeout(
            function () {
                if (
                    typeof initMap ===
                    'function'
                ) {
                    initMap();
                }
            },
            300
        );
    }
}


// ============================================================
// 설정 화면 연결 상태
// ============================================================

function updateSettingsConnectionUI() {

    const server =
        document.getElementById(
            'settingsServerStatus'
        );

    const github =
        document.getElementById(
            'settingsGithubStatus'
        );

    const kakao =
        document.getElementById(
            'settingsKakaoStatus'
        );

    const version =
        document.getElementById(
            'settingsAppVersion'
        );


    // --------------------------------------------------------
    // 서버
    // --------------------------------------------------------

    if (server) {

        if (serverBase()) {

            server.textContent =
                '● 서버 설정됨';

            server.style.color =
                '#38a169';

        } else {

            server.textContent =
                '● 서버 미설정';

            server.style.color =
                '#e53e3e';
        }
    }


    // --------------------------------------------------------
    // GitHub
    // --------------------------------------------------------

    // GitHub는 브라우저에서 직접 접근하지 않고
    // LOCAL → SERVER → GitHub 구조의
    // 서버 동기화를 기준으로 표시한다.

    if (github) {

        if (serverBase()) {

            github.textContent =
                '● 자동 동기화';

            github.style.color =
                '#38a169';

        } else {

            github.textContent =
                '● 서버 필요';

            github.style.color =
                '#d69e2e';
        }
    }


    // --------------------------------------------------------
    // Kakao
    // --------------------------------------------------------

    // Kakao REST API는 서버에서 관리한다.
    // JavaScript Key는 현재 설정값을 사용할 수 있다.

    if (kakao) {

        const jsKeyConfigured = isKakaoMapReadyOrConfigured();

        if (jsKeyConfigured) {

            kakao.textContent =
                kakaoMap
                    ? '● 지도 사용 중'
                    : '● 지도키 설정됨';

            kakao.style.color =
                '#38a169';

        } else {

            kakao.textContent =
                '● 지도키 미설정';

            kakao.style.color =
                '#d69e2e';
        }
    }


    // --------------------------------------------------------
    // 앱 버전
    // --------------------------------------------------------

    if (version) {
        version.textContent =
            '최신';
    }
}

function isKakaoMapReadyOrConfigured() {
    return !!(
        kakaoMap ||
        KAKAO_JAVASCRIPT_KEY ||
        (
            typeof window !== 'undefined' &&
            window.kakao &&
            window.kakao.maps
        )
    );
}


// ============================================================
// 서버 연결 상태 확인
// ============================================================

async function refreshSettingsConnectionStatus() {

    const serverEl =
        document.getElementById(
            'settingsServerStatus'
        );

    const githubEl =
        document.getElementById(
            'settingsGithubStatus'
        );

    const kakaoEl =
        document.getElementById(
            'settingsKakaoStatus'
        );


    if (serverEl) {

        serverEl.textContent =
            '⏳ 확인 중...';

        serverEl.style.color =
            '#d69e2e';
    }


    try {

        const data =
            await serverGet(
                '/api/health'
            );


        // ----------------------------------------------------
        // 서버
        // ----------------------------------------------------

        if (serverEl) {

            serverEl.textContent =
                '● 연결됨';

            serverEl.style.color =
                '#38a169';
        }


        // ----------------------------------------------------
        // GitHub
        // ----------------------------------------------------

        if (githubEl) {

            if (
                data.githubConfigured === true ||
                data.gitHubConfigured === true
            ) {

                githubEl.textContent =
                    '● 연결됨';

                githubEl.style.color =
                    '#38a169';

            } else {

                githubEl.textContent =
                    '● 자동 동기화';

                githubEl.style.color =
                    '#38a169';
            }
        }


        // ----------------------------------------------------
        // Kakao
        // ----------------------------------------------------

        if (kakaoEl) {

            const mapReady = !!kakaoMap;
            const mapConfigured =
                isKakaoMapReadyOrConfigured();
            const kakaoOk = !!(
                mapConfigured ||
                data.kakaoRestKeyConfigured ||
                data.appKeyConfigured
            );

            if (kakaoOk) {

                kakaoEl.textContent = mapReady
                    ? '● 지도 사용 중'
                    : mapConfigured
                        ? '● 지도키 설정됨'
                        : '● 서버 연결됨';

                kakaoEl.style.color =
                    '#38a169';

            } else {

                kakaoEl.textContent =
                    '● 서버 확인 필요';

                kakaoEl.style.color =
                    '#d69e2e';
            }
        }


        // ----------------------------------------------------
        // 기존 사진 서버 상태
        // ----------------------------------------------------

        const oldStatus =
            document.getElementById(
                'photoServerStatus'
            );

        if (oldStatus) {

            oldStatus.textContent =
                '✅ 서버 연결됨';

            oldStatus.className =
                'badge badge-ok';
        }


    } catch (error) {

        if (serverEl) {

            serverEl.textContent =
                '● 연결 실패';

            serverEl.style.color =
                '#e53e3e';
        }

        if (githubEl) {

            githubEl.textContent =
                '● 확인 불가';

            githubEl.style.color =
                '#e53e3e';
        }

        if (kakaoEl) {

            kakaoEl.textContent =
                '● 확인 불가';

            kakaoEl.style.color =
                '#e53e3e';
        }

        console.warn(
            '[Settings] 서버 상태 확인 실패:',
            error
        );
    }


    // 기본 UI도 다시 반영
    updateSettingsConnectionUI();
}


// ============================================================
// 인가 상태 UI
// ============================================================

function updateAuthorizationUI() {

    const authStatus =
        document.getElementById(
            'settingsAuthStatus'
        );

    const region =
        document.getElementById(
            'settingsRegionDisplay'
        );

    const adminGroup =
        document.getElementById(
            'adminSettingsGroup'
        );


    // --------------------------------------------------------
    // 미인가
    // --------------------------------------------------------

    if (!isAuthorized()) {

        if (authStatus) {

            authStatus.textContent =
                '🔒 미인가';

            authStatus.className =
                'badge badge-wait';
        }

        if (region) {
            region.textContent =
                '-';
        }

        if (adminGroup) {
            adminGroup.style.display =
                'none';
        }

        return;
    }


    // --------------------------------------------------------
    // 마스터
    // --------------------------------------------------------

    if (isMaster()) {

        if (authStatus) {

            authStatus.textContent =
                '👑 마스터';

            authStatus.className =
                'badge badge-ok';
        }

        if (region) {

            region.textContent =
                currentRegion ||
                '전체 지역';
        }

        if (adminGroup) {
            adminGroup.style.display =
                '';
        }

        return;
    }


    // --------------------------------------------------------
    // 지역 사용자
    // --------------------------------------------------------

    if (authStatus) {

        authStatus.textContent =
            '📍 지역 사용자';

        authStatus.className =
            'badge badge-ok';
    }

    if (region) {

        region.textContent =
            fieldPilotAuth.region ||
            currentRegion ||
            '-';
    }

    if (adminGroup) {

        adminGroup.style.display =
            'none';
    }
}

// ============================================================
// 관리자 - 카카오워크 지역 사용자 관리
// ============================================================

async function loadAdminKakaoWorkMappings() {

    if (!isMaster()) {
        return;
    }

    const container =
        document.getElementById(
            'adminKakaoWorkMappings'
        );

    if (!container) {
        return;
    }

    container.innerHTML =
        '<div style="padding:10px;text-align:center;color:#718096;">' +
        '⏳ 불러오는 중...' +
        '</div>';

    try {

        const data =
            await serverGet(
                '/api/admin/kakao-work/mappings'
            );

        renderAdminKakaoWorkMappings(
            data.mappings || {}
        );

    } catch (error) {

        container.innerHTML =
            '<div style="padding:10px;color:#e53e3e;">' +
            '❌ 불러오기 실패<br>' +
            '<small>' +
            escapeHtml(
                error.message
            ) +
            '</small>' +
            '</div>';
    }
}
function renderAdminKakaoWorkMappings(
    mappings
) {

    const container =
        document.getElementById(
            'adminKakaoWorkMappings'
        );

    if (!container) {
        return;
    }

    const regions =
        Object.keys(
            mappings || {}
        );

    // 지역 목록은 현재 regionSelect에서 가져온다.
    const select =
        document.getElementById(
            'regionSelect'
        );

    const regionNames = [];

    if (select) {

        Array.from(
            select.options
        ).forEach(function(option) {

            const value =
                String(
                    option.value || ''
                ).trim();

            if (
                value &&
                !regionNames.includes(
                    value
                )
            ) {
                regionNames.push(
                    value
                );
            }

        });
    }

    // 매핑에만 존재하는 지역도 유지
    regions.forEach(function(region) {

        if (
            !regionNames.includes(
                region
            )
        ) {
            regionNames.push(
                region
            );
        }

    });

    if (!regionNames.length) {

        container.innerHTML =
            '<div style="padding:10px;color:#718096;">' +
            '등록된 지역이 없습니다.' +
            '</div>';

        return;
    }

    let html = '';

    regionNames.forEach(
        function(region) {

            const mapping =
                mappings[region] || {};

            html +=
                '<div style="' +
                'background:white;' +
                'border:1px solid #e2e8f0;' +
                'border-radius:9px;' +
                'padding:12px;' +
                'margin-bottom:8px;' +
                '">';

            html +=
                '<div style="' +
                'font-weight:700;' +
                'font-size:13px;' +
                'margin-bottom:8px;' +
                '">' +
                '📍 ' +
                escapeHtml(region) +
                '</div>';

            html +=
                '<div style="' +
                'font-size:11px;' +
                'color:#718096;' +
                'margin-bottom:5px;' +
                '">' +
                '현재 수신자' +
                '</div>';

            if (mapping.userId) {

                html +=
                    '<div style="' +
                    'padding:8px;' +
                    'background:#f0fff4;' +
                    'border-radius:7px;' +
                    'margin-bottom:8px;' +
                    '">' +

                    '👤 <strong>' +
                    escapeHtml(
                        mapping.userName ||
                        mapping.userId
                    ) +
                    '</strong>' +

                    '<div style="' +
                    'font-size:10px;' +
                    'color:#718096;' +
                    'margin-top:2px;' +
                    '">' +
                    'User ID: ' +
                    escapeHtml(
                        String(
                            mapping.userId
                        )
                    ) +
                    '</div>' +

                    '</div>';

            } else {

                html +=
                    '<div style="' +
                    'padding:8px;' +
                    'background:#fffaf0;' +
                    'color:#b7791f;' +
                    'border-radius:7px;' +
                    'margin-bottom:8px;' +
                    '">' +
                    '⚠️ 수신자 미설정' +
                    '</div>';
            }

            html +=
                '<div style="' +
                'display:flex;' +
                'gap:6px;' +
                '">';

            html +=
                '<button ' +
                'class="btn btn-primary btn-sm" ' +
                'style="flex:1;" ' +
                'onclick="openAdminKakaoWorkUserPicker(\'' +
                escapeJsString(
                    region
                ) +
                '\')">' +
                '👤 사용자 선택' +
                '</button>';

            html +=
                '<button ' +
                'class="btn btn-outline btn-sm" ' +
                'onclick="clearAdminKakaoWorkMapping(\'' +
                escapeJsString(
                    region
                ) +
                '\')">' +
                '삭제' +
                '</button>';

            html +=
                '</div>';

            html +=
                '</div>';
        }
    );

    container.innerHTML =
        html;
}
async function openAdminKakaoWorkUserPicker(
    region
) {

    const existing =
        document.getElementById(
            'adminKakaoWorkUserModal'
        );

    if (existing) {
        existing.remove();
    }

    const html = `
<div
    id="adminKakaoWorkUserModal"
    style="
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.55);
        z-index:999999;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
    "
    onclick="if(event.target===this)this.remove()"
>

    <div
        style="
            background:white;
            width:min(520px,100%);
            max-height:80vh;
            overflow:auto;
            border-radius:14px;
            padding:16px;
            box-shadow:0 20px 50px rgba(0,0,0,.25);
        "
        onclick="event.stopPropagation()"
    >

        <div
            style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                margin-bottom:12px;
            "
        >

            <strong>
                👤 ${escapeHtml(region)}
                카카오워크 수신자
            </strong>

            <button
                class="btn btn-outline btn-sm"
                onclick="
                    document
                        .getElementById(
                            'adminKakaoWorkUserModal'
                        )
                        .remove()
                "
            >
                ×
            </button>

        </div>

        <input
            id="adminKakaoWorkUserSearch"
            type="text"
            placeholder="이름 / 부서 / 이메일 검색"
            style="
                width:100%;
                box-sizing:border-box;
                padding:10px;
                border:1px solid #cbd5e0;
                border-radius:8px;
                margin-bottom:10px;
            "
            oninput="
                searchAdminKakaoWorkUsers(
                    '${escapeJsString(region)}'
                )
            "
        >

        <div
            id="adminKakaoWorkUserResults"
        >
            ⏳ 사용자 불러오는 중...
        </div>

    </div>

</div>
`;

    document.body.insertAdjacentHTML(
        'beforeend',
        html
    );

    await searchAdminKakaoWorkUsers(
        region
    );
}
async function searchAdminKakaoWorkUsers(
    region
) {

    const input =
        document.getElementById(
            'adminKakaoWorkUserSearch'
        );

    const box =
        document.getElementById(
            'adminKakaoWorkUserResults'
        );

    if (!box) {
        return;
    }

    const keyword =
        String(
            input?.value || ''
        ).trim();

    box.innerHTML =
        '<div style="padding:12px;text-align:center;color:#718096;">' +
        '⏳ 검색 중...' +
        '</div>';

    try {

        const data =
            await serverGet(
                '/api/admin/kakao-work/users?q=' +
                encodeURIComponent(
                    keyword
                )
            );

        const users =
            data.users || [];

        if (!users.length) {

            box.innerHTML =
                '<div style="padding:16px;text-align:center;color:#718096;">' +
                '검색 결과가 없습니다.' +
                '</div>';

            return;
        }

        let html =
            '<div style="display:flex;flex-direction:column;gap:6px;">';

        users.forEach(
            function(user) {

                html +=
                    '<button ' +
                    'type="button" ' +
                    'style="' +
                    'display:block;' +
                    'width:100%;' +
                    'text-align:left;' +
                    'background:white;' +
                    'border:1px solid #e2e8f0;' +
                    'border-radius:8px;' +
                    'padding:10px;' +
                    'cursor:pointer;' +
                    '" ' +
                    'onclick="selectAdminKakaoWorkUser(' +
                    '\'' +
                    escapeJsString(
                        region
                    ) +
                    '\',' +
                    '\'' +
                    escapeJsString(
                        String(
                            user.id
                        )
                    ) +
                    '\',' +
                    '\'' +
                    escapeJsString(
                        user.name ||
                        ''
                    ) +
                    '\'' +
                    ')">';

                html +=
                    '<strong>' +
                    escapeHtml(
                        user.name ||
                        '-'
                    ) +
                    '</strong>';

                if (
                    user.department ||
                    user.position
                ) {

                    html +=
                        '<div style="font-size:11px;color:#718096;margin-top:3px;">' +
                        escapeHtml(
                            [
                                user.department,
                                user.position
                            ]
                            .filter(Boolean)
                            .join(' · ')
                        ) +
                        '</div>';
                }

                html +=
                    '<div style="font-size:10px;color:#a0aec0;margin-top:3px;">' +
                    'ID: ' +
                    escapeHtml(
                        String(
                            user.id
                        )
                    ) +
                    '</div>';

                html +=
                    '</button>';
            }
        );

        html +=
            '</div>';

        box.innerHTML =
            html;

    } catch (error) {

        box.innerHTML =
            '<div style="padding:12px;color:#e53e3e;">' +
            '❌ 검색 실패<br>' +
            '<small>' +
            escapeHtml(
                error.message
            ) +
            '</small>' +
            '</div>';
    }
}
async function selectAdminKakaoWorkUser(
    region,
    userId,
    userName
) {

    try {

        const result =
            await serverPost(
                '/api/admin/kakao-work/mappings',
                {
                    region,
                    userId,
                    userName
                }
            );

        if (!result.ok) {

            throw new Error(
                result.message ||
                result.error ||
                '저장 실패'
            );
        }

        const modal =
            document.getElementById(
                'adminKakaoWorkUserModal'
            );

        if (modal) {
            modal.remove();
        }

        showTabStatus(
            'tab-settings',
            '✅ ' +
            region +
            ' 수신자를 ' +
            userName +
            '님으로 설정했습니다.',
            'ok'
        );

        await loadAdminKakaoWorkMappings();

    } catch (error) {

        alert(
            '❌ 카카오워크 사용자 저장 실패\n\n' +
            error.message
        );
    }
}
async function clearAdminKakaoWorkMapping(
    region
) {

    if (
        !confirm(
            region +
            ' 지역의 카카오워크 수신자를 삭제하시겠습니까?'
        )
    ) {
        return;
    }

    try {

        const result =
            await serverPost(
                '/api/admin/kakao-work/mappings',
                {
                    region,
                    userId: '',
                    userName: ''
                }
            );

        if (!result.ok) {

            throw new Error(
                result.message ||
                result.error ||
                '삭제 실패'
            );
        }

        showTabStatus(
            'tab-settings',
            '✅ ' +
            region +
            ' 수신자 설정을 삭제했습니다.',
            'ok'
        );

        await loadAdminKakaoWorkMappings();

    } catch (error) {

        alert(
            '❌ 삭제 실패\n\n' +
            error.message
        );
    }
}
// ============================================================
// 관리자 설정 펼치기 / 접기
// ============================================================

function toggleAdminSettings() {

    if (!isMaster()) {

        showTabStatus(
            'tab-settings',
            '⚠️ 관리자 권한이 필요합니다.',
            'warning'
        );

        return;
    }


    const panel =
        document.getElementById(
            'adminSettingsPanel'
        );

    const arrow =
        document.getElementById(
            'adminSettingsArrow'
        );


    if (!panel) return;


    const opening =
        panel.style.display === 'none' ||
        !panel.style.display;


    panel.style.display =
        opening
            ? 'block'
            : 'none';


    if (arrow) {

        arrow.textContent =
            opening
                ? '⌄'
                : '›';
    }
    if (opening) {
    loadAdminKakaoWorkMappings();
}
}


// ============================================================
// 설정 탭 진입 시 갱신
// ============================================================

async function refreshSettingsTab() {

    updateWorkerNameStatus();

    updateAuthorizationUI();

    updateSettingsConnectionUI();


    if (isAuthorized()) {

        await refreshSettingsConnectionStatus();
    }
}
                                                                                                                                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                                                                                    
async function testGitHubToken() {
    let token = settings.githubToken || document.getElementById('githubToken').value.trim();
    if (!token) {
        showTabStatus('tab-settings', '토큰을 입력하세요.', 'warning');
        return;
    }
    let gs = document.getElementById('githubStatus');
    gs.textContent = '⏳ 테스트 중...';
    gs.className = 'badge badge-wait';
    try {
        let res = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (res.ok) {
            let user = await res.json();
            gs.textContent = '✅ ' + user.login;
            gs.className = 'badge badge-ok';
            settings.githubToken = token;
            saveSettings();
        } else {
            gs.textContent = '❌ 실패 (' + res.status + ')';
            gs.className = 'badge badge-fail';
        }
    } catch {
        gs.textContent = '❌ 네트워크 오류';
        gs.className = 'badge badge-fail';
    }
}

// ============================================================
// 4. 저장소 및 지역 관리
// ============================================================
function savePlaces() {

    if (!isAuthorized()) {
        showTabStatus(
            'tab-settings',
            '🔒 인가코드 인증이 필요합니다.',
            'warning'
        );
        return false;
    }

    if (
        isRegionUser() &&
        currentRegion !== fieldPilotAuth.region
    ) {
        showTabStatus(
            'tab-settings',
            '🔒 허용된 지역이 아닙니다.',
            'warning'
        );
        return false;
    }

    let key =
        getStorageKey(currentRegion);

    localStorage.setItem(
        key,
        JSON.stringify(places)
    );

    // IndexedDB가 기본 저장소이며 localStorage는 기존 버전 호환용 사본이다.
    fieldPilotCore()?.storage?.setValue(key, places).catch(function(error) {
        console.warn('[FieldPilot] IndexedDB 현장 저장 실패:', error);
    });

    renderPlaces();
    if (kakaoMap) renderNearbyPlaceClusters();
    updateStorageInfo();

    scheduleAutoSync();

    return true;
}

let placeSyncInProgress = false;
let placeSyncPending = false;

function scheduleAutoSync() {
    clearTimeout(autoSyncTimer);

    if (!currentRegion) return;

    if (!navigator.onLine) {
        placeSyncPending = true;
        queueServerWrite(
            '/api/places?region=' + encodeURIComponent(currentRegion),
            { version: 1, region: currentRegion, places: places, lastUpdated: new Date().toISOString() }
        );
        showTabStatus(
            'tab-settings',
            '📡 오프라인 - 서버 동기화 대기 중',
            'warning'
        );
        return;
    }

    autoSyncTimer = setTimeout(async function() {

        if (placeSyncInProgress) {
            placeSyncPending = true;
            return;
        }

        placeSyncInProgress = true;
        placeSyncPending = false;

        try {
            await serverPost(
                '/api/places?region=' +
                encodeURIComponent(currentRegion),
                {
                    version: 1,
                    region: currentRegion,
                    places: places,
                    lastUpdated: new Date().toISOString()
                }
            );

            console.log(
                '[LOCAL → SERVER] 현장 동기화 완료:',
                currentRegion,
                places.length
            );

        } catch (error) {

            placeSyncPending = true;
            queueServerWrite(
                '/api/places?region=' + encodeURIComponent(currentRegion),
                { version: 1, region: currentRegion, places: places, lastUpdated: new Date().toISOString() }
            );

            console.error(
                '[LOCAL → SERVER] 동기화 실패:',
                error
            );

        } finally {

            placeSyncInProgress = false;

            if (placeSyncPending) {
                scheduleAutoSync();
            }
        }

    }, 1500);
}
function updateStorageInfo() {
    let size = 0;
    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);
        if (key) size += localStorage.getItem(key).length * 2;
    }
    document.getElementById('storageInfo').textContent = '저장소: ' + (size / 1024).toFixed(1) + ' KB';
}
async function loadPlacesFromServer(region, useServer = true) {
    if (!region) {
        places = [];
        return;
    }

    const localKey = getStorageKey(region);
    let localData = localStorage.getItem(localKey);
    try {
        const indexedValue = await fieldPilotCore()?.storage?.getValue(localKey, null);
        if (indexedValue !== null && indexedValue !== undefined) {
            localData = typeof indexedValue === 'string'
                ? indexedValue : JSON.stringify(indexedValue);
        }
    } catch (error) {
        console.warn('[FieldPilot] IndexedDB 현장 로드 실패, 호환 저장소 사용:', error);
    }

    // 1. LOCAL을 먼저 화면에 표시
    if (localData) {
        try {
            places = JSON.parse(localData);
        } catch (e) {
            console.warn('LOCAL 현장 데이터 파싱 실패:', e);
            places = [];
        }
    } else {
        places = [];
    }

    renderPlaces();
    if (kakaoMap) renderNearbyPlaceClusters();
    updateStorageInfo();

    if (!useServer || !navigator.onLine) {
        return;
    }

    // 2. 서버 최신 데이터 확인
    try {
        const data = await serverGet(
            '/api/places?region=' +
            encodeURIComponent(region)
        );

        if (
            data &&
            Array.isArray(data.places)
        ) {
            places = data.places;

            // 서버 데이터를 LOCAL 캐시로 반영
            localStorage.setItem(
                localKey,
                JSON.stringify(places)
            );
            fieldPilotCore()?.storage?.setValue(localKey, places).catch(function(error) {
                console.warn('[FieldPilot] IndexedDB 현장 캐시 저장 실패:', error);
            });

            renderPlaces();
            if (kakaoMap) renderNearbyPlaceClusters();
            updateStorageInfo();

            console.log(
                '[SERVER → LOCAL] 현장 로딩:',
                region,
                places.length
            );
        }

    } catch (error) {

        console.warn(
            '[SERVER → LOCAL] 실패. LOCAL 데이터 사용:',
            error.message
        );
    }
}

function loadRegionList() {
    let select =
        document.getElementById(
            'regionSelect'
        );

    if (!select) return;

    select.innerHTML = '';

    // 인가되지 않았으면 지역을 만들거나 선택하지 않음
    if (!isAuthorized()) {

        currentRegion = '';

        places = [];

        updateRegionDisplay();

        updateFeatureLockState();

        return;
    }

    if (isRegionUser()) {

    const region =
        String(fieldPilotAuth.region || '').trim();

    if (!region) {
        console.warn(
            '[AUTH] 지역 사용자이지만 region이 없습니다.'
        );

        currentRegion = '';
        places = [];

        updateRegionDisplay();
        updateFeatureLockState();

        return;
    }

    currentRegion = region;

    localStorage.setItem(
        SELECTED_REGION_KEY,
        region
    );

    const option =
        document.createElement('option');

    option.value = region;
    option.textContent = region;

    select.appendChild(option);

    select.value = region;
    select.disabled = true;

    /*
     * 기존 LOCAL 데이터를 먼저 표시한다.
     * 처음 사용하는 사용자라면 빈 배열이 된다.
     */
    const data =
        localStorage.getItem(
            getStorageKey(region)
        );

    try {
        places =
            data
                ? JSON.parse(data)
                : [];
    } catch (error) {

        console.warn(
            '[LOCAL] 지역 데이터 파싱 실패:',
            error
        );

        places = [];
    }

    updateRegionDisplay();
    clearNearbyPlaceClusters();
    renderPlaces();
    updateStorageInfo();

    /*
     * ★ 핵심
     * 지역 인가가 완료되면 반드시
     * SERVER → LOCAL 동기화를 수행한다.
     *
     * 처음 사용하는 사용자도 여기서
     * 서버의 용산 현장 목록을 가져온다.
     */
    loadPlacesFromServer(
        region,
        true
    ).catch(function(error) {

        console.warn(
            '[SERVER → LOCAL] 지역 현장 초기 로딩 실패:',
            error
        );
    });

    return;
}
    select.innerHTML = '';
    
    let regions = [];
    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
            let region = key.replace(STORAGE_KEY_PREFIX, '');
            if (region && !regions.includes(region)) {
                regions.push(region);
            }
        }
    }
    
    if (regions.length === 0) {
        let defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '📍 지역 선택';
        defaultOpt.selected = true;
        defaultOpt.disabled = true;
        select.appendChild(defaultOpt);
        updateRegionDisplay();
        return;
    }
    
    regions.sort();
    for (let i = 0; i < regions.length; i++) {
        let opt = document.createElement('option');
        opt.value = regions[i];
        opt.textContent = regions[i];
        select.appendChild(opt);
    }
    
    let savedRegion = localStorage.getItem(SELECTED_REGION_KEY);
    if (savedRegion && regions.includes(savedRegion)) {
        select.value = savedRegion;
        currentRegion = savedRegion;
    } else {
        select.value = regions[0];
        currentRegion = regions[0];
        localStorage.setItem(SELECTED_REGION_KEY, currentRegion);
    }
    
    updateRegionDisplay();
    
    loadPlacesFromServer(
    currentRegion,
    true
);
    
    if (kakaoMap) {
        let center = getRegionCenter(currentRegion);
        kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
        kakaoMap.setLevel(5);
        kakaoMap.relayout();
    }
}

async function switchRegion(region) {
    if (!isAuthorized()) {
        showTabStatus(
            'tab-settings',
            '🔒 먼저 인가코드를 입력하세요.',
            'warning'
        );
        return;
    }

    if (
        !isMaster() &&
        region !== fieldPilotAuth.region
    ) {
        showTabStatus(
            'tab-settings',
            '🔒 ' +
            fieldPilotAuth.region +
            ' 지역만 사용할 수 있습니다.',
            'warning'
        );
        return;
    }

    if (!region || region === '') {
        return;
    }
    if (!region || region === '') return;

    clearTimeout(autoSyncTimer);

    currentRegion = region;

    localStorage.setItem(
        SELECTED_REGION_KEY,
        region
    );

    let select = document.getElementById('regionSelect');

    if (select) {
        select.value = region;
    }

    updateRegionDisplay();

    // LOCAL → SERVER
    await loadPlacesFromServer(region, true);
    if (kakaoMap) renderNearbyPlaceClusters();

    // 경로 데이터 초기화
    waypoints = [];
    routeResult = null;
    startPoint = null;

    renderWaypointList();

    clearRouteMarkers();
    clearSingleMarker();

    isShowingRouteMarkers = false;

    document.getElementById('startInfo').textContent =
        '⏳ 출발지를 검색하거나 현재 위치 버튼을 눌러 설정하세요';

    document.getElementById('startInfo').style.color =
        '#718096';

    document.getElementById('placeCount').textContent =
        '0개소';

    document.getElementById('totalDistance').textContent =
        '0.00 km';

    document.getElementById('totalTime').textContent =
        '0 분';

    document.getElementById('optimizeMode').textContent =
        '-';

    document.getElementById('routeList').innerHTML = '';

    document.getElementById('savedRow').style.display =
        'none';

    currentPlaceId = null;

    if (kakaoMap) {
        let center = getRegionCenter(region);

        kakaoMap.setCenter(
            new kakao.maps.LatLng(
                center.lat,
                center.lng
            )
        );

        kakaoMap.setLevel(5);
        kakaoMap.relayout();
    }

    let activeTab =
        document.querySelector('.tab-content.active');

    if (activeTab) {
        showTabStatus(
            activeTab.id,
            '📍 ' + region +
            ' 지역으로 전환됨 (' +
            places.length +
            '개 현장)',
            'info'
        );
    }

    fetchWeather();
}

function addRegion() {
    let existing = document.getElementById('customRegionModal');
    if (existing) existing.remove();
    
    let modalHtml = `
        <div id="customRegionModal" style="
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 99999;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            animation: fadeIn 0.2s ease;
        " onclick="if(event.target===this) this.remove()">
            <div style="
                background: white;
                border-radius: 16px;
                padding: 24px;
                max-width: 380px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            " onclick="event.stopPropagation()">
                <h3 style="font-size:17px; font-weight:700; color:#1a202c; margin-bottom:8px;">📍 지역 추가</h3>
                <p style="font-size:14px; color:#4a5568; margin-bottom:16px; line-height:1.6;">
                    새 지역명을 입력하세요:
                </p>
                <input id="customRegionInput" type="text" placeholder="예: 강남구" 
                       style="width:100%; padding:10px 12px; border:2px solid #e2e8f0; border-radius:8px; font-size:14px; margin-bottom:16px;"
                       onkeydown="if(event.key==='Enter') document.getElementById('customRegionConfirmBtn').click();">
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button class="btn btn-outline btn-sm" onclick="document.getElementById('customRegionModal').remove();" style="padding:6px 16px; border:1px solid #cbd5e0; border-radius:8px; background:white; cursor:pointer;">취소</button>
                    <button id="customRegionConfirmBtn" class="btn btn-primary btn-sm" style="padding:6px 16px; background:#4f7eb3; color:white; border:none; border-radius:8px; cursor:pointer;">추가</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    setTimeout(function() {
        let input = document.getElementById('customRegionInput');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
    
    document.getElementById('customRegionConfirmBtn').addEventListener('click', function() {
        let input = document.getElementById('customRegionInput');
        let name = input ? input.value.trim() : '';
        document.getElementById('customRegionModal').remove();
        
        if (!name) {
            showTabStatus('tab-settings', '⚠️ 지역명을 입력하세요.', 'warning');
            return;
        }
        
        let region = name.replace(/[\/\\:*?"<>|]/g, '');
        if (!region) {
            showTabStatus('tab-settings', '⚠️ 사용할 수 없는 지역명입니다.', 'warning');
            return;
        }
        
        let select = document.getElementById('regionSelect');
        if (!select) {
            showTabStatus('tab-settings', '⚠️ 오류 발생, 새로고침 후 다시 시도하세요.', 'error');
            return;
        }
        
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === region) {
                showTabStatus('tab-settings', '⚠️ 이미 존재하는 지역입니다.', 'warning');
                return;
            }
        }
        
        let key = getStorageKey(region);
        localStorage.setItem(key, JSON.stringify([]));
        
        let opt = document.createElement('option');
        opt.value = region;
        opt.textContent = region;
        select.appendChild(opt);
        select.value = region;
        
        switchRegion(region);
        showTabStatus('tab-settings', '✅ "' + region + '" 지역 추가됨', 'ok');
    });
}

function deleteRegion() {
    let select = document.getElementById('regionSelect');
    if (!select) return;
    
    let currentRegion = select.value;
    if (!currentRegion || currentRegion === '') {
        showTabStatus('tab-settings', '⚠️ 삭제할 지역을 선택하세요.', 'warning');
        return;
    }
    
    if (select.options.length <= 1) {
        showTabStatus('tab-settings', '⚠️ 삭제할 지역이 없습니다.', 'warning');
        return;
    }
    
    showConfirmModal(
        '🗑️ 지역 삭제',
        '"' + currentRegion + '" 지역을 삭제하시겠습니까?\n해당 지역의 모든 현장 데이터도 함께 삭제됩니다.',
        function() {
            let key = getStorageKey(currentRegion);
            localStorage.removeItem(key);
            
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === currentRegion) {
                    select.remove(i);
                    break;
                }
            }
            
            if (select.options.length > 0) {
                let newRegion = select.options[0].value;
                select.value = newRegion;
                switchRegion(newRegion);
                showTabStatus('tab-settings', '✅ "' + currentRegion + '" 지역 삭제됨', 'ok');
            } else {
                select.innerHTML = '';
                let defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.textContent = '📍 지역 선택';
                defaultOpt.selected = true;
                select.appendChild(defaultOpt);
                currentRegion = '';
                localStorage.removeItem(SELECTED_REGION_KEY);
                places = [];
                renderPlaces();
                showTabStatus('tab-settings', '📭 모든 지역이 삭제되었습니다.', 'info');
            }
        }
    );
}

// ============================================================
// 5. 설정 내보내기/가져오기
// ============================================================
function exportSettings() {
    const data = {
        kakaoJsKey: settings.kakaoJsKey || '',
        kakaoRestKey: settings.kakaoRestKey || '',
        routeApi: routeApi || 'kakao',
        exportDate: new Date().toISOString()
    };

    const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download =
        'fieldpilot-settings-' +
        new Date().toISOString().slice(0, 10) +
        '.json';

    a.click();

    URL.revokeObjectURL(url);

    showTabStatus(
        'tab-settings',
        '✅ 설정 백업 완료',
        'ok'
    );
}

function importSettings(event) {
    let file = event.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function(e) {
        try {
            let data = JSON.parse(e.target.result);
            if (!data.githubToken && !data.kakaoJsKey && !data.kakaoRestKey) {
                showTabStatus('tab-settings', '❌ 유효한 설정 파일이 아닙니다.', 'error');
                return;
            }
            settings.githubToken = data.githubToken || '';
            settings.kakaoJsKey = data.kakaoJsKey || '';
            settings.kakaoRestKey = data.kakaoRestKey || '';
            if (data.routeApi) routeApi = data.routeApi;
            saveSettings();
            document.getElementById('githubToken').value = settings.githubToken;
            document.getElementById('kakaoJsKey').value = settings.kakaoJsKey;
            document.getElementById('kakaoRestKey').value = settings.kakaoRestKey;
            showTabStatus('tab-settings', '✅ 설정 복원 완료', 'ok');
            initMap();
        } catch(error) {
            showTabStatus('tab-settings', '❌ 설정 파일 오류: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ============================================================
// 6. 검색 결과 렌더링
// ============================================================
function renderSearchResults(container, results, onClickName, isMultiSelect) {
    if (!results || results.length === 0) {
        container.style.display = 'none';
        return;
    }
    let html = '';
    for (let i = 0; i < results.length; i++) {
        let item = results[i];
        let sourceLabel = item._source || '카카오맵';
        let checked = selectedWaypoints.some(function(w) { return w.name === item.place_name; });
        html += '<div class="result-item" data-name="' + escapeHtml(item.place_name) + '" data-address="' + escapeHtml(item.address_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '" data-index="' + i + '">';
        if (isMultiSelect) {
            html += '<input type="checkbox" class="result-check" ' + (checked ? 'checked' : '') + ' onclick="event.stopPropagation(); toggleWaypointSelection(\'' + escapeHtml(item.place_name) + '\', \'' + escapeHtml(item.address_name) + '\', ' + item.y + ', ' + item.x + ')">';
        }
        html += '<div class="result-info"><div>' + escapeHtml(item.place_name) + ' <span class="source">' + sourceLabel + '</span></div>';
        html += '<div class="addr">' + escapeHtml(item.address_name) + '</div></div></div>';
    }
    container.innerHTML = html;
    container.style.display = 'block';
    
    container.querySelectorAll('.result-item').forEach(function(el) {
        el.addEventListener('click', function(e) {
            if (e.target.closest('.result-check')) return;
            
            let name = this.dataset.name;
            let address = this.dataset.address;
            let lat = parseFloat(this.dataset.lat);
            let lng = parseFloat(this.dataset.lng);
            
            if (onClickName === 'selectStartPoint') {
                selectStartPoint(name, address, lat, lng);
            } else if (onClickName === 'selectAddress') {
                selectAddress(name, address, lat, lng);
            } else {
                let fn = window[onClickName];
                if (typeof fn === 'function') {
                    fn(name, address, lat, lng);
                }
            }
        });
    });
}

// ============================================================
// 7. 여러개 추가 모드
// ============================================================
function toggleMultiSelect() {
    multiSelectMode = !multiSelectMode;
    
    let toggleBtn = document.getElementById('multiToggleBtn');
    let addBtn = document.getElementById('addWaypointBtn');
    let input = document.getElementById('waypointInput');
    let statusEl = document.getElementById('modeStatus');
    
    if (multiSelectMode) {
        if (toggleBtn) {
            toggleBtn.style.background = '#2b6cb0';
            toggleBtn.style.color = 'white';
            toggleBtn.style.borderColor = '#2b6cb0';
            toggleBtn.textContent = '✅ 여러개 추가 ON';
        }
        if (addBtn) {
            addBtn.textContent = '✅ 선택 추가';
            addBtn.style.background = '#2b6cb0';
        }
        if (input) {
            input.placeholder = '🔍 검색 후 체크박스로 선택하세요';
        }
        if (statusEl) {
            statusEl.textContent = '📋 여러개 추가 모드 - 검색 결과에서 체크박스로 선택 후 "선택 추가" 버튼 클릭';
            statusEl.style.color = '#2b6cb0';
        }
        showTabStatus('tab-places', '📋 여러개 추가 모드 활성화', 'info');
    } else {
        if (toggleBtn) {
            toggleBtn.style.background = 'white';
            toggleBtn.style.color = '#4a5568';
            toggleBtn.style.borderColor = '#cbd5e0';
            toggleBtn.textContent = '📋 여러개 추가';
        }
        if (addBtn) {
            addBtn.textContent = '➕ 추가';
            addBtn.style.background = '#38a169';
        }
        if (input) {
            input.placeholder = '경유지 입력';
        }
        if (statusEl) {
            statusEl.textContent = '💡 일반 모드 - 경유지를 입력하고 추가하세요';
            statusEl.style.color = '#a0aec0';
        }
        selectedWaypoints = [];
        let resultsContainer = document.getElementById('waypointSearchResults');
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }
        showTabStatus('tab-places', '일반 모드로 전환됨', 'info');
    }
}

// ============================================================
// 8. 경유지 선택 토글
// ============================================================
function toggleWaypointSelection(name, address, lat, lng) {
    let idx = selectedWaypoints.findIndex(function(w) { return w.name === name; });
    if (idx >= 0) {
        selectedWaypoints.splice(idx, 1);
    } else {
        if (selectedWaypoints.length >= 15) {
            showTabStatus('tab-places', '⚠️ 최대 15개까지 선택 가능', 'warning');
            return;
        }
        selectedWaypoints.push({ name: name, address: address, lat: lat, lng: lng });
    }
    let container = document.getElementById('waypointSearchResults');
    if (container) {
        container.querySelectorAll('.result-item').forEach(function(el) {
            let cb = el.querySelector('.result-check');
            if (cb) {
                cb.checked = selectedWaypoints.some(function(w) { return w.name === el.dataset.name; });
            }
        });
    }
}

function getRecentStartPoints() {
    try {
        let key = 'recentStartPoints_' + currentRegion;
        let data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

function saveRecentStartPoint(name, address, lat, lng) {
    let recent = getRecentStartPoints();
    recent = recent.filter(function(item) { return item.name !== name; });
    recent.unshift({ name: name, address: address, lat: lat, lng: lng });
    recent = recent.slice(0, 3);
    let key = 'recentStartPoints_' + currentRegion;
    localStorage.setItem(key, JSON.stringify(recent));
}

// ============================================================
// 9. 출발지 검색 및 설정
// ============================================================
function searchStartPoint(query) {
    let container = document.getElementById('startSearchResults');
    
    if (!query || query.length === 0) {
        let recent = getRecentStartPoints();
        if (recent.length === 0) {
            container.style.display = 'none';
            return;
        }
        let html = '';
        for (let i = 0; i < recent.length; i++) {
            let item = recent[i];
            html += '<div class="result-item" data-name="' + escapeHtml(item.name) + '" data-address="' + escapeHtml(item.address) + '" data-lat="' + item.lat + '" data-lng="' + item.lng + '">';
            html += '<div>🕐 ' + escapeHtml(item.name) + ' <span style="font-size:10px;color:#a0aec0;">최근</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address) + '</div></div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        
        container.querySelectorAll('.result-item').forEach(function(el) {
            el.addEventListener('click', function() {
                let name = this.dataset.name;
                let address = this.dataset.address;
                let lat = parseFloat(this.dataset.lat);
                let lng = parseFloat(this.dataset.lng);
                selectStartPoint(name, address, lat, lng);
            });
        });
        return;
    }
    
    if (query.length < 2) {
        container.style.display = 'none';
        return;
    }
    
    clearTimeout(window._startSearchTimer);
    window._startSearchTimer = setTimeout(async function() {
        let allResults = [];
        let seenNames = {};
        let lowerQuery = query.toLowerCase();
        
        for (let i = 0; i < places.length; i++) {
            let p = places[i];
            if (p.name.toLowerCase().includes(lowerQuery) || (p.address && p.address.toLowerCase().includes(lowerQuery))) {
                let key = p.name + '|' + (p.address || '');
                if (!seenNames[key]) {
                    seenNames[key] = true;
                    allResults.push({
                        place_name: p.name,
                        address_name: p.address || '(주소 없음)',
                        y: p.lat || 0,
                        x: p.lng || 0,
                        _source: '현장리스트'
                    });
                }
            }
        }
        
        let kakaoResults = await searchKakaoPlaces(query);
        kakaoResults.slice(0, 5).forEach(function(item) {
            let key = item.place_name + '|' + item.address_name;
            if (!seenNames[key]) {
                seenNames[key] = true;
                allResults.push(item);
            }
        });
        
        if (allResults.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        let html = '';
        for (let i = 0; i < allResults.length; i++) {
            let item = allResults[i];
            let sourceLabel = item._source || '카카오맵';
            html += '<div class="result-item" data-name="' + escapeHtml(item.place_name) + '" data-address="' + escapeHtml(item.address_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '">';
            html += '<div class="result-info"><div>' + escapeHtml(item.place_name) + ' <span class="source">' + sourceLabel + '</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address_name) + '</div></div></div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        
        container.querySelectorAll('.result-item').forEach(function(el) {
            el.addEventListener('click', function() {
                let name = this.dataset.name;
                let address = this.dataset.address;
                let lat = parseFloat(this.dataset.lat);
                let lng = parseFloat(this.dataset.lng);
                selectStartPoint(name, address, lat, lng);
            });
        });
    }, 300);
}

function selectStartPoint(name, address, lat, lng) {
    document.getElementById('startPoint').value = name;
    document.getElementById('startSearchResults').style.display = 'none';
    if (!lat || !lng || lat < 33 || lat > 39 || lng < 124 || lng > 132) {
        showTabStatus('tab-places', '⚠️ 유효하지 않은 좌표입니다.', 'warning');
        return;
    }
    let cleanName = name.replace(/^[🎯🚩]\s*/, '');
    saveRecentStartPoint(cleanName, address, lat, lng);
    startPoint = { name: cleanName, address: address, lat: lat, lng: lng };
    document.getElementById('startInfo').textContent = '✅ ' + cleanName + ' (' + address + ')';
    document.getElementById('startInfo').style.color = '#22543d';
    if (kakaoMap) {
        routeMarkers = [];
        if (startMarker) {
            try { startMarker.setMap(null); } catch(e) {}
            startMarker = null;
        }
        clearSingleMarker();
        isShowingRouteMarkers = false;
        addRouteMarker(startPoint.lat, startPoint.lng, cleanName, true, -1);
        kakaoMap.setCenter(new kakao.maps.LatLng(startPoint.lat, startPoint.lng));
        kakaoMap.setLevel(5);
        kakaoMap.relayout();
    }
    showTabStatus('tab-places', '✅ 출발지 "' + cleanName + '" 설정 완료', 'ok');
}

function setCurrentLocation() {
    if (!navigator.geolocation) {
        showTabStatus('tab-places', '⚠️ 이 브라우저는 GPS를 지원하지 않습니다.', 'warning');
        return;
    }
    
    let btn = document.querySelector('.btn-outline[onclick*="setCurrentLocation"]');
    if (btn) {
        btn.innerHTML = '<span style="font-size:14px;">⏳</span> 위치 확인 중...';
        btn.disabled = true;
    }
    
    showTabStatus('tab-places', '📍 GPS 위치 가져오는 중...', 'info');
    
    navigator.geolocation.getCurrentPosition(
function(position) {
let lat = position.coords.latitude;
let lng = position.coords.longitude;
// ★ GPS 좌표 저장 (날씨용)
userGpsCoords = { lat: lat, lng: lng };
// ★ 날씨 즉시 갱신 (실제 위치 기반)
fetchWeather();
if (btn) {
btn.innerHTML = '<span style="font-size:14px;">🎯</span> 현재 위치';
btn.disabled = false;
}
            
            let restKey = settings.kakaoRestKey || 'server-proxy'; // 서버가 실제 키 보유, 클라이언트는 게이트 통과용
            if (restKey) {
                serverGet('/api/geocode/reverse?lat=' + lat + '&lng=' + lng)
                .then(function(data) {
                    let address = '현재 위치';
                    if (data.documents && data.documents.length > 0) {
                        let doc = data.documents[0];
                        if (doc.road_address) {
                            address = doc.road_address.address_name;
                        } else if (doc.address) {
                            address = doc.address.address_name;
                        }
                    }
                    let shortAddr = shortenAddress(address);
                    selectStartPoint('내 위치', shortAddr || address, lat, lng);
                    showTabStatus('tab-places', '✅ 현재 위치로 설정됨: ' + (shortAddr || address), 'ok');
                })
                .catch(function() {
                    selectStartPoint('내 위치', 'GPS 좌표', lat, lng);
                    showTabStatus('tab-places', '✅ 현재 위치로 설정됨', 'ok');
                });
            } else {
                selectStartPoint('내 위치', 'GPS 좌표', lat, lng);
                showTabStatus('tab-places', '✅ 현재 위치로 설정됨', 'ok');
            }
        },
        function(error) {
            if (btn) {
                btn.innerHTML = '<span style="font-size:14px;">🎯</span> 현재 위치';
                btn.disabled = false;
            }
            
            let msg = 'GPS 위치를 가져올 수 없습니다.';
            if (error.code === 1) {
                msg = '⚠️ GPS 권한이 필요합니다. 설정 → 개인정보 보호 → 위치 서비스에서 허용해주세요.';
            } else if (error.code === 2) {
                msg = '⚠️ GPS 신호가 약합니다. 야외로 이동해보세요.';
            } else if (error.code === 3) {
                msg = '⚠️ GPS 요청 시간이 초과되었습니다. 다시 시도해주세요.';
            }
            showTabStatus('tab-places', msg, 'warning');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

async function setStartPoint() {
    let name = document.getElementById('startPoint').value.trim();
    if (!name) {
        showTabStatus('tab-places', '출발지를 입력하세요.', 'warning');
        return;
    }
    let restKey = settings.kakaoRestKey || 'server-proxy'; // 서버가 실제 키 보유, 클라이언트는 게이트 통과용
    if (!restKey) {
        showTabStatus('tab-places', '⚠️ REST API 키가 필요합니다.', 'warning');
        return;
    }
    let geo = await geocodeAddress(name, restKey);
    if (!geo) {
        showTabStatus('tab-places', '❌ "' + name + '" 위치를 찾을 수 없습니다.', 'error');
        return;
    }
    selectStartPoint(name, geo.address, geo.lat, geo.lng);
}

function selectWaypointFromSearch(name, address, lat, lng) {
    document.getElementById('waypointInput').value = '';
    document.getElementById('waypointSearchResults').style.display = 'none';
    if (waypoints.length >= 15) {
        showTabStatus('tab-places', '⚠️ 최대 15개까지 가능', 'warning');
        return;
    }
    waypoints.push({ name: name, lat: lat, lng: lng, address: address });
    renderWaypointList();
    showTabStatus('tab-places', '✅ "' + name + '" 경유지 추가', 'ok');
}

// ============================================================
// 10. 경유지 관리
// ============================================================
function addWaypoint() {
    let input = document.getElementById('waypointInput');
    let name = input.value.trim();
    
    if (multiSelectMode) {
        if (selectedWaypoints.length === 0) {
            showTabStatus('tab-places', '⚠️ 선택된 경유지가 없습니다. 검색 후 체크박스를 선택하세요.', 'warning');
            input.focus();
            return;
        }
        
        let added = 0;
        let duplicated = 0;
        
        for (let i = 0; i < selectedWaypoints.length; i++) {
            let w = selectedWaypoints[i];
            if (waypoints.length >= 15) {
                showTabStatus('tab-places', '⚠️ 최대 15개까지 가능', 'warning');
                break;
            }
            if (!waypoints.some(function(ex) { return ex.name === w.name; })) {
                waypoints.push({ 
                    name: w.name, 
                    lat: w.lat || 0, 
                    lng: w.lng || 0, 
                    address: w.address || '' 
                });
                added++;
            } else {
                duplicated++;
            }
        }
        
        renderWaypointList();
        selectedWaypoints = [];
        let resultsContainer = document.getElementById('waypointSearchResults');
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }
        
        let msg = '✅ ' + added + '개 경유지 추가됨';
        if (duplicated > 0) msg += ' (' + duplicated + '개 중복 제외)';
        showTabStatus('tab-places', msg, 'ok');
        return;
    }
    
    if (!name) {
        showTabStatus('tab-places', '경유지를 입력하세요.', 'warning');
        input.focus();
        return;
    }
    if (waypoints.length >= 15) {
        showTabStatus('tab-places', '⚠️ 최대 15개까지 가능', 'warning');
        return;
    }
    if (waypoints.some(function(ex) { return ex.name === name; })) {
        showTabStatus('tab-places', '⚠️ "' + name + '"은(는) 이미 경유지에 있습니다.', 'warning');
        input.value = '';
        input.focus();
        return;
    }
    waypoints.push({ name: name, lat: 0, lng: 0 });
    renderWaypointList();
    input.value = '';
    input.focus();
    let resultsContainer = document.getElementById('waypointSearchResults');
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
    }
    showTabStatus('tab-places', '✅ "' + name + '" 추가', 'ok');
}

function removeWaypoint(index) {
    waypoints.splice(index, 1);
    renderWaypointList();
}

function renderWaypointList() {
    let list = document.getElementById('waypointList');
    let countEl = document.getElementById('wpCount');
    if (!list) return;
    if (countEl) countEl.textContent = '(' + waypoints.length + '개)';
    
    // 경유지가 없을 때
    if (waypoints.length === 0) {
        list.innerHTML = '<li class="empty-msg">경유지를 추가하세요 (드래그로 순서 변경 가능)</li>';
        // 기존 Sortable 인스턴스 제거
        if (window._sortable) {
            window._sortable.destroy();
            window._sortable = null;
        }
        return;
    }
    
    let html = '';
    for (let i = 0; i < waypoints.length; i++) {
        let wp = waypoints[i];
        html += '<li data-index="' + i + '" data-name="' + escapeHtml(wp.name) + '" data-lat="' + (wp.lat || 0) + '" data-lng="' + (wp.lng || 0) + '">';
        html += '<div style="display:flex;align-items:center;flex:1;">';
        html += '<span class="drag-handle">⠿</span>'; // ★ 드래그 핸들 추가
        html += '<span class="idx">' + (i + 1) + '</span>';
        html += '<span>' + escapeHtml(wp.name) + '</span></div>';
        html += '<span class="remove" onclick="event.stopPropagation(); removeWaypoint(' + i + ')">✕</span></li>';
    }
    list.innerHTML = html;
    
    // ★ Sortable 초기화 (함수 내부에 위치해야 함)
    if (window.Sortable) {
        if (window._sortable) window._sortable.destroy();
        window._sortable = new Sortable(list, {
            handle: '.drag-handle', // 위에서 추가한 드래그 핸들을 타겟으로 지정
            animation: 150,
            onEnd: function(evt) {
                let oldIndex = evt.oldIndex;
                let newIndex = evt.newIndex;
                if (oldIndex === newIndex) return;
                
                let moved = waypoints.splice(oldIndex, 1)[0];
                waypoints.splice(newIndex, 0, moved);
                
                renderWaypointList();
                showTabStatus('tab-places', '🔄 경유지 순서 변경됨', 'info');
                
                if (startPoint && waypoints.length > 0) {
                    setTimeout(runOptimize, 300);
                }
            }
        });
    }
} // 함수의 올바른 종료 위치

// ============================================================
// 11. 경유지 검색
// ============================================================
function searchWaypoint(query) {
    let container = document.getElementById('waypointSearchResults');
    if (!query || query.length < 1) {
        container.style.display = 'none';
        return;
    }
    clearTimeout(window._waypointSearchTimer);
    window._waypointSearchTimer = setTimeout(async function() {
        let placeResults = [];
        let lowerQuery = query.toLowerCase();
        for (let i = 0; i < places.length; i++) {
            let p = places[i];
            if (p.name.toLowerCase().includes(lowerQuery) || 
                (p.address && p.address.toLowerCase().includes(lowerQuery))) {
                placeResults.push({
                    place_name: p.name,
                    address_name: p.address || '(주소 없음)',
                    y: p.lat || 0,
                    x: p.lng || 0,
                    _source: '현장리스트'
                });
            }
        }
        placeResults = placeResults.slice(0, 5);
        let kakaoResults = await searchKakaoPlaces(query, 5);
        kakaoResults = kakaoResults.slice(0, 5);
        let allResults = [];
        let seenNames = {};
        placeResults.concat(kakaoResults).forEach(function(item) {
            let key = item.place_name + '|' + item.address_name;
            if (!seenNames[key]) {
                seenNames[key] = true;
                allResults.push(item);
            }
        });
        if (allResults.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        let html = '';
        let isMulti = multiSelectMode;
        for (let i = 0; i < allResults.length; i++) {
            let item = allResults[i];
            let sourceLabel = item._source || '카카오맵';
            let checked = selectedWaypoints.some(function(w) { return w.name === item.place_name; });
            html += '<div class="result-item" data-name="' + escapeHtml(item.place_name) + '" data-address="' + escapeHtml(item.address_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '">';
            if (isMulti) {
                html += '<input type="checkbox" class="result-check" ' + (checked ? 'checked' : '') + ' onclick="event.stopPropagation(); toggleWaypointSelection(\'' + escapeHtml(item.place_name) + '\', \'' + escapeHtml(item.address_name) + '\', ' + item.y + ', ' + item.x + ')">';
            }
            html += '<div class="result-info"><div>' + escapeHtml(item.place_name) + ' <span class="source">' + sourceLabel + '</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address_name) + '</div></div></div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        
        container.querySelectorAll('.result-item').forEach(function(el) {
            el.addEventListener('click', function(e) {
                if (e.target.closest('.result-check')) return;
                let name = this.dataset.name;
                let address = this.dataset.address;
                let lat = parseFloat(this.dataset.lat);
                let lng = parseFloat(this.dataset.lng);
                if (multiSelectMode) {
                    toggleWaypointSelection(name, address, lat, lng);
                } else {
                    selectWaypointFromSearch(name, address, lat, lng);
                }
            });
        });
    }, 300);
}

function searchAddressForPlace(query) {
    let container = document.getElementById('addrSearchResults');
    if (!query || query.length < 2) {
        container.style.display = 'none';
        return;
    }
    clearTimeout(window._addrSearchTimer);
    window._addrSearchTimer = setTimeout(async function() {
        let results = await searchKakaoPlaces(query);
        if (results.length === 0) {
            container.style.display = 'none';
            return;
        }
        let html = '';
        for (let i = 0; i < results.length; i++) {
            let item = results[i];
            html += '<div class="result-item" data-name="' + escapeHtml(item.place_name) + '" data-address="' + escapeHtml(item.address_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '">';
            html += '<div class="result-info"><div>' + escapeHtml(item.place_name) + ' <span class="source">카카오맵</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address_name) + '</div></div></div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        container.querySelectorAll('.result-item').forEach(function(el) {
            el.addEventListener('click', function() {
                let name = this.dataset.name;
                let address = this.dataset.address;
                let lat = parseFloat(this.dataset.lat);
                let lng = parseFloat(this.dataset.lng);
                selectAddress(name, address, lat, lng);
            });
        });
    }, 300);
}

function selectAddress(name, address, lat, lng) {
    document.getElementById('newPlaceAddr').value = address;
    document.getElementById('addrSearchResults').style.display = 'none';
    let nameInput = document.getElementById('newPlaceName');
    if (!nameInput.value.trim()) nameInput.value = name;
}

// ============================================================
// 12. 현장 관리 (즐겨찾기 필터 분리)
// ============================================================
function toggleFavFilter() {
    favFilterActive = !favFilterActive;
    let btn = document.getElementById('favFilterBtn');
    if (btn) {
        btn.classList.toggle('active', favFilterActive);
        btn.textContent = favFilterActive ? '⭐ 즐겨찾기 ON' : '⭐ 즐겨찾기';
    }
    renderPlaces();
}

function applySort() {
    let sortSelect = document.getElementById('sortPlaces');
    if (sortSelect) {
        let newSort = sortSelect.value;
        if (newSort !== currentSort) {
            currentSort = newSort;
            renderPlaces();
        }
    }
}

function getFilteredAndSortedPlaces() {
    if (!places || places.length === 0) return [];

    let filtered = [...places];
    
    if (favFilterActive) {
        filtered = filtered.filter(function(p) { return p.favorite === true; });
    }
    
    if (currentSort === 'no-coord') {
        filtered = filtered.filter(function(p) {
            return !p.lat || !p.lng || (p.lat === 0 && p.lng === 0);
        });
    }

    if (currentSort === 'name-asc' || currentSort === 'favorite' || currentSort === 'no-coord') {
        filtered.sort(function(a, b) {
            return (a.name || '').localeCompare(b.name || '', 'ko');
        });
    } else if (currentSort === 'name-desc') {
        filtered.sort(function(a, b) {
            return (b.name || '').localeCompare(a.name || '', 'ko');
        });
    }

    return filtered;
}

function renderPlaces(filtered) {
    let list = document.getElementById('placeList');
    let data = filtered || getFilteredAndSortedPlaces();
    document.getElementById('listCount').textContent = '(' + data.length + '개)';

    if (data.length === 0) {
        list.innerHTML = '<div class="empty-msg">등록된 현장이 없습니다</div>';
        return;
    }

    let html = '';
    for (let i = 0; i < data.length; i++) {
        let p = data[i];
        let shortAddr = shortenAddress(p.address || '');
        let starIcon = p.favorite ? '★' : '☆';
        let starClass = p.favorite ? 'fav active' : 'fav inactive';
        let remarkDisplay = p.remark ? '<span class="remark">' + escapeHtml(p.remark) + '</span>' : '';

        let hasCoords = (p.lat && p.lng && p.lat !== 0 && p.lng !== 0);
        let borderColor = hasCoords ? '#4f7eb3' : '#e53e3e';

        html += '<div class="place-item" style="border-left-color: ' + borderColor + ';" onclick="openEditModal(\'' + p.id + '\')" title="클릭하여 편집">';
        html += '<div class="info"><span class="name">' + escapeHtml(p.name) + '</span>';
        html += '<span class="addr">' + escapeHtml(shortAddr) + '</span>';
        html += remarkDisplay;

        if (!hasCoords) {
            html += ' <span style="color:#e53e3e; font-size:12px; font-weight:700;" title="주소 변환 실패">⚠️</span>';
        }

        html += '</div><div class="actions" onclick="event.stopPropagation();">';
        html += '<button class="map" onclick="showPlaceOnMap(\'' + p.id + '\')" title="지도 보기">📍</button>';
        html += '<button class="add" onclick="addWaypointFromList(\'' + p.id + '\')" title="경유지 추가">➕</button>';
        html += '<button class="del" onclick="deletePlace(\'' + p.id + '\')" title="삭제">🗑️</button>';
        html += '<button class="' + starClass + '" onclick="toggleFavorite(\'' + p.id + '\')" title="즐겨찾기">' + starIcon + '</button>';
        html += '<button class="kakao" onclick="openKakaoMapFromPlace(\'' + p.id + '\')" title="카카오맵에서 열기" style="color:#3c1e1e; font-size:16px; background:none; border:none; cursor:pointer; padding:4px 4px;">🗺️</button>';
        html += '</div></div>';
    }
    list.innerHTML = html;
}

function searchPlaces() {
    let keyword = document.getElementById('searchPlace').value.trim();
    let baseList = getFilteredAndSortedPlaces();

    if (!keyword) {
        renderPlaces(baseList);
        return;
    }

    let results = baseList.filter(function(p) {
        return (p.name && p.name.includes(keyword)) || (p.address && p.address.includes(keyword));
    });

    renderPlaces(results);
}

// ============================================================
// 13. 현장 추가 모달
// ============================================================
function openAddPlaceModal() {
    document.getElementById('addPlaceModal').classList.add('active');
    document.getElementById('modalPlaceName').value = '';
    document.getElementById('modalPlaceAddr').value = '';
    document.getElementById('modalPlaceRemark').value = '';
    document.getElementById('modalPlaceName').focus();
}

function closeAddPlaceModal() {
    document.getElementById('addPlaceModal').classList.remove('active');
    document.getElementById('modalAddrSearchResults').style.display = 'none';
    if (document.getElementById('modalPlaceDong')) document.getElementById('modalPlaceDong').value = '';
}

function saveAddPlaceModal() {
    let name = document.getElementById('modalPlaceName').value.trim();
    let address = document.getElementById('modalPlaceAddr').value.trim();
    let lat = parseFloat(document.getElementById('modalPlaceLat').value);
    let lng = parseFloat(document.getElementById('modalPlaceLng').value);
    let remark = document.getElementById('modalPlaceRemark').value.trim();
    let dong = document.getElementById('modalPlaceDong') ? document.getElementById('modalPlaceDong').value.trim() : '';

    if (!name) {
        showTabStatus('tab-list', '⚠️ 현장명을 입력하세요.', 'warning');
        document.getElementById('modalPlaceName').focus();
        return;
    }

    if (!address && (isNaN(lat) || isNaN(lng))) {
        showTabStatus('tab-list', '⚠️ 주소 또는 위도/경도를 입력하세요.', 'warning');
        document.getElementById('modalPlaceAddr').focus();
        return;
    }

    if (!isNaN(lat) && !isNaN(lng)) {
        if (lat < 33 || lat > 43 || lng < 124 || lng > 132) {
            showTabStatus('tab-list', '⚠️ 대한민국 범위를 벗어났습니다.\n위도: 33~43, 경도: 124~132', 'warning');
            return;
        }
    }

    if (places.some(function(p) { return normalizeName(p.name) === normalizeName(name); })) {
        showTabStatus('tab-list', '⚠️ 이미 존재하는 현장명입니다.', 'warning');
        document.getElementById('modalPlaceName').focus();
        return;
    }

    let fullAddress = address;
    let finalLat = lat;
    let finalLng = lng;

    if (address && (isNaN(lat) || isNaN(lng))) {
        let restKey = settings.kakaoRestKey || 'server-proxy'; // 서버가 실제 키 보유, 클라이언트는 게이트 통과용
        if (restKey) {
            geocodeAddress(address, restKey).then(function(geo) {
                if (geo) {
                    finalLat = geo.lat;
                    finalLng = geo.lng;
                    fullAddress = geo.address || address;
                } else {
                    showTabStatus('tab-list', '⚠️ 주소 변환 실패. 위도/경도를 직접 입력하세요.', 'warning');
                    return;
                }
                savePlaceFromModal(name, fullAddress, finalLat, finalLng, remark, dong);
            });
            return;
        } else {
            showTabStatus('tab-list', '⚠️ 카카오 REST API 키가 없습니다. 위도/경도를 직접 입력하세요.', 'warning');
            return;
        }
    }

    savePlaceFromModal(name, fullAddress, finalLat, finalLng, remark, dong);
}

async function savePlaceFromModal(name, address, lat, lng, remark, dong) {
    // 동이 비어있고 좌표가 있으면 API로 자동 변환
    if (!dong && lat && lng) {
        dong = await extractDongFromCoords(lat, lng);
        if (dong === '기타') dong = '';
    }
    places.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: name,
        address: address,
        lat: lat,
        lng: lng,
        dong: dong || '',
        remark: remark || '',
        favorite: false
    });
    savePlaces();
    scheduleAutoSync();
    closeAddPlaceModal();
    let msg = '✅ "' + name + '" 추가됨';
    if (dong) msg += ' (' + dong + ')';
    showTabStatus('tab-list', msg, 'ok');
}

function searchAddressForModal(query) {
    let container = document.getElementById('modalAddrSearchResults');
    if (!query || query.length < 2) {
        container.style.display = 'none';
        return;
    }
    clearTimeout(window._modalAddrSearchTimer);
    window._modalAddrSearchTimer = setTimeout(async function() {
        let results = await searchKakaoPlaces(query);
        if (results.length === 0) {
            container.style.display = 'none';
            return;
        }
        let html = '';
        for (let i = 0; i < results.length; i++) {
            let item = results[i];
            html += '<div class="result-item" data-address="' + escapeHtml(item.address_name) + '" data-name="' + escapeHtml(item.place_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '">';
            html += '<div class="result-info"><div>' + escapeHtml(item.place_name) + ' <span class="source">카카오맵</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address_name) + '</div></div></div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        
        container.querySelectorAll('.result-item').forEach(function(el) {
            el.addEventListener('click', function() {
                let name = this.dataset.name;
                let address = this.dataset.address;
                let lat = parseFloat(this.dataset.lat);
                let lng = parseFloat(this.dataset.lng);
                document.getElementById('modalPlaceAddr').value = address;
                if (!document.getElementById('modalPlaceName').value.trim()) {
                    document.getElementById('modalPlaceName').value = name;
                }
                container.style.display = 'none';
            });
        });
    }, 300);
}

// ============================================================
// 14. 내부 팝업 모달
// ============================================================
function showConfirmModal(title, message, onConfirm, onCancel) {
    let existing = document.getElementById('confirmModal');
    if (existing) existing.remove();
    
    window._tempConfirm = onConfirm || null;
    window._tempCancel = onCancel || null;
    
    let modalHtml = `
        <div id="confirmModal" style="
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            animation: fadeIn 0.2s ease;
        " onclick="if(event.target===this) { document.getElementById('confirmModal').remove(); if(window._tempCancel) window._tempCancel(); }">
            <div style="
                background: white;
                border-radius: 16px;
                padding: 24px;
                max-width: 360px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            " onclick="event.stopPropagation()">
                <h3 style="font-size:17px; font-weight:700; color:#1a202c; margin-bottom:8px;">${escapeHtml(title)}</h3>
                <p style="font-size:14px; color:#4a5568; margin-bottom:20px; line-height:1.6;">${escapeHtml(message)}</p>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button class="btn btn-outline btn-sm" onclick="
                        document.getElementById('confirmModal').remove();
                        if(window._tempCancel) window._tempCancel();
                    " style="padding:6px 16px; border:1px solid #cbd5e0; border-radius:8px; background:white; cursor:pointer;">취소</button>
                    <button class="btn btn-primary btn-sm" id="confirmModalOkBtn" style="padding:6px 16px; background:#4f7eb3; color:white; border:none; border-radius:8px; cursor:pointer;">확인</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.getElementById('confirmModalOkBtn').addEventListener('click', function() {
        document.getElementById('confirmModal').remove();
        if (window._tempConfirm) {
            window._tempConfirm();
        }
        window._tempConfirm = null;
        window._tempCancel = null;
    });
}

function showPromptModal(title, message, defaultValue, onConfirm, onCancel) {
    let existing = document.getElementById('promptModal');
    if (existing) existing.remove();
    
    let modalHtml = `
        <div id="promptModal" style="
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            animation: fadeIn 0.2s ease;
        " onclick="if(event.target===this) { if(typeof onCancel==='function') onCancel(); this.remove(); }">
            <div style="
                background: white;
                border-radius: 16px;
                padding: 24px;
                max-width: 380px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            " onclick="event.stopPropagation()">
                <h3 style="font-size:17px; font-weight:700; color:#1a202c; margin-bottom:4px;">${escapeHtml(title)}</h3>
                <p style="font-size:14px; color:#4a5568; margin-bottom:12px; line-height:1.6;">${escapeHtml(message)}</p>
                <input id="promptInput" type="text" value="${escapeHtml(defaultValue || '')}" 
                       style="width:100%; padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; font-size:14px; margin-bottom:16px;"
                       onkeydown="if(event.key==='Enter') document.getElementById('promptConfirmBtn').click();">
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button class="btn btn-outline btn-sm" onclick="document.getElementById('promptModal').remove(); if(typeof onCancel==='function') onCancel();" style="padding:6px 16px;">취소</button>
                    <button id="promptConfirmBtn" class="btn btn-primary btn-sm" onclick="
                        let input = document.getElementById('promptInput');
                        let value = input ? input.value.trim() : '';
                        document.getElementById('promptModal').remove();
                        if(typeof onConfirm==='function') onConfirm(value);
                    " style="padding:6px 16px;">확인</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    let input = document.getElementById('promptInput');
    if (input) {
        setTimeout(function() {
            input.focus();
            input.select();
        }, 100);
    }
}

// ============================================================
// 15. 현장 삭제/수정/초기화 등
// ============================================================
function deletePlace(id) {
    let target = places.find(function(p) { return p.id === id; });
    if (!target) return;
    
    showConfirmModal(
        '🗑️ 현장 삭제',
        '"' + target.name + '" 현장을 삭제하시겠습니까?',
        function() {
            places = places.filter(function(p) { return p.id !== id; });
            waypoints = waypoints.filter(function(w) { return w.name !== target.name; });
            renderWaypointList();
            if (singlePlaceMarker && singlePlaceMarker._placeId === id) clearSingleMarker();
            savePlaces();
            scheduleAutoSync();
            showTabStatus('tab-list', '✅ 삭제 완료', 'ok');
        }
    );
}

function resetRoute() {
    showConfirmModal(
        '🔄 경로 초기화',
        '출발지, 경유지, 최적화 결과를 모두 초기화하시겠습니까?',
        function() {
            startPoint = null;
            document.getElementById('startPoint').value = '';
            document.getElementById('startInfo').textContent = '⏳ 출발지를 검색하거나 현재 위치 버튼을 눌러 설정하세요';
            document.getElementById('startInfo').style.color = '#718096';
            waypoints = [];
            renderWaypointList();
            document.getElementById('waypointInput').value = '';
            routeResult = null;
            document.getElementById('placeCount').textContent = '0개소';
            document.getElementById('totalDistance').textContent = '0.00 km';
            document.getElementById('totalTime').textContent = '0 분';
            document.getElementById('optimizeMode').textContent = '-';
            document.getElementById('routeList').innerHTML = '';
            document.getElementById('savedRow').style.display = 'none';
            clearRouteMarkers();
            clearSingleMarker();
            isShowingRouteMarkers = false;
            if (kakaoMap && currentRegion) {
                let center = getRegionCenter(currentRegion);
                kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
                kakaoMap.setLevel(5);
                kakaoMap.relayout();
            }
            showTabStatus('tab-places', '🔄 모든 경로 데이터가 초기화되었습니다.', 'ok');
        }
    );
}

function resetAll() {
    showConfirmModal(
        '⚠️ 모든 데이터 초기화',
        '모든 데이터를 초기화하시겠습니까?\n(현장리스트, 경로, 설정 모두 삭제됩니다)',
        function() {
            let keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                if (key && (key.startsWith(STORAGE_KEY_PREFIX) || key === SETTINGS_KEY || key === SELECTED_REGION_KEY || key === OPTIMIZE_MODE_KEY || key === PRESETS_KEY || key === ROUTE_API_KEY)) {
                    keys.push(key);
                }
            }
            for (let i = 0; i < keys.length; i++) localStorage.removeItem(keys[i]);
            places = [];
            waypoints = [];
            routeResult = null;
            startPoint = null;
            presets = [];
            renderPlaces();
            renderWaypointList();
            renderPresets();
            clearRouteMarkers();
            clearSingleMarker();
            document.getElementById('placeCount').textContent = '0개소';
            document.getElementById('totalDistance').textContent = '0.00 km';
            document.getElementById('totalTime').textContent = '0 분';
            document.getElementById('optimizeMode').textContent = '-';
            document.getElementById('routeList').innerHTML = '';
            document.getElementById('savedRow').style.display = 'none';
            document.getElementById('startInfo').textContent = '⏳ 출발지를 검색하거나 현재 위치 버튼을 눌러 설정하세요';
            updateStorageInfo();
            showTabStatus('tab-settings', '✅ 초기화 완료', 'ok');
            loadRegionList();
        }
    );
}

function toggleFavorite(id) {
    let place = places.find(function(p) { return p.id === id; });
    if (!place) return;
    place.favorite = !place.favorite;
    savePlaces();
    scheduleAutoSync();
    renderPlaces();
    showTabStatus('tab-list', place.favorite ? '⭐ 즐겨찾기 추가됨' : '⭐ 즐겨찾기 해제됨', 'info');
}

function openEditModal(id) {
    let place = places.find(function(p) { return p.id === id; });
    if (!place) return;
    document.getElementById('modalTitle').textContent = '✏️ 현장 편집';
    document.getElementById('modalName').value = place.name;
    document.getElementById('modalAddress').value = place.address || '';
    document.getElementById('modalRemark').value = place.remark || '';
    if (document.getElementById('modalDong')) document.getElementById('modalDong').value = place.dong || '';
    document.getElementById('modalId').value = id;
    showModalEditError(null);
    document.getElementById('modal').classList.add('active');
}

function showModalEditError(msg) {
    let errorEl = document.getElementById('modalEditError');
    if (!errorEl) return;
    if (msg) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    } else {
        errorEl.style.display = 'none';
    }
}

async function saveModal() {
    let id = document.getElementById('modalId').value;
    let name = document.getElementById('modalName').value.trim();
    let address = document.getElementById('modalAddress').value.trim();
    let lat = parseFloat(document.getElementById('modalLat').value);
    let lng = parseFloat(document.getElementById('modalLng').value);
    let remark = document.getElementById('modalRemark').value.trim();

    let place = places.find(function(p) { return p.id === id; });
    if (!place) { closeModal(); return; }

    if (!name) {
        showModalEditError('⚠️ 현장명을 입력하세요.');
        document.getElementById('modalName').focus();
        return;
    }

    if (!address && (isNaN(lat) || isNaN(lng))) {
        showModalEditError('⚠️ 주소 또는 위도/경도를 입력하세요.');
        document.getElementById('modalAddress').focus();
        return;
    }

    if (!isNaN(lat) && !isNaN(lng)) {
        if (lat < 33 || lat > 43 || lng < 124 || lng > 132) {
            showModalEditError('⚠️ 대한민국 범위를 벗어났습니다.\n위도: 33~43, 경도: 124~132');
            return;
        }
    }

    let existing = places.find(function(p) {
        return p.id !== id && normalizeName(p.name) === normalizeName(name);
    });
    if (existing) {
        showModalEditError('⚠️ 이미 존재하는 현장명입니다.');
        document.getElementById('modalName').focus();
        return;
    }

    let fullAddress = address;
    let finalLat = lat;
    let finalLng = lng;

    if (address && (isNaN(lat) || isNaN(lng))) {
        let restKey = settings.kakaoRestKey || 'server-proxy'; // 서버가 실제 키 보유, 클라이언트는 게이트 통과용
        if (restKey) {
            let geo = await geocodeAddress(address, restKey);
            if (geo) {
                finalLat = geo.lat;
                finalLng = geo.lng;
                fullAddress = geo.address || address;
            } else {
                showModalEditError('⚠️ 주소 변환 실패. 위도/경도를 직접 입력하세요.');
                return;
            }
        } else {
            showModalEditError('⚠️ 카카오 REST API 키가 없습니다. 위도/경도를 직접 입력하세요.');
            return;
        }
    }

   place.name = name;
   place.address = fullAddress;
   place.lat = finalLat;
   place.lng = finalLng;
   place.remark = remark;

// 동 처리: 사용자 입력 우선, 비어있으면 자동 변환
let manualDong = document.getElementById('modalDong') ? document.getElementById('modalDong').value.trim() : '';
if (manualDong) {
    place.dong = manualDong;
} else if (finalLat && finalLng) {
    let autoDong = await extractDongFromCoords(finalLat, finalLng);
    place.dong = (autoDong && autoDong !== '기타') ? autoDong : (place.dong || '');
}

savePlaces();
scheduleAutoSync();
closeModal();
renderPlaces();
let dongMsg = place.dong ? ' (' + place.dong + ')' : '';
showTabStatus('tab-list', '✅ "' + name + '" 수정 완료' + dongMsg, 'ok');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
    document.getElementById('modalName').value = '';
    document.getElementById('modalAddress').value = '';
    document.getElementById('modalLat').value = '';
    document.getElementById('modalLng').value = '';
    document.getElementById('modalRemark').value = '';
    if (document.getElementById('modalDong')) document.getElementById('modalDong').value = '';
    document.getElementById('modalId').value = '';
    showModalEditError(null);
}

function addWaypointFromList(id) {
    let place = places.find(function(p) { return p.id === id; });
    if (!place) return;
    if (waypoints.length >= 15) {
        showTabStatus('tab-list', '⚠️ 최대 15개까지 가능', 'warning');
        return;
    }
    if (waypoints.some(function(w) { return w.name === place.name; })) {
        showTabStatus('tab-list', '⚠️ "' + place.name + '"은(는) 이미 경유지에 있습니다.', 'warning');
        return;
    }
    waypoints.push({ name: place.name, lat: place.lat || 0, lng: place.lng || 0, address: place.address || '' });
    renderWaypointList();
    showTabStatus('tab-list', '✅ "' + place.name + '" 경유지 추가됨!', 'ok');
}

// ============================================================
// 16. 지오코딩
// ============================================================
async function geocodeAddress(address, restKey, retries) {
    // restKey는 더 이상 사용하지 않음 - 실제 카카오 REST 키는 노트북 서버(config.json)가 보관하고
    // 이 함수는 서버의 /api/geocode 프록시를 호출한다. (인자는 기존 호출부와의 호환을 위해 유지)
    retries = retries || 1;
    if (!address) return null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            let geo = await serverGet('/api/geocode?address=' + encodeURIComponent(address));
            return geo || null;
        } catch(e) {
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500));
                continue;
            }
            return null;
        }
    }
    return null;
}

async function geocodeBatch(rows, restKey, batchSize, onProgress) {
    batchSize = batchSize || 5;
    let results = [];
    for (let i = 0; i < rows.length; i += batchSize) {
        let batch = rows.slice(i, i + batchSize);
        let batchResults = await Promise.all(batch.map(function(row) {
            return geocodeAddress(row.address, restKey, 1).then(function(geo) {
                row.geo = geo;
                return geo;
            });
        }));
        results = results.concat(batchResults);
        if (onProgress) onProgress(i + batch.length, rows.length);
    }
    return results;
}

// ============================================================
// 17. 경로 최적화
// ============================================================
function getOptimizationScore(cost) {
    if (routeObjective === 'time') {
        return cost.durationMin;
    }

    if (routeObjective === 'balanced') {
        let refDistance = 30;
        let refTime = 60;
        let distanceScore = cost.distanceKm / Math.max(1, refDistance);
        let timeScore = cost.durationMin / Math.max(1, refTime);
        return distanceScore * 0.5 + timeScore * 0.5;
    }

    return cost.distanceKm;
}

function setRouteObjective(objective) {
    routeObjective = objective || 'distance';
    updateOptimizationLiveSummary();
}

function setRoadOptimization(enabled) {
    useRoadOptimization = !!enabled;
    updateOptimizationLiveSummary();
}

function setDirectionHint(enabled) {
    useDirectionHint = !!enabled;
    updateOptimizationLiveSummary();
}

function setOptimizeMode(mode) {
    if (mode !== 'Nearest' && mode !== 'Farthest') {
        mode = 'Nearest';
    }
    optimizeMode = mode;
    localStorage.setItem(OPTIMIZE_MODE_KEY, mode);
    updateOptimizationLiveSummary();
}

function calculateAngle(startX, startY, targetX, targetY) {
    let dx = targetX - startX, dy = targetY - startY;
    if (dx === 0 && dy === 0) return 0;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return angle;
}

function getClusterGroup16(angle) {
    let group = Math.floor(((angle + 11.25) % 360) / 22.5) + 1;
    return group > 16 ? 16 : group;
}

// ===== 도로 기반 경로 최적화 =====
let roadMetricCache = new Map();
let ROAD_CANDIDATE_COUNT = 3;
let ROAD_OPTIMIZE_MAX_CALLS = 80;
let roadOptimizeCallCount = 0;
let roadCallSuccessCount = 0;
let roadCallFallbackCount = 0;

function roadMetricKey(from, to) {
    return [
        Number(from.lat).toFixed(6), Number(from.lng).toFixed(6),
        Number(to.lat).toFixed(6), Number(to.lng).toFixed(6)
    ].join(',');
}

function getStraightDistance(a, b) {
    return haversineKm(a.lat, a.lng, b.lat, b.lng);
}

async function getRoadMetric(from, to, restKey) {
    let key = roadMetricKey(from, to);
    if (roadMetricCache.has(key)) return roadMetricCache.get(key);

    let fallback = {
        distanceKm: getStraightDistance(from, to),
        durationMin: Math.max(1, Math.round(getStraightDistance(from, to) / 40 * 60)),
        source: 'straight'
    };

    if (!useRoadOptimization) {
        roadMetricCache.set(key, fallback);
        roadCallFallbackCount++;
        return fallback;
    }

    if (!restKey || roadOptimizeCallCount >= ROAD_OPTIMIZE_MAX_CALLS) {
        roadMetricCache.set(key, fallback);
        roadCallFallbackCount++;
        return fallback;
    }

    roadOptimizeCallCount++;
    try {
        // 카카오모빌리티 direct 호출 대신 노트북 서버의 /api/route/directions 프록시 경유
        let query = '?originLat=' + Number(from.lat) + '&originLng=' + Number(from.lng)
            + '&destLat=' + Number(to.lat) + '&destLng=' + Number(to.lng);
        let data = await serverGet('/api/route/directions' + query);

        let route = data && data.routes && data.routes[0];
        if (!route || !route.summary) throw new Error('도로 경로 없음');

        let metric = {
            distanceKm: Number(route.summary.distance || 0) / 1000,
            durationMin: Math.max(1, Math.round(Number(route.summary.duration || 0) / 60)),
            source: 'road'
        };
        roadMetricCache.set(key, metric);
        roadCallSuccessCount++;
        return metric;
    } catch (e) {
        roadMetricCache.set(key, fallback);
        roadCallFallbackCount++;
        return fallback;
    }
}

function rankByStraightDistance(current, candidates) {
    return candidates.slice().sort(function(a, b) {
        return getStraightDistance(current, a) - getStraightDistance(current, b);
    });
}

async function chooseNextRoadPoint(current, candidates, restKey, mode) {
    if (!candidates.length) return null;
    let shortlist = rankByStraightDistance(current, candidates).slice(0, ROAD_CANDIDATE_COUNT);
    let best = null;
    let bestScore = mode === 'Farthest' ? -Infinity : Infinity;

    for (let i = 0; i < shortlist.length; i++) {
        let metric = await getRoadMetric(current, shortlist[i], restKey);
        let score = metric.distanceKm;
        if ((mode === 'Nearest' && score < bestScore) ||
            (mode === 'Farthest' && score > bestScore)) {
            bestScore = score;
            best = shortlist[i];
            best._lastRoadMetric = metric;
        }
    }
    return best || shortlist[0];
}

function buildGeometricSeed(places, startPoint, mode) {
    let remaining = places.slice();
    let result = [];
    let current = startPoint;

    if (useDirectionHint) {
        if (mode === 'Farthest') {
            remaining.sort(function(a, b) {
                let ga = getClusterGroup16(calculateAngle(startPoint.lng, startPoint.lat, a.lng, a.lat));
                let gb = getClusterGroup16(calculateAngle(startPoint.lng, startPoint.lat, b.lng, b.lat));
                return gb - ga;
            });
        } else {
            remaining.sort(function(a, b) {
                let ga = getClusterGroup16(calculateAngle(startPoint.lng, startPoint.lat, a.lng, a.lat));
                let gb = getClusterGroup16(calculateAngle(startPoint.lng, startPoint.lat, b.lng, b.lat));
                return ga - gb;
            });
        }
    } else {
        if (mode === 'Farthest') {
            remaining.sort(function(a, b) {
                return getStraightDistance(startPoint, b) - getStraightDistance(startPoint, a);
            });
        } else {
            remaining.sort(function(a, b) {
                return getStraightDistance(startPoint, a) - getStraightDistance(startPoint, b);
            });
        }
    }

    while (remaining.length) {
        let bestIndex = 0;
        let bestDist = mode === 'Farthest' ? -Infinity : Infinity;
        for (let i = 0; i < remaining.length; i++) {
            let d = getStraightDistance(current, remaining[i]);
            if ((mode === 'Nearest' && d < bestDist) || (mode === 'Farthest' && d > bestDist)) {
                bestDist = d;
                bestIndex = i;
            }
        }
        let next = remaining.splice(bestIndex, 1)[0];
        result.push(next);
        current = next;
    }
    return result;
}

async function buildRoadGreedySeed(places, startPoint, restKey, mode) {
    let remaining = places.slice();
    let result = [];
    let current = startPoint;

    let first = await chooseNextRoadPoint(current, remaining, restKey, mode);
    if (first) {
        result.push(first);
        remaining.splice(remaining.indexOf(first), 1);
        current = first;
    }

    while (remaining.length) {
        let next = await chooseNextRoadPoint(current, remaining, restKey, 'Nearest');
        if (!next) break;
        result.push(next);
        remaining.splice(remaining.indexOf(next), 1);
        current = next;
    }
    return result;
}

async function routeCost(route, startPoint, restKey) {
    let current = startPoint;
    let distanceKm = 0;
    let durationMin = 0;
    for (let i = 0; i < route.length; i++) {
        let metric = await getRoadMetric(current, route[i], restKey);
        distanceKm += metric.distanceKm;
        durationMin += metric.durationMin;
        current = route[i];
    }
    return { distanceKm: distanceKm, durationMin: durationMin };
}

async function twoOptRoad(route, startPoint, restKey, mode) {
    if (typeof mode === 'undefined' || mode === null) {
        mode = 'Distance';
    }
    if (route.length < 4) return route;
    let improved = true;
    let pass = 0;
    let maxPass = 3;

    while (improved && pass < maxPass && roadOptimizeCallCount < ROAD_OPTIMIZE_MAX_CALLS) {
        improved = false;
        pass++;
        let currentCost = await routeCost(route, startPoint, restKey);

        for (let i = 0; i < route.length - 2; i++) {
            for (let j = i + 1; j < route.length - 1; j++) {
                if (roadOptimizeCallCount >= ROAD_OPTIMIZE_MAX_CALLS) break;
                let candidate = route.slice(0, i + 1)
                    .concat(route.slice(i + 1, j + 1).reverse())
                    .concat(route.slice(j + 1));
                let candidateCost = await routeCost(candidate, startPoint, restKey);

                let currentScore = getOptimizationScore(currentCost);
                let candidateScore = getOptimizationScore(candidateCost);
                if (candidateScore + 0.001 < currentScore) {
                    route = candidate;
                    currentCost = candidateCost;
                    improved = true;
                    break;
                }
            }
            if (improved) break;
        }
    }
    return route;
}

// 15개 이상 경유지에서는 기존 Greedy/2-opt에 더해 SA 후보를 만든다.
// 도로 API를 반복 호출하지 않고 기하학적 비용으로 후보만 생성한 뒤 기존 도로
// 최적화 단계가 검증하므로, 기존 결과보다 나쁜 경로를 채택하지 않는다.
function simulatedAnnealingSeed(route, startPoint) {
    if (!Array.isArray(route) || route.length < 15) return route ? route.slice() : [];

    function geometricCost(candidate) {
        let current = startPoint;
        let cost = 0;
        for (let i = 0; i < candidate.length; i++) {
            cost += haversineKm(current.lat, current.lng, candidate[i].lat, candidate[i].lng);
            current = candidate[i];
        }
        return cost;
    }

    let current = route.slice();
    let currentCost = geometricCost(current);
    let best = current.slice();
    let bestCost = currentCost;
    let temperature = Math.max(1, currentCost * 0.08);
    const iterations = Math.min(900, Math.max(180, current.length * 36));

    for (let step = 0; step < iterations; step++) {
        const left = Math.floor(Math.random() * (current.length - 1));
        const right = left + 1 + Math.floor(Math.random() * (current.length - left - 1));
        const candidate = current.slice(0, left)
            .concat(current.slice(left, right + 1).reverse())
            .concat(current.slice(right + 1));
        const candidateCost = geometricCost(candidate);
        const delta = candidateCost - currentCost;

        if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
            current = candidate;
            currentCost = candidateCost;
            if (currentCost < bestCost) {
                best = current.slice();
                bestCost = currentCost;
            }
        }
        temperature *= 0.985;
    }

    return best;
}

async function optimizeRouteAlgorithm(places, startLat, startLng, mode, restKey) {
    if (!places || places.length === 0) return [];
    if (places.length === 1) return places.slice();

    roadOptimizeCallCount = 0;
    roadCallSuccessCount = 0;
    roadCallFallbackCount = 0;
    roadMetricCache.clear();

    let start = { name: '출발지', lat: startLat, lng: startLng };

    let seeds = [];
    let geometric = buildGeometricSeed(places, start, mode);
    seeds.push(geometric);

    let roadGreedy = await buildRoadGreedySeed(places, start, restKey, mode);
    if (roadGreedy.length === places.length) seeds.push(roadGreedy);

    let clustered = places.slice().sort(function(a, b) {
        let ga = getClusterGroup16(calculateAngle(startLng, startLat, a.lng, a.lat));
        let gb = getClusterGroup16(calculateAngle(startLng, startLat, b.lng, b.lat));
        return ga - gb;
    });
    if (mode === 'Farthest') clustered.reverse();
    seeds.push(clustered);

    if (places.length >= 15) {
        seeds.push(simulatedAnnealingSeed(geometric, start));
    }

    let bestRoute = seeds[0];
    let bestCost = await routeCost(bestRoute, start, restKey);
    let bestScore = getOptimizationScore(bestCost);

    for (let s = 0; s < seeds.length; s++) {
        if (roadOptimizeCallCount >= ROAD_OPTIMIZE_MAX_CALLS) break;
        let objective = (typeof routeObjective !== 'undefined' && routeObjective === 'time') ? 'Time' : 'Distance';
        let candidate = await twoOptRoad(seeds[s].slice(), start, restKey, objective);
        let cost = await routeCost(candidate, start, restKey);
        let candidateScore = getOptimizationScore(cost);
        if (candidateScore + 0.001 < bestScore) {
            bestScore = candidateScore;
            bestCost = cost;
            bestRoute = candidate;
        }
    }

    bestRoute._optimizationMeta = {
        roadCalls: roadOptimizeCallCount,
        roadSuccess: roadCallSuccessCount,
        roadFallback: roadCallFallbackCount,
        distanceKm: bestCost.distanceKm,
        durationMin: bestCost.durationMin,
        method: places.length >= 15
            ? '도로거리 기반 Greedy + Multi-start + SA + 2-opt'
            : '도로거리 기반 Greedy + Multi-start + 2-opt'
    };
    return bestRoute;
}

async function runOptimize() {
    let btn = document.getElementById('runOptimizeBtn');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;
    
    try {
        if (!startPoint || !startPoint.lat) {
            showTabStatus('tab-places', '🚩 출발지를 설정하세요!', 'warning');
            document.getElementById('startPoint').focus();
            return;
        }
        if (waypoints.length === 0) {
            showTabStatus('tab-places', '📍 경유지를 추가하세요!', 'warning');
            return;
        }
        
        let restKey = settings.kakaoRestKey || 'server-proxy'; // 서버가 실제 키 보유, 클라이언트는 게이트 통과용
        if (!restKey) {
            showTabStatus('tab-places', '⚠️ REST API 키 필요 (설정 탭)', 'warning');
            return;
        }
        
        showTabStatus('tab-places', '📍 주소 변환 중...', 'info');
        
        let wpCoords = [];
        let hasError = false;
        
        for (let i = 0; i < waypoints.length; i++) {
            let wp = waypoints[i];
            let lat = wp.lat || 0;
            let lng = wp.lng || 0;
            let address = wp.address || '';
            
            if (!lat || !lng) {
                let found = places.find(function(p) { return p.name === wp.name; });
                if (found && found.lat && found.lng) {
                    lat = found.lat;
                    lng = found.lng;
                    address = found.address || '';
                } else {
                    let geo = await geocodeAddress(wp.name, restKey, 1);
                    if (geo) {
                        lat = geo.lat;
                        lng = geo.lng;
                        address = geo.address || wp.name;
                        let place = places.find(function(p) { return p.name === wp.name; });
                        if (place) {
                            place.lat = lat;
                            place.lng = lng;
                            place.address = address;
                        }
                    } else {
                        showTabStatus('tab-places', '❌ "' + wp.name + '" 변환 실패', 'error');
                        hasError = true;
                        break;
                    }
                }
            }
            wpCoords.push({
                name: wp.name,
                lat: lat,
                lng: lng,
                address: address,
                remark: wp.remark || ''
            });
        }
        
        if (hasError) {
            savePlaces();
            return;
        }
        
        let validPlaces = wpCoords.filter(function(p) { return p.lat && p.lng; });
        if (validPlaces.length === 0) {
            showTabStatus('tab-places', '좌표가 있는 경유지가 없습니다.', 'error');
            return;
        }
        
        originalRouteCost = await routeCost(validPlaces.slice(), startPoint, restKey);
        
        showTabStatus('tab-places', '🛣️ 실제 도로거리 기반 최적화 계산 중...', 'info');
        let sorted = await optimizeRouteAlgorithm(validPlaces, startPoint.lat, startPoint.lng, optimizeMode, restKey);
        
        if (!sorted || sorted.length === 0) {
            showTabStatus('tab-places', '⚠️ 최적화 실패', 'error');
            return;
        }
        
        let allPoints = [{
            name: startPoint.name,
            lat: startPoint.lat,
            lng: startPoint.lng,
            address: startPoint.address || ''
        }].concat(sorted);
        
        let routeData = await callKakaoMobilityRoute(allPoints, restKey);
        // 첫 실행에서도 지도 객체가 준비된 뒤에만 경로·마커를 그린다.
        await ensureRouteMapReady(12000);
        renderOptimizedRouteMapView(allPoints, routeData);

        if (!routeData) {
            showTabStatus('tab-route', '⚠️ 도로 경로를 불러올 수 없어 직선으로 표시합니다.', 'warning');
        }
        
        let totalKm = 0;
        let totalMin = 0;
        let sectionDistances = [];
        let sectionTimes = [];
        
        if (routeData && routeData.routes && routeData.routes[0] && routeData.routes[0].sections) {
            let route = routeData.routes[0];
            
            if (route.summary) {
                totalKm = route.summary.distance / 1000;
                totalMin = Math.round(route.summary.duration / 60);
            }
            
            for (let i = 0; i < route.sections.length; i++) {
                let section = route.sections[i];
                let distKm = section.distance / 1000;
                let timeMin = Math.round(section.duration / 60);
                sectionDistances.push(distKm);
                sectionTimes.push(timeMin);
            }
            
            while (sectionDistances.length < sorted.length) {
                let idx = sectionDistances.length;
                let prev = idx === 0 ? startPoint : sorted[idx - 1];
                let curr = sorted[idx];
                if (prev && curr) {
                    let dist = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
                    sectionDistances.push(dist);
                    sectionTimes.push(Math.round(dist / 40 * 60));
                } else {
                    sectionDistances.push(0);
                    sectionTimes.push(0);
                }
            }
        } else {
            for (let i = 0; i < allPoints.length - 1; i++) {
                let p1 = allPoints[i];
                let p2 = allPoints[i + 1];
                let dist = haversineKm(p1.lat, p1.lng, p2.lat, p2.lng);
                totalKm += dist;
                sectionDistances.push(dist);
                sectionTimes.push(Math.round(dist / 40 * 60));
            }
            totalMin = Math.round(totalKm / 40 * 60);
        }
        
        totalKm = parseFloat(totalKm.toFixed(2));
        totalMin = Math.round(totalMin);
        
        for (let i = 0; i < sorted.length; i++) {
            let dist = sectionDistances[i] || 0;
            let time = sectionTimes[i] || 0;
            sorted[i]._segDist = parseFloat(dist.toFixed(2));
            sorted[i]._segTime = Math.round(time);
        }
        
        routeResult = {
            places: sorted,
            startPoint: startPoint,
            totalKm: totalKm,
            totalMin: totalMin,
            mode: optimizeMode
        };
        
        document.getElementById('placeCount').textContent = validPlaces.length + '개소';
        document.getElementById('totalDistance').textContent = totalKm + ' km';
        document.getElementById('totalTime').textContent = totalMin + ' 분';
        document.getElementById('optimizeMode').textContent = optimizeMode === 'Nearest' ? '가까운순' : '먼순';
        
        if (originalRouteCost) {
            let savedKm = parseFloat((originalRouteCost.distanceKm - totalKm).toFixed(2));
            let savedMin = Math.round(originalRouteCost.durationMin - totalMin);
            let savedRow = document.getElementById('savedRow');
            let savedEl = document.getElementById('savedAmount');
            if (savedRow && savedEl) {
                if (savedKm > 0.1 || savedMin > 0) {
                    savedRow.style.display = 'flex';
                    let parts = [];
                    if (savedKm > 0.1) parts.push('-' + savedKm + 'km');
                    if (savedMin > 0) parts.push('-' + savedMin + '분');
                    savedEl.textContent = parts.join(' ') + ' 절약 ✨';
                    savedEl.style.color = '#38a169';
                } else {
                    savedRow.style.display = 'none';
                }
            }
        }
        
        showRouteList();
        
        let meta = sorted._optimizationMeta || {};
        let roadMsg = '';
        if (meta.roadSuccess !== undefined && meta.roadFallback !== undefined) {
            let totalRoadCalls = meta.roadSuccess + meta.roadFallback;
            if (totalRoadCalls > 0) {
                let roadPercent = Math.round((meta.roadSuccess / totalRoadCalls) * 100);
                if (roadPercent === 100) {
                    roadMsg = '🛣️ 모든 구간 실제 도로 정보 사용 (' + totalRoadCalls + '구간)';
                } else if (roadPercent >= 50) {
                    roadMsg = '🛣️ ' + roadPercent + '% 도로 정보 사용 (' + meta.roadSuccess + '/' + totalRoadCalls + '구간)';
                } else {
                    roadMsg = '⚠️ 일부 구간은 도로정보 대신 직선거리로 보완했습니다. (' + meta.roadFallback + '/' + totalRoadCalls + '구간)';
                }
            }
        }
        
        if (meta.roadCalls >= ROAD_OPTIMIZE_MAX_CALLS) {
            roadMsg += ' ⚠️ API 호출 제한 도달';
            showTabStatus('tab-route', '⚠️ 도로 API 호출 제한에 도달했습니다. 일부 구간은 직선거리로 계산됨.', 'warning');
        }
        
        let modeText = optimizeMode === 'Nearest' ? '가까운순' : '먼순';
        let objectiveText = routeObjective === 'time' ? '최소시간' 
            : routeObjective === 'balanced' ? '거리+시간 균형' 
            : '최단거리';
        let resultMsg = '✅ 최적화 완료! ' + validPlaces.length + '개소 · ' + totalKm + 'km · ' + totalMin + '분';
        if (roadMsg) resultMsg += ' · ' + roadMsg;
        showTabStatus('tab-route', resultMsg, 'ok');
        
        updateOptimizationLiveSummary();
        
        stabilizeRouteStartCenter(startPoint.lat, startPoint.lng);
    } catch(e) {
        showTabStatus('tab-places', '❌ 오류 발생: ' + e.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// 18. 경로 표시
// ============================================================
function showRouteList() {
    if (!routeResult) return;
    let container = document.getElementById('routeList');
    let { places: sorted, startPoint, totalKm, totalMin } = routeResult;
    if (!sorted || sorted.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#a0aec0;">최적화된 경로가 없습니다.</div>';
        return;
    }

    // ===== 1. 경로 목록 HTML 생성 =====
    let html = '<div style="font-weight:600;font-size:14px;margin-bottom:8px;">📋 최적 경로</div>';
    html += '<div id="routeSortable">';

    // 출발지
    html += '<div class="route-item route-start" data-no-drag="true" data-lat="' + startPoint.lat + '" data-lng="' + startPoint.lng + '" data-name="' + escapeHtml(startPoint.name) + '" style="cursor:pointer;" onclick="moveToRoutePoint(this)">';
    html += '<div class="idx" style="background:#4a5568;color:white;">🚩</div>';
    html += '<div class="info"><div class="name">' + escapeHtml(startPoint.name) + '</div><div class="addr">' + escapeHtml(startPoint.address || '') + '</div></div>';
    html += '</div>';

    // 경유지
    let colors = ['#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB', '#0ABDE3', '#10AC84', '#EE5A24', '#5F27CD', '#1DD1A1', '#F368E0', '#00D2D3', '#54A0FF', '#FF9FF3', '#F368E0'];
    for (let i = 0; i < sorted.length; i++) {
        let p = sorted[i];
        let prev = i === 0 ? startPoint : sorted[i - 1];
        let segDist = p._segDist || haversineKm(prev.lat, prev.lng, p.lat, p.lng);
        let segTime = p._segTime || Math.round(segDist / 40 * 60);
        let color = colors[i % colors.length];
        let addrDisplay = p.address ? '<div class="addr">' + escapeHtml(shortenAddress(p.address)) + '</div>' : '';
        let remarkDisplay = p.remark ? '<span class="remark">' + escapeHtml(p.remark) + '</span>' : '';
        html += '<div class="route-item sortable-item" data-index="' + i + '" data-lat="' + p.lat + '" data-lng="' + p.lng + '" data-name="' + escapeHtml(p.name) + '" style="border-left-color:' + color + ';cursor:pointer;" onclick="if(!event.target.closest(\'.kakao-route-btn\') && !event.target.closest(\'.drag-handle\')) moveToRoutePoint(this)">';
        html += '<div class="idx" style="background:' + color + ';color:white;">' + (i + 1) + '</div>';
        html += '<div class="info"><div class="name">' + escapeHtml(p.name) + ' ' + remarkDisplay + '</div>' + addrDisplay + '</div>';
        html += '<div class="dist" style="text-align:right;font-size:12px;font-weight:600;flex-shrink:0;min-width:80px;color:' + color + ';">' + segDist.toFixed(1) + 'km<br><span style="font-size:10px;color:#718096;">' + segTime + '분</span></div>';
        html += '<button class="btn btn-outline kakao-route-btn" style="margin-left:4px;padding:4px 8px;font-size:12px;flex-shrink:0;min-height:32px;border-radius:4px;position:relative;z-index:10;" onclick="openKakaoMapFromRoute(this)" title="길찾기" data-from-name="' + escapeHtml(prev.name) + '" data-from-lat="' + prev.lat + '" data-from-lng="' + prev.lng + '" data-to-name="' + escapeHtml(p.name) + '" data-to-lat="' + p.lat + '" data-to-lng="' + p.lng + '">🗺️</button>';
        html += '<span class="drag-handle" style="color:#a0aec0;font-size:20px;cursor:grab;padding:4px 6px;user-select:none;margin-left:2px;" title="드래그하여 순서 변경">⠿</span>';
        html += '</div>';
    }
    html += '</div>';

    // ===== 2. 전체 경유지 연결 버튼 + 통계 기록 버튼 (나란히 배치) =====
const totalPoints = sorted.length + 1;
const isKakao = routeApi === 'kakao';
const appLimit = isKakao ? 6 : 12;
const waypointLimit = isKakao ? 5 : 10;
const appName = isKakao ? '카카오맵' : 'TMap';
const isOverLimit = totalPoints > appLimit;
const displayCount = Math.min(totalPoints, appLimit);

html += '<div style="margin-top:12px; padding-top:12px; border-top: 1px solid #e2e8f0;">';

// ★ 버튼 2개를 나란히 배치
html += '<div style="display:flex; gap:8px; margin-bottom:8px;">';

// 왼쪽: 전체 경유지 연결 버튼
if (routeApi === 'tmap') {
// ★ TMap: 전체 연결 버튼 숨김 + 안내 문구
html += '<div style="flex:1; padding:10px; font-size:12px; color:#a0aec0; background:#f7fafc; border-radius:8px; text-align:center;">';
html += 'ℹ️ TMap은 경유지 기능을 지원하지 않습니다<br><span style="font-size:11px;">각 구간별 🚗 버튼으로 이동하세요</span>';
html += '</div>';
} else {
// 카카오맵: 기존 전체 연결 버튼
html += '<button id="nav-all-waypoints-btn" class="btn" style="flex:1; padding:10px; font-size:14px; font-weight:600; background:#fee500; color:#333; border: none; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">';
html += '🗺️ 전체 경로 연결';
html += '</button>';
}

// 오른쪽: 통계 기록 버튼 (배경색 있음)
html += '<button id="stats-record-btn" class="btn" style="flex:1; padding:10px; font-size:14px; font-weight:600; background:#38a169; color:white; border:none; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="recordVisitStats()">';
html += '📝방문 현장 기록';
html += '</button>';

html += '</div>';

// API별 제한 안내
if (isOverLimit) {
    html += '<div style="font-size:0.7rem; color:#e53e3e; text-align:center; margin-top:4px;">⚠️ ' + appName + ' 제한: 총 ' + appLimit + '개 지점까지만 전달됩니다';
    if (isKakao) html += '<br>(경유지 ' + waypointLimit + '개 초과 시 초과분은 잘려서 전달됩니다)';
    html += '</div>';
} else {
    html += '<div style="font-size:0.7rem; color:#718096; text-align:center; margin-top:4px;">✅ ' + totalPoints + '개 지점 모두 연결 (' + appName + ' 지원 범위 내)</div>';
}

// ★ 통계 기록 안내 문구
html += '<div style="font-size:0.65rem; color:#a0aec0; text-align:center; margin-top:6px; padding:6px; background:#f7fafc; border-radius:4px; border:1px dashed #cbd5e0;">';
html += '💡 <strong>통계 기록</strong> 버튼을 눌러야 방문 기록이 저장됩니다';
html += '</div>';

html += '</div>';

    // ===== 3. HTML을 DOM에 한 번만 삽입 =====
    container.innerHTML = html;

    // ===== 4. 전체 연결 버튼 이벤트 =====
    const navBtn = document.getElementById('nav-all-waypoints-btn');
    if (navBtn) {
        navBtn.addEventListener('click', function() {
            openMultiStopNavigation();
        });
    }

    // ===== 5. SortableJS 초기화 (한 번만!) =====
    let sortableEl = document.getElementById('routeSortable');
    if (sortableEl && window.Sortable) {
        if (window._routeSortable) window._routeSortable.destroy();
        window._routeSortable = new Sortable(sortableEl, {
            handle: '.drag-handle',
            animation: 150,
            onMove: function(evt) {
                if (evt.toIndex === 0) {
                    showTabStatus('tab-route', '⚠️ 출발지 위치로는 이동할 수 없습니다.', 'warning');
                    return false;
                }
                return true;
            },
            onEnd: function(evt) {
                let oldIndex = evt.oldIndex - 1;
                let newIndex = evt.newIndex - 1;
                if (oldIndex === newIndex || oldIndex < 0 || newIndex < 0) return;
                let moved = routeResult.places.splice(oldIndex, 1)[0];
                routeResult.places.splice(newIndex, 0, moved);
                showRouteList();
                let allPoints = [{ name: startPoint.name, lat: startPoint.lat, lng: startPoint.lng }].concat(routeResult.places);
                clearRouteMarkers();
                addRouteMarker(startPoint.lat, startPoint.lng, startPoint.name, true, -1);
                for (let i = 0; i < routeResult.places.length; i++) {
                    let p = routeResult.places[i];
                    addRouteMarker(p.lat, p.lng, (i + 1) + '. ' + p.name, false, i);
                }
                let restKey = settings.kakaoRestKey || 'server-proxy'; // 서버가 실제 키 보유, 클라이언트는 게이트 통과용
                if (restKey) {
                    callKakaoMobilityRoute(allPoints, restKey).then(function(routeData) {
                        if (routeData) drawRoadRoute(routeData);
                        else drawRoute(allPoints);
                    });
                } else drawRoute(allPoints);
                showTabStatus('tab-route', '🔄 경로 순서 변경됨', 'ok');
            }
        });
    }
}

function openKakaoMapFromRoute(btn) {
    if (!btn) {
        showTabStatus('tab-route', '⚠️ 버튼 정보가 없습니다.', 'warning');
        return;
    }

    let fromName = btn.dataset.fromName;
    let fromLat = parseFloat(btn.dataset.fromLat);
    let fromLng = parseFloat(btn.dataset.fromLng);
    let toName = btn.dataset.toName;
    let toLat = parseFloat(btn.dataset.toLat);
    let toLng = parseFloat(btn.dataset.toLng);

    if (!fromName || !toName || isNaN(fromLat) || isNaN(toLat)) {
        showTabStatus('tab-route', '⚠️ 경로 정보가 올바르지 않습니다.', 'warning');
        return;
    }

    openRouteMap(fromName, fromLat, fromLng, toName, toLat, toLng);
}

function moveToRoutePoint(el) {
    if (!el) {
        showTabStatus('tab-route', '⚠️ 위치 정보가 없습니다.', 'warning');
        return;
    }
    let lat = parseFloat(el.dataset.lat);
    let lng = parseFloat(el.dataset.lng);
    let name = el.dataset.name || '장소';
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        showTabStatus('tab-route', '⚠️ 위치 정보가 올바르지 않습니다.', 'warning');
        return;
    }
    switchTab('tab-route');
    focusMapOnPoint(lat, lng, 4);
    document.querySelectorAll('.route-item').forEach(function(item) { item.style.background = ''; });
    el.style.background = '#ebf8ff';
    showTabStatus('tab-route', '📍 "' + name + '" 위치로 이동했습니다.', 'info');
}

// ============================================================
// 19. 경로 API 연결 (카카오맵 / TMap 통합)
// ============================================================
function openRouteMap(fromName, fromLat, fromLng, toName, toLat, toLng) {
    if (!toName || !toLat || !toLng) { 
        showTabStatus('tab-route', '⚠️ 목적지 정보가 없습니다.', 'warning'); 
        return; 
    }
    if (!fromName || !fromLat || !fromLng) { 
        showTabStatus('tab-route', '⚠️ 출발지 정보가 없습니다.', 'warning'); 
        return; 
    }

    let isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (routeApi === 'tmap') {
        let tmapUrl;
        let webUrl;
        
        if (isIOS) {
            tmapUrl = 'tmap://route?'
                + 'sName=' + encodeURIComponent(fromName)
                + '&sX=' + fromLng
                + '&sY=' + fromLat
                + '&rGoName=' + encodeURIComponent(toName)
                + '&rGoX=' + toLng
                + '&rGoY=' + toLat;
        } else {
            tmapUrl = 'tmap://route?'
                + 'startName=' + encodeURIComponent(fromName)
                + '&startX=' + fromLng
                + '&startY=' + fromLat
                + '&endName=' + encodeURIComponent(toName)
                + '&endX=' + toLng
                + '&endY=' + toLat
                + '&startPoiType=1'
                + '&endPoiType=1'
                + '&searchOption=0';
        }
        
        webUrl = 'https://apis-navi.tmap.co.kr/routes/'
            + fromLat + ',' + fromLng + '/' + toLat + ',' + toLng
            + '?name=' + encodeURIComponent(fromName + '→' + toName);

        if (isMobile) {
            window.location.href = tmapUrl;
            setTimeout(function() {
                if (!window.location.href.startsWith('tmap://')) {
                    window.open(webUrl, '_blank');
                }
            }, 2000);
            showTabStatus('tab-route', '🗺️ TMap 길찾기: ' + fromName + ' → ' + toName, 'info');
            return;
        } else {
            window.open(webUrl, '_blank');
            showTabStatus('tab-route', '🗺️ TMap 웹 길찾기: ' + fromName + ' → ' + toName, 'info');
            return;
        }
    }

    // ===== 카카오맵 =====
    if (isMobile) {
        let kakaoUrl;
        if (isIOS) {
            kakaoUrl = 'kakaomap://route?'
                + 'sp=' + fromLat + ',' + fromLng
                + '&ep=' + toLat + ',' + toLng
                + '&sname=' + encodeURIComponent(fromName)
                + '&dname=' + encodeURIComponent(toName)
                + '&by=CAR';
        } else {
            kakaoUrl = 'kakaomap://route?'
                + 'sp=' + fromLat + ',' + fromLng
                + '&ep=' + toLat + ',' + toLng
                + '&sname=' + encodeURIComponent(fromName)
                + '&dname=' + encodeURIComponent(toName)
                + '&by=CAR';
        }
        
        let webUrl = 'https://map.kakao.com/link/from/'
            + encodeURIComponent(fromName) + ',' + fromLat + ',' + fromLng
            + '/to/'
            + encodeURIComponent(toName) + ',' + toLat + ',' + toLng;
        
        window.location.href = kakaoUrl;
        setTimeout(function() {
            if (!window.location.href.startsWith('kakaomap://')) {
                window.open(webUrl, '_blank');
            }
        }, 2000);
        showTabStatus('tab-route', '🗺️ 카카오맵 길찾기: ' + fromName + ' → ' + toName, 'info');
    } else {
        let url = 'https://map.kakao.com/link/from/'
            + encodeURIComponent(fromName) + ',' + fromLat + ',' + fromLng
            + '/to/'
            + encodeURIComponent(toName) + ',' + toLat + ',' + toLng;
        window.open(url, '_blank');
        showTabStatus('tab-route', '🗺️ 카카오맵 길찾기: ' + fromName + ' → ' + toName, 'info');
    }
}

function openKakaoMap(fromName, fromLat, fromLng, toName, toLat, toLng) {
    openRouteMap(fromName, fromLat, fromLng, toName, toLat, toLng);
}

function openKakaoMapFromPlace(id) {
    let place = places.find(function(p) { return p.id === id; });
    if (!place) {
        showTabStatus('tab-list', '❌ 현장을 찾을 수 없습니다.', 'error');
        return;
    }
    if (!place.lat || !place.lng || place.lat === 0 || place.lng === 0) {
        showTabStatus('tab-list', '⚠️ "' + place.name + '"의 좌표가 없습니다.', 'warning');
        return;
    }

    let webUrl;
    let isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (startPoint && startPoint.lat && startPoint.lng) {
        webUrl = 'https://map.kakao.com/link/from/'
            + encodeURIComponent(startPoint.name) + ',' + startPoint.lat + ',' + startPoint.lng
            + '/to/'
            + encodeURIComponent(place.name) + ',' + place.lat + ',' + place.lng;
        showTabStatus('tab-list', '🗺️ 길찾기: ' + startPoint.name + ' → ' + place.name, 'info');
    } else {
        webUrl = 'https://map.kakao.com/link/map/'
            + encodeURIComponent(place.name) + ',' + place.lat + ',' + place.lng;
        showTabStatus('tab-list', '🗺️ "' + place.name + '" 위치 열기', 'info');
    }

    if (isMobile && routeApi === 'kakao') {
        let kakaoUrl;
        if (startPoint && startPoint.lat && startPoint.lng) {
            kakaoUrl = 'kakaomap://route?'
                + 'sp=' + startPoint.lat + ',' + startPoint.lng
                + '&ep=' + place.lat + ',' + place.lng
                + '&sname=' + encodeURIComponent(startPoint.name)
                + '&dname=' + encodeURIComponent(place.name)
                + '&by=car';
        } else {
            kakaoUrl = 'kakaomap://open?page=map&lat=' + place.lat + '&lng=' + place.lng
                + '&q=' + encodeURIComponent(place.name);
        }
        window.location.href = kakaoUrl;
        setTimeout(function() {
            if (window.location.href.startsWith('kakaomap://')) {
                window.open(webUrl, '_blank');
            }
        }, 2000);
    } else {
        window.open(webUrl, '_blank');
    }
}

function openCurrentPlaceInKakaoMap() {
    if (!currentPlaceId) {
        showTabStatus('tab-route', '⚠️ 표시된 현장이 없습니다.', 'warning');
        return;
    }

    let place = places.find(function(p) { return p.id === currentPlaceId; });
    if (!place) {
        showTabStatus('tab-route', '❌ 현장을 찾을 수 없습니다.', 'error');
        return;
    }
    if (!place.lat || !place.lng || place.lat === 0 || place.lng === 0) {
        showTabStatus('tab-route', '⚠️ "' + place.name + '"의 좌표가 없습니다.', 'warning');
        return;
    }

    let url;
    if (startPoint && startPoint.lat && startPoint.lng) {
        url = 'https://map.kakao.com/link/from/'
            + encodeURIComponent(startPoint.name) + ',' + startPoint.lat + ',' + startPoint.lng
            + '/to/'
            + encodeURIComponent(place.name) + ',' + place.lat + ',' + place.lng;
        showTabStatus('tab-route', '🗺️ 길찾기: ' + startPoint.name + ' → ' + place.name, 'info');
    } else {
        url = 'https://map.kakao.com/link/map/'
            + encodeURIComponent(place.name) + ',' + place.lat + ',' + place.lng;
        showTabStatus('tab-route', '🗺️ "' + place.name + '" 위치 열기', 'info');
    }

    window.open(url, '_blank');
}

// ============================================================
// 20. 지도 표시
// ============================================================
function showPlaceOnMap(id) {
    let place = places.find(function(p) { return p.id === id; });
    if (!place) {
        showTabStatus('tab-list', '❌ 현장을 찾을 수 없습니다.', 'error');
        return;
    }
    if (!place.lat || !place.lng || place.lat === 0 || place.lng === 0) {
        showTabStatus('tab-list', '⚠️ "' + place.name + '"의 좌표가 없습니다.', 'warning');
        return;
    }
    routeResult = null;
    document.getElementById('placeCount').textContent = '0개소';
    document.getElementById('totalDistance').textContent = '0.00 km';
    document.getElementById('totalTime').textContent = '0 분';
    document.getElementById('optimizeMode').textContent = '-';
    document.getElementById('routeList').innerHTML = '';
    clearRouteMarkers();
    clearSingleMarker();
    isShowingRouteMarkers = false;
    
    if (!kakaoMap) {
        initMap();
        setTimeout(function() { showPlaceOnMap(id); }, 500);
        return;
    }
    
    let pos = new kakao.maps.LatLng(place.lat, place.lng);
    let content = '<div style="background:rgba(255,255,255,0.95);padding:8px 18px;border-radius:24px;border:2.5px solid rgba(37,99,235,0.5);box-shadow:0 8px 32px rgba(37,99,235,0.2);font-size:14px;font-weight:700;color:#1a202c;white-space:nowrap;backdrop-filter:blur(12px);">📍 ' + escapeHtml(place.name) + '</div>';
    let customOverlay = new kakao.maps.CustomOverlay({
        map: kakaoMap,
        position: pos,
        content: content,
        yAnchor: 1.4,
        xAnchor: 0.5
    });
    singlePlaceMarker = customOverlay;
    singlePlaceMarker._placeId = id;
    kakaoMap.setCenter(pos);
    kakaoMap.setLevel(4);
    switchTab('tab-route');
    showTabStatus('tab-route', '📍 "' + place.name + '" 위치 표시 중 (경로 초기화됨)', 'info');
}

function clearSingleMarker() {
    if (singlePlaceMarker) {
        try { singlePlaceMarker.setMap(null); } catch(e) {}
        singlePlaceMarker = null;
    }
    if (singlePlaceInfoWindow) {
        try { singlePlaceInfoWindow.close(); } catch(e) {}
        singlePlaceInfoWindow = null;
    }
}

// ============================================================
// 21. 카카오모빌리티 API (경로 표시용)
// ============================================================
async function callKakaoMobilityRoute(points, restKey) {
    // restKey는 더 이상 사용하지 않음 - 노트북 서버의 /api/route/waypoints 프록시가 실제 키를 보유
    if (points.length < 2) return null;
    try {
        let origin = points[0], destination = points[points.length - 1], waypoints = points.slice(1, -1);
        let payload = {
            origin: { name: origin.name || '출발지', x: origin.lng, y: origin.lat },
            destination: { name: destination.name || '도착지', x: destination.lng, y: destination.lat }
        };
        if (waypoints.length > 0) {
            payload.waypoints = waypoints.map(function(w) {
                return { name: w.name || '경유지', x: w.lng, y: w.lat };
            });
        }
        return await serverPost('/api/route/waypoints', payload);
    } catch(e) {
        return null;
    }
}

function drawRoadRoute(routeData) {
    if (!kakaoMap || !routeData) return;
    try {
        let route = routeData.routes[0];
        if (!route || !route.sections) return;
        
        if (kakaoPolyline) { kakaoPolyline.setMap(null); kakaoPolyline = null; }
        if (window._sectionPolylines) {
            for (let i = 0; i < window._sectionPolylines.length; i++) {
                try { window._sectionPolylines[i].setMap(null); } catch(e) {}
            }
            window._sectionPolylines = [];
        }
        
        let totalBounds = new kakao.maps.LatLngBounds();
        let sectionIndex = 0;
        
        for (let s = 0; s < route.sections.length; s++) {
            let section = route.sections[s];
            if (!section.roads) continue;
            let sectionPath = [];
            for (let r = 0; r < section.roads.length; r++) {
                let road = section.roads[r];
                if (road.vertexes) {
                    for (let v = 0; v < road.vertexes.length; v += 2) {
                        let lng = road.vertexes[v];
                        let lat = road.vertexes[v + 1];
                        if (lat && lng) {
                            let point = new kakao.maps.LatLng(lat, lng);
                            sectionPath.push(point);
                            totalBounds.extend(point);
                        }
                    }
                }
            }
            if (sectionPath.length > 1) {
                let color = COLORS[sectionIndex % COLORS.length];
                
                let polyline = new kakao.maps.Polyline({
                    map: kakaoMap,
                    path: sectionPath,
                    strokeWeight: 6,
                    strokeColor: color,
                    strokeOpacity: 0.85,
                    strokeStyle: 'solid',
                    zIndex: 1
                });
                let glowPolyline = new kakao.maps.Polyline({
                    map: kakaoMap,
                    path: sectionPath,
                    strokeWeight: 12,
                    strokeColor: color,
                    strokeOpacity: 0.2,
                    strokeStyle: 'solid',
                    zIndex: 0
                });
                if (!window._sectionPolylines) window._sectionPolylines = [];
                window._sectionPolylines.push(polyline);
                window._sectionPolylines.push(glowPolyline);
                sectionIndex++;
            }
        }
        
        if (totalBounds.getSouthWest() && totalBounds.getNorthEast()) {
            let sw = totalBounds.getSouthWest();
            let ne = totalBounds.getNorthEast();
            let latMargin = (ne.getLat() - sw.getLat()) * 0.2;
            let lngMargin = (ne.getLng() - sw.getLng()) * 0.2;
            let newSw = new kakao.maps.LatLng(sw.getLat() - latMargin, sw.getLng() - lngMargin);
            let newNe = new kakao.maps.LatLng(ne.getLat() + latMargin, ne.getLng() + lngMargin);
            let newBounds = new kakao.maps.LatLngBounds(newSw, newNe);
            kakaoMap.setBounds(newBounds);
        }
        
        setTimeout(function() {
            kakaoMap.relayout();
        }, 100);
    } catch(e) {}
}

function drawRoute(path) {
    if (!kakaoMap || !path || path.length < 2) return;
    try {
        if (kakaoPolyline) { kakaoPolyline.setMap(null); kakaoPolyline = null; }
        if (window._sectionPolylines) {
            for (let i = 0; i < window._sectionPolylines.length; i++) {
                try { window._sectionPolylines[i].setMap(null); } catch(e) {}
            }
            window._sectionPolylines = [];
        }
        
        let bounds = new kakao.maps.LatLngBounds();
        let allPoints = [];
        for (let i = 0; i < path.length; i++) {
            let p = path[i];
            let latlng = new kakao.maps.LatLng(p.lat, p.lng);
            allPoints.push(latlng);
            bounds.extend(latlng);
        }
        
        for (let i = 0; i < allPoints.length - 1; i++) {
            let color = COLORS[i % COLORS.length];
            let polyline = new kakao.maps.Polyline({
                map: kakaoMap,
                path: [allPoints[i], allPoints[i + 1]],
                strokeWeight: 6,
                strokeColor: color,
                strokeOpacity: 0.85,
                strokeStyle: 'solid',
                zIndex: 1
            });
            if (!window._sectionPolylines) window._sectionPolylines = [];
            window._sectionPolylines.push(polyline);
        }
        
        if (bounds.getSouthWest() && bounds.getNorthEast()) {
            let sw = bounds.getSouthWest();
            let ne = bounds.getNorthEast();
            let latMargin = (ne.getLat() - sw.getLat()) * 0.2;
            let lngMargin = (ne.getLng() - sw.getLng()) * 0.2;
            let newSw = new kakao.maps.LatLng(sw.getLat() - latMargin, sw.getLng() - lngMargin);
            let newNe = new kakao.maps.LatLng(ne.getLat() + latMargin, ne.getLng() + lngMargin);
            let newBounds = new kakao.maps.LatLngBounds(newSw, newNe);
            kakaoMap.setBounds(newBounds);
        }
        
        setTimeout(function() {
            kakaoMap.relayout();
        }, 100);
    } catch(e) {}
}

// ============================================================
// 22. 지도 중심 이동
// ============================================================
function focusMapOnPoint(lat, lng, level) {
    lat = Number(lat);
    lng = Number(lng);
    level = Number(level) || 5;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) return false;
    let center = {lat: lat, lng: lng, level: level};
    if (typeof kakao !== 'undefined' && kakao.maps && kakaoMap) {
        try {
            kakaoMap.relayout();
            kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
            kakaoMap.setLevel(level);
            kakaoMap.relayout();
            pendingMapCenter = null;
            return true;
        } catch (e) {}
    }
    pendingMapCenter = center;

// 지도 탭이 활성화된 경우에만 SDK 로딩
const routeTab = document.getElementById('tab-route');
const routeActive = routeTab &&
    routeTab.classList.contains('active');

if (routeActive && !sdkLoading) {
    try {
        initMap();
    } catch (e) {
        console.warn('[MAP] 지연 초기화 실패:', e);
    }
}

return false;
}

function applyPendingMapCenter() {
    if (!pendingMapCenter || !kakaoMap) return;
    let p = pendingMapCenter;
    try {
        kakaoMap.relayout();
        kakaoMap.setCenter(new kakao.maps.LatLng(p.lat, p.lng));
        kakaoMap.setLevel(p.level || 5);
        kakaoMap.relayout();
        pendingMapCenter = null;
    } catch (e) {}
}

function focusRouteStart() {
    return startPoint ? focusMapOnPoint(startPoint.lat, startPoint.lng, 5) : false;
}

function ensureRouteMapReady(timeoutMs) {
    timeoutMs = Number(timeoutMs) || 12000;
    switchTab('tab-route');

    return new Promise(function(resolve) {
        const startedAt = Date.now();

        function checkMap() {
            if (kakaoMap && typeof kakao !== 'undefined' && kakao.maps) {
                try { kakaoMap.relayout(); } catch (e) {}
                resolve(true);
                return;
            }

            if (!sdkLoading) initMap();
            if (Date.now() - startedAt >= timeoutMs) {
                resolve(false);
                return;
            }
            setTimeout(checkMap, 100);
        }

        requestAnimationFrame(function() { setTimeout(checkMap, 50); });
    });
}

function stabilizeRouteStartCenter(lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    pendingMapCenter = { lat: lat, lng: lng, level: 5 };
    const token = ++routeMapFocusToken;
    [0, 180, 500, 1000, 1800].forEach(function(delay) {
        setTimeout(function() {
            const routeTab = document.getElementById('tab-route');
            if (token !== routeMapFocusToken || !routeTab || !routeTab.classList.contains('active')) return;
            if (!kakaoMap || typeof kakao === 'undefined' || !kakao.maps) return;
            try {
                const center = new kakao.maps.LatLng(lat, lng);
                kakaoMap.relayout();
                // 확대 수준 변경이 중심을 미세하게 이동시키는 브라우저가 있어
                // level을 먼저 적용하고 center를 마지막에 두 번 확정한다.
                kakaoMap.setLevel(5);
                kakaoMap.setCenter(center);
                kakaoMap.relayout();
                kakaoMap.setCenter(center);
                pendingMapCenter = null;
            } catch (error) {
                console.warn('[MAP] 출발지 중심 안정화 실패:', error);
            }
        }, delay);
    });
}

function enableMapInteraction() {
    const container = document.getElementById('map');
    if (container) {
        container.style.pointerEvents = 'auto';
        container.style.touchAction = 'none';
        if (!container.dataset.interactionGuard) {
            const cancelAutoFocus = function() {
                // 사용자가 직접 지도를 움직이면 예약된 자동 중앙 고정을 즉시 취소한다.
                routeMapFocusToken += 1;
                pendingMapCenter = null;
            };
            container.addEventListener('pointerdown', cancelAutoFocus, { capture: true, passive: true });
            container.addEventListener('wheel', cancelAutoFocus, { capture: true, passive: true });
            container.dataset.interactionGuard = 'on';
        }
    }
    if (!kakaoMap) return;
    try {
        kakaoMap.setDraggable(true);
        kakaoMap.setZoomable(true);
    } catch (error) {
        console.warn('[MAP] 지도 조작 활성화 실패:', error);
    }
}

function renderOptimizedRouteMapView(allPoints, routeData) {
    if (!Array.isArray(allPoints) || allPoints.length < 2) return false;
    if (!kakaoMap) {
        pendingOptimizedMapView = { allPoints: allPoints, routeData: routeData || null };
        return false;
    }

    clearRouteMarkers();
    clearSingleMarker();
    isShowingRouteMarkers = true;

    const routeStart = allPoints[0];
    addRouteMarker(routeStart.lat, routeStart.lng, routeStart.name, true, -1);
    for (let i = 1; i < allPoints.length; i++) {
        const point = allPoints[i];
        addRouteMarker(point.lat, point.lng, i + '. ' + point.name, false, i - 1);
    }

    if (routeData) drawRoadRoute(routeData);
    else drawRoute(allPoints);

    pendingOptimizedMapView = null;
    return true;
}

function applyPendingOptimizedRouteMapView() {
    if (!pendingOptimizedMapView || !kakaoMap) return false;
    const view = pendingOptimizedMapView;
    const rendered = renderOptimizedRouteMapView(view.allPoints, view.routeData);
    if (rendered && view.allPoints[0]) {
        const routeStart = view.allPoints[0];
        stabilizeRouteStartCenter(routeStart.lat, routeStart.lng);
    }
    return rendered;
}

function focusRouteStartAfterTabOpen() {
    if (!startPoint) return;
    const lat = Number(startPoint.lat);
    const lng = Number(startPoint.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    // SDK가 아직 준비되지 않은 경우에도 createMap()에서 적용할 수 있도록 보관한다.
    pendingMapCenter = { lat: lat, lng: lng, level: 5 };
    let attempts = 0;

    function applyStartCenter() {
        attempts += 1;
        const routeTab = document.getElementById('tab-route');
        if (!routeTab || !routeTab.classList.contains('active')) return;

        if (kakaoMap && typeof kakao !== 'undefined' && kakao.maps) {
            try {
                kakaoMap.relayout();
                kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
                kakaoMap.setLevel(5);
                kakaoMap.relayout();
                pendingMapCenter = null;
                stabilizeRouteStartCenter(lat, lng);
                return;
            } catch (error) {
                console.warn('[MAP] 출발지 중심 이동 재시도:', error);
            }
        } else if (!sdkLoading) {
            initMap();
        }

        if (attempts < 40) setTimeout(applyStartCenter, 250);
    }

    requestAnimationFrame(function() {
        setTimeout(applyStartCenter, 220);
    });
}

// ============================================================
// 23. 지도 초기화
// ============================================================
function initMap() {
    const container = document.getElementById('map');
    if (!container) return;

    // 이미 지도가 생성되어 있으면 재사용
    if (kakaoMap) {
        try {
            kakaoMap.relayout();
        } catch (e) {}

        try {
            kakaoMap.setDraggable(true);
            kakaoMap.setZoomable(true);
        } catch (e) {}

        return;
    }

    // SDK 로딩 중이면 중복 로딩 방지
    if (sdkLoading) return;

    // 키는 서버 런타임 설정에서만 받는다. 아직 준비되지 않았다면 한 번 로드 후 재시도한다.
    if (!KAKAO_JAVASCRIPT_KEY) {
        sdkLoading = true;
        loadRuntimeConfiguration().then(function() {
            sdkLoading = false;
            if (KAKAO_JAVASCRIPT_KEY) {
                initMap();
            } else {
                container.innerHTML =
                    '<div style="display:flex;justify-content:center;align-items:center;height:100%;' +
                    'color:#975a16;font-size:14px;background:#fffff0;border-radius:12px;padding:20px;text-align:center;">' +
                    '⚠️ 서버의 jsKey 설정이 필요합니다.</div>';
            }
        });
        return;
    }

    container.innerHTML =
        '<div style="display:flex;justify-content:center;align-items:center;height:100%;' +
        'color:#d69e2e;font-size:14px;background:#fffff0;border-radius:12px;">' +
        '⏳ 카카오 지도 로딩 중...</div>';

    // 이미 SDK가 로드되어 있는 경우
    if (typeof kakao !== 'undefined' && kakao.maps) {
        kakao.maps.load(function () {
            createMap(container);

            if (kakaoMap) {
                kakaoMap.setDraggable(true);
                kakaoMap.setZoomable(true);

                setTimeout(() => {
                    try {
                        kakaoMap.relayout();
                    } catch (e) {}
                }, 100);
            }
        });

        return;
    }

    // SDK 동적 로딩
    sdkLoading = true;

    const script = document.createElement('script');

    script.src =
        'https://dapi.kakao.com/v2/maps/sdk.js' +
        '?appkey=' +
        encodeURIComponent(KAKAO_JAVASCRIPT_KEY) +
        '&autoload=false' +
        '&libraries=services,clusterer';

    script.async = true;
    script.defer = true;

    script.onload = function () {
        sdkLoading = false;

        if (
            typeof kakao === 'undefined' ||
            !kakao.maps
        ) {
            container.innerHTML =
                '<div style="display:flex;justify-content:center;align-items:center;' +
                'height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;' +
                'border-radius:12px;padding:20px;text-align:center;">' +
                '❌ 카카오 지도 SDK를 초기화할 수 없습니다.' +
                '</div>';

            return;
        }

        kakao.maps.load(function () {
            createMap(container);

            if (kakaoMap) {
                kakaoMap.setDraggable(true);
                kakaoMap.setZoomable(true);

                setTimeout(() => {
                    try {
                        kakaoMap.relayout();
                    } catch (e) {}
                }, 100);
            }
        });
    };

    script.onerror = function () {
        sdkLoading = false;

        container.innerHTML =
            '<div style="display:flex;justify-content:center;align-items:center;' +
            'height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;' +
            'border-radius:12px;padding:20px;text-align:center;">' +
            '❌ 카카오 지도 SDK 로드에 실패했습니다.<br>' +
            '카카오 개발자 콘솔의 허용 도메인을 확인하세요.' +
            '</div>';
    };

    document.head.appendChild(script);
}
function createMap(container) {
    try {
        let region = currentRegion || '서울';
        let centerInfo = getRegionCenter(region);
        let centerLat = centerInfo.lat, centerLng = centerInfo.lng;
        let zoomLevel = 5;
        
        // ... (출발지 좌표 계산 로직 유지)
        
        let options = {
    center: new kakao.maps.LatLng(centerLat, centerLng),
    level: zoomLevel,
    draggable: true,
    zoomable: true,
    scrollwheel: !isMobile()
};
        
        kakaoMap = new kakao.maps.Map(container, options);
        enableMapInteraction();
        // ★ 중복 호출 제거 - options에서 이미 설정됨
        // kakaoMap.setDraggable(true);   ← 제거
        // kakaoMap.setZoomable(true);    ← 제거
        
        renderNearbyPlaceClusters();
        // 첫 최적화 때 지도 SDK가 늦게 생성돼도 보관해 둔 경로를 여기서 그린다.
        // 경로의 setBounds가 끝난 뒤 출발지 중심을 마지막으로 적용해야 한다.
        applyPendingOptimizedRouteMapView();
        applyPendingMapCenter();
        initializeMapViewControls();
        updateSettingsConnectionUI();
        showTabStatus('tab-route', '🗺️ 지도 로드 완료', 'ok');
    } catch(e) {
        container.innerHTML = '<div style="...">❌ 지도 생성 실패</div>';
    }
}

function clearNearbyPlaceClusters() {
    if (nearbyPlaceClusterer) {
        try { nearbyPlaceClusterer.clear(); } catch (e) {}
        try { nearbyPlaceClusterer.setMap(null); } catch (e) {}
    }
    nearbyPlaceClusterer = null;
    placeMarkers.forEach(function(marker) { try { marker.setMap(null); } catch (e) {} });
    placeMarkers = [];
}

function renderNearbyPlaceClusters() {
    clearNearbyPlaceClusters();
    if (!nearbyClustersEnabled || !kakaoMap || !window.kakao?.maps?.MarkerClusterer) return;
    const validPlaces = (Array.isArray(places) ? places : []).filter(function(place) {
        return Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng));
    });
    if (!validPlaces.length) return;
    placeMarkers = validPlaces.map(function(place) {
        const marker = new kakao.maps.Marker({
            position: new kakao.maps.LatLng(Number(place.lat), Number(place.lng)),
            title: String(place.name || '현장')
        });
        kakao.maps.event.addListener(marker, 'click', function() {
            const info = new kakao.maps.InfoWindow({ content: '<div style="padding:7px 10px;white-space:nowrap;font-size:12px;font-weight:700;">' + escapeHtml(place.name || '현장') + '</div>' });
            info.open(kakaoMap, marker);
            setTimeout(function() { try { info.close(); } catch (e) {} }, 3500);
        });
        return marker;
    });
    nearbyPlaceClusterer = new kakao.maps.MarkerClusterer({
        map: kakaoMap,
        averageCenter: true,
        minLevel: 4,
        disableClickZoom: false,
        styles: [{ width:'42px', height:'42px', background:'rgba(49,130,206,.9)', borderRadius:'50%', color:'#fff', textAlign:'center', fontWeight:'700', lineHeight:'42px', boxShadow:'0 3px 12px rgba(0,0,0,.25)' }]
    });
    nearbyPlaceClusterer.addMarkers(placeMarkers);
}

function toggleNearbyPlaceClusters(enabled) {
    nearbyClustersEnabled = !!enabled;
    localStorage.setItem('nearbyPlaceClusters', nearbyClustersEnabled ? 'on' : 'off');
    renderNearbyPlaceClusters();
}

async function searchMapAddress() {
    const input = document.getElementById('mapAddressSearchInput');
    const button = document.getElementById('mapAddressSearchButton');
    const query = String(input?.value || '').trim();
    if (query.length < 2) {
        showTabStatus('tab-route', '⚠️ 검색할 주소를 두 글자 이상 입력하세요.', 'warning');
        input?.focus();
        return;
    }
    if (!kakaoMap) {
        initMap();
        showTabStatus('tab-route', '⏳ 지도를 준비하고 있습니다. 잠시 후 다시 검색하세요.', 'info');
        return;
    }
    if (button) { button.disabled = true; button.textContent = '검색 중…'; }
    showTabStatus('tab-route', '🔎 주소 검색 중: ' + query, 'info');
    try {
        const geo = await geocodeAddress(query, 'server-proxy', 1);
        if (!geo || !Number.isFinite(Number(geo.lat)) || !Number.isFinite(Number(geo.lng))) {
            throw new Error('일치하는 주소를 찾지 못했습니다. 도로명이나 지번 주소로 다시 검색하세요.');
        }
        if (mapAddressSearchOverlay) {
            try { mapAddressSearchOverlay.setMap(null); } catch (e) {}
        }
        const position = new kakao.maps.LatLng(Number(geo.lat), Number(geo.lng));
        const label = geo.address || query;
        mapAddressSearchOverlay = new kakao.maps.CustomOverlay({
            map: kakaoMap,
            position,
            yAnchor: 1.35,
            content: '<div style="background:rgba(255,255,255,.96);padding:7px 12px;border:2px solid #3182ce;border-radius:18px;box-shadow:0 5px 18px rgba(0,0,0,.2);font-size:12px;font-weight:700;color:#1a202c;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis;">🔎 ' + escapeHtml(label) + '</div>'
        });
        kakaoMap.setLevel(3);
        kakaoMap.panTo(position);
        kakaoMap.relayout();
        showTabStatus('tab-route', '✅ 주소 위치를 지도에 표시했습니다: ' + label, 'ok');
    } catch (error) {
        showTabStatus('tab-route', '❌ 주소 검색 실패: ' + (error.message || '알 수 없는 오류'), 'error');
    } finally {
        if (button) { button.disabled = false; button.textContent = '🔎 검색'; }
    }
}

function initializeMapViewControls() {
    const toggle = document.getElementById('nearbyClusterToggle');
    if (toggle) toggle.checked = nearbyClustersEnabled;
}

function addRouteMarker(lat, lng, title, isStart, colorIndex) {
    if (!kakaoMap) return;
    try {
        if (isStart && startMarker) {
            try { startMarker.setMap(null); } catch(e) {}
            startMarker = null;
            for (let i = routeMarkers.length - 1; i >= 0; i--) {
                if (routeMarkers[i] === startMarker) routeMarkers.splice(i, 1);
            }
        }
        let pos = new kakao.maps.LatLng(lat, lng);
        let content;
        
        if (isStart) {
            let prefix = (title && title.includes('내 위치')) ? '🎯' : '🚩';
            let displayName = title ? title.replace(/^[🎯🚩]\s*/, '') : '';
            content = '<div style="background:white;padding:6px 14px;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.15);font-size:13px;font-weight:700;color:#1a202c;white-space:nowrap;border:2px solid #2d3748;z-index:10;">' + prefix + ' ' + escapeHtml(displayName) + '</div>';
        } else {
            let idx = (colorIndex !== undefined && colorIndex !== null) ? colorIndex : 0;
            let color = COLORS[idx % COLORS.length];
            content = '<div style="background:' + color + ';padding:6px 14px;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.15);font-size:13px;font-weight:700;color:white;white-space:nowrap;border:1px solid rgba(255,255,255,0.3);z-index:5;">📍 ' + escapeHtml(title) + '</div>';
        }
        
        let customOverlay = new kakao.maps.CustomOverlay({
            map: kakaoMap,
            position: pos,
            content: content,
            yAnchor: 1.4,
            xAnchor: 0.5,
            zIndex: isStart ? 10 : 5
        });
        if (isStart) startMarker = customOverlay;
        routeMarkers.push(customOverlay);
        return customOverlay;
    } catch(e) {
        return null;
    }
}

function clearRouteMarkers() {
    for (let i = 0; i < routeMarkers.length; i++) {
        try { routeMarkers[i].setMap(null); } catch(e) {}
    }
    routeMarkers = [];
    if (startMarker) {
        try { startMarker.setMap(null); } catch(e) {}
        startMarker = null;
    }
    if (window._sectionPolylines) {
        for (let i = 0; i < window._sectionPolylines.length; i++) {
            try { window._sectionPolylines[i].setMap(null); } catch(e) {}
        }
        window._sectionPolylines = [];
    }
    if (kakaoPolyline) {
        try { kakaoPolyline.setMap(null); } catch(e) {}
        kakaoPolyline = null;
    }
    isShowingRouteMarkers = false;
}

// ============================================================
// 24. 프리셋 관리
// ============================================================
function loadPresets() {
    let saved = localStorage.getItem(PRESETS_KEY);
    presets = saved ? JSON.parse(saved) : [];
    renderPresets();
}

function savePresets() {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    renderPresets();
}

function renderPresets() {
    let container = document.getElementById('presetList');
    if (!container) return;

    if (presets.length === 0) {
        container.innerHTML = '<div class="empty-msg" style="padding:8px;font-size:12px;">저장된 프리셋이 없습니다</div>';
        return;
    }

    let html = '';
    for (let i = 0; i < presets.length; i++) {
        let p = presets[i];
        html += '<div class="preset-item" onclick="loadPreset(' + i + ')">';
        html += '<div class="preset-info"><div class="preset-name">' + escapeHtml(p.name) + '</div>';
        html += '<div class="preset-detail">🚩 ' + escapeHtml(p.startPoint ? p.startPoint.name : '없음') + ' → ' + (p.waypoints ? p.waypoints.length : 0) + '개 경유지</div></div>';
        html += '<button class="preset-delete" onclick="event.stopPropagation(); deletePreset(' + i + ')">✕</button></div>';
    }
    container.innerHTML = html;
}

function addPreset() {
    if (!startPoint || !startPoint.name) {
        showTabStatus('tab-places', '⚠️ 출발지를 먼저 설정하세요.', 'warning');
        return;
    }
    if (waypoints.length === 0) {
        showTabStatus('tab-places', '⚠️ 경유지를 최소 1개 이상 추가하세요.', 'warning');
        return;
    }

    let existing = document.getElementById('customPresetModal');
    if (existing) existing.remove();

    let modalHtml = `
        <div id="customPresetModal" style="
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 99999;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            animation: fadeIn 0.2s ease;
        " onclick="if(event.target===this) this.remove()">
            <div style="
                background: white;
                border-radius: 16px;
                padding: 24px;
                max-width: 380px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            " onclick="event.stopPropagation()">
                <h3 style="font-size:17px; font-weight:700; color:#1a202c; margin-bottom:8px;">💾 프리셋 저장</h3>
                <p style="font-size:14px; color:#4a5568; margin-bottom:12px; line-height:1.6;">
                    프리셋 이름을 입력하세요:
                </p>
                <input id="presetNameInput" type="text" placeholder="프리셋 이름" 
                       value="프리셋 ${presets.length + 1}"
                       style="width:100%; padding:10px 12px; border:2px solid #e2e8f0; border-radius:8px; font-size:14px; margin-bottom:16px;"
                       onkeydown="if(event.key==='Enter') document.getElementById('presetSaveBtn').click();">
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button class="btn btn-outline btn-sm" onclick="document.getElementById('customPresetModal').remove();" style="padding:6px 16px; border:1px solid #cbd5e0; border-radius:8px; background:white; cursor:pointer;">취소</button>
                    <button id="presetSaveBtn" class="btn btn-primary btn-sm" style="padding:6px 16px; background:#4f7eb3; color:white; border:none; border-radius:8px; cursor:pointer;">저장</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    setTimeout(function() {
        let input = document.getElementById('presetNameInput');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);

    document.getElementById('presetSaveBtn').addEventListener('click', function() {
        let input = document.getElementById('presetNameInput');
        let name = input ? input.value.trim() : '';
        document.getElementById('customPresetModal').remove();

        if (!name) {
            showTabStatus('tab-places', '⚠️ 프리셋 이름을 입력하세요.', 'warning');
            return;
        }

        let preset = {
            id: Date.now(),
            name: name,
            startPoint: {
                name: startPoint.name,
                address: startPoint.address || '',
                lat: startPoint.lat,
                lng: startPoint.lng
            },
            waypoints: waypoints.map(function(w) {
                return {
                    name: w.name,
                    address: w.address || '',
                    lat: w.lat || 0,
                    lng: w.lng || 0
                };
            })
        };

        presets.push(preset);
        savePresets();
        renderPresets();
        showTabStatus('tab-places', '✅ 프리셋 "' + preset.name + '" 저장됨!', 'ok');
    });
}

function loadPreset(index) {
    let preset = presets[index];
    if (!preset) {
        showTabStatus('tab-places', '⚠️ 프리셋을 찾을 수 없습니다.', 'warning');
        return;
    }

    showConfirmModal(
        '📂 프리셋 불러오기',
        '"' + preset.name + '" 프리셋을 불러오시겠습니까?\n현재 데이터는 초기화됩니다.',
        function() {
            let sp = preset.startPoint;
            if (sp && sp.lat && sp.lng) {
                selectStartPoint(sp.name, sp.address, sp.lat, sp.lng);
            } else {
                showTabStatus('tab-places', '⚠️ 출발지 정보가 없습니다.', 'warning');
                return;
            }

            waypoints = [];
            for (let i = 0; i < preset.waypoints.length; i++) {
                let w = preset.waypoints[i];
                waypoints.push({
                    name: w.name,
                    address: w.address || '',
                    lat: w.lat || 0,
                    lng: w.lng || 0
                });
            }
            renderWaypointList();

            routeResult = null;
            document.getElementById('placeCount').textContent = '0개소';
            document.getElementById('totalDistance').textContent = '0.00 km';
            document.getElementById('totalTime').textContent = '0 분';
            document.getElementById('optimizeMode').textContent = '-';
            document.getElementById('routeList').innerHTML = '';

            clearRouteMarkers();
            clearSingleMarker();
            isShowingRouteMarkers = false;

            if (kakaoMap && sp && sp.lat && sp.lng) {
                kakaoMap.setCenter(new kakao.maps.LatLng(sp.lat, sp.lng));
                kakaoMap.setLevel(5);
                kakaoMap.relayout();
            }

            showTabStatus('tab-places', '✅ 프리셋 "' + preset.name + '" 불러오기 완료!', 'ok');
        }
    );
}

function deletePreset(index) {
    showConfirmModal(
        '🗑️ 프리셋 삭제',
        '프리셋을 삭제하시겠습니까?',
        function() {
            presets.splice(index, 1);
            savePresets();
            showTabStatus('tab-places', '🗑️ 프리셋 삭제됨', 'ok');
        }
    );
}

// ============================================================
// 25. GitHub 연동
// ============================================================
function utf8ToBase64(str) {
    try {
        let bytes = new TextEncoder().encode(str);
        let binString = String.fromCodePoint.apply(null, bytes);
        return btoa(binString);
    } catch(e) {
        return btoa(unescape(encodeURIComponent(str)));
    }
}

async function uploadToGitHub(silent) {
    silent = silent || false;
    let token = settings.githubToken;
    if (!token) {
        if (!silent) showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    if (!currentRegion || currentRegion.trim() === '') {
        if (!silent) showTabStatus('tab-settings', '⚠️ 현재 선택된 지역이 없습니다.', 'warning');
        return;
    }
    if (!navigator.onLine) {
        if (!silent) showTabStatus('tab-settings', '📡 오프라인 상태 - 업로드 보류됨', 'warning');
        return;
    }
    
    try {
        if (!silent) showTabStatus('tab-settings', '☁️ GitHub 업로드 중...', 'info');
        
        let userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) {
            throw new Error('토큰 인증 실패: ' + userRes.status);
        }
        let user = await userRes.json();
        let username = user.login;
        
        let repoName = 'route-data';
        let fileName = currentRegion + '.json';
        let content = JSON.stringify(places, null, 2);
        let b64Content = utf8ToBase64(content);
        
        let repoUrl = 'https://api.github.com/repos/' + username + '/' + repoName;
        let repoRes = await fetch(repoUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        if (repoRes.status === 404) {
            let isPrivate = await new Promise(function(resolve) {
                showConfirmModal(
                    '📢 GitHub 저장소 생성',
                    '저장소를 비공개로 생성하시겠습니까?\n(취소 시 공개 저장소로 생성됩니다)',
                    function() { resolve(true); },
                    function() { resolve(false); }
                );
            });
            
            let createRes = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: {
                    'Authorization': 'token ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: repoName,
                    description: '경로 최적화 데이터 저장소',
                    private: !!isPrivate,
                    auto_init: true
                })
            });
            if (!createRes.ok) throw new Error('저장소 생성 실패');
            if (!silent) showTabStatus('tab-settings', '✅ 저장소 생성됨: ' + repoName, 'ok');
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else if (!repoRes.ok) {
            throw new Error('저장소 확인 실패: ' + repoRes.status);
        }
        
        let fileUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + encodeURIComponent(fileName);
        let fileRes = await fetch(fileUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        let sha = null;
        if (fileRes.ok) {
            let fileData = await fileRes.json();
            sha = fileData.sha;
        }
        
        let putData = {
            message: 'Auto sync: ' + currentRegion + ' (' + new Date().toLocaleString() + ')',
            content: b64Content
        };
        if (sha) putData.sha = sha;
        
        let putRes = await fetch(fileUrl, {
            method: 'PUT',
            headers: {
                'Authorization': 'token ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(putData)
        });
        
        if (putRes.status === 409) {
            showConfirmModal(
                '⚠️ 동기화 충돌',
                '다른 기기에서 동시에 수정한 것으로 보입니다.\n최신 버전을 가져와 병합하시겠습니까?',
                async function() {
                    let latestRes = await fetch(fileUrl, {
                        headers: { 'Authorization': 'token ' + token }
                    });
                    if (latestRes.ok) {
                        let latestData = await latestRes.json();
                        let latestContent = new TextDecoder('utf-8').decode(
                            Uint8Array.from(atob(latestData.content), function(c) { return c.charCodeAt(0); })
                        );
                        let latestPlaces = JSON.parse(latestContent);
                        let merged = latestPlaces.slice();
                        places.forEach(function(localP) {
                            let existing = merged.find(function(m) { return normalizeName(m.name) === normalizeName(localP.name); });
                            if (existing) {
                                existing.address = localP.address || existing.address;
                                existing.lat = localP.lat || existing.lat;
                                existing.lng = localP.lng || existing.lng;
                                existing.remark = localP.remark || existing.remark;
                                existing.favorite = localP.favorite !== undefined ? localP.favorite : existing.favorite;
                            } else {
                                merged.push(localP);
                            }
                        });
                        places = merged;
                        savePlaces();
                        serverPost('/api/places')
                    } else {
                        showTabStatus('tab-settings', '❌ 충돌 해결 실패', 'error');
                    }
                },
                function() {
                    showTabStatus('tab-settings', '⏸️ 충돌로 인해 업로드가 취소되었습니다.', 'warning');
                }
            );
            return;
        }
        
        if (!putRes.ok) {
            let errorText = await putRes.text();
            throw new Error('업로드 실패: ' + putRes.status + ' - ' + errorText);
        }
        
        if (!silent) {
            showTabStatus('tab-settings', '✅ GitHub 업로드 완료! (' + places.length + '개)', 'ok');
        }
    } catch(error) {
        if (!silent) {
            showTabStatus('tab-settings', '❌ 업로드 실패: ' + error.message, 'error');
        }
    }
}

async function downloadFromGitHub() {
    let token = settings.githubToken;
    if (!token) {
        showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    
    try {
        showTabStatus('tab-settings', '☁️ GitHub 저장소 목록 불러오는 중...', 'info');
        
        let userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        let user = await userRes.json();
        let username = user.login;
        
        let repoName = 'route-data';
        let repoUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents';
        let repoRes = await fetch(repoUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        if (repoRes.status === 404) {
            showTabStatus('tab-settings', '📭 GitHub에 저장된 데이터가 없습니다.\n먼저 "업로드"를 실행하세요.', 'warning');
            return;
        }
        if (!repoRes.ok) {
            throw new Error('저장소 조회 실패: ' + repoRes.status);
        }
        
        let files = await repoRes.json();
        let regions = [];
        files.forEach(function(file) {
if (file.name.endsWith('.json') && file.name.indexOf('_stats') === -1 && file.name.indexOf('_work') === -1 && file.name !== '.json') {
let region = file.name.replace('.json', '');
regions.push(region);
}
});
        
        if (regions.length === 0) {
            showTabStatus('tab-settings', '📭 GitHub에 저장된 지역 데이터가 없습니다.', 'warning');
            return;
        }
        
        showRegionSelectModal(regions, function(selectedRegion) {
            if (selectedRegion) {
                processDownloadFromGitHub(selectedRegion);
            }
        });
    } catch(error) {
        showTabStatus('tab-settings', '❌ 목록 조회 실패: ' + error.message, 'error');
    }
}

function showRegionSelectModal(regions, onSelect) {
    let existing = document.getElementById('regionSelectModal');
    if (existing) existing.remove();
    
    let optionsHtml = '';
    regions.forEach(function(region) {
        optionsHtml += '<option value="' + escapeHtml(region) + '">' + escapeHtml(region) + '</option>';
    });
    
    let modalHtml = `
        <div id="regionSelectModal" style="
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            animation: fadeIn 0.2s ease;
        " onclick="if(event.target===this) this.remove()">
            <div style="
                background: white;
                border-radius: 16px;
                padding: 24px;
                max-width: 380px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            " onclick="event.stopPropagation()">
                <h3 style="font-size:17px; font-weight:700; color:#1a202c; margin-bottom:8px;">📥 다운로드할 지역 선택</h3>
                <p style="font-size:14px; color:#4a5568; margin-bottom:16px; line-height:1.6;">
                    GitHub에 저장된 지역 중 선택하세요:
                </p>
                <select id="regionSelectDropdown" style="
                    width:100%; padding:10px 12px; border:2px solid #e2e8f0; border-radius:8px; 
                    font-size:14px; margin-bottom:16px; background:white; cursor:pointer;
                ">
                    <option value="">-- 지역 선택 --</option>
                    ${optionsHtml}
                </select>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button class="btn btn-outline btn-sm" onclick="document.getElementById('regionSelectModal').remove();" style="padding:6px 16px;">취소</button>
                    <button class="btn btn-primary btn-sm" id="confirmDownloadBtn" style="padding:6px 16px;">다운로드</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.getElementById('confirmDownloadBtn').addEventListener('click', function() {
        let select = document.getElementById('regionSelectDropdown');
        let selected = select.value;
        document.getElementById('regionSelectModal').remove();
        if (selected && typeof onSelect === 'function') {
            onSelect(selected);
        } else if (!selected) {
            showTabStatus('tab-settings', '⚠️ 다운로드할 지역을 선택해주세요.', 'warning');
        }
    });
}

async function processDownloadFromGitHub(region) {
    let token = settings.githubToken;
    if (!token) {
        showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    
    try {
        showTabStatus('tab-settings', '☁️ GitHub 다운로드 중...', 'info');
        
        let userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        let user = await userRes.json();
        let username = user.login;
        
        let repoName = 'route-data';
        let fileName = region + '.json';
        let fileUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + encodeURIComponent(fileName);
        
        let fileRes = await fetch(fileUrl, {
            headers: { 'Authorization': 'token ' + token },
            cache: 'no-store'
        });
        
        if (fileRes.status === 404) {
            showTabStatus('tab-settings', '📭 GitHub에 "' + region + '" 지역의 데이터가 없습니다.', 'warning');
            return;
        }
        if (!fileRes.ok) {
            throw new Error('다운로드 실패: ' + fileRes.status);
        }
        
        let data = await fileRes.json();
        let binaryString = atob(data.content);
        let bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        let content = new TextDecoder('utf-8').decode(bytes);
        let loadedPlaces = JSON.parse(content);
        
        places = loadedPlaces;
        
        let key = getStorageKey(region);
        localStorage.setItem(key, JSON.stringify(places));
        
        let select = document.getElementById('regionSelect');
        let exists = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === region) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            let opt = document.createElement('option');
            opt.value = region;
            opt.textContent = region;
            select.appendChild(opt);
        }
        
        select.value = region;
        currentRegion = region;
        localStorage.setItem(SELECTED_REGION_KEY, region);
        
        renderPlaces();
        updateStorageInfo();
        
        if (kakaoMap) {
            let center = getRegionCenter(region);
            kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
            kakaoMap.setLevel(5);
            kakaoMap.relayout();
        }
        
        showTabStatus('tab-settings', '✅ GitHub 다운로드 완료! (' + loadedPlaces.length + '개)', 'ok');
    } catch(error) {
        showTabStatus('tab-settings', '❌ 다운로드 실패: ' + error.message, 'error');
    }
}

// 히스토리 토글 기능
async function showGitHubHistory() {
    let historyDiv = document.getElementById('githubHistory');
    if (!historyDiv) return;
    
    if (historyDiv.style.display === 'block') {
        historyDiv.style.display = 'none';
        return;
    }
    
    let token = settings.githubToken;
    if (!token) {
        showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    
    historyDiv.innerHTML = '<div style="text-align:center;padding:8px;color:#a0aec0;">⏳ 로딩 중...</div>';
    historyDiv.style.display = 'block';
    
    try {
        let userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        let user = await userRes.json();
        let username = user.login;
        let repoName = 'route-data';
        let fileName = currentRegion + '.json';
        let url = 'https://api.github.com/repos/' + username + '/' + repoName + '/commits?path=' + encodeURIComponent(fileName) + '&per_page=10';
        let commitRes = await fetch(url, {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!commitRes.ok) {
            if (commitRes.status === 404) {
                historyDiv.innerHTML = '<div style="color:#a0aec0;text-align:center;padding:8px;">📭 아직 커밋 기록이 없습니다</div>';
                showTabStatus('tab-settings', '📭 히스토리가 없습니다.', 'warning');
                return;
            }
            throw new Error('히스토리 조회 실패');
        }
        let commits = await commitRes.json();
        if (commits.length === 0) {
            historyDiv.innerHTML = '<div style="color:#a0aec0;text-align:center;padding:8px;">📭 아직 커밋 기록이 없습니다</div>';
        } else {
            let html = '<div style="font-weight:600;font-size:12px;margin-bottom:4px;">📋 최근 10개 커밋</div>';
            for (let i = 0; i < commits.length; i++) {
                let c = commits[i];
                let date = new Date(c.commit.author.date).toLocaleString();
                let msg = c.commit.message || 'No message';
                let sha = c.sha;
                html += '<div class="commit-item">';
                html += '<div class="commit-info">';
                html += '<div class="commit-msg">' + escapeHtml(msg) + '</div>';
                html += '<div class="commit-date">' + date + '</div>';
                html += '</div>';
                html += '<button class="restore-btn" onclick="restoreFromGitHub(\'' + sha + '\')">복원</button>';
                html += '</div>';
            }
            historyDiv.innerHTML = html;
        }
        historyDiv.style.display = 'block';
        showTabStatus('tab-settings', '✅ 히스토리 로드 완료', 'ok');
    } catch(error) {
        historyDiv.innerHTML = '<div style="color:#e53e3e;text-align:center;padding:8px;">❌ 히스토리 로드 실패</div>';
        historyDiv.style.display = 'block';
        showTabStatus('tab-settings', '❌ 히스토리 로드 실패', 'error');
    }
}

async function restoreFromGitHub(sha) {
    let token = settings.githubToken;
    if (!token) {
        showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    if (!currentRegion) {
        showTabStatus('tab-settings', '⚠️ 복원할 지역이 선택되지 않았습니다.', 'warning');
        return;
    }
    
    showConfirmModal(
        '⏪ 히스토리 복원',
        '해당 버전으로 데이터를 복원하시겠습니까?\n현재 데이터는 덮어쓰기됩니다.',
        async function() {
            try {
                showTabStatus('tab-settings', '⏳ 복원 중...', 'info');
                let userRes = await fetch('https://api.github.com/user', {
                    headers: { 'Authorization': 'token ' + token }
                });
                if (!userRes.ok) throw new Error('토큰 인증 실패');
                let user = await userRes.json();
                let username = user.login;
                let repoName = 'route-data';
                let fileName = currentRegion + '.json';
                let url = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + encodeURIComponent(fileName) + '?ref=' + sha;
                let fileRes = await fetch(url, {
                    headers: { 'Authorization': 'token ' + token }
                });
                if (!fileRes.ok) throw new Error('파일 조회 실패');
                let data = await fileRes.json();
                let binaryString = atob(data.content);
                let bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                let content = new TextDecoder('utf-8').decode(bytes);
                let loadedPlaces = JSON.parse(content);
                
                places = loadedPlaces;
                let key = getStorageKey(currentRegion);
                localStorage.setItem(key, JSON.stringify(places));
                
                renderPlaces();
                updateStorageInfo();
                showTabStatus('tab-settings', '✅ 복원 완료! (' + loadedPlaces.length + '개)', 'ok');
                
                if (kakaoMap) {
                    let center = getRegionCenter(currentRegion);
                    kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
                    kakaoMap.setLevel(5);
                    kakaoMap.relayout();
                }
            } catch(error) {
                showTabStatus('tab-settings', '❌ 복원 실패: ' + error.message, 'error');
            }
        }
    );
}

// ============================================================
// 26. 오프라인 상태 감지
// ============================================================
function updateOnlineStatus() {
    let banner = document.getElementById('offlineBanner');
    if (!banner) return;
    if (!navigator.onLine) {
        banner.classList.add('show');
        showTabStatus('tab-settings', '📡 오프라인 상태 - 변경사항이 GitHub에 동기화되지 않을 수 있습니다.', 'warning');
    } else {
        banner.classList.remove('show');
        if (settings.githubToken) {
            setTimeout(function() {
                uploadToGitHub(true);
            }, 2000);
        }
        if (pendingWorkUpload && settings.githubToken) {
            setTimeout(function() {
                let work = loadWorkFromLocalStorage();
                uploadWorkToGitHub(work).then(function(ok) {
                    if (ok) showTabStatus('tab-work', '✅ 오프라인 중 저장된 작업 기록이 업로드되었습니다.', 'ok');
                });
            }, 3000);
        }
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ============================================================
// 27. 엑셀 처리
// ============================================================
function parseCSVLine(line) {
    let result = [], current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        let ch = line[i];
        if (inQuotes) {
            if (ch === '"' && (i + 1 < line.length && line[i + 1] === '"')) {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current.trim());
    return result;
}

function handleFile(event) {
    let file = event.target.files[0];
    if (!file) return;
    processExcelFile(file);
    event.target.value = '';
}

async function processExcelFile(file) {
    let btn = document.querySelector('.btn-outline[onclick*="document.getElementById(\'fileInput\').click()"]');
    if (btn) btn.disabled = true;
    try {
        let resultDiv = document.getElementById('uploadResult');
        resultDiv.style.display = 'block';
        let ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
            let reader = new FileReader();
            reader.onload = function(e) {
                let text = e.target.result;
                let lines = text.split('\n').filter(function(l) { return l.trim(); });
                if (lines.length === 0) {
                    showUploadResult('❌ 데이터 없음', 'error');
                    return;
                }
                let header = parseCSVLine(lines[0]);
                let rows = [];
                for (let i = 1; i < lines.length; i++) {
                    let vals = parseCSVLine(lines[i]);
                    if (vals.length < 2) continue;
                    let row = {};
                    for (let j = 0; j < header.length; j++) {
                        row[header[j]] = vals[j] || '';
                    }
                    rows.push(row);
                }
                importPlaces(rows);
            };
            reader.readAsText(file, 'UTF-8');
            return;
        }
        if (ext === 'xlsx' || ext === 'xls') {
            let reader = new FileReader();
            reader.onload = function(e) {
                try {
                    let data = new Uint8Array(e.target.result);
                    let wb = XLSX.read(data, { type: 'array' });
                    let sheet = wb.Sheets[wb.SheetNames[0]];
                    let json = XLSX.utils.sheet_to_json(sheet);
                    importPlaces(json);
                } catch(error) {
                    showUploadResult('❌ 엑셀 읽기 오류: ' + error.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
            return;
        }
        showUploadResult('❌ 지원 안 함 (.csv, .xlsx, .xls)', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function importPlaces(data) {
    if (!data || data.length === 0) {
        showUploadResult('❌ 데이터 없음', 'error');
        return;
    }
    let added = 0, updated = 0, skipped = 0;
    let restKey = settings.kakaoRestKey || 'server-proxy'; // 서버가 실제 키 보유, 클라이언트는 게이트 통과용
    let rowsToGeocode = [];
    for (let i = 0; i < data.length; i++) {
        let row = data[i];
        let name = String(row['현장명'] || row['개소명'] || row['name'] || row['Name'] || '').trim();
let address = String(row['도로명주소'] || row['주소'] || row['address'] || row['Address'] || '').trim();
let remark = String(row['비고'] || row['remark'] || row['Remark'] || '').trim();
let dong = String(row['동정보'] || row['동'] || row['dong'] || '').trim();
        if (!name) continue;
        let normalized = normalizeName(name);
        let existing = places.find(function(p) { return normalizeName(p.name) === normalized; });
        if (existing) {
if (existing.address !== address || existing.remark !== remark || existing.dong !== dong) {
existing.address = address;
existing.remark = remark;
if (dong) existing.dong = dong;
                if (address && restKey) {
                    rowsToGeocode.push({ name: name, address: address, existing: existing });
                }
                updated++;
            } else {
                skipped++;
            }
        } else {
            let newPlace = {
id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
name: name,
address: address,
lat: 0,
lng: 0,
remark: remark,
dong: dong || '',
favorite: false
};
            places.push(newPlace);
            if (address && restKey) {
                rowsToGeocode.push({ name: name, address: address, existing: newPlace });
            }
            added++;
        }
    }
    if (rowsToGeocode.length > 0 && restKey) {
        showUploadResult('📍 ' + rowsToGeocode.length + '개 주소 변환 중...', 'info');
        await geocodeBatch(rowsToGeocode, restKey, 5, function(done, total) {
            showUploadResult('📍 주소 변환 중... ' + done + '/' + total, 'info');
        });
        for (let i = 0; i < rowsToGeocode.length; i++) {
    let item = rowsToGeocode[i];
    if (item.existing && item.geo) {
        item.existing.lat = item.geo.lat;
        item.existing.lng = item.geo.lng;
        item.existing.address = item.geo.address || item.existing.address;
        if (!item.existing.dong) {
            let dong = await extractDongFromCoords(item.geo.lat, item.geo.lng);
            if (!dong || dong === '기타') {
                dong = extractDongFromAddress(item.geo.address || '');
            }
            item.existing.dong = dong || '';
        }
    }
}
    }
   if (added > 0 || updated > 0) {
    savePlaces();
}
    showUploadResult('✅ 추가 ' + added + ', 업데이트 ' + updated + ', 건너뜀 ' + skipped, 'success');
    searchPlaces();
}

function showUploadResult(msg, type) {
    let el = document.getElementById('uploadResult');
    el.textContent = msg;
    el.style.display = 'block';
    let colors = { success: '#c6f6d5', error: '#fed7d7', warning: '#fefcbf', info: '#bee3f8' };
    el.style.background = colors[type] || colors.info;
}

async function exportData() {
    if (currentRegion && navigator.onLine) {
    try {
        const serverData = await serverGet(
            '/api/places?region=' +
            encodeURIComponent(currentRegion)
        );

        if (
            serverData &&
            Array.isArray(serverData.places)
        ) {
            places = serverData.places;

            localStorage.setItem(
                getStorageKey(currentRegion),
                JSON.stringify(places)
            );
        }
    } catch (e) {
        console.warn(
            '서버 최신 데이터 조회 실패. LOCAL 데이터로 내보냅니다.',
            e.message
        );
    }
}
let data = [];
if (places.length === 0) {
data = [
{ '현장명': '예시_현장명_1', '주소': '서울시 강남구 테헤란로 123', '위도': 0, '경도': 0, '비고': '', '동정보': '', '주소변환상태': '미변환' },
{ '현장명': '예시_현장명_2', '주소': '서울시 서초구 서초대로 456', '위도': 0, '경도': 0, '비고': '', '동정보': '', '주소변환상태': '미변환' },
{ '현장명': '예시_현장명_3', '주소': '서울시 종로구 종로 789', '위도': 0, '경도': 0, '비고': '', '동정보': '', '주소변환상태': '미변환' }
];
showTabStatus('tab-list', '📄 예시 양식이 다운로드됩니다.', 'info');
} else {
data = places.map(function(p) {
return {
'현장명': p.name,
'주소': p.address || '',
'위도': p.lat || 0,
'경도': p.lng || 0,
'비고': p.remark || '',
'동정보': p.dong || '',
'주소변환상태': (p.lat && p.lng && p.lat !== 0 && p.lng !== 0) ? '완료' : '미변환'
};
});
showTabStatus('tab-list', '✅ 내보내기 완료 (' + data.length + '개)', 'ok');
}
let wb = XLSX.utils.book_new();
let ws = XLSX.utils.json_to_sheet(data);
XLSX.utils.book_append_sheet(wb, ws, '현장리스트');
let now = new Date();
let timestamp = now.toISOString().slice(0,10) + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(now.getSeconds()).padStart(2,'0');
XLSX.writeFile(wb, '현장리스트_' + currentRegion + '_' + timestamp + '.xlsx');
}

// ============================================================
// 28. 날씨
// ============================================================
async function fetchWeather() {
    let weatherEl = document.getElementById('weatherDisplay');
    if (!weatherEl) return false;
    try {
        // OpenWeather 직접 호출 대신 노트북 서버의 /api/weather 프록시 경유 (키는 서버 config.json에만 존재)
        let center = (typeof userGpsCoords !== 'undefined' && userGpsCoords) ? userGpsCoords : getRegionCenter(currentRegion);
        let data = await serverGet('/api/weather?lat=' + center.lat + '&lng=' + center.lng);
        let temp = Math.round(data.main.temp);
        let icon = data.weather[0].icon;
        let main = data.weather[0].main;
        let mainMap = {
            'Clear': '☀️ 맑음',
            'Clouds': '☁️ 구름',
            'Rain': '🌧️ 비',
            'Drizzle': '🌦️ 이슬비',
            'Thunderstorm': '⛈️ 천둥번개',
            'Snow': '❄️ 눈',
            'Mist': '🌫️ 안개',
            'Fog': '🌫️ 안개',
            'Haze': '🌫️ 연무',
            'Smoke': '🌫️ 연기',
            'Dust': '🌫️ 먼지',
            'Sand': '🌫️ 모래'
        };
        let desc = mainMap[main] || '🌡️ ' + main;
        if (main === 'Clear' && icon === '01n') {
            desc = '🌙 맑음';
        }
        weatherEl.innerHTML = '<span style="font-size:13px;">' + desc + '</span><span class="temp" style="margin-left:4px;">' + temp + '°C</span>';
        return true;
    } catch (error) {
        weatherEl.innerHTML = '<span>⏳</span><span class="temp">--°C</span><span>날씨</span>';
        return false;
    }
}

async function showWeekWeather() {
    let existingModal = document.getElementById('weekWeatherModal');
    if (existingModal) {
        existingModal.remove();
        return;
    }
    await fetchWeather();
    let center = (typeof userGpsCoords !== 'undefined' && userGpsCoords) ? userGpsCoords : getRegionCenter(currentRegion);
    try {
        let data = await serverGet('/api/weather/forecast?lat=' + center.lat + '&lng=' + center.lng);

        let dailyMap = {};
        data.list.forEach(function(item) {
            let parts = item.dt_txt.split(' ');
            let date = parts[0];
            let hour = parseInt(parts[1].split(':')[0], 10);
            if (hour < 9 || hour > 18) return;
            if (!dailyMap[date]) {
                dailyMap[date] = { temps: [], icons: [], descs: [], mains: [], hours: [], date: date };
            }
            dailyMap[date].temps.push(item.main.temp);
            dailyMap[date].icons.push(item.weather[0].icon);
            dailyMap[date].descs.push(item.weather[0].description);
            dailyMap[date].mains.push(item.weather[0].main);
            dailyMap[date].hours.push(hour);
        });

        let dailyList = Object.values(dailyMap).slice(0, 5);

        let mainIconMap = {
            'Clear': '☀️', 'Clouds': '☁️', 'Rain': '🌧️',
            'Drizzle': '🌦️', 'Thunderstorm': '⛈️', 'Snow': '❄️',
            'Mist': '🌫️', 'Fog': '🌫️', 'Haze': '🌫️'
        };

        let modalHtml = '<div id="weekWeatherModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:9999;display:flex;justify-content:center;align-items:center;padding:20px;" onclick="this.remove()">';
        modalHtml += '<div style="background:white;border-radius:24px;padding:24px 20px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:80vh;overflow-y:auto;" onclick="event.stopPropagation()">';
        modalHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
        modalHtml += '<h3 style="font-size:18px;font-weight:700;color:#2d3748;">📅 5일 예보 (' + escapeHtml(currentRegion) + ')</h3>';
        modalHtml += '<button onclick="document.getElementById(\'weekWeatherModal\').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#a0aec0;">×</button>';
        modalHtml += '</div>';
        modalHtml += '<div style="font-size:11px;color:#718096;background:#f7fafc;border-radius:8px;padding:6px 10px;margin-bottom:12px;text-align:center;">🕘 활동시간 기준 · 오전 9시 ~ 오후 6시</div>';
        modalHtml += '<div style="display:flex;flex-direction:column;gap:10px;">';

        dailyList.forEach(function(day) {
            if (day.temps.length === 0) return;
            let minTemp = Math.round(Math.min.apply(null, day.temps));
            let maxTemp = Math.round(Math.max.apply(null, day.temps));
            let descCount = {};
            day.descs.forEach(function(d) { descCount[d] = (descCount[d] || 0) + 1; });
            let mainDesc = Object.keys(descCount).sort(function(a, b) { return descCount[b] - descCount[a]; })[0] || '';
            let iconCode = day.icons[0] || '01d';
            for (let i = 0; i < day.hours.length; i++) {
                if (day.hours[i] === 12) { iconCode = day.icons[i]; break; }
            }
            let iconEmoji = mainIconMap[day.mains[0]] || '🌡️';
            let dateObj = new Date(day.date + 'T00:00:00');
            let weekdays = ['일', '월', '화', '수', '목', '금', '토'];
            let dayLabel = weekdays[dateObj.getDay()] + '요일';
            let dateLabel = (dateObj.getMonth() + 1) + '/' + dateObj.getDate();
            modalHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f7fafc;border-radius:14px;border-left:4px solid #2563eb;">';
            modalHtml += '<div style="display:flex;align-items:center;gap:12px;min-width:80px;">';
            modalHtml += '<span style="font-size:22px;">' + iconEmoji + '</span>';
            modalHtml += '<div><div style="font-weight:600;font-size:14px;">' + dayLabel + '</div><div style="font-size:11px;color:#a0aec0;">' + dateLabel + '</div></div>';
            modalHtml += '</div>';
            modalHtml += '<div style="text-align:center;flex:1;"><span style="font-size:13px;color:#718096;">' + escapeHtml(mainDesc) + '</span></div>';
            modalHtml += '<div style="text-align:right;font-weight:700;font-size:15px;">' + maxTemp + '° <span style="color:#a0aec0;font-weight:400;">/</span> ' + minTemp + '°</div>';
            modalHtml += '</div>';
        });

        modalHtml += '</div>';
        modalHtml += '<div style="margin-top:14px;font-size:11px;color:#a0aec0;text-align:center;">* 오전 9시~오후 6시 기준 최저/최고 기온</div>';
        modalHtml += '</div></div>';
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        showTabStatus('tab-settings', '❌ 날씨 예보를 불러오지 못했습니다.', 'error');
    }
}
// ============================================================
// 29. Service Worker
// ============================================================
function getAppBasePath() {
    var path = window.location.pathname || '/';
    if (!path.endsWith('/')) path = path.substring(0, path.lastIndexOf('/') + 1);
    return path;
}

function getServiceWorkerUrl() {
    return getAppBasePath() + 'sw.js';
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var swUrl = getServiceWorkerUrl();
    navigator.serviceWorker.register(swUrl)
        .then(function(reg) {
            console.log('Service Worker registered:', swUrl);
            return reg.update();
        })
        .catch(function(err) {
            console.error('Service Worker registration failed:', err);
        });
}

function displayAppVersion() {
    var statusEl = document.getElementById('updateStatus');
    if (!statusEl) return;
    var swUrl = getServiceWorkerUrl();

    fetch(swUrl + '?v=' + Date.now(), { cache: 'no-store' })
        .then(function(response) {
            if (!response.ok) throw new Error('sw.js load failed: ' + response.status);
            return response.text();
        })
        .then(function(text) {
            var match = text.match(/CACHE_NAME\s*=\s*['"](.+)['"]/);
            if (match && match[1]) {
                var version = match[1];
                statusEl.innerHTML = '✅ 현재 버전: <strong>' + escapeHtml(version) + '</strong>';
                statusEl.style.color = '#38a169';
                localStorage.setItem('app_cache_name', version);
            } else {
                statusEl.innerHTML = '✅ 최신 버전입니다.';
                statusEl.style.color = '#38a169';
            }
        })
        .catch(function(err) {
            console.error('버전 확인 실패:', err);
            var cachedVersion = localStorage.getItem('app_cache_name');
            statusEl.innerHTML = cachedVersion
                ? '⚠️ 현재 버전: <strong>' + escapeHtml(cachedVersion) + '</strong>'
                : '⚠️ 버전 확인 실패';
            statusEl.style.color = '#d69e2e';
        });
}

async function checkForUpdates() {
    var statusEl = document.getElementById('updateStatus');
    if (!statusEl) return;

    if (!('serviceWorker' in navigator)) {
        statusEl.innerHTML = '⚠️ Service Worker를 지원하지 않는 브라우저입니다.';
        statusEl.style.color = '#e53e3e';
        return;
    }

    statusEl.innerHTML = '⏳ 업데이트 확인 중...';
    statusEl.style.color = '#d69e2e';

    try {
        var swUrl = getServiceWorkerUrl();
        var registration = await navigator.serviceWorker.getRegistration();
        if (!registration) registration = await navigator.serviceWorker.register(swUrl);

        await registration.update();

        var response = await fetch(swUrl + '?v=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error('sw.js 로드 실패: ' + response.status);

        var swText = await response.text();
        var match = swText.match(/CACHE_NAME\s*=\s*['"](.+)['"]/);

        if (match && match[1]) {
            var version = match[1];
            localStorage.setItem('app_cache_name', version);
            statusEl.innerHTML = '✅ 현재 버전: <strong>' + escapeHtml(version) + '</strong>';
            statusEl.style.color = '#38a169';
        } else {
            statusEl.innerHTML = '✅ 최신 버전입니다.';
            statusEl.style.color = '#38a169';
        }

        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'CHECK_UPDATE' });
        }
    } catch (err) {
        console.error('업데이트 확인 실패:', err);
        statusEl.innerHTML = '❌ 업데이트 확인 실패: ' + escapeHtml(err.message || String(err));
        statusEl.style.color = '#e53e3e';
    }
}

function forceUpdateApp() {
    let statusEl = document.getElementById('updateStatus');
    if (!statusEl) return;
    if (!('serviceWorker' in navigator)) {
        statusEl.innerHTML = '⚠️ Service Worker를 지원하지 않는 브라우저입니다.';
        statusEl.style.color = '#e53e3e';
        return;
    }
    statusEl.innerHTML = '⏳ 캐시 초기화 중... (3초 후 새로고침)';
    statusEl.style.color = '#d69e2e';
    
    navigator.serviceWorker.ready
        .then(function(registration) {
            return registration.update();
        })
        .then(function() {
            return caches.keys().then(function(cacheNames) {
                return Promise.all(
                    cacheNames.map(function(cacheName) {
                        return caches.delete(cacheName);
                    })
                );
            });
        })
        .then(function() {
            statusEl.innerHTML = '🔄 캐시 초기화 완료. 3초 후 새로고침됩니다...';
            statusEl.style.color = '#2b6cb0';
            setTimeout(function() {
                window.location.reload(true);
            }, 3000);
        })
        .catch(function(err) {
            statusEl.innerHTML = '❌ 캐시 초기화 실패: ' + err.message;
            statusEl.style.color = '#e53e3e';
        });
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', function() {
        let statusEl = document.getElementById('updateStatus');
        if (statusEl) {
            statusEl.innerHTML = '🔄 새 버전이 적용되었습니다. 페이지를 새로고침하세요.';
            statusEl.style.color = '#2b6cb0';
        }
    });
}

// ============================================================
// 30. 최적화 설정 모달
// ============================================================
function openOptimizeSettingsModal() {
    let modal = document.getElementById('optimizeSettingsModal');
    if (!modal) return;
    syncModalSettings();
    modal.classList.add('active');
}

function closeOptimizeSettingsModal() {
    let modal = document.getElementById('optimizeSettingsModal');
    if (modal) modal.classList.remove('active');
}

function syncModalSettings() {
    let nearest = document.getElementById('modalModeNearest');
    let farthest = document.getElementById('modalModeFarthest');
    if (optimizeMode === 'Nearest') {
        nearest.classList.add('active');
        farthest.classList.remove('active');
        nearest.querySelector('.choice-radio').textContent = '●';
        farthest.querySelector('.choice-radio').textContent = '○';
    } else {
        nearest.classList.remove('active');
        farthest.classList.add('active');
        nearest.querySelector('.choice-radio').textContent = '○';
        farthest.querySelector('.choice-radio').textContent = '●';
    }
    document.getElementById('modalModeInfo').textContent = '💡 현재 초기 경로: ' + (optimizeMode === 'Nearest' ? '가까운순' : '먼순');

    let cards = {
        distance: document.getElementById('modalMetricDistance'),
        time: document.getElementById('modalMetricTime'),
        balanced: document.getElementById('modalMetricBalanced')
    };
    Object.keys(cards).forEach(function(k) {
        let active = (k === routeObjective);
        cards[k].classList.toggle('active', active);
        let radio = cards[k].querySelector('input');
        if (radio) radio.checked = active;
        let mark = cards[k].querySelector('.metric-radio');
        if (mark) mark.textContent = active ? '●' : '○';
    });

    document.getElementById('modalUseRoadOptimization').checked = useRoadOptimization;
    document.getElementById('modalUseDirectionHint').checked = useDirectionHint;

    let apiKakaoRadio = document.querySelector('input[name="modalRouteApi"][value="kakao"]');
    let apiTmapRadio = document.querySelector('input[name="modalRouteApi"][value="tmap"]');
    let apiKakao = document.getElementById('modalApiKakao');
    let apiTmap = document.getElementById('modalApiTmap');
    
    if (routeApi === 'kakao') {
        if (apiKakaoRadio) apiKakaoRadio.checked = true;
        if (apiTmapRadio) apiTmapRadio.checked = false;
        apiKakao.classList.add('active');
        apiTmap.classList.remove('active');
        apiKakao.querySelector('.choice-radio').textContent = '●';
        apiTmap.querySelector('.choice-radio').textContent = '○';
    } else {
        if (apiKakaoRadio) apiKakaoRadio.checked = false;
        if (apiTmapRadio) apiTmapRadio.checked = true;
        apiKakao.classList.remove('active');
        apiTmap.classList.add('active');
        apiKakao.querySelector('.choice-radio').textContent = '○';
        apiTmap.querySelector('.choice-radio').textContent = '●';
    }
}

function setModalOptimizeMode(mode) {
    let nearest = document.getElementById('modalModeNearest');
    let farthest = document.getElementById('modalModeFarthest');
    if (mode === 'Nearest') {
        nearest.classList.add('active');
        farthest.classList.remove('active');
        nearest.querySelector('.choice-radio').textContent = '●';
        farthest.querySelector('.choice-radio').textContent = '○';
    } else {
        nearest.classList.remove('active');
        farthest.classList.add('active');
        nearest.querySelector('.choice-radio').textContent = '○';
        farthest.querySelector('.choice-radio').textContent = '●';
    }
    document.getElementById('modalModeInfo').textContent = '💡 현재 초기 경로: ' + (mode === 'Nearest' ? '가까운순' : '먼순');
    tempSettings.optimizeMode = mode;
}

function setModalRouteObjective(objective) {
    let cards = {
        distance: document.getElementById('modalMetricDistance'),
        time: document.getElementById('modalMetricTime'),
        balanced: document.getElementById('modalMetricBalanced')
    };
    Object.keys(cards).forEach(function(k) {
        let active = (k === objective);
        cards[k].classList.toggle('active', active);
        let radio = cards[k].querySelector('input');
        if (radio) radio.checked = active;
        let mark = cards[k].querySelector('.metric-radio');
        if (mark) mark.textContent = active ? '●' : '○';
    });
    tempSettings.routeObjective = objective;
}

function setModalRoadOptimization(enabled) {
    tempSettings.useRoadOptimization = enabled;
}

function setModalDirectionHint(enabled) {
    tempSettings.useDirectionHint = enabled;
}

function setModalRouteApi(api) {
    let apiKakao = document.getElementById('modalApiKakao');
    let apiTmap = document.getElementById('modalApiTmap');
    let apiKakaoRadio = document.querySelector('input[name="modalRouteApi"][value="kakao"]');
    let apiTmapRadio = document.querySelector('input[name="modalRouteApi"][value="tmap"]');
    
    if (api === 'kakao') {
        if (apiKakaoRadio) apiKakaoRadio.checked = true;
        if (apiTmapRadio) apiTmapRadio.checked = false;
        apiKakao.classList.add('active');
        apiTmap.classList.remove('active');
        apiKakao.querySelector('.choice-radio').textContent = '●';
        apiTmap.querySelector('.choice-radio').textContent = '○';
    } else {
        if (apiKakaoRadio) apiKakaoRadio.checked = false;
        if (apiTmapRadio) apiTmapRadio.checked = true;
        apiKakao.classList.remove('active');
        apiTmap.classList.add('active');
        apiKakao.querySelector('.choice-radio').textContent = '○';
        apiTmap.querySelector('.choice-radio').textContent = '●';
    }
    tempSettings.routeApi = api;
}

function saveOptimizeSettings() {
    if (tempSettings.optimizeMode !== undefined) setOptimizeMode(tempSettings.optimizeMode);
    if (tempSettings.routeObjective !== undefined) {
        routeObjective = tempSettings.routeObjective;
    }
    if (tempSettings.useRoadOptimization !== undefined) {
        useRoadOptimization = tempSettings.useRoadOptimization;
    }
    if (tempSettings.useDirectionHint !== undefined) {
        useDirectionHint = tempSettings.useDirectionHint;
    }
    if (tempSettings.routeApi !== undefined) {
        routeApi = tempSettings.routeApi;
        localStorage.setItem(ROUTE_API_KEY, routeApi);
    }
    tempSettings = {};
    closeOptimizeSettingsModal();
    updateOptimizationLiveSummary();
    showTabStatus('tab-places', '✅ 설정이 저장되었습니다.', 'ok');
}

// ============================================================
// 31. 최적화 라이브 요약 업데이트
// ============================================================
function updateOptimizationLiveSummary() {
    let text = document.getElementById('optimizationStatus');
    if (!text) return;
    let mode = (typeof optimizeMode !== 'undefined' && optimizeMode === 'Farthest') ? '먼순' : '가까운순';
    let objective = (typeof routeObjective !== 'undefined' && routeObjective === 'time') ? '최소시간'
        : (typeof routeObjective !== 'undefined' && routeObjective === 'balanced') ? '거리+시간 균형'
        : '최단거리';
    let road = (typeof useRoadOptimization === 'undefined' || useRoadOptimization) ? '실제 도로' : '직선거리 보완';
    let direction = (typeof useDirectionHint === 'undefined' || useDirectionHint) ? '방향 고려' : '방향 미고려';
    let api = (routeApi === 'tmap') ? 'TMap' : '카카오맵';
    text.textContent = mode + ' · ' + objective + ' · ' + road + ' · ' + direction + ' · ' + api;
}

// ============================================================
// 32. 지역 관리 팝업
// ============================================================
function updateRegionDisplay() {

    const display =
        document.getElementById(
            'regionDisplay'
        );

    const name =
        document.getElementById(
            'currentRegionName'
        );

    if (name) {
        name.textContent =
            currentRegion ||
            '지역 선택';
    }

    if (!display) return;

    if (
        isAuthorized() &&
        isMaster()
    ) {
        display.onclick =
            openRegionManager;

        display.style.cursor =
            'pointer';
    } else {
        display.onclick = null;

        display.style.cursor =
            'default';
    }
}

function selectRegionFromPopup(region) {
    if (!region) return;
    switchRegion(region);
    let modal = document.getElementById('regionManagerModal');
    if (modal) modal.remove();
}

function addRegionFromPopup() {
    let input = document.getElementById('newRegionInput');
    if (!input) return;
    let name = input.value.trim();
    if (!name) {
        showTabStatus('tab-settings', '⚠️ 지역명을 입력하세요.', 'warning');
        return;
    }
    let region = name.replace(/[\/\\:*?"<>|]/g, '');
    if (!region) {
        showTabStatus('tab-settings', '⚠️ 사용할 수 없는 지역명입니다.', 'warning');
        return;
    }
    let select = document.getElementById('regionSelect');
    if (!select) return;
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === region) {
            showTabStatus('tab-settings', '⚠️ 이미 존재하는 지역입니다.', 'warning');
            input.value = '';
            input.focus();
            return;
        }
    }
    let key = getStorageKey(region);
    localStorage.setItem(key, JSON.stringify([]));
    let opt = document.createElement('option');
    opt.value = region;
    opt.textContent = region;
    select.appendChild(opt);
    select.value = region;
    switchRegion(region);
    updateRegionDisplay();
    input.value = '';
    input.focus();
    showTabStatus('tab-settings', '✅ "' + region + '" 지역 추가됨', 'ok');
    let modal = document.getElementById('regionManagerModal');
    if (modal) modal.remove();
    openRegionManager();
}

function deleteRegionFromPopup() {
    let currentRegion = localStorage.getItem(SELECTED_REGION_KEY);
    if (!currentRegion) {
        showTabStatus('tab-settings', '⚠️ 삭제할 지역이 없습니다.', 'warning');
        return;
    }
    let select = document.getElementById('regionSelect');
    if (!select || select.options.length <= 1) {
        showTabStatus('tab-settings', '⚠️ 마지막 남은 지역은 삭제할 수 없습니다.', 'warning');
        return;
    }
    showConfirmModal(
        '🗑️ 지역 삭제',
        '"' + currentRegion + '" 지역을 삭제하시겠습니까?\n해당 지역의 모든 현장 데이터도 함께 삭제됩니다.',
        function() {
            let key = getStorageKey(currentRegion);
            localStorage.removeItem(key);
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === currentRegion) {
                    select.remove(i);
                    break;
                }
            }
            if (select.options.length > 0) {
                let newRegion = select.options[0].value;
                select.value = newRegion;
                switchRegion(newRegion);
            } else {
                select.innerHTML = '';
                let defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.textContent = '📍 지역 선택';
                defaultOpt.selected = true;
                defaultOpt.disabled = true;
                select.appendChild(defaultOpt);
                currentRegion = '';
                localStorage.removeItem(SELECTED_REGION_KEY);
                places = [];
                renderPlaces();
            }
            updateRegionDisplay();
            showTabStatus('tab-settings', '✅ "' + currentRegion + '" 지역 삭제됨', 'ok');
            let modal = document.getElementById('regionManagerModal');
            if (modal) modal.remove();
            openRegionManager();
        },
        function() {}
    );
}

function openRegionManager() {
    let existing = document.getElementById('regionManagerModal');
    if (existing) existing.remove();
    
    let regions = [];
    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
            let region = key.replace(STORAGE_KEY_PREFIX, '');
            if (region && !regions.includes(region)) {
                regions.push(region);
            }
        }
    }
    regions.sort();
    
    let currentRegion = localStorage.getItem(SELECTED_REGION_KEY) || '';
    let regionListHtml = '';
    
    if (regions.length === 0) {
        regionListHtml = '<div style="text-align:center;color:#a0aec0;padding:10px;">저장된 지역이 없습니다</div>';
    } else {
        regions.forEach(function(region) {
            let isActive = (region === currentRegion);
            regionListHtml += `
                <div class="region-item ${isActive ? 'active' : ''}" onclick="selectRegionFromPopup('${region}')" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    margin-bottom: 4px;
                    background: ${isActive ? '#ebf8ff' : '#f7fafc'};
                    border-radius: 6px;
                    cursor: pointer;
                    border-left: 3px solid ${isActive ? '#4f7eb3' : 'transparent'};
                    transition: all 0.2s;
                ">
                    <span style="font-weight: ${isActive ? '600' : '400'};">
                        ${isActive ? '📍 ' : ''}${region}
                    </span>
                    ${isActive ? '<span style="font-size:11px;color:#4f7eb3;font-weight:600;">현재</span>' : ''}
                </div>
            `;
        });
    }
    
    let modalHtml = `
        <div id="regionManagerModal" style="
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            animation: fadeIn 0.2s ease;
        " onclick="if(event.target===this) this.remove()">
            <div style="
                background: white;
                border-radius: 16px;
                padding: 24px;
                max-width: 380px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                max-height: 80vh;
                overflow-y: auto;
            " onclick="event.stopPropagation()">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 style="font-size:17px; font-weight:700; color:#1a202c; margin:0;">📍 지역 관리</h3>
                    <button onclick="document.getElementById('regionManagerModal').remove()" style="background:none; border:none; font-size:22px; cursor:pointer; color:#a0aec0;">&times;</button>
                </div>
                
                <div style="font-size:13px; color:#4a5568; margin-bottom:12px;">
                    현재: <strong id="popupCurrentRegion">${currentRegion || '선택 안 됨'}</strong>
                </div>
                
                <div style="margin-bottom:12px; max-height:250px; overflow-y:auto;">
                    ${regionListHtml}
                </div>
                
                <div style="display:flex; gap:8px; margin-top:8px; border-top:1px solid #e2e8f0; padding-top:12px;">
                    <input id="newRegionInput" type="text" placeholder="새 지역명 입력" 
                           style="flex:1; padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; font-size:13px;"
                           onkeydown="if(event.key==='Enter') addRegionFromPopup();">
                    <button class="btn btn-primary btn-sm" onclick="addRegionFromPopup()" 
                            style="padding:6px 14px; background:#4f7eb3; color:white; border:none; border-radius:8px; cursor:pointer;">추가</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteRegionFromPopup()" 
                            style="padding:6px 14px; background:#e53e3e; color:white; border:none; border-radius:8px; cursor:pointer;">삭제</button>
                </div>
                
                <div style="font-size:11px; color:#a0aec0; margin-top:8px; text-align:center;">
                    팝업을 닫으려면 배경을 클릭하세요
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    setTimeout(function() {
        let input = document.getElementById('newRegionInput');
        if (input) input.focus();
    }, 100);
}

// ============================================================
// 33. 검색 결과 팝업 외부 클릭 시 닫기
// ============================================================
document.addEventListener('click', function(event) {
    let startContainer = document.getElementById('startSearchResults');
    let startInput = document.getElementById('startPoint');
    if (startContainer && startContainer.style.display === 'block') {
        if (!startContainer.contains(event.target) && event.target !== startInput) {
            startContainer.style.display = 'none';
        }
    }
    
    let waypointContainer = document.getElementById('waypointSearchResults');
    let waypointInput = document.getElementById('waypointInput');
    if (waypointContainer && waypointContainer.style.display === 'block') {
        if (!waypointContainer.contains(event.target) && event.target !== waypointInput) {
            waypointContainer.style.display = 'none';
        }
    }
    
    let addrContainer = document.getElementById('addrSearchResults');
    let addrInput = document.getElementById('newPlaceAddr');
    if (addrContainer && addrContainer.style.display === 'block') {
        if (!addrContainer.contains(event.target) && event.target !== addrInput) {
            addrContainer.style.display = 'none';
        }
    }
});

// ============================================================
// 34. 카카오맵 장소 검색
// ============================================================
async function searchKakaoPlaces(query, size) {
    size = size || 5;
    let restKey = settings.kakaoRestKey || 'server-proxy'; // 서버가 실제 키 보유, 클라이언트는 게이트 통과용
    if (!query || query.length < 2 || !restKey) return [];
    try {
        let data = await serverGet('/api/places/search?q=' + encodeURIComponent(query) + '&size=' + size);
        return data.documents || [];
    } catch(e) {
        return [];
    }
}

// ============================================================
// 35. 키보드 네비게이션
// ============================================================
function handleStartKeydown(event) {
    let results = document.querySelectorAll('#startSearchResults .result-item');
    if (results.length === 0) return;
    let index = searchIndexState.selected || -1;
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        index = Math.min(index + 1, results.length - 1);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        index = Math.max(index - 1, -1);
    } else if (event.key === 'Enter' && index >= 0) {
        event.preventDefault();
        results[index].click();
        return;
    } else if (event.key === 'Escape') {
        document.getElementById('startSearchResults').style.display = 'none';
        index = -1;
    }
    searchIndexState.selected = index;
    for (let i = 0; i < results.length; i++) {
        results[i].style.background = i === index ? '#bee3f8' : '';
    }
}

function handleWaypointKeydown(event) {
    let results = document.querySelectorAll('#waypointSearchResults .result-item');
    if (results.length === 0) return;
    let index = searchIndexState.waypoint || -1;
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        index = Math.min(index + 1, results.length - 1);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        index = Math.max(index - 1, -1);
    } else if (event.key === 'Enter' && index >= 0) {
        event.preventDefault();
        results[index].click();
        return;
    } else if (event.key === 'Escape') {
        document.getElementById('waypointSearchResults').style.display = 'none';
        index = -1;
    }
    searchIndexState.waypoint = index;
    for (let i = 0; i < results.length; i++) {
        results[i].style.background = i === index ? '#bee3f8' : '';
    }
}

function handleAddrKeydown(event) {
    let results = document.querySelectorAll('#addrSearchResults .result-item');
    if (results.length === 0) return;
    let index = searchIndexState.addr || -1;
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        index = Math.min(index + 1, results.length - 1);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        index = Math.max(index - 1, -1);
    } else if (event.key === 'Enter' && index >= 0) {
        event.preventDefault();
        results[index].click();
        return;
    } else if (event.key === 'Escape') {
        document.getElementById('addrSearchResults').style.display = 'none';
        index = -1;
    }
    searchIndexState.addr = index;
    for (let i = 0; i < results.length; i++) {
        results[i].style.background = i === index ? '#bee3f8' : '';
    }
}

// ============================================================
// 36. 탭 스와이프
// ============================================================
(function() {
    let startX = 0, startY = 0, tracking = false;
    let validTabs = ['tab-places', 'tab-route', 'tab-list', 'tab-stats', 'tab-work', 'tab-settings', 'tab-help'];
    document.addEventListener('touchstart', function(e) {
        let target = e.target;
        // ★ 지도 영역과 입력 요소는 스와이프에서 제외
        if (target.closest('input, textarea, select, button, .bottom-tabs, #map, .waypoint-list, .route-item') || !e.touches || e.touches.length !== 1) {
            tracking = false; return;
        }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
    }, {passive:true});
    document.addEventListener('touchend', function(e) {
        if (!tracking || !e.changedTouches || !e.changedTouches.length) return;
        tracking = false;
        let dx = e.changedTouches[0].clientX - startX;
        let dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dy) >= Math.abs(dx) || Math.abs(dx) < 70 || Math.abs(dy) > 60) return;
        let activeTab = document.querySelector('.tab-content.active');
        if (!activeTab) return;
        let currentIndex = tabOrder.indexOf(activeTab.id);
        if (currentIndex < 0) return;
        let nextIndex = dx < 0 ? Math.min(currentIndex + 1, tabOrder.length - 1) : Math.max(currentIndex - 1, 0);
        if (nextIndex !== currentIndex) switchTab(tabOrder[nextIndex]);
    }, {passive:true});
})();

// ============================================================
// 37. 하단 탭 이벤트 및 초기화
// DOMContentLoaded 리스너를 하나만 유지하기 위해 38번 초기화에서 호출한다.
// ============================================================
function initializeBottomTabs() {
    let tabs = document.querySelectorAll('.bottom-tab');
    tabs.forEach(function(tab) {
        tab.removeEventListener('click', tab._clickHandler);
        let handler = function(e) {
            let tabId = this.getAttribute('data-tab');
            if (!tabId) {
                let onclickAttr = this.getAttribute('onclick');
                if (onclickAttr) {
                    let match = onclickAttr.match(/switchTab\(['"](.+)['"]\)/);
                    if (match) tabId = match[1];
                }
            }
            if (tabId) {
                switchTab(tabId);
            } else {
                console.warn('탭 ID를 찾을 수 없습니다.');
            }
        };
        tab.addEventListener('click', handler);
        tab._clickHandler = handler;
    });

    if (!localStorage.getItem(OPTIMIZE_MODE_KEY)) {
        localStorage.setItem(OPTIMIZE_MODE_KEY, 'Nearest');
    }
    optimizeMode = localStorage.getItem(OPTIMIZE_MODE_KEY) || 'Nearest';
    routeApi = localStorage.getItem(ROUTE_API_KEY) || 'kakao';
    updateOptimizationLiveSummary();

    let nav = document.querySelector('.bottom-tabs');
    if (nav) {
        nav.style.display = 'flex';
        nav.style.visibility = 'visible';
        nav.style.opacity = '1';
    }
    
    updateOnlineStatus();
}

// ============================================================
// 38. 초기화 실행
// ============================================================

document.addEventListener(
    'DOMContentLoaded',
    async function() {

        console.log(
            '[FieldPilot] 초기화 시작'
        );

        initializeBottomTabs();

        // --------------------------------------------------------
        // 1. 설정
        // --------------------------------------------------------

        loadSettings();
        await loadRuntimeConfiguration();

        // --------------------------------------------------------
        // 2. 인증 복구
        // --------------------------------------------------------

        const authorized =
            await restoreFieldPilotAuth();

        // --------------------------------------------------------
        // 3. 기본 UI
        // --------------------------------------------------------

        loadRegionList();

        loadPresets();

        initDarkMode();

        updateRegionDisplay();

        updateFeatureLockState();

        // --------------------------------------------------------
        // 4. 인증된 사용자만 서버 데이터 로드
        // --------------------------------------------------------

        if (
            authorized &&
            isAuthorized()
        ) {

            /*
             * 일반 사용자
             *
             * 인가코드에 연결된 지역을 강제로 사용
             */

            if (
                fieldPilotAuth.role !==
                'master'
            ) {

                currentRegion =
                    fieldPilotAuth.region;

                localStorage.setItem(
                    SELECTED_REGION_KEY,
                    currentRegion
                );
            }

            /*
             * 현장 목록 서버에서 로드
             */

            if (currentRegion) {

                console.log(
                    '[FieldPilot] 현장 목록 로드:',
                    currentRegion
                );

                try {

                    await loadPlacesFromServer(
                        currentRegion,
                        true
                    );

                } catch (error) {

                    console.error(
                        '[FieldPilot] 현장 목록 로드 실패:',
                        error
                    );
                }

            }

        } else {

            /*
             * 미인가 상태
             */

            currentRegion = '';

            places = [];

        }

        // --------------------------------------------------------
        // 5. UI 갱신
        // --------------------------------------------------------

        updateRegionDisplay();

        const sortSelect =
            document.getElementById(
                'sortPlaces'
            );

        if (sortSelect) {

            currentSort =
                sortSelect.value;

        }

        renderPlaces();

        renderWaypointList();

        updateOptimizationLiveSummary();

        updateStorageInfo();

        updateFeatureLockState();

        // --------------------------------------------------------
        // 6. 서비스워커
        // --------------------------------------------------------

        registerServiceWorker();

        setTimeout(
            displayAppVersion,
            1000
        );

        // --------------------------------------------------------
        // 7. 날씨
        // --------------------------------------------------------

        function initWeather() {

            if (
                weatherRetryCount >=
                MAX_WEATHER_RETRY
            ) {

                console.log(
                    '날씨 API 재시도 한도 도달. 10분 후 재시도.'
                );

                setTimeout(
                    function() {

                        weatherRetryCount = 0;

                        initWeather();

                    },
                    600000
                );

                return;
            }

            fetchWeather()
                .then(
                    function(success) {

                        if (!success) {

                            weatherRetryCount++;

                            setTimeout(
                                initWeather,
                                10000
                            );

                        } else {

                            weatherRetryCount = 0;

                        }

                    }
                );

        }

        setTimeout(
            initWeather,
            3000
        );

        if (weatherInterval) {

            clearInterval(
                weatherInterval
            );

        }

        weatherInterval =
            setInterval(
                function() {

                    weatherRetryCount = 0;

                    fetchWeather();

                },
                3600000
            );

        // --------------------------------------------------------
        // 8. 히스토리
        // --------------------------------------------------------

        initHistoryHash();

        // --------------------------------------------------------
        // 9. 도움말 이스터에그
        // --------------------------------------------------------

        const helpHeader =
            document.querySelector(
                '#tab-help .ux-tab-header'
            ) ||
            document.querySelector(
                '#tab-help h3'
            ) ||
            document.querySelector(
                '#tab-help h2'
            );

        if (helpHeader) {

            helpHeader.style.cursor =
                'pointer';

            helpHeader.addEventListener(
                'click',
                handleHelpEasterEgg
            );

        }

        console.log(
            '[FieldPilot] 초기화 완료'
        );

        initializeMapViewControls();
        refreshGlobalConnectionStatus();
        if (!window._fieldPilotStatusTimer) {
            window._fieldPilotStatusTimer = setInterval(refreshGlobalConnectionStatus, 30000);
        }

    }
);// ★★ DOMContentLoaded(38. 초기화 실행) 콜백을 닫는 괄호 — 반드시 필요합니다! ★★

// ============================================================
// 탭 진입 시 자동 동기화
// ============================================================
function autoSyncStats() {
    let now = Date.now();
    // 10초 이내 재진입 시 캐시 사용 (연속 클릭 방지)
    if (window._lastStatsSync && now - window._lastStatsSync < 10000) {
        renderStatsTab();
        return;
    }
    window._lastStatsSync = now;
    if (settings.githubToken && navigator.onLine) {
        refreshStatsFromGitHub();
    } else {
        renderStatsTab();
    }
}

function autoSyncWork() {
    let now = Date.now();
    if (window._lastWorkSync && now - window._lastWorkSync < 10000) {
        renderWorkTab();
        return;
    }
    window._lastWorkSync = now;
    if (settings.githubToken && navigator.onLine) {
        refreshWorkFromGitHub();
    } else {
        renderWorkTab();
    }
}
// ============================================================
// 39. 도우미 함수 (tab-status 표시)
// ============================================================
function showTabStatus(tabId, msg, type) {
    let statusEl = document.getElementById(tabId + 'Status');
    if (!statusEl) {
        let tabContent = document.getElementById(tabId);
        if (tabContent) {
            statusEl = document.createElement('div');
            statusEl.id = tabId + 'Status';
            statusEl.className = 'tab-status';
            tabContent.appendChild(statusEl);
        }
    }
    if (statusEl) {
        statusEl.textContent = msg;
        statusEl.className = 'tab-status show ' + (type || 'info');
        clearTimeout(statusEl._hideTimer);
        statusEl._hideTimer = setTimeout(function() {
            statusEl.classList.remove('show');
        }, 5000);
    }
}

// ===== 경로 요약 카드 초기화 (틀 방식) =====
function initRouteSummaryCard() {
    const navBtn = document.getElementById('nav-start-btn');
    
    if (navBtn) {
        // 기존 이벤트 제거 (중복 방지)
        const newNavBtn = navBtn.cloneNode(true);
        navBtn.parentNode.replaceChild(newNavBtn, navBtn);
        
        // ★ 경유지 연결 버튼 클릭 시 바로 스킴 실행 (드롭다운/패널 없음)
        newNavBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openMultiStopNavigation();
        });
    }
}

function renderOptimizedWaypoints() {
    if (!routeResult) return;
    
    const container = document.getElementById('optimized-waypoints-list');
    const badge = document.getElementById('selected-count-badge');
    const limitMsg = document.getElementById('nav-limit-msg');
    const navBtn = document.getElementById('nav-start-btn');
    const frameContainer = document.getElementById('waypoint-frame-container');
    
    if (!container) return;
    
    let { places: sorted, startPoint } = routeResult;
    const allPoints = [startPoint, ...sorted];
    const totalPoints = allPoints.length;
    
    // ★ 틀에 표시될 경유지 (frameStartIndex ~ frameEndIndex)
    const startIdx = Math.max(0, Math.min(frameStartIndex, totalPoints - 1));
    const endIdx = Math.min(frameEndIndex + 1, totalPoints);
    const displayPoints = allPoints.slice(startIdx, endIdx);
    const selectedCount = displayPoints.length;
    
    // 선택 개수 배지 업데이트
    if (badge) {
        badge.textContent = selectedCount;
    }
    
    // 버튼 텍스트 업데이트
    if (navBtn) {
        const apiLabel = routeApi === 'tmap' ? 'TMap' : '카카오내비';
        const icon = routeApi === 'tmap' ? '🚗' : '🗺️';
        navBtn.innerHTML = `${icon} 경유지 연결 (<span id="selected-count-badge">${selectedCount}</span>)`;
        navBtn.style.background = routeApi === 'tmap' ? '#0064d8' : '#fee500';
        navBtn.style.color = routeApi === 'tmap' ? 'white' : '#333';
        // 배지 재설정
        const newBadge = navBtn.querySelector('#selected-count-badge');
        if (newBadge) newBadge.textContent = selectedCount;
    }
    
    // 제한 메시지
    if (limitMsg) {
        if (selectedCount > 10) {
            limitMsg.textContent = `⚠️ 최대 10개까지 전달됩니다 (${selectedCount - 10}개 제외)`;
            limitMsg.style.color = '#e53e3e';
        } else {
            limitMsg.textContent = `✅ ${selectedCount}개 지점 선택됨`;
            limitMsg.style.color = 'var(--text-muted)';
        }
    }
    
    // ★ 틀 테두리 색상 (10개 초과 시 경고)
    if (frameContainer) {
        if (selectedCount > 10) {
            frameContainer.style.borderColor = '#e53e3e';
            frameContainer.style.borderStyle = 'solid';
        } else {
            frameContainer.style.borderColor = 'var(--primary-color)';
            frameContainer.style.borderStyle = 'dashed';
        }
    }
    
    // 경유지 목록 렌더링
    container.innerHTML = '';
    
    for (let i = 0; i < displayPoints.length; i++) {
        const p = displayPoints[i];
        const globalIndex = startIdx + i;
        const isStart = globalIndex === 0;
        
        const card = document.createElement('div');
        card.className = 'route-item';
        card.style.padding = '8px 10px';
        card.style.margin = '0';
        card.style.cursor = 'pointer';
        card.style.borderLeft = isStart ? '3px solid #4a5568' : '3px solid #4f7eb3';
        card.style.background = isStart ? 'rgba(74,85,104,0.08)' : 'var(--bg-secondary)';
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        card.style.gap = '8px';
        
        // 번호 배지
        const numBadge = document.createElement('span');
        numBadge.style.background = isStart ? '#4a5568' : '#4f7eb3';
        numBadge.style.color = 'white';
        numBadge.style.borderRadius = '50%';
        numBadge.style.width = '24px';
        numBadge.style.height = '24px';
        numBadge.style.display = 'flex';
        numBadge.style.alignItems = 'center';
        numBadge.style.justifyContent = 'center';
        numBadge.style.fontSize = '0.7rem';
        numBadge.style.fontWeight = 'bold';
        numBadge.style.flexShrink = '0';
        numBadge.innerHTML = isStart ? '🚩' : String(globalIndex);
        
        // 정보 영역
        const info = document.createElement('div');
        info.style.flex = '1';
        info.style.minWidth = '0';
        
        const name = document.createElement('div');
        name.style.fontWeight = '600';
        name.style.fontSize = '0.85rem';
        name.style.whiteSpace = 'nowrap';
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';
        name.textContent = p.name || '알 수 없는 위치';
        
        const addr = document.createElement('div');
        addr.style.fontSize = '0.7rem';
        addr.style.color = 'var(--text-muted)';
        addr.style.whiteSpace = 'nowrap';
        addr.style.overflow = 'hidden';
        addr.style.textOverflow = 'ellipsis';
        addr.textContent = p.address || '';
        
        info.appendChild(name);
        info.appendChild(addr);
        
        // 클릭하면 지도로 이동
        card.addEventListener('click', function() {
            focusMapOnPoint(p.lat, p.lng, 4);
        });
        
        card.appendChild(numBadge);
        card.appendChild(info);
        
        container.appendChild(card);
    }
    
    // ★ 틀 높이 자동 조절
    if (frameContainer) {
        const itemHeight = 52;
        const padding = 32;
        const maxHeight = Math.min(displayPoints.length * itemHeight + padding + 20, 350);
        const minHeight = 80;
        const newHeight = Math.max(minHeight, Math.min(maxHeight, 350));
        frameContainer.style.height = newHeight + 'px';
        container.style.maxHeight = (newHeight - padding) + 'px';
    }
}

function openMultiStopNavigation() {
    if (!routeResult) {
        showTabStatus('tab-route', '⚠️ 최적화된 경로가 없습니다.', 'warning');
        return;
    }
    
    const { places: sorted, startPoint } = routeResult;
    const allPoints = [startPoint, ...sorted];
    const totalPoints = allPoints.length;
    
    if (totalPoints < 2) {
        showTabStatus('tab-route', '⚠️ 최소 2개 이상의 지점이 필요합니다.', 'warning');
        return;
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    // ============================================================
    // 1. TMap 처리 (경유지 최대 10개 지원)
    // ============================================================
    if (routeApi === 'tmap') {
// ★ TMap: 경유지 미지원 → 출발지~도착지만 연결
const tStart = allPoints[0];
const tEnd = allPoints[allPoints.length - 1];
const schemeUrl = 'tmap://route?'
+ 'startX=' + tStart.lng
+ '&startY=' + tStart.lat
+ '&endX=' + tEnd.lng
+ '&endY=' + tEnd.lat;
const webUrl = 'https://apis-navi.tmap.co.kr/routes/'
+ tStart.lat + ',' + tStart.lng + '/' + tEnd.lat + ',' + tEnd.lng
+ '?name=' + encodeURIComponent(tStart.name + '→' + tEnd.name);
if (!isMobile) {
window.open(webUrl, '_blank');
showTabStatus('tab-route', '💻 PC 환경이므로 TMap 웹으로 연결합니다.', 'info');
return;
}
window.location.href = schemeUrl;
setTimeout(function() {
window.open(webUrl, '_blank');
}, 1500);
showTabStatus('tab-route', '🗺️ TMap 실행 중... (경유지 미지원, 출발→도착만)', 'warning');
return;
}

    // ============================================================
    // 2. 카카오맵 처리 (경유지 최대 5개 제한)
    // ============================================================
    if (routeApi === 'kakao') {
        const maxWaypoints = 5; // 카카오맵 앱 공식 제한
        const start = allPoints[0];
        const end = allPoints[allPoints.length - 1];
        const allWaypoints = allPoints.slice(1, -1); // 전체 중간 경유지
        
        // ★ 경유지 5개 초과 시 모달 표시
        if (allWaypoints.length > maxWaypoints) {
            showConfirmModal(
                '카카오맵 경유지 제한',
                '카카오맵 앱은 경유지를 최대 ' + maxWaypoints + '개까지만 지원합니다.\n\n' +
                '현재 경유지는 ' + allWaypoints.length + '개입니다.\n\n' +
                '• [확인]: 앞의 ' + maxWaypoints + '개 경유지만 잘라서 카카오맵으로 연결합니다.\n' +
                '• [취소]: 연결을 취소합니다.',
                function() {
                    // ★ 확인: 앞의 5개 경유지만 잘라서 카카오맵 앱 실행
                    const trimmedWaypoints = allWaypoints.slice(0, maxWaypoints);
                    openKakaoMapApp(start, end, trimmedWaypoints, isMobile, isIOS);
                    showTabStatus('tab-route', 
                        `🗺️ 카카오맵 실행 (경유지 ${trimmedWaypoints.length}개만 전달)`, 
                        'info');
                },
                function() {
                    // ★ 취소: 아무것도 안 함
                    showTabStatus('tab-route', 'ℹ️ 카카오맵 연결이 취소되었습니다.', 'info');
                }
            );
            return;
        }

        // ★ 경유지 5개 이하: 정상 실행
        openKakaoMapApp(start, end, allWaypoints, isMobile, isIOS);
        showTabStatus('tab-route', `🗺️ 카카오맵 실행 중... (총 ${allPoints.length}개 지점)`, 'info');
        return;
    }
}

// ============================================================
// 헬퍼 함수: 카카오맵 앱 실행 (출발지 + 경유지 + 도착지)
// ============================================================
function openKakaoMapApp(start, end, waypoints, isMobile, isIOS) {
// kakaomap://route 스킴: 경유지는 vp, vp2, vp3, vp4, vp5 (최대 5개)
let scheme = 'kakaomap://route?'
+ 'sp=' + start.lat + ',' + start.lng
+ '&ep=' + end.lat + ',' + end.lng
+ '&sname=' + encodeURIComponent(start.name)
+ '&dname=' + encodeURIComponent(end.name)
+ '&by=CAR';

// ★ 경유지: vp(1번째), vp2~vp5 (최대 5개) + 이름
for (let i = 0; i < waypoints.length && i < 5; i++) {
let prefix = (i === 0) ? 'vp' : ('vp' + (i + 1));
scheme += '&' + prefix + '=' + waypoints[i].lat + ',' + waypoints[i].lng;
scheme += '&' + prefix + 'n=' + encodeURIComponent(waypoints[i].name || '');
}

// ★ 웹 링크: 출발지 + 경유지 + 도착지 전부 포함
let webUrl = 'https://map.kakao.com/link/from/'
+ encodeURIComponent(start.name) + ',' + start.lat + ',' + start.lng;
for (let i = 0; i < waypoints.length && i < 5; i++) {
webUrl += '/' + encodeURIComponent(waypoints[i].name || '') + ',' + waypoints[i].lat + ',' + waypoints[i].lng;
}
webUrl += '/to/'
+ encodeURIComponent(end.name) + ',' + end.lat + ',' + end.lng;

if (!isMobile) {
window.open(webUrl, '_blank');
showTabStatus('tab-route', '💻 PC 환경이므로 카카오맵 웹으로 연결합니다.', 'info');
return;
}

// 모바일: 스킴 실행 시도 → 실패 시 웹 링크
window.location.href = scheme;
setTimeout(function() {
window.open(webUrl, '_blank');
}, 1500);
}

function initFrameDragHandlers() {
    const topHandle = document.getElementById('frame-handle-top');
    const bottomHandle = document.getElementById('frame-handle-bottom');
    const container = document.getElementById('waypoint-frame-container');
    const list = document.getElementById('optimized-waypoints-list');
    
    if (!topHandle || !bottomHandle || !container || !list) return;
    
    let startY = 0;
    let startHeight = 0;
    let isDragging = false;
    
    function onDragStart(e) {
        e.preventDefault();
        isDragging = true;
        startY = e.clientY || e.touches[0].clientY;
        startHeight = container.offsetHeight;
        container.style.borderStyle = 'solid';
        container.style.borderColor = '#3182ce';
    }
    
    function onDragMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const currentY = e.clientY || e.touches[0].clientY;
        const delta = currentY - startY;
        let newHeight = startHeight + delta;
        
        // 최소/최대 높이 제한
        newHeight = Math.max(80, Math.min(380, newHeight));
        
        container.style.height = newHeight + 'px';
        list.style.maxHeight = (newHeight - 36) + 'px';
        
        // 실시간 선택 업데이트
        updateFrameSelection();
    }
    
    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        container.style.borderStyle = 'dashed';
        container.style.borderColor = 'var(--primary-color)';
        updateFrameSelection();
        renderOptimizedWaypoints();
    }
    
    // 마우스 이벤트
    topHandle.addEventListener('mousedown', onDragStart);
    bottomHandle.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    
    // 터치 이벤트 (모바일)
    topHandle.addEventListener('touchstart', onDragStart, { passive: false });
    bottomHandle.addEventListener('touchstart', onDragStart, { passive: false });
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd, { passive: false });
}

function updateFrameSelection() {
    if (!routeResult) return;
    
    const container = document.getElementById('waypoint-frame-container');
    const list = document.getElementById('optimized-waypoints-list');
    if (!container || !list) return;
    
    const { places: sorted, startPoint } = routeResult;
    const allPoints = [startPoint, ...sorted];
    const totalPoints = allPoints.length;
    
    // 컨테이너 높이로 표시 가능한 항목 수 계산
    const containerHeight = container.offsetHeight;
    const itemHeight = 48; // 각 항목 높이 (px)
    const padding = 36;
    const visibleHeight = containerHeight - padding;
    const visibleCount = Math.max(1, Math.floor(visibleHeight / itemHeight));
    
    // ★ 프레임 시작 인덱스는 고정, 끝 인덱스만 조정
    const startIdx = frameStartIndex;
    const newEndIdx = Math.min(startIdx + visibleCount - 1, totalPoints - 1);
    
    if (newEndIdx !== frameEndIndex) {
        frameEndIndex = newEndIdx;
        renderOptimizedWaypoints();
    }
}
// ============================================================
// 40. 다크 모드
// ============================================================
const DARK_MODE_KEY = 'darkMode';

function applyDarkMode(isDark) {
    if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.classList.add('dark-mode');
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.body.classList.remove('dark-mode');
    }
    updateDarkModeButton();
}

function toggleDarkMode() {
    let current = document.body.classList.contains('dark-mode');
    let newValue = !current;
    localStorage.setItem(DARK_MODE_KEY, newValue ? 'on' : 'off');
    applyDarkMode(newValue);
}

function updateDarkModeButton() {
    let btn = document.getElementById('darkModeToggleBtn');
    if (!btn) return;
    let isDark = document.body.classList.contains('dark-mode');
    // 이모지만 표시 (텍스트 없음)
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.title = isDark ? '라이트 모드로 전환' : '다크 모드로 전환';
}
function injectDarkModeCSS() {
    if (document.getElementById('dark-mode-css')) return;
    let style = document.createElement('style');
    style.id = 'dark-mode-css';
    let c = [];
    // 기본
    c.push('body.dark-mode{--bg-primary:#1a202c;--bg-secondary:#2d3748;--bg-tertiary:#374151;--bg-hover:#3f4b5d;--bg-active:#2a4365;--text-primary:#f7fafc;--text-secondary:#cbd5e0;--text-muted:#cbd5e0;--text-placeholder:#a0aec0;--border-color:#4a5568;--border-light:#374151;--primary-color:#63b3ed;--primary-hover:#90cdf4;--success-color:#68d391;--success-hover:#9ae6b4;--danger-color:#fc8181;--danger-hover:#feb2b2;--warning-color:#fbd38d;--purple-color:#d6bcfa;--summary-bg:linear-gradient(135deg,#2a4365,#2d3748);--map-bg:#374151;--tab-icon-color:#cbd5e0;--fav-inactive:#a0aec0;background:#1a202c!important;color:#e2e8f0!important}');
    c.push('body.dark-mode h1,body.dark-mode h2,body.dark-mode h3,body.dark-mode h4,body.dark-mode h5{color:#f7fafc!important}');
    c.push('body.dark-mode p,body.dark-mode label,body.dark-mode span,body.dark-mode div,body.dark-mode li{color:#e2e8f0}');
    c.push('body.dark-mode a{color:#63b3ed!important}');
    // 헤더
    c.push('body.dark-mode .header{background:linear-gradient(135deg,#2d3748,#1a202c)!important}');
    c.push('body.dark-mode #weatherDisplay{background:rgba(255,255,255,0.1)!important;color:#e2e8f0!important}');
    c.push('body.dark-mode #regionDisplay{background:rgba(255,255,255,0.1)!important;color:#e2e8f0!important}');
    c.push('body.dark-mode #startInfo{color:#a0aec0!important}');
    // 탭 헤더 통일
    c.push('body.dark-mode .ux-tab-title{color:#f7fafc!important}');
    c.push('body.dark-mode .ux-tab-sub{color:#a0aec0!important}');
    c.push('body.dark-mode .ux-tab-icon{background:#2d3748!important;color:#63b3ed!important}');
    c.push('body.dark-mode #tab-stats .ux-tab-icon{background:#2c5282!important;color:#bee3f8!important}');
    c.push('body.dark-mode #tab-work .ux-tab-icon{background:#276749!important;color:#c6f6d5!important}');
    c.push('body.dark-mode #tab-list .ux-tab-icon{background:#22543d!important;color:#c6f6d5!important}');
    c.push('body.dark-mode #tab-settings .ux-tab-icon{background:#44337a!important;color:#e9d8fd!important}');
    c.push('body.dark-mode #tab-help .ux-tab-icon{background:#7b341e!important;color:#feebc8!important}');
    // 탭 콘텐츠
    c.push('body.dark-mode .tab-content{background:#1a202c!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .card{background:#2d3748!important;border-color:#4a5568!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .card-title{color:#f7fafc!important}');
    // 하단 탭
    c.push('body.dark-mode .bottom-tabs{background:#2d3748!important;border-top-color:#4a5568!important}');
    c.push('body.dark-mode .bottom-tab{color:#a0aec0!important}');
    c.push('body.dark-mode .bottom-tab.active{color:#63b3ed!important;background:rgba(99,179,237,0.1)!important}');
    // 입력 요소
    c.push('body.dark-mode input,body.dark-mode textarea,body.dark-mode select{background:#2d3748!important;color:#e2e8f0!important;border-color:#4a5568!important}');
    c.push('body.dark-mode input::placeholder,body.dark-mode textarea::placeholder{color:#a0aec0!important;opacity:1}');
    c.push('body.dark-mode input:focus,body.dark-mode textarea:focus,body.dark-mode select:focus{border-color:#63b3ed!important}');
    // 버튼
    c.push('body.dark-mode .btn{background:#4a5568!important;color:#e2e8f0!important;border-color:#718096!important}');
    c.push('body.dark-mode .btn-primary{background:#2b6cb0!important;color:#fff!important;border-color:#63b3ed!important}');
    c.push('body.dark-mode .btn-success{background:#276749!important;color:#fff!important;border-color:#68d391!important}');
    c.push('body.dark-mode .btn-danger{background:#c53030!important;color:#fff!important;border-color:#fc8181!important}');
    c.push('body.dark-mode .btn-outline{background:transparent!important;color:#cbd5e0!important;border-color:#4a5568!important}');
    // 리스트
    c.push('body.dark-mode .place-item{background:#2d3748!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .place-item:hover{background:#3a4556!important}');
    c.push('body.dark-mode .place-item .name{color:#f7fafc!important}');
    c.push('body.dark-mode .place-item .addr,body.dark-mode .addr{color:#a0aec0!important}');
    c.push('body.dark-mode .route-item{background:#2d3748!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .route-item:hover{background:#3a4556!important}');
    c.push('body.dark-mode .route-item .name{color:#f7fafc!important}');
    c.push('body.dark-mode .route-start{background:rgba(74,85,104,0.4)!important}');
    c.push('body.dark-mode .result-item{background:#2d3748!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .result-item:hover{background:#3a4556!important}');
    c.push('body.dark-mode .result-info{color:#e2e8f0!important}');
    c.push('body.dark-mode .source{background:#4a5568!important;color:#cbd5e0!important}');
    c.push('body.dark-mode .remark{background:#4a5568!important;color:#cbd5e0!important}');
    c.push('body.dark-mode .empty-msg{color:#cbd5e0!important}');
    c.push('body.dark-mode .waypoint-list li{background:#2d3748!important;color:#e2e8f0!important}');
    // 배지
    c.push('body.dark-mode .badge{background:#4a5568!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .badge-ok{background:#276749!important;color:#c6f6d5!important}');
    c.push('body.dark-mode .badge-wait{background:#744210!important;color:#fefcbf!important}');
    c.push('body.dark-mode .badge-fail{background:#9b2c2c!important;color:#fed7d7!important}');
    // 요약
    c.push('body.dark-mode .summary{background:linear-gradient(135deg,#2d3748,#1a202c)!important}');
    c.push('body.dark-mode .summary-row .label{color:#a0aec0!important}');
    c.push('body.dark-mode .summary-row .value{color:#f7fafc!important}');
    c.push('body.dark-mode #placeCount,body.dark-mode #totalDistance,body.dark-mode #totalTime,body.dark-mode #optimizeMode{color:#f7fafc!important}');
    c.push('body.dark-mode #savedAmount{color:#68d391!important}');
    c.push('body.dark-mode #optimizationStatus{color:#a0aec0!important}');
    c.push('body.dark-mode #modeStatus{color:#a0aec0!important}');
    // 프리셋
    c.push('body.dark-mode .preset-item{background:#2d3748!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .preset-item:hover{background:#3a4556!important}');
    c.push('body.dark-mode .preset-name{color:#f7fafc!important}');
    c.push('body.dark-mode .preset-detail{color:#a0aec0!important}');
    c.push('body.dark-mode .preset-delete{color:#fc8181!important}');
    // 설정
    c.push('body.dark-mode .setting-group{background:#2d3748!important}');
    c.push('body.dark-mode .setting-group h4{color:#f7fafc!important}');
    c.push('body.dark-mode .commit-item{background:#2d3748!important;color:#e2e8f0!important;border-color:#4a5568!important}');
    c.push('body.dark-mode .commit-msg{color:#f7fafc!important}');
    c.push('body.dark-mode .commit-date{color:#a0aec0!important}');
    c.push('body.dark-mode .restore-btn{background:#3182ce!important;color:#fff!important}');
    c.push('body.dark-mode #storageInfo{color:#a0aec0!important}');
    c.push('body.dark-mode #uploadResult{color:#1a202c!important}');
    c.push('body.dark-mode .region-item{background:#2d3748!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .region-item.active{background:#2c5282!important;color:#ebf8ff!important}');
    // 통계
    c.push('body.dark-mode #statsContent{color:#e2e8f0!important}');
    c.push('body.dark-mode .stats-period-btn{background:#4a5568!important;color:#e2e8f0!important;border-color:#718096!important}');
    c.push('body.dark-mode .stats-period-btn.active{background:#3182ce!important;color:#fff!important}');
    // 작업 기록
    c.push('body.dark-mode #workCalendar{color:#e2e8f0!important}');
    c.push('body.dark-mode #workDateDetail{color:#e2e8f0!important}');
    c.push('body.dark-mode #workWorkerDisplay{color:#a0aec0!important}');
    c.push('body.dark-mode .work-calendar-day{background:#2d3748!important;border-color:#4a5568!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .work-calendar-day:hover{background:#3a4556!important;border-color:#718096!important}');
    c.push('body.dark-mode .work-calendar-day.is-today{background:#2a4365!important;border-color:#63b3ed!important}');
    c.push('body.dark-mode .work-calendar-day.is-selected{background:#2c5282!important;border-color:#90cdf4!important;box-shadow:0 0 0 2px rgba(144,205,244,.38)!important}');
    c.push('body.dark-mode .work-calendar-day.is-sunday>div:first-child{color:#feb2b2!important}');
    c.push('body.dark-mode .work-calendar-day.is-saturday>div:first-child{color:#90cdf4!important}');
    c.push('body.dark-mode .work-calendar-day>div[style*="color:#3182ce"]{color:#90cdf4!important}');
    c.push('body.dark-mode .work-date-selection{background:#2c5282!important;border-color:#63b3ed!important;color:#ebf8ff!important}');
    // 상태
    c.push('body.dark-mode .tab-status{background:#2d3748!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .tab-status.ok,body.dark-mode .tab-status.success{background:#276749!important;color:#c6f6d5!important}');
    c.push('body.dark-mode .tab-status.error{background:#9b2c2c!important;color:#fed7d7!important}');
    c.push('body.dark-mode .tab-status.warning{background:#744210!important;color:#fefcbf!important}');
    c.push('body.dark-mode .tab-status.info{background:#2c5282!important;color:#bee3f8!important}');
    c.push('body.dark-mode #offlineBanner{background:#9b2c2c!important;color:#fed7d7!important}');
    // 지도
    c.push('body.dark-mode #map{filter:brightness(.72) contrast(1.16) saturate(.78)}');
    c.push('body.dark-mode #lunchGameModal .lunch-game-panel{background:#2d3748!important;color:#e2e8f0!important}');
    c.push('body.dark-mode #lunchGameModal h3{color:#f7fafc!important}');
    c.push('body.dark-mode #lunchGameModal select{background:#1a202c!important;color:#f7fafc!important;border-color:#4a5568!important}');
    c.push('body.dark-mode #lunchGameModal .lunch-restaurant-item{background:#1a202c!important;border-color:#48bb78!important}');
    c.push('body.dark-mode #lunchGameModal .lunch-restaurant-item div{color:#e2e8f0!important}');
    // 모달
    c.push('body.dark-mode .modal{background:#2d3748!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .modal h3{color:#f7fafc!important}');
    c.push('body.dark-mode #confirmModal>div,body.dark-mode #promptModal>div,body.dark-mode #customRegionModal>div,body.dark-mode #customPresetModal>div,body.dark-mode #regionManagerModal>div,body.dark-mode #weekWeatherModal>div,body.dark-mode #addPlaceModal>div,body.dark-mode #modal>div,body.dark-mode #optimizeSettingsModal>div,body.dark-mode #workEditModal>div,body.dark-mode #workAddModal>div,body.dark-mode #categoryManagerModal>div,body.dark-mode #exitConfirmModal>div,body.dark-mode #regionSelectModal>div{background:#2d3748!important;color:#e2e8f0!important}');
    c.push('body.dark-mode #confirmModal h3,body.dark-mode #promptModal h3,body.dark-mode #modal h3,body.dark-mode #optimizeSettingsModal h3,body.dark-mode #addPlaceModal h3,body.dark-mode #workEditModal h3,body.dark-mode #workAddModal h3,body.dark-mode #categoryManagerModal h3,body.dark-mode #exitConfirmModal h3,body.dark-mode #regionManagerModal h3,body.dark-mode #weekWeatherModal h3,body.dark-mode #regionSelectModal h3{color:#f7fafc!important}');
    c.push('body.dark-mode #confirmModal p,body.dark-mode #promptModal p,body.dark-mode #exitConfirmModal p{color:#cbd5e0!important}');
    c.push('body.dark-mode #exitCancelBtn{background:#4a5568!important;color:#e2e8f0!important;border-color:#718096!important}');
    c.push('body.dark-mode #exitConfirmBtn{background:#e53e3e!important;color:#fff!important}');
    // 아이콘
    c.push('body.dark-mode .fav.active{color:#ecc94b!important}');
    c.push('body.dark-mode .fav.inactive{color:#718096!important}');
    c.push('body.dark-mode .idx{color:#fff!important}');
    c.push('body.dark-mode .drag-handle{color:#a0aec0!important}');
    c.push('body.dark-mode .remove{color:#fc8181!important}');
    // 도움말
    c.push('body.dark-mode #tab-help{background:#1a202c!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .help-section{border-color:#4a5568!important}');
    c.push('body.dark-mode .help-title{color:#63b3ed!important}');
    c.push('body.dark-mode .help-body{color:#cbd5e0!important}');
    c.push('body.dark-mode .help-first-card{background:linear-gradient(135deg,#2a4365,#22543d)!important;border-color:#4a5568!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .help-step{border-color:#4a5568!important;color:#e2e8f0!important}');
    c.push('body.dark-mode .help-step-number{background:#2b6cb0!important;color:#fff!important}');
    c.push('body.dark-mode .help-jump{background:#2c5282!important;color:#ebf8ff!important;border-color:#63b3ed!important}');
    c.push('body.dark-mode #darkModeToggleBtn{color:#f7fafc!important}');
    c.push('body.dark-mode #updateStatus{color:#9ae6b4!important}');
    c.push('body.dark-mode #settingsServerStatus,body.dark-mode #settingsGithubStatus,body.dark-mode #settingsKakaoStatus,body.dark-mode #settingsAppVersion{color:#f7fafc!important}');
    // ★ 인라인 스타일 커버 (글씨 안 보이는 핵심 원인)
    const darkInlineRules = [
        ['background', ['#f7fafc', '#fff', 'white', '#ffffff'], '#2d3748'],
        ['background', ['#ebf8ff', '#eff6ff', '#bee3f8'], '#2a4365'],
        ['background', ['#fff5f5', '#fed7d7'], '#742a2a'],
        ['background', ['#f0fff4', '#f0fdf4', '#c6f6d5'], '#22543d'],
        ['background', ['#fffff0', '#fefcbf', '#fffbeb'], '#4a3b16'],
        ['background', ['#faf5ff', '#f5f3ff'], '#44337a'],
        ['background', ['#edf2f7', '#e2e8f0'], '#374151'],
        ['background', ['#f8fafc'], '#273244'],
        ['background', ['#fffaf0', '#fff7ed'], '#4a3520'],
        ['background', ['#3182ce', '#2563eb', '#4f7eb3'], '#2b6cb0'],
        ['background', ['#38a169', '#5a9e6f'], '#276749'],
        ['background', ['#e53e3e'], '#c53030'],
        ['background', ['#FF6B6B'], '#9b2c2c'],
        ['background', ['#FF9F43'], '#9c4221'],
        ['background', ['#FECA57'], '#744210'],
        ['color', ['#4a5568', '#718096', '#a0aec0'], '#cbd5e0'],
        ['color', ['#2d3748', '#1a202c', '#1f2937'], '#f7fafc'],
        ['color', ['#276749', '#22543d', '#16a34a', '#38a169'], '#9ae6b4'],
        ['color', ['#975a16', '#744210', '#d69e2e', '#ea580c'], '#fbd38d'],
        ['color', ['#2b6cb0', '#2c5282', '#3182ce', '#2563eb', '#4f7eb3'], '#90cdf4'],
        ['color', ['#9b2c2c', '#c53030', '#e53e3e'], '#feb2b2'],
        ['color', ['#7c3aed', '#667eea'], '#d6bcfa']
    ];
    darkInlineRules.forEach(([property, values, replacement]) => {
        values.forEach(value => {
            c.push('body.dark-mode [style*="' + property + ':' + value + '"],body.dark-mode [style*="' + property + ': ' + value + '"]{' + property + ':' + replacement + '!important}');
        });
    });
    ['border-color:#e2e8f0', 'border:1px solid #e2e8f0', 'border-top:1px solid #e2e8f0', 'border:2px solid #e2e8f0', 'border:1px dashed #cbd5e0'].forEach(rule => {
        c.push('body.dark-mode [style*="' + rule + '"],body.dark-mode [style*="' + rule.replace(':', ': ') + '"]{border-color:#4a5568!important}');
    });
    // 검색 결과
    c.push('body.dark-mode .search-results{background:#2d3748!important;border-color:#4a5568!important}');
    // 선택 카드 (최적화 설정 모달)
    c.push('body.dark-mode .choice-card,body.dark-mode .metric-card{background:#2d3748!important;border-color:#4a5568!important}');
    c.push('body.dark-mode .choice-card.active,body.dark-mode .metric-card.active{background:#2c5282!important;border-color:#3182ce!important}');
    c.push('body.dark-mode .choice-content strong,body.dark-mode .metric-content strong{color:#f7fafc!important}');
    c.push('body.dark-mode .choice-content small,body.dark-mode .metric-content small{color:#a0aec0!important}');
    c.push('body.dark-mode .selection-hint{background:#2d3748!important;color:#cbd5e0!important}');
    c.push('body.dark-mode .advanced-options{background:#2d3748!important;border-color:#4a5568!important}');
    c.push('body.dark-mode .switch-text strong{color:#f7fafc!important}');
    c.push('body.dark-mode .switch-text small{color:#a0aec0!important}');
    c.push('body.dark-mode details,body.dark-mode summary,body.dark-mode table,body.dark-mode th,body.dark-mode td{background-color:#2d3748!important;color:#e2e8f0!important;border-color:#4a5568!important}');
    c.push('body.dark-mode pre,body.dark-mode code{background:#1a202c!important;color:#bee3f8!important;border-color:#4a5568!important}');
    c.push('body.dark-mode hr{border-color:#4a5568!important}');
    // 기타
    c.push('body.dark-mode #darkModeToggleBtn:hover{background:rgba(255,255,255,0.1)!important}');
    c.push('body.dark-mode .dist{color:inherit!important}');
    style.textContent = c.join(' ');
    document.head.appendChild(style);
}
function addDarkModeToggleToHeader() {
    // 날씨 표시 요소(#weatherDisplay) 바로 옆에 배치
    let weatherEl = document.getElementById('weatherDisplay');
    if (!weatherEl) return;
    
    // 이미 버튼이 있으면 중복 생성 방지
    if (document.getElementById('darkModeToggleBtn')) return;

    let btn = document.createElement('button');
    btn.id = 'darkModeToggleBtn';
    btn.type = 'button';
    btn.title = '다크 모드 전환';
    btn.style.cssText = 'background:transparent; border:none; font-size:1.1rem; cursor:pointer; padding:2px 6px; margin-left:4px; border-radius:4px; transition:background 0.2s; vertical-align:middle; line-height:1;';
    btn.addEventListener('click', toggleDarkMode);
    btn.addEventListener('mouseenter', function() {
        this.style.background = document.body.classList.contains('dark-mode') 
            ? 'rgba(255,255,255,0.1)' 
            : 'rgba(0,0,0,0.05)';
    });
    btn.addEventListener('mouseleave', function() {
        this.style.background = 'transparent';
    });
    
    // 날씨 요소 바로 다음에 삽입
    weatherEl.parentNode.insertBefore(btn, weatherEl.nextSibling);
    updateDarkModeButton();
}

function initDarkMode() {
    injectDarkModeCSS();
    let saved = localStorage.getItem(DARK_MODE_KEY);
    let isDark = false;
    if (saved === 'on') {
        isDark = true;
    } else if (saved === 'off') {
        isDark = false;
    } else {
        // 시스템 설정 따르기
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            isDark = true;
        }
    }
    applyDarkMode(isDark);
    
    // ★ 설정 탭이 아닌 헤더에 추가
    addDarkModeToggleToHeader();
    
    // 시스템 테마 변경 감지
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            let saved = localStorage.getItem(DARK_MODE_KEY);
            if (!saved) {
                applyDarkMode(e.matches);
            }
        });
    }
}

// ============================================================
// 초기 로드 시 URL 해시에 맞춰 탭 설정
// ============================================================
function initHistoryHash() {
    let validTabs = ['tab-places', 'tab-route', 'tab-list', 'tab-stats', 'tab-work', 'tab-settings', 'tab-help'];
    let initialHash = window.location.hash.replace('#', '');
    
    if (initialHash && validTabs.includes(initialHash) && document.getElementById(initialHash)) {
        switchTab(initialHash, false);
    } else {
        history.replaceState({ tab: 'tab-places' }, '', '#tab-places');
    }
}

// ============================================================
// 41. 브라우저 뒤로가기/앞으로가기 지원 (History API)
// ============================================================
window.addEventListener('popstate', function(event) {
    isPopState = true;
    
    // ★ state가 있고 tab 정보가 있으면 해당 탭으로 이동
    if (event.state && event.state.tab) {
        switchTab(event.state.tab, false);
        isPopState = false;
        return;
    }
    
    // ★ state가 없거나 tab 정보가 없으면 → 첫 화면에서 뒤로가기
    // 현재 활성화된 탭 확인
    let currentTab = document.querySelector('.tab-content.active');
    let currentTabId = currentTab ? currentTab.id : 'tab-places';
    
    // ★ 종료 확인 모달 표시
    showExitConfirmModal(function() {
        // [확인] 클릭 → 앱 종료 시도
        tryCloseApp();
    }, function() {
        // [취소] 클릭 → 현재 탭으로 다시 push (뒤로가기 스택 복구)
        history.pushState({ tab: currentTabId }, '', '#' + currentTabId);
    });
    
    isPopState = false;
});

// ============================================================
// 앱 종료 확인 모달
// ============================================================
function showExitConfirmModal(onConfirm, onCancel) {
    let existing = document.getElementById('exitConfirmModal');
    if (existing) existing.remove();
    
    let modalHtml = `
        <div id="exitConfirmModal" style="
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            animation: fadeIn 0.2s ease;
        ">
            <div style="
                background: white;
                border-radius: 16px;
                padding: 24px;
                max-width: 360px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                text-align: center;
            ">
                <div style="font-size:48px; margin-bottom:12px;">👋</div>
                <h3 style="font-size:17px; font-weight:700; color:#1a202c; margin-bottom:8px;">
                    앱을 종료하시겠습니까?
                </h3>
                <p style="font-size:14px; color:#4a5568; margin-bottom:20px; line-height:1.6;">
                    확인을 누르면 앱이 종료됩니다.<br>
                    취소을 누르면 계속 이용하실 수 있습니다.
                </p>
                <div style="display:flex; gap:8px; justify-content:center;">
                    <button id="exitCancelBtn" style="
                        padding:10px 24px; 
                        border:1px solid #cbd5e0; 
                        border-radius:8px; 
                        background:white; 
                        color:#4a5568;
                        font-size:14px;
                        font-weight:600;
                        cursor:pointer;
                        min-width:80px;
                    ">취소</button>
                    <button id="exitConfirmBtn" style="
                        padding:10px 24px; 
                        background:#e53e3e; 
                        color:white; 
                        border:none; 
                        border-radius:8px; 
                        font-size:14px;
                        font-weight:600;
                        cursor:pointer;
                        min-width:80px;
                    ">확인</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.getElementById('exitConfirmBtn').addEventListener('click', function() {
        document.getElementById('exitConfirmModal').remove();
        if (typeof onConfirm === 'function') onConfirm();
    });
    
    document.getElementById('exitCancelBtn').addEventListener('click', function() {
        document.getElementById('exitConfirmModal').remove();
        if (typeof onCancel === 'function') onCancel();
    });
}

// ============================================================
// 앱 종료 시도
// ============================================================
function tryCloseApp() {
    // 1차 시도: window.close()
    try {
        window.close();
    } catch(e) {}
    
    // 2차 시도: 약간의 시간 후에도 닫히지 않으면 빈 페이지로 이동
    setTimeout(function() {
        // 여전히 열려있으면 빈 페이지로 강제 이동
        window.location.href = 'about:blank';
    }, 100);
    
    // 3차 시도: 200ms 후에도 열려있으면 history.back() 시도
    setTimeout(function() {
        if (window.history.length > 1) {
            window.history.back();
        }
    }, 200);
}

// ============================================================
// 41. 통계 기능
// ============================================================

// ===== 동 추출 (카카오 coord2address API) =====
async function extractDongFromCoords(lat, lng) {
    let restKey = settings.kakaoRestKey || 'server-proxy'; // 서버가 실제 키 보유, 클라이언트는 게이트 통과용
    if (!restKey) return '';
    try {
        let data = await serverGet('/api/geocode/reverse?lat=' + lat + '&lng=' + lng);
        if (data.documents && data.documents.length > 0) {
            let doc = data.documents[0];
            if (doc.address && doc.address.region_3depth_name) {
                return doc.address.region_3depth_name;
            }
            if (doc.road_address && doc.road_address.address_name) {
                let match = doc.road_address.address_name.match(/([가-힣]+\d?[가-힣]?\d?동)/);
                if (match) return match[1];
            }
        }
        return '';
    } catch(e) {
        return '';
    }
}

// ===== 주소에서 동 추출 (API 실패 시 fallback) =====
function extractDongFromAddress(address) {
    if (!address) return '';
    let match = address.match(/([가-힣]+\d?[가-힣]?\d?동)/);
    return match ? match[1] : '';
}
// ===== 현장 탭 진입 시 동 자동 변환 =====
async function autoFillDong() {
    if (!settings.kakaoRestKey) return;
    let needConvert = places.filter(function(p) {
        return !p.dong && p.lat && p.lng && p.lat !== 0 && p.lng !== 0;
    });
    if (needConvert.length === 0) return;
    showTabStatus('tab-list', '🏘️ 동 정보 자동 변환 중... (0/' + needConvert.length + ')', 'info');
    let converted = 0;
    for (let i = 0; i < needConvert.length; i++) {
        let p = needConvert[i];
        let dong = await extractDongFromCoords(p.lat, p.lng);
        if (!dong || dong === '기타') {
            dong = extractDongFromAddress(p.address || '');
        }
        p.dong = dong || '미변환';
        converted++;
        if (converted % 5 === 0 || converted === needConvert.length) {
            showTabStatus('tab-list', '🏘️ 동 정보 자동 변환 중... (' + converted + '/' + needConvert.length + ')', 'info');
        }
    }
    savePlaces();
    renderPlaces();
    showTabStatus('tab-list', '✅ 동 정보 변환 완료 (' + converted + '개 현장)', 'ok');
}

// ===== 통계 기록 버튼 (showRouteList에서 호출) =====
async function recordVisitStats() {
    if (!routeResult) {
        showTabStatus('tab-route', '⚠️ 최적화된 경로가 없습니다.', 'warning');
        return;
    }
    if (!currentRegion) {
        showTabStatus('tab-route', '⚠️ 지역이 선택되지 않았습니다.', 'warning');
        return;
    }
    let sorted = routeResult.places;
    let startPoint = routeResult.startPoint;
    if (!sorted || sorted.length === 0) {
        showTabStatus('tab-route', '⚠️ 기록할 경로가 없습니다.', 'warning');
        return;
    }
    showTabStatus('tab-route', '⏳ 통계 기록 중... (동 정보 변환)', 'info');
    let placeRecords = [];
    for (let i = 0; i < sorted.length; i++) {
        let p = sorted[i];
        let dong = '';
        if (p.lat && p.lng) {
            dong = await extractDongFromCoords(p.lat, p.lng);
        }
        if (!dong) {
            dong = extractDongFromAddress(p.address || '');
        }
        placeRecords.push({ name: p.name, dong: dong || '미변환', lat: p.lat, lng: p.lng });
    }
    let startDong = '';
    if (startPoint && startPoint.lat && startPoint.lng) {
        startDong = await extractDongFromCoords(startPoint.lat, startPoint.lng);
    }
    let now = new Date();
    let visitRecord = {
        date: now.toISOString().slice(0, 10),
        time: now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0'),
        timestamp: now.getTime(),
        placeCount: sorted.length,
        places: placeRecords,
        startDong: startDong || '미변환'
    };
    let stats = loadStatsFromLocalStorage();
    stats.visitHistory.push(visitRecord);
    let cutoff = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    stats.visitHistory = stats.visitHistory.filter(function(v) { return v.timestamp >= cutoff; });
    stats.lastUpdated = now.toISOString();
    saveStatsToLocalStorage(stats);

    // ===== 작업 기록에도 동시 기록 =====
    let work = loadWorkFromLocalStorage();
    let nowWork = new Date();
    for (let i = 0; i < placeRecords.length; i++) {
        let pr = placeRecords[i];
        work.workHistory.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5) + i,
            date: nowWork.toISOString().slice(0, 10),
            time: '',
            timestamp: nowWork.getTime(),
            placeName: pr.name,
            dong: pr.dong || '',
            worker: workerName || '미설정',
            category: '',
            content: '',
            camera: '',
            fromStats: true
        });
    }
    work.lastUpdated = nowWork.toISOString();
    saveWorkToLocalStorage(work);

    // ★ 순차 업로드: work 먼저 완료 후 stats (409 방지)
    let workUploaded = await uploadWorkToGitHub(work);
    await new Promise(r => setTimeout(r, 1000));
    let uploaded = await uploadStatsToGitHub(stats);

    if (uploaded && workUploaded) {
        showTabStatus('tab-route', '✅ 통계 기록 완료! (' + sorted.length + '개 현장, GitHub 동기화 완료)', 'ok');
    } else if (uploaded || workUploaded) {
        showTabStatus('tab-route', '⚠️ 일부 GitHub 업로드 실패 (로컬 저장은 완료)', 'warning');
    } else {
        showTabStatus('tab-route', '⚠️ GitHub 업로드 실패 (로컬 저장은 완료)', 'warning');
    }
}

// ===== localStorage 저장/불러오기 =====
function getStatsKey(region) {
    return STATS_KEY_PREFIX + (region || currentRegion);
}

function loadStatsFromLocalStorage() {
    let key = getStatsKey(currentRegion);
    let data = localStorage.getItem(key);
    if (data) {
        try { return JSON.parse(data); } catch(e) {}
    }
    return { version: 1, visitHistory: [], lastUpdated: null };
}

async function saveStatsToLocalStorage(stats) {

    const region =
        String(currentRegion || '').trim();

    // ------------------------------------------------------------
    // LOCAL 저장은 항상 먼저 수행
    // ------------------------------------------------------------
    const key =
        getStatsKey(region);

    localStorage.setItem(
        key,
        JSON.stringify(stats)
    );

    try {
        await fieldPilotCore()?.storage?.setValue(key, stats);
    } catch (error) {
        console.warn('[FieldPilot] IndexedDB 통계 저장 실패:', error);
    }

    currentStats = stats;

    // ------------------------------------------------------------
    // 지역이 없으면 서버 전송하지 않음
    // ------------------------------------------------------------
    if (!region) {
        console.warn(
            '[STATS] currentRegion이 없어 서버 동기화를 건너뜁니다.'
        );
        return false;
    }

    // ------------------------------------------------------------
    // 인증 토큰 확인
    // ------------------------------------------------------------
    const token =
        getAuthToken();

    if (!token) {
        console.warn(
            '[STATS] 인증 토큰이 없어 서버 동기화를 건너뜁니다.'
        );
        return false;
    }

    // ------------------------------------------------------------
    // 온라인 상태 확인
    // ------------------------------------------------------------
    if (!navigator.onLine) {
        console.warn(
            '[STATS] 오프라인 상태 - LOCAL에만 저장했습니다.'
        );
        queueServerWrite('/api/stats?region=' + encodeURIComponent(region), stats);
        return false;
    }

    // ------------------------------------------------------------
    // SERVER 동기화
    // ------------------------------------------------------------
    try {

        const result =
            await serverPost(
                '/api/stats?region=' +
                encodeURIComponent(region),
                stats
            );

        console.log(
            '[STATS] SERVER 동기화 성공:',
            result
        );

        return true;

    } catch (error) {

        console.error(
            '[STATS] SERVER 동기화 실패:',
            error
        );

        queueServerWrite('/api/stats?region=' + encodeURIComponent(region), stats);

        return false;
    }
}
// ===== GitHub 업로드 (통계 기록 시 자동) =====
async function uploadStatsToGitHub(stats) {
    let token = settings.githubToken;
    if (!token) return false;
    if (!currentRegion) return false;
    if (!navigator.onLine) return false;
    try {
        let userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) return false;
        let user = await userRes.json();
        let username = user.login;
        let repoName = 'route-data';
        let fileName = currentRegion + '_stats.json';
        let content = JSON.stringify(stats, null, 2);
        let b64Content = utf8ToBase64(content);
        let fileUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + encodeURIComponent(fileName);
        
        // sha 가져오기
        let fileRes = await fetch(fileUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        let sha = null;
        if (fileRes.ok) {
            let fileData = await fileRes.json();
            sha = fileData.sha;
        }
        
        let putData = {
            message: 'Stats update: ' + currentRegion + ' (' + new Date().toLocaleString() + ')',
            content: b64Content
        };
        if (sha) putData.sha = sha;
        
        let putRes = await fetch(fileUrl, {
            method: 'PUT',
            headers: {
                'Authorization': 'token ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(putData)
        });
        
        // ★ 409 Conflict 시 sha 재획득 후 1회 재시도
        if (putRes.status === 409) {
            console.log('⚠️ stats 409 충돌 감지, sha 재획득 후 재시도...');
            await new Promise(r => setTimeout(r, 1500));
            let retryRes = await fetch(fileUrl, {
                headers: { 'Authorization': 'token ' + token }
            });
            if (retryRes.ok) {
                let newSha = (await retryRes.json()).sha;
                putData.sha = newSha;
                putRes = await fetch(fileUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': 'token ' + token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(putData)
                });
            }
        }
        
        return putRes.ok;
    } catch(e) {
        return false;
    }
}

// ===== GitHub에서 통계 다운로드 (🔄 새로고침 버튼) =====
async function refreshStatsFromGitHub() {
    let statsContent = document.getElementById('statsContent');
    if (!statsContent) return;
    if (!settings.githubToken) {
        statsContent.innerHTML = '<div style="text-align:center;padding:20px;color:#e53e3e;">⚠️ 설정 탭에서 GitHub 토큰을 먼저 설정해주세요.</div>';
        return;
    }
    if (!currentRegion) {
        statsContent.innerHTML = '<div style="text-align:center;padding:20px;color:#e53e3e;">⚠️ 지역이 선택되지 않았습니다.</div>';
        return;
    }
    statsContent.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#a0aec0;">⏳ GitHub에서 통계 불러오는 중...</div>';
    try {
        let token = settings.githubToken;
        let userRes = await fetch('https://api.github.com/user', { headers: { 'Authorization': 'token ' + token } });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        let user = await userRes.json();
        let fileName = currentRegion + '_stats.json';
        let fileUrl = 'https://api.github.com/repos/' + user.login + '/route-data/contents/' + encodeURIComponent(fileName);
        let fileRes = await fetch(fileUrl, { headers: { 'Authorization': 'token ' + token }, cache: 'no-store' });
        if (fileRes.status === 404) {
            currentStats = { version: 1, visitHistory: [], lastUpdated: null };
            saveStatsToLocalStorage(currentStats);
            renderStatsTab();
            return;
        }
        if (!fileRes.ok) throw new Error('다운로드 실패: ' + fileRes.status);
        let data = await fileRes.json();
        let binaryString = atob(data.content);
        let bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        let stats = JSON.parse(new TextDecoder('utf-8').decode(bytes));
        let cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
        if (stats.visitHistory) {
            stats.visitHistory = stats.visitHistory.filter(function(v) { return v.timestamp >= cutoff; });
        }
        currentStats = stats;
        saveStatsToLocalStorage(stats);
        renderStatsTab();
        showTabStatus('tab-stats', '✅ GitHub에서 통계 동기화 완료', 'ok');
    } catch(error) {
        statsContent.innerHTML = '<div style="text-align:center;padding:20px;color:#e53e3e;">❌ 통계 로드 실패: ' + escapeHtml(error.message) + '</div>';
    }
}

// ===== 통계 탭 렌더링 (자동 동 변환 포함) =====
async function renderStatsTab() {
    let container = document.getElementById('statsContent');
    if (!container) return;
    
    if (!currentStats) {
        currentStats = loadStatsFromLocalStorage();
    }
    let stats = currentStats;
    let history = stats.visitHistory || [];
    
    // 기간 필터링
    let today = new Date().toISOString().slice(0, 10);
    let todayVisits = history.filter(function(v) { return v.date === today; });
    let weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    let weekStartStr = weekStart.toISOString().slice(0, 10);
    let weekVisits = history.filter(function(v) { return v.date >= weekStartStr; });
    let monthVisits = history;
    
    // 동별 현장 분포
    let dongCount = {};
    let noDongCount = 0;
    for (let i = 0; i < places.length; i++) {
        let p = places[i];
        if (p.dong && p.dong !== '미변환') {
            dongCount[p.dong] = (dongCount[p.dong] || 0) + 1;
        } else {
            noDongCount++;
        }
    }
    let dongSorted = Object.entries(dongCount).sort(function(a, b) { return b[1] - a[1]; });
    let visitCounts = { today: todayVisits, week: weekVisits, month: monthVisits };
    
    // HTML 생성
    let html = '';
    
    // 기본 현황판
    html += '<div style="margin-bottom:20px;">';
    html += '<div style="font-size:13px;color:#718096;margin-bottom:8px;">총 현장: <strong>' + places.length + '개</strong></div>';
    html += '<div style="font-weight:600;font-size:13px;margin-bottom:6px;">동별 현장 분포</div>';
    
    if (dongSorted.length === 0 && noDongCount === 0) {
        html += '<div style="color:#a0aec0;font-size:13px;padding:8px;">현장 데이터가 없습니다</div>';
    } else {
        if (noDongCount > 0) {
            html += '<div style="font-size:12px;color:#e53e3e;background:#fff5f5;border:1px solid #fed7d7;border-radius:6px;padding:8px;margin-bottom:8px;">';
            html += '⚠️ 동 정보를 알 수 없는 현장 <strong>' + noDongCount + '개</strong>';
            html += '<br><span style="font-size:11px;">통계 탭 진입 시 자동 변환됩니다</span>';
            html += '</div>';
        }
        let maxCount = dongSorted.length > 0 ? dongSorted[0][1] : 1;
        html += '<div style="display:flex;flex-direction:column;gap:4px;">';
        for (let i = 0; i < dongSorted.length; i++) {
            let dong = dongSorted[i][0];
            let count = dongSorted[i][1];
            let barWidth = Math.round((count / maxCount) * 100);
            html += '<div style="display:flex;align-items:center;gap:8px;">';
            html += '<span style="min-width:70px;font-size:12px;text-align:right;">' + escapeHtml(dong) + '</span>';
            html += '<div style="flex:1;background:#e2e8f0;border-radius:4px;height:16px;overflow:hidden;">';
            html += '<div style="width:' + barWidth + '%;background:#4f7eb3;height:100%;border-radius:4px;min-width:2px;"></div>';
            html += '</div>';
            html += '<span style="min-width:35px;font-size:12px;font-weight:600;">' + count + '개</span>';
            html += '</div>';
        }
        html += '</div>';
    }
    html += '</div>';
    
    // 방문 분석
    html += '<div style="border-top:1px solid #e2e8f0;padding-top:16px;">';
    html += '<div style="font-weight:700;font-size:15px;margin-bottom:12px;">📈 방문 분석</div>';
    html += '<div id="statsPeriodBtns" style="display:flex;gap:6px;margin-bottom:12px;">';
    html += '<button class="btn btn-sm stats-period-btn active" data-period="today" onclick="switchStatsPeriod(\'today\')" style="padding:6px 12px;font-size:12px;border-radius:6px;">오늘</button>';
    html += '<button class="btn btn-sm stats-period-btn" data-period="week" onclick="switchStatsPeriod(\'week\')" style="padding:6px 12px;font-size:12px;border-radius:6px;">이번 주</button>';
    html += '<button class="btn btn-sm stats-period-btn" data-period="month" onclick="switchStatsPeriod(\'month\')" style="padding:6px 12px;font-size:12px;border-radius:6px;">이번 달</button>';
    html += '</div>';
    html += '<div id="statsVisitData">';
    html += renderVisitData(visitCounts.today);
    html += '</div>';
    html += '</div>';
    
    if (stats.lastUpdated) {
        let lastDate = new Date(stats.lastUpdated);
        html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#a0aec0;text-align:center;">';
        html += '⏳ 마지막 동기화: ' + lastDate.toLocaleString();
        html += '</div>';
    }
    
    container.innerHTML = html;
}
// ===== 방문 데이터 렌더링 =====
function renderVisitData(visits) {
    let html = '';
    let totalPlaces = 0;
    visits.forEach(function(v) { totalPlaces += v.placeCount; });
    html += '<div style="display:flex;gap:12px;margin-bottom:12px;">';
    html += '<div style="flex:1;background:#f7fafc;border-radius:8px;padding:10px;text-align:center;">';
    html += '<div style="font-size:20px;font-weight:700;color:#2b6cb0;">' + visits.length + '</div>';
    html += '<div style="font-size:11px;color:#718096;">방문 횟수</div></div>';
    html += '<div style="flex:1;background:#f7fafc;border-radius:8px;padding:10px;text-align:center;">';
    html += '<div style="font-size:20px;font-weight:700;color:#38a169;">' + totalPlaces + '</div>';
    html += '<div style="font-size:11px;color:#718096;">방문 현장</div></div></div>';

    if (visits.length === 0) {
        html += '<div style="text-align:center;padding:16px;color:#a0aec0;font-size:13px;">기록된 방문이 없습니다</div>';
        return html;
    }

    let topPlaces = getTopPlacesForPeriod(visits);
    if (topPlaces.length > 0) {
        html += '<div style="font-weight:600;font-size:13px;margin-bottom:6px;">🏆 최다 방문 장소 TOP 5</div>';
        html += '<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:12px;">';
        for (let i = 0; i < topPlaces.length; i++) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#f7fafc;border-radius:4px;font-size:12px;">';
            html += '<span>' + (i + 1) + '. ' + escapeHtml(topPlaces[i][0]) + '</span>';
            html += '<span style="font-weight:600;">' + topPlaces[i][1] + '회</span></div>';
        }
        html += '</div>';
    }

    let topDongs = getTopDongsForPeriod(visits);
    if (topDongs.length > 0) {
        html += '<div style="font-weight:600;font-size:13px;margin-bottom:6px;">📍 동별 자주 방문 TOP 3</div>';
        html += '<div style="display:flex;flex-direction:column;gap:3px;">';
        let medals = ['🥇', '🥈', '🥉'];
        for (let i = 0; i < topDongs.length; i++) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#f7fafc;border-radius:4px;font-size:12px;">';
            html += '<span>' + medals[i] + ' ' + escapeHtml(topDongs[i][0]) + '</span>';
            html += '<span style="font-weight:600;">' + topDongs[i][1] + '회</span></div>';
        }
        html += '</div>';
    }
    return html;
}

function getTopPlacesForPeriod(visits) {
    let placeCount = {};
    visits.forEach(function(v) {
        v.places.forEach(function(p) { placeCount[p.name] = (placeCount[p.name] || 0) + 1; });
    });
    return Object.entries(placeCount).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5);
}

function getTopDongsForPeriod(visits) {
    let dongVisitCount = {};
    visits.forEach(function(v) {
        v.places.forEach(function(p) {
            if (p.dong && p.dong !== '미변환') {
                dongVisitCount[p.dong] = (dongVisitCount[p.dong] || 0) + 1;
            }
        });
    });
    return Object.entries(dongVisitCount).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3);
}

// ===== 기간 전환 =====
function switchStatsPeriod(period) {
    document.querySelectorAll('.stats-period-btn').forEach(function(btn) {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '#cbd5e0';
    });
    let activeBtn = document.querySelector('.stats-period-btn[data-period="' + period + '"]');
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = '#4f7eb3';
        activeBtn.style.color = 'white';
        activeBtn.style.borderColor = '#4f7eb3';
    }
    if (!currentStats) return;
    let history = currentStats.visitHistory || [];
    let today = new Date().toISOString().slice(0, 10);
    let weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    let weekStartStr = weekStart.toISOString().slice(0, 10);
    let visits;
    if (period === 'today') {
        visits = history.filter(function(v) { return v.date === today; });
    } else if (period === 'week') {
        visits = history.filter(function(v) { return v.date >= weekStartStr; });
    } else {
        visits = history;
    }
    let dataContainer = document.getElementById('statsVisitData');
    if (dataContainer) {
        dataContainer.innerHTML = renderVisitData(visits);
    }
}

// ============================================================
// 43. 작업 기록 데이터
// ============================================================
function getWorkKey(region) {
    return WORK_KEY_PREFIX + (region || currentRegion);
}

function loadWorkFromLocalStorage() {
    let key = getWorkKey(currentRegion);
    let data = localStorage.getItem(key);
    if (data) {
        try { return JSON.parse(data); } catch(e) {}
    }
    return { version: 1, categories: ['카메라', '비상벨', '전원설비', '네트워크', '기타'], workHistory: [], lastUpdated: null };
}

async function saveWorkToLocalStorage(work) {

    const region =
        String(currentRegion || '').trim();

    const key =
        getWorkKey(region);

    // ------------------------------------------------------------
    // LOCAL 저장
    // ------------------------------------------------------------
    localStorage.setItem(
        key,
        JSON.stringify(work)
    );

    try {
        await fieldPilotCore()?.storage?.setValue(key, work);
    } catch (error) {
        console.warn('[FieldPilot] IndexedDB 작업기록 저장 실패:', error);
    }

    currentWork = work;

    // ------------------------------------------------------------
    // 서버 전송 조건
    // ------------------------------------------------------------
    if (!region) {
        console.warn(
            '[WORK] currentRegion이 없어 서버 동기화를 건너뜁니다.'
        );
        return false;
    }

    const token =
        getAuthToken();

    if (!token) {
        console.warn(
            '[WORK] 인증 토큰이 없어 서버 동기화를 건너뜁니다.'
        );
        return false;
    }

    if (!navigator.onLine) {
        console.warn(
            '[WORK] 오프라인 상태 - LOCAL에만 저장했습니다.'
        );
        queueServerWrite('/api/work-history?region=' + encodeURIComponent(region), work);
        return false;
    }

    // ------------------------------------------------------------
    // SERVER 동기화
    // ------------------------------------------------------------
    try {

        const result =
            await serverPost(
                '/api/work-history?region=' +
                encodeURIComponent(region),
                work
            );

        console.log(
            '[WORK] SERVER 동기화 성공:',
            result
        );

        return true;

    } catch (error) {

        console.error(
            '[WORK] SERVER 동기화 실패:',
            error
        );

        queueServerWrite('/api/work-history?region=' + encodeURIComponent(region), work);

        return false;
    }
}

async function uploadWorkToGitHub(work) {
    let token = settings.githubToken;
    if (!token || !currentRegion || !navigator.onLine) {
        if (!navigator.onLine) pendingWorkUpload = true;
        return false;
    }
    try {
        let userRes = await fetch('https://api.github.com/user', { headers: { 'Authorization': 'token ' + token } });
        if (!userRes.ok) return false;
        let user = await userRes.json();
        let fileName = currentRegion + '_work.json';
        let content = JSON.stringify(work, null, 2);
        let b64Content = utf8ToBase64(content);
        let fileUrl = 'https://api.github.com/repos/' + user.login + '/route-data/contents/' + encodeURIComponent(fileName);
        let fileRes = await fetch(fileUrl, { headers: { 'Authorization': 'token ' + token } });
        let sha = null;
        if (fileRes.ok) { sha = (await fileRes.json()).sha; }
        let putData = { message: 'Work: ' + currentRegion + ' (' + new Date().toLocaleString() + ')', content: b64Content };
        if (sha) putData.sha = sha;
        let putRes = await fetch(fileUrl, {
            method: 'PUT',
            headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify(putData)
        });
        if (putRes.ok) pendingWorkUpload = false;
        return putRes.ok;
    } catch(e) { return false; }
}

async function refreshWorkFromGitHub() {
    let container = document.getElementById('workCalendar');
    if (!container) return;
    if (!settings.githubToken) {
        showTabStatus('tab-work', '⚠️ GitHub 토큰을 먼저 설정해주세요.', 'warning');
        return;
    }
    if (!currentRegion) {
        showTabStatus('tab-work', '⚠️ 지역이 선택되지 않았습니다.', 'warning');
        return;
    }
    container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#a0aec0;">⏳ GitHub에서 작업 기록 불러오는 중...</div>';
    try {
        let token = settings.githubToken;
        let userRes = await fetch('https://api.github.com/user', { headers: { 'Authorization': 'token ' + token } });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        let user = await userRes.json();
        let fileName = currentRegion + '_work.json';
        let fileUrl = 'https://api.github.com/repos/' + user.login + '/route-data/contents/' + encodeURIComponent(fileName);
        let fileRes = await fetch(fileUrl, { headers: { 'Authorization': 'token ' + token }, cache: 'no-store' });
        if (fileRes.status === 404) {
            currentWork = { version: 1, categories: ['카메라', '비상벨', '전원설비', '네트워크', '기타'], workHistory: [], lastUpdated: null };
            saveWorkToLocalStorage(currentWork);
            renderWorkTab();
            showTabStatus('tab-work', '📭 아직 작업 기록이 없습니다.', 'info');
            return;
        }
        if (!fileRes.ok) throw new Error('다운로드 실패: ' + fileRes.status);
        let data = await fileRes.json();
        let binaryString = atob(data.content);
        let bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        let work = JSON.parse(new TextDecoder('utf-8').decode(bytes));
        currentWork = work;
        saveWorkToLocalStorage(work);
        renderWorkTab();
        showTabStatus('tab-work', '✅ GitHub에서 작업 기록 동기화 완료', 'ok');
    } catch(error) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#e53e3e;">❌ 로드 실패: ' + escapeHtml(error.message) + '</div>';
    }
}

// ============================================================
// 44. 캘린더 렌더링
// ============================================================
function renderWorkTab() {
    updateWorkWorkerDisplay();
    let container = document.getElementById('workCalendar');
    if (!container) return;
    let work = currentWork || loadWorkFromLocalStorage();
    currentWork = work;
    let history = work.workHistory || [];

    let dateCounts = {};
    history.forEach(function(w) {
        dateCounts[w.date] = (dateCounts[w.date] || 0) + 1;
    });

    let year = workCalendarYear;
    let month = workCalendarMonth;
    let firstDay = new Date(year, month, 1).getDay();
    let daysInMonth = new Date(year, month + 1, 0).getDate();
    let monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    let dayNames = ['일','월','화','수','목','금','토'];
    let today = new Date().toISOString().slice(0, 10);

    let html = '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
    html += '<button class="btn btn-outline btn-sm" onclick="changeWorkMonth(-1)" style="padding:4px 12px;">◀</button>';
    html += '<div style="font-weight:700;font-size:16px;">' + year + '년 ' + monthNames[month] + '</div>';
    html += '<button class="btn btn-outline btn-sm" onclick="changeWorkMonth(1)" style="padding:4px 12px;">▶</button>';
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">';
    for (let i = 0; i < 7; i++) {
        let color = i === 0 ? '#e53e3e' : i === 6 ? '#3182ce' : '#4a5568';
        html += '<div style="text-align:center;font-size:12px;font-weight:600;color:' + color + ';padding:4px;">' + dayNames[i] + '</div>';
    }
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">';
    for (let i = 0; i < firstDay; i++) {
        html += '<div></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
        let dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        let count = dateCounts[dateStr] || 0;
        let isToday = dateStr === today;
        let dayOfWeek = new Date(year, month, d).getDay();
        let isSelected = dateStr === selectedWorkDate;
        let stateClass =
            (isToday ? ' is-today' : '') +
            (isSelected ? ' is-selected' : '') +
            (dayOfWeek === 0 ? ' is-sunday' : dayOfWeek === 6 ? ' is-saturday' : '');
        let textColor = dayOfWeek === 0 ? '#e53e3e' : dayOfWeek === 6 ? '#3182ce' : '#2d3748';
        html += '<button type="button" class="work-calendar-day' + stateClass + '" onclick="showWorkDateDetail(\'' + dateStr + '\')" aria-pressed="' + (isSelected ? 'true' : 'false') + '" aria-label="' + dateStr + (count ? ', 기록 ' + count + '건' : ', 기록 없음') + '" style="width:100%;text-align:center;padding:6px 2px;min-height:52px;border-radius:7px;cursor:pointer;background:' + (isSelected ? '#bee3f8' : isToday ? '#ebf8ff' : 'transparent') + ';border:' + (isSelected ? '3px solid #2b6cb0' : isToday ? '2px solid #3182ce' : '1px solid #e2e8f0') + ';box-shadow:' + (isSelected ? '0 0 0 2px rgba(49,130,206,.18)' : 'none') + ';">';
        html += '<div style="font-size:13px;font-weight:' + (isToday ? '700' : '400') + ';color:' + textColor + ';">' + d + '</div>';
        if (count > 0) {
            html += '<div style="font-size:10px;color:white;background:#38a169;border-radius:8px;padding:1px 4px;margin-top:2px;">' + count + '건</div>';
        }
        if (isSelected) {
            html += '<div style="font-size:9px;color:#2b6cb0;font-weight:700;margin-top:2px;">✓ 선택</div>';
        }
        html += '</button>';
    }
    html += '</div>';
    container.innerHTML = html;
}

function changeWorkMonth(delta) {
    workCalendarMonth += delta;
    if (workCalendarMonth < 0) { workCalendarMonth = 11; workCalendarYear--; }
    if (workCalendarMonth > 11) { workCalendarMonth = 0; workCalendarYear++; }
    selectedWorkDate = '';
    hideWorkDateDetail(false);
    renderWorkTab();
}

// ============================================================
// 45. 날짜별 상세 + 처리내역 모달
// ============================================================
function showWorkDateDetail(dateStr) {
    selectedWorkDate = dateStr;
    renderWorkTab();
    let work = currentWork || loadWorkFromLocalStorage();
    let history = work.workHistory || [];
    let dayRecords = history.filter(function(w) { return w.date === dateStr; });
    let container = document.getElementById('workDateDetail');
    if (!container) return;

    let dateObj = new Date(dateStr + 'T00:00:00');
    let weekdays = ['일','월','화','수','목','금','토'];
    let dayLabel = (dateObj.getMonth() + 1) + '월 ' + dateObj.getDate() + '일 (' + weekdays[dateObj.getDay()] + ')';

    let html = '';
    html += '<div class="work-date-selection" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:10px 12px;background:#ebf8ff;border:2px solid #3182ce;border-radius:9px;">';
    html += '<div><div style="font-size:10px;color:#4f7eb3;font-weight:700;margin-bottom:2px;">현재 선택한 날짜</div><div style="font-weight:700;font-size:15px;">📅 ' + dayLabel + '</div></div>';
    html += '<button class="btn btn-outline btn-sm" onclick="hideWorkDateDetail()" style="padding:4px 12px;">✕ 닫기</button>';
    html += '</div>';

        if (dayRecords.length === 0) {
        html += '<div style="text-align:center;padding:16px;color:#a0aec0;">이 날짜에 기록이 없습니다</div>';
    } else {
        for (let i = 0; i < dayRecords.length; i++) {
            let r = dayRecords[i];
            let hasContent = !!String(r.content || '').trim();
            let timeDisplay = r.time || '--:--';
            html += '<div onclick="openWorkEditModal(\'' + r.id + '\')" style="background:#f7fafc;border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;border-left:3px solid ' + (hasContent ? '#38a169' : '#e53e3e') + ';">';
            html += '<div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
            html += '<span style="color:#4a5568;">⏰ ' + timeDisplay + '</span>';
            html += '<span>' + escapeHtml(r.placeName) + '</span>';
            if (r.camera) {
                html += '<span style="background:#ebf8ff;color:#3182ce;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;">📷 ' + escapeHtml(r.camera) + '</span>';
            }
            html += '</div>';
            html += '<div style="font-size:12px;color:#718096;margin-top:2px;">👤 ' + escapeHtml(r.worker || '미설정') + '</div>';
            if (r.content) {
                html += '<div style="font-size:12px;color:#4a5568;margin-top:4px;padding:6px 8px;background:#fff;border-radius:4px;border-left:2px solid #2b6cb0;white-space:pre-wrap;">' + escapeHtml(r.content) + '</div>';
            } else {
                html += '<div style="font-size:12px;color:#e53e3e;margin-top:4px;">⚠️ 미작성 - 터치하여 작성</div>';
            }
            html += '</div>';
        }
    }
    html += '<button class="btn btn-primary btn-sm" onclick="openWorkAddModal(\'' + dateStr + '\')" style="width:100%;margin-top:8px;padding:8px;">+ 처리내역 추가</button>';
    container.innerHTML = html;
    container.style.display = 'block';
}

function hideWorkDateDetail(clearSelection = true) {
    let container = document.getElementById('workDateDetail');
    if (container) { container.style.display = 'none'; container.innerHTML = ''; }
    if (clearSelection) {
        selectedWorkDate = '';
        renderWorkTab();
    }
}

function openWorkEditModal(workId) {
    let work = currentWork || loadWorkFromLocalStorage();
    let record = work.workHistory.find(function(w) { return w.id === workId; });
    if (!record) return;
    let existing = document.getElementById('workEditModal');
    if (existing) existing.remove();

    let modalHtml = '<div id="workEditModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:999999;display:flex;justify-content:center;align-items:center;padding:20px;" onclick="if(event.target===this)this.remove()">';
    modalHtml += '<div style="background:white;border-radius:16px;padding:24px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);max-height:80vh;overflow-y:auto;" onclick="event.stopPropagation()">';
    modalHtml += '<h3 style="font-size:17px;font-weight:700;color:#1a202c;margin-bottom:12px;">✏️ 처리내역 작성</h3>';
    modalHtml += '<div style="font-size:13px;color:#4a5568;margin-bottom:12px;">';
    modalHtml += '<div>현장: <strong>' + escapeHtml(record.placeName) + '</strong></div>';
    modalHtml += '<div>일시: ' + record.date + (record.time ? ' ' + record.time : '') + '</div>';
    modalHtml += '<div>작업자: ' + escapeHtml(record.worker || '미설정') + '</div>';
    modalHtml += '</div>';
    modalHtml += '<div style="margin-bottom:12px;">';
    modalHtml += '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">📷 카메라 번호</label>';
    modalHtml += '<input type="text" id="workEditCamera" value="' + escapeHtml(record.camera || '') + '" placeholder="예: 01, A3 (선택)" style="width:100%;padding:8px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:13px;">';
    modalHtml += '</div>';
    modalHtml += '<div style="margin-bottom:12px;">';
    modalHtml += '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">처리내용</label>';
    modalHtml += '<textarea id="workEditContent" rows="3" placeholder="처리 내용을 입력하세요" style="width:100%;padding:8px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:13px;resize:vertical;">' + escapeHtml(record.content || '') + '</textarea>';
    modalHtml += '</div>';
    // ★ 사진 업로드 영역
    modalHtml += '<div style="margin-bottom:12px;">';
    modalHtml += '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">📸 현장 사진</label>';
    modalHtml += '<div style="display:flex;gap:8px;">';
    modalHtml += '<button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById(\'workEditCameraInput\').click()" style="flex:1;padding:9px 10px;">📷 카메라</button>';
    modalHtml += '<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'workEditAlbumInput\').click()" style="flex:1;padding:9px 10px;">🖼️ 앨범/파일</button>';
    modalHtml += '</div>';
    modalHtml += '<input id="workEditCameraInput" type="file" accept="image/*" capture="environment" multiple data-work-id="' + record.id + '" onchange="handleWorkPhotoUpload(event)" style="display:none;">';
    modalHtml += '<input id="workEditAlbumInput" type="file" accept="image/*" multiple data-work-id="' + record.id + '" onchange="handleWorkPhotoUpload(event)" style="display:none;">';
    modalHtml += '<div id="workPhotoStatus" style="font-size:11px;color:#a0aec0;margin-top:4px;"></div>';
    modalHtml += '<div id="workPhotoList" style="margin-top:8px;"></div>';
    modalHtml += '</div>';
    modalHtml += '<div style="font-size:11px;color:#a0aec0;margin-bottom:12px;">💡 저장 시 현재 시간이 자동으로 기록됩니다</div>';
    modalHtml += '<div style="display:flex;gap:8px;justify-content:flex-end;">';
    modalHtml += '<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'workEditModal\').remove()" style="padding:6px 16px;">취소</button>';
    modalHtml += '<button class="btn btn-danger btn-sm" onclick="deleteWorkRecord(\'' + record.id + '\')" style="padding:6px 16px;">삭제</button>';
    modalHtml += '<button class="btn btn-primary btn-sm" onclick="saveWorkEdit(\'' + record.id + '\')" style="padding:6px 16px;">저장</button>';
    modalHtml += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // ★ 기존 사진 목록 표시
    renderWorkPhotoList(record.id);
}

async function saveWorkEdit(workId) {
let work = currentWork || loadWorkFromLocalStorage();
let record = work.workHistory.find(function(w) { return w.id === workId; });
if (!record) return;
let content = document.getElementById('workEditContent').value.trim();
let camera = document.getElementById('workEditCamera') ? document.getElementById('workEditCamera').value.trim() : '';
// ★ 저장 시점의 시간 자동 기록
let now = new Date();
record.time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
record.content = content;
record.camera = camera;
record.updatedAt = now.toISOString();
saveWorkToLocalStorage(work);
document.getElementById('workEditModal').remove();
let uploaded = await uploadWorkToGitHub(work);
renderWorkTab();
showWorkDateDetail(record.date);
showTabStatus('tab-work', uploaded ? '✅ 처리내역 저장 완료 (⏰ ' + record.time + ' 기록)' : '⚠️ 저장됨. GitHub 업로드 실패', uploaded ? 'ok' : 'warning');
// ★ 기존 서버의 카카오워크 그룹방 전송
const kakaoSent = await sendToKakaoChatbot(record);
if (!kakaoSent) {
    console.warn('[FieldPilot] 기록 저장 후 카카오워크 전송 실패');
}
}

function deleteWorkRecord(workId) {
    showConfirmModal('🗑️ 기록 삭제', '이 작업 기록을 삭제하시겠습니까?', async function() {
        let work = currentWork || loadWorkFromLocalStorage();
        let idx = work.workHistory.findIndex(function(w) { return w.id === workId; });
        if (idx >= 0) {
            let dateStr = work.workHistory[idx].date;
            work.workHistory.splice(idx, 1);
            saveWorkToLocalStorage(work);
            let modal = document.getElementById('workEditModal');
            if (modal) modal.remove();
            await uploadWorkToGitHub(work);
            renderWorkTab();
            showWorkDateDetail(dateStr);
            showTabStatus('tab-work', '✅ 기록 삭제됨', 'ok');
        }
    });
}

function openWorkAddModal(dateStr) {
    var existing = document.getElementById('workAddModal');
    if (existing) existing.remove();

    var workId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    // ★ 사진 촬영 전에 작업 기록을 임시 등록한다.
    // savePhotoToDB()가 workId로 기록을 찾을 수 있도록 한다.
    var draftWork = currentWork || loadWorkFromLocalStorage();
    if (!draftWork || !Array.isArray(draftWork.workHistory)) {
        draftWork = {
            version: 1,
            categories: [],
            workHistory: [],
            lastUpdated: null
        };
    }
    var draftNow = new Date();
    draftWork.workHistory.push({
        id: workId,
        date: dateStr,
        time: draftNow.getHours().toString().padStart(2, '0') + ':' + draftNow.getMinutes().toString().padStart(2, '0'),
        timestamp: draftNow.getTime(),
        placeName: '',
        dong: '',
        worker: workerName || '미설정',
        category: '',
        content: '',
        camera: '',
        fromStats: false,
        _draft: true
    });
    draftWork.lastUpdated = draftNow.toISOString();
    currentWork = draftWork;
    saveWorkToLocalStorage(draftWork);
    var modalHtml = '<div id="workAddModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:999999;display:flex;justify-content:center;align-items:center;padding:20px;" onclick="if(event.target===this)cancelWorkAdd(\'' + workId + '\')">';
    modalHtml += '<div style="background:white;border-radius:16px;padding:24px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);max-height:85vh;overflow-y:auto;" onclick="event.stopPropagation()">';
    modalHtml += '<h3 style="font-size:17px;font-weight:700;color:#1a202c;margin-bottom:12px;">➕ 처리내역 추가</h3>';

    modalHtml += '<div style="margin-bottom:12px;">';
    modalHtml += '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">현장 검색</label>';
    modalHtml += '<input type="text" id="workAddPlaceSearch" placeholder="🔍 현장명을 검색하세요" autocomplete="off" oninput="searchWorkAddPlace()" style="width:100%;padding:9px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:13px;">';
    modalHtml += '<input type="hidden" id="workAddPlace" data-work-id="' + workId + '">';
    modalHtml += '<div id="workAddPlaceResults" style="margin-top:6px;max-height:150px;overflow-y:auto;display:none;"></div>';
    modalHtml += '<div id="workAddSelectedPlace" style="font-size:12px;color:#718096;margin-top:5px;">현장을 검색해서 선택하세요.</div>';
    modalHtml += '</div>';

    modalHtml += '<div style="margin-bottom:12px;"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">📷 카메라 번호</label>';
    modalHtml += '<input type="text" id="workAddCamera" placeholder="예: 01, A3 (선택)" style="width:100%;padding:8px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:13px;"></div>';

    modalHtml += '<div style="margin-bottom:12px;"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">처리내용</label>';
    modalHtml += '<textarea id="workAddContent" rows="3" placeholder="처리 내용을 입력하세요" style="width:100%;padding:8px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:13px;resize:vertical;"></textarea></div>';

    modalHtml += '<div style="margin-bottom:12px;">';
    modalHtml += '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">📸 현장 사진</label>';
    modalHtml += '<div style="display:flex;gap:8px;">';
    modalHtml += '<button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById(\'workAddCameraInput\').click()" style="flex:1;padding:9px 10px;">📷 카메라</button>';
    modalHtml += '<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'workAddAlbumInput\').click()" style="flex:1;padding:9px 10px;">🖼️ 앨범/파일</button>';
    modalHtml += '</div>';
    modalHtml += '<input id="workAddCameraInput" type="file" accept="image/*" capture="environment" multiple data-work-id="' + workId + '" onchange="handleWorkPhotoUpload(event)" style="display:none;">';
    modalHtml += '<input id="workAddAlbumInput" type="file" accept="image/*" multiple data-work-id="' + workId + '" onchange="handleWorkPhotoUpload(event)" style="display:none;">';
    modalHtml += '<div id="workPhotoStatus" style="font-size:11px;color:#a0aec0;margin-top:4px;"></div>';
    modalHtml += '<div id="workPhotoList" style="margin-top:8px;"></div>';
    modalHtml += '</div>';

    modalHtml += '<div style="font-size:11px;color:#a0aec0;margin-bottom:12px;">💡 저장 시 현재 시간이 자동으로 기록됩니다</div>';
    modalHtml += '<div style="display:flex;gap:8px;justify-content:flex-end;">';
    modalHtml += '<button class="btn btn-outline btn-sm" onclick="cancelWorkAdd(\'' + workId + '\')" style="padding:6px 16px;">취소</button>';
    modalHtml += '<button class="btn btn-primary btn-sm" onclick="saveWorkAdd(\'' + dateStr + '\',\'' + workId + '\')" style="padding:6px 16px;">저장</button>';
    modalHtml += '</div></div></div>';

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function cancelWorkAdd(workId) {
    try {
        var photos = await getPhotosByWorkId(workId);
        for (var i = 0; i < photos.length; i++) {
            await deletePhotoFromDB(photos[i].id);
        }
    } catch (e) {
        console.warn('임시 사진 삭제 실패:', e);
    }

    var work = currentWork || loadWorkFromLocalStorage();
    if (work && Array.isArray(work.workHistory)) {
        var before = work.workHistory.length;
        work.workHistory = work.workHistory.filter(function(w) {
            return !(String(w.id) === String(workId) && w._draft);
        });
        if (work.workHistory.length !== before) {
            work.lastUpdated = new Date().toISOString();
            currentWork = work;
            saveWorkToLocalStorage(work);
        }
    }

    var modal = document.getElementById('workAddModal');
    if (modal) modal.remove();
}

function searchWorkAddPlace() {
    var input = document.getElementById('workAddPlaceSearch');
    var results = document.getElementById('workAddPlaceResults');
    if (!input || !results) return;

    var keyword = input.value.trim().toLowerCase();
    var selected = document.getElementById('workAddPlace');
    if (selected) selected.value = '';

    if (!keyword) {
        results.innerHTML = '';
        results.style.display = 'none';
        var selectedEl = document.getElementById('workAddSelectedPlace');
        if (selectedEl) selectedEl.textContent = '현장을 검색해서 선택하세요.';
        return;
    }

    var matched = places.filter(function(p) {
        return p && p.name && p.name.toLowerCase().includes(keyword);
    }).slice(0, 30);

    if (matched.length === 0) {
        results.innerHTML = '<div style="padding:10px;text-align:center;color:#a0aec0;font-size:12px;">검색 결과가 없습니다.</div>';
        results.style.display = 'block';
        return;
    }

    var html = '';
    matched.forEach(function(p) {
        var safeId = escapeJsString(String(p.id));
        html += '<button type="button" onclick="selectWorkAddPlace(\'' + safeId + '\')" style="display:block;width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:7px;padding:9px 10px;margin-bottom:4px;cursor:pointer;">';
        html += '<strong style="font-size:13px;">' + escapeHtml(p.name) + '</strong>';
        if (p.address) html += '<div style="font-size:11px;color:#718096;margin-top:2px;">' + escapeHtml(p.address) + '</div>';
        html += '</button>';
    });

    results.innerHTML = html;
    results.style.display = 'block';
}
// ============================================================
// 카카오워크 1:1 사진 내보내기
// ============================================================

let kakaoWorkExportState = {
    user: null,
    place: null,
    photos: []
};


// ------------------------------------------------------------
// 모달 열기
// ------------------------------------------------------------

function openKakaoWorkExportModal() {

    const modal =
        document.getElementById(
            'kakaoWorkExportModal'
        );

    if (!modal) {
        console.error(
            '[KakaoWork] kakaoWorkExportModal 요소가 없습니다.'
        );
        alert(
            '카카오워크 내보내기 화면을 불러올 수 없습니다.'
        );
        return;
    }

    if (!isAuthorized()) {
        alert('먼저 인가코드 인증을 완료하세요.');
        return;
    }

    kakaoWorkExportState = {
        user: null,
        place: null,
        photos: []
    };

    modal.style.display = 'flex';

    // 일반 사용자는 수신자를 검색하지 않는다.
    const search =
        document.getElementById('kakaoWorkUserSearch');
    const results =
        document.getElementById('kakaoWorkUserResults');
    const searchStatus =
        document.getElementById('kakaoWorkUserSearchStatus');

    if (search) {
        search.value = '';
        search.style.display = 'none';
        search.disabled = true;
    }

    if (results) {
        results.innerHTML = '';
        results.style.display = 'none';
    }

    if (searchStatus) {
        searchStatus.textContent = '';
        searchStatus.style.display = 'none';
    }

    const selected =
        document.getElementById('kakaoWorkSelectedUserBox');

    if (selected) {
        selected.style.display = 'block';
    }

    const photos =
        document.getElementById('kakaoWorkExportPhotos');

    if (photos) {
        photos.value = '';
    }

    const preview =
        document.getElementById(
            'kakaoWorkExportPhotoPreview'
        );

    if (preview) {
        preview.innerHTML = '';
    }

    loadKakaoWorkExportPlaces();

    autoMatchKakaoWorkRecipient()
        .then(function() {
            // 용산 지역은 현재 현장 목록에서 첫 번째 현장을 자동 선택.
            if (
                String(fieldPilotAuth?.region || currentRegion || '') ===
                '용산'
            ) {
                autoSelectYongsanPlace();
            }

            updateKakaoWorkExportSummary();
        })
        .catch(function(error) {
            console.warn(
                '[KakaoWork] 자동 수신자 설정 실패:',
                error
            );
            updateKakaoWorkExportSummary();
        });

    updateKakaoWorkExportSummary();
}


// ------------------------------------------------------------
// 모달 닫기
// ------------------------------------------------------------

function closeKakaoWorkExportModal() {

    const modal =
        document.getElementById(
            'kakaoWorkExportModal'
        );

    if (modal) {

        modal.style.display =
            'none';

    }

}


// ------------------------------------------------------------
// 현장 목록
// ------------------------------------------------------------

function loadKakaoWorkExportPlaces() {

    const search =
        document.getElementById(
            'kakaoWorkExportPlaceSearch'
        );

    const results =
        document.getElementById(
            'kakaoWorkExportPlaceResults'
        );

    const selected =
        document.getElementById(
            'kakaoWorkExportSelectedPlace'
        );

    const region = String(
        currentRegion ||
        fieldPilotAuth?.region ||
        ''
    ).trim();

    if (search) {
        search.value = '';
    }

    if (results) {
        results.innerHTML = '';
        results.style.display = 'none';
    }

    if (selected) {
        selected.textContent =
            '현장을 검색해서 선택하세요.';
    }

    const regionStatus =
        document.getElementById(
            'kakaoWorkExportRegionStatus'
        );

    if (regionStatus) {
        regionStatus.textContent = region
            ? '📍 현재 지역: ' + region
            : '⚠️ 지역이 선택되지 않았습니다.';
    }

    kakaoWorkExportState.place = null;
}


// ------------------------------------------------------------
// 1:1 내보내기 현장 검색
// ------------------------------------------------------------
function searchKakaoWorkExportPlaces() {

    const input =
        document.getElementById(
            'kakaoWorkExportPlaceSearch'
        );

    const results =
        document.getElementById(
            'kakaoWorkExportPlaceResults'
        );

    if (!input || !results) return;

    const keyword =
        input.value.trim().toLowerCase();

    const region = String(
        currentRegion ||
        fieldPilotAuth?.region ||
        ''
    ).trim();

    if (!keyword) {
        results.innerHTML = '';
        results.style.display = 'none';
        return;
    }

    const matched =
        (Array.isArray(places) ? places : [])
            .filter(function(place) {
                if (!place || !place.name) return false;

                const placeRegion = String(
                    place.region ||
                    place.지역 ||
                    region ||
                    ''
                ).trim();

                if (
                    region &&
                    placeRegion &&
                    placeRegion !== region
                ) {
                    return false;
                }

                return String(place.name)
                    .toLowerCase()
                    .includes(keyword);
            })
            .slice(0, 30);

    if (!matched.length) {
        results.innerHTML =
            '<div style="padding:10px;text-align:center;color:#a0aec0;font-size:12px;">' +
            '검색 결과가 없습니다.' +
            '</div>';
        results.style.display = 'block';
        return;
    }

    let html = '';

    matched.forEach(function(place) {

        const safeId =
            escapeJsString(String(place.id));

        html +=
            '<button type="button" ' +
            'onclick="selectKakaoWorkExportPlace(\'' +
            safeId +
            '\')" ' +
            'style="' +
            'display:block;' +
            'width:100%;' +
            'text-align:left;' +
            'background:#fff;' +
            'border:1px solid #e2e8f0;' +
            'border-radius:8px;' +
            'padding:10px 11px;' +
            'margin-bottom:5px;' +
            'cursor:pointer;' +
            '">';

        html +=
            '<div style="font-size:13px;font-weight:700;">' +
            escapeHtml(place.name) +
            '</div>';

        if (place.address) {
            html +=
                '<div style="font-size:11px;color:#718096;margin-top:3px;">' +
                escapeHtml(place.address) +
                '</div>';
        }

        html += '</button>';
    });

    results.innerHTML = html;
    results.style.display = 'block';
}


// ------------------------------------------------------------
// 1:1 내보내기 현장 선택
// ------------------------------------------------------------
async function selectKakaoWorkExportPlace(placeId) {

    const place =
        (Array.isArray(places) ? places : [])
            .find(function(item) {
                return String(item.id) === String(placeId);
            });

    if (!place) return;

    kakaoWorkExportState.place = place;
    kakaoWorkExportState.photos = [];

    const search =
        document.getElementById(
            'kakaoWorkExportPlaceSearch'
        );

    const results =
        document.getElementById(
            'kakaoWorkExportPlaceResults'
        );

    const selected =
        document.getElementById(
            'kakaoWorkExportSelectedPlace'
        );

    if (search) {
        search.value = place.name || '';
    }

    if (results) {
        results.innerHTML = '';
        results.style.display = 'none';
    }

    if (selected) {
        selected.innerHTML =
            '✅ 선택된 현장: <strong>' +
            escapeHtml(place.name || '') +
            '</strong>';
    }

    updateKakaoWorkExportSummary();

    await loadKakaoWorkExportPhotos(
        place.name
    );
}


// ------------------------------------------------------------
// 선택 현장의 서버 저장 사진 불러오기
// ------------------------------------------------------------
async function loadKakaoWorkExportPhotos(siteName) {

    const container =
        document.getElementById(
            'kakaoWorkExportFileList'
        );

    if (!container) return;

    kakaoWorkExportState.photos = [];

    if (!siteName) {
        container.innerHTML =
            '<div style="padding:15px;text-align:center;color:#a0aec0;font-size:12px;">' +
            '현장을 선택하면 서버에 저장된 사진 목록이 표시됩니다.' +
            '</div>';
        updateKakaoWorkExportSummary();
        return;
    }

    const region = String(
        currentRegion ||
        fieldPilotAuth?.region ||
        ''
    ).trim();

    container.innerHTML =
        '<div style="padding:15px;text-align:center;color:#718096;font-size:12px;">' +
        '📷 사진 불러오는 중...' +
        '</div>';

    try {

        const data =
            await serverGet(
                '/api/photos?region=' +
                encodeURIComponent(region) +
                '&siteName=' +
                encodeURIComponent(siteName)
            );

        const photos =
            Array.isArray(data.photos)
                ? data.photos
                : [];

        renderKakaoWorkExportPhotoList(
            region,
            siteName,
            photos
        );

    } catch (error) {

        console.error(
            '[KakaoWork] 사진 목록 조회 실패:',
            error
        );

        container.innerHTML =
            '<div style="padding:15px;text-align:center;color:#e53e3e;font-size:12px;">' +
            '❌ 사진 목록을 불러오지 못했습니다.<br>' +
            escapeHtml(error.message || '') +
            '</div>';

        updateKakaoWorkExportSummary();
    }
}


// ------------------------------------------------------------
// 서버 사진 목록 렌더링
// ------------------------------------------------------------
function renderKakaoWorkExportPhotoList(
    region,
    siteName,
    photos
) {

    const container =
        document.getElementById(
            'kakaoWorkExportFileList'
        );

    if (!container) return;

    if (!photos.length) {

        container.innerHTML =
            '<div style="padding:16px;text-align:center;color:#a0aec0;font-size:12px;">' +
            '📷 이 현장에 저장된 사진이 없습니다.' +
            '</div>';

        updateKakaoWorkExportSummary();
        return;
    }

    let html =
        '<label style="display:flex;align-items:center;gap:8px;padding:8px 3px;border-bottom:1px solid #e2e8f0;margin-bottom:6px;font-size:12px;font-weight:700;cursor:pointer;">' +
        '<input type="checkbox" id="kakaoWorkExportSelectAll" onchange="toggleAllKakaoWorkExportPhotos(this.checked)">' +
        '전체 선택 (' + photos.length + '장)' +
        '</label>';

    photos.forEach(function(photo, index) {

        const fileName =
            String(photo.fileName || '').trim();

        if (!fileName) return;

        const originalUrl =
            photoDownloadUrl(
                region,
                siteName,
                fileName
            );

        const thumbnailUrl = photoThumbnailUrl(region, siteName, fileName);
        const capturedAt = photo.capturedAt || photo.modifiedAt || '';
        const worker = photo.worker || '작업자 미설정';

        html +=
            '<label style="display:flex;align-items:center;gap:8px;padding:7px 3px;border-radius:8px;cursor:pointer;">' +
            '<input type="checkbox" class="kakaoWorkExportPhotoCheck" data-file-name="' +
            escapeHtml(fileName) +
            '" onchange="updateKakaoWorkExportSelection()">' +
            '<img src="' +
            thumbnailUrl +
            '" loading="lazy" data-original-url="' + escapeHtml(originalUrl) + '" onclick="event.preventDefault();event.stopPropagation();openKakaoWorkPhotoPreview(this.dataset.originalUrl,\'' + escapeJsString(fileName) + '\')" style="width:56px;height:56px;object-fit:cover;border-radius:7px;background:#edf2f7;border:1px solid #e2e8f0;" onerror="this.style.opacity=0.35;">' +
            '<div style="min-width:0;flex:1;">' +
            '<div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
            escapeHtml(fileName) +
            '</div>' +
            '<div style="font-size:10px;color:#a0aec0;margin-top:2px;">' +
            escapeHtml(siteName) + ' · 👤 ' + escapeHtml(worker) + '<br>' +
            formatKakaoWorkPhotoInfo(photo.size, capturedAt) +
            '</div>' +
            '</div>' +
            '</label>';
    });

    container.innerHTML = html;
    updateKakaoWorkExportSelection();
}


// ------------------------------------------------------------
// 사진 선택 상태
// ------------------------------------------------------------
function updateKakaoWorkExportSelection() {

    const checks =
        document.querySelectorAll(
            '.kakaoWorkExportPhotoCheck'
        );

    kakaoWorkExportState.photos = [];

    checks.forEach(function(check) {
        if (check.checked) {
            kakaoWorkExportState.photos.push({
                fileName:
                    check.getAttribute('data-file-name') || ''
            });
        }
    });

    const count =
        document.getElementById(
            'kakaoWorkExportPhotoSelectedCount'
        );

    if (count) {
        count.textContent =
            kakaoWorkExportState.photos.length +
            '장 선택';
    }

    updateKakaoWorkExportSummary();
}


// ------------------------------------------------------------
// 전체 사진 선택
// ------------------------------------------------------------
function toggleAllKakaoWorkExportPhotos(checked) {

    document
        .querySelectorAll(
            '.kakaoWorkExportPhotoCheck'
        )
        .forEach(function(check) {
            check.checked = !!checked;
        });

    updateKakaoWorkExportSelection();
}


// ------------------------------------------------------------
// 사진 정보
// ------------------------------------------------------------
function formatKakaoWorkPhotoInfo(size, modifiedAt) {

    const parts = [];

    if (size) {
        const kb =
            Number(size) / 1024;

        if (kb < 1024) {
            parts.push(
                kb.toFixed(0) + ' KB'
            );
        } else {
            parts.push(
                (kb / 1024).toFixed(1) +
                ' MB'
            );
        }
    }

    if (modifiedAt) {
        try {
            parts.push(
                new Date(modifiedAt)
                    .toLocaleString('ko-KR')
            );
        } catch (e) {}
    }

    return parts.join(' · ');
}


// ------------------------------------------------------------
// 사용자 검색
// ------------------------------------------------------------

async function autoMatchKakaoWorkRecipient() {

    const region = String(
        fieldPilotAuth?.region || currentRegion || ''
    ).trim();

    if (!region) {
        kakaoWorkExportState.user = null;
        return false;
    }

    let userId = String(
        fieldPilotAuth?.kakaoWorkUserId || ''
    ).trim();

    let userName = String(
        fieldPilotAuth?.kakaoWorkUserName || ''
    ).trim();

    // 세션 생성 시 저장된 수신자 복사본이 아니라 현재 선택 지역의
    // 최신 사용자 매칭을 직접 조회한다. 마스터 세션도 동일하게 동작한다.
    try {
        const response = await fetch(
            serverBase() +
                '/api/kakao-work/recipient?region=' +
                encodeURIComponent(region),
            {
                method: 'GET',
                headers: {
                    Authorization:
                        'Bearer ' + getAuthToken()
                }
            }
        );

        if (response.ok) {
            const data = await response.json();

            if (data.ok) {
                userId = String(
                    data.kakaoWorkUserId || ''
                ).trim();

                userName = String(
                    data.kakaoWorkUserName || ''
                ).trim();

                fieldPilotAuth = {
                    ...fieldPilotAuth,
                    kakaoWorkUserId: userId,
                    kakaoWorkUserName: userName
                };

                localStorage.setItem(
                    AUTH_STORAGE_KEY,
                    JSON.stringify(fieldPilotAuth)
                );
            }
        } else {
            const errorData = await response.json().catch(function() {
                return {};
            });

            throw new Error(
                errorData.message ||
                errorData.error ||
                '수신자 매칭을 확인하지 못했습니다.'
            );
        }
    } catch (error) {
        console.warn(
            '[KakaoWork] 최신 지역 수신자 확인 실패 → 저장값 사용:',
            error
        );
    }

    if (!userId) {
        kakaoWorkExportState.user = null;

        const box = document.getElementById(
            'kakaoWorkSelectedUserBox'
        );

        const display = document.getElementById(
            'kakaoWorkSelectedUser'
        );

        if (box) box.style.display = 'block';

        if (display) {
            display.innerHTML =
                '⚠️ ' +
                escapeHtml(region) +
                ' 지역의 카카오워크 수신자가 설정되지 않았습니다.';
        }

        return false;
    }

    kakaoWorkExportState.user = {
        id: userId,
        userId: userId,
        name: userName || userId,
        displayName: userName || userId
    };

    const box = document.getElementById(
        'kakaoWorkSelectedUserBox'
    );

    const display = document.getElementById(
        'kakaoWorkSelectedUser'
    );

    if (box) box.style.display = 'block';

    if (display) {
        display.innerHTML =
            '👤 <strong>' +
            escapeHtml(userName || userId) +
            '</strong>' +
            '<div style="font-size:11px;color:#718096;margin-top:3px;">' +
            '📍 ' + escapeHtml(region) +
            ' · 자동 선택됨</div>';
    }

    return true;
}

// ------------------------------------------------------------
// 사용자 검색 (구버전 호환용)
// ------------------------------------------------------------

async function searchKakaoWorkUsers() {

    const input =
        document.getElementById(
            'kakaoWorkUserSearch'
        );

    const results =
        document.getElementById(
            'kakaoWorkUserResults'
        );

    const status =
        document.getElementById(
            'kakaoWorkUserSearchStatus'
        );


    if (!input || !results) return;


    const keyword =
        input.value.trim();


    if (!keyword) {

        if (status) {
            status.textContent =
                '검색어를 입력하세요.';
        }

        return;
    }


    if (status) {

        status.textContent =
            '⏳ 사용자 검색 중...';

    }


    results.innerHTML = '';


    try {

        /*
         * 서버에 사용자 검색 API가 있다면 우선 사용
         */

        const data =
            await serverGet(
                '/api/kakaowork/users?keyword=' +
                encodeURIComponent(keyword)
            );


        const users =
            Array.isArray(data)
                ? data
                : (
                    Array.isArray(data.users)
                        ? data.users
                        : []
                );


        if (!users.length) {

            results.innerHTML =
                '<div style="padding:12px;color:#718096;text-align:center;">' +
                '검색 결과가 없습니다.' +
                '</div>';

            if (status) {
                status.textContent =
                    '검색 결과 없음';
            }

            return;
        }


        users.forEach(
            function(user) {

                renderKakaoWorkUserResult(
                    user,
                    results
                );

            }
        );


        if (status) {

            status.textContent =
                users.length +
                '명의 사용자를 찾았습니다.';

        }


    } catch (error) {

        console.error(
            '[KakaoWork] 사용자 검색 실패:',
            error
        );


        /*
         * 서버 API가 아직 없다면
         * 명확하게 표시한다.
         */

        results.innerHTML =
            '<div style="' +
            'padding:12px;' +
            'background:#fff5f5;' +
            'border:1px solid #fed7d7;' +
            'border-radius:8px;' +
            'color:#c53030;' +
            '">' +
            '❌ 사용자 검색에 실패했습니다.<br>' +
            '<small>' +
            escapeHtml(
                error.message
            ) +
            '</small>' +
            '</div>';


        if (status) {

            status.textContent =
                '사용자 검색 실패';

        }

    }

}


// ------------------------------------------------------------
// 사용자 검색 결과 UI
// ------------------------------------------------------------

function renderKakaoWorkUserResult(
    user,
    container
) {

    const button =
        document.createElement(
            'button'
        );


    button.type =
        'button';


    button.style.cssText =
        'display:block;' +
        'width:100%;' +
        'text-align:left;' +
        'padding:11px;' +
        'margin-top:6px;' +
        'border:1px solid #e2e8f0;' +
        'border-radius:9px;' +
        'background:#fff;' +
        'cursor:pointer;';


    const name =
        user.name ||
        user.user_name ||
        user.displayName ||
        '이름 없음';


    const email =
        user.email ||
        user.user_email ||
        '';


    button.innerHTML =
        '<div style="font-weight:700;">' +
        escapeHtml(name) +
        '</div>' +
        (
            email
                ? '<div style="font-size:11px;color:#718096;margin-top:2px;">' +
                  escapeHtml(email) +
                  '</div>'
                : ''
        );


    button.onclick =
        function() {

            selectKakaoWorkUser(
                user
            );

        };


    container.appendChild(
        button
    );

}


// ------------------------------------------------------------
// 사용자 선택
// ------------------------------------------------------------

function selectKakaoWorkUser(user) {

    kakaoWorkExportState.user =
        user;


    const name =
        user.name ||
        user.user_name ||
        user.displayName ||
        '이름 없음';


    const email =
        user.email ||
        user.user_email ||
        '';


    const box =
        document.getElementById(
            'kakaoWorkSelectedUserBox'
        );


    const display =
        document.getElementById(
            'kakaoWorkSelectedUser'
        );


    if (box) {

        box.style.display =
            'block';

    }


    if (display) {

        display.innerHTML =
            escapeHtml(name) +
            (
                email
                    ? ' <span style="font-size:11px;color:#718096;">' +
                      escapeHtml(email) +
                      '</span>'
                    : ''
            );

    }


    /*
     * 용산 사용자인 경우
     * 용산 현장을 자동 선택
     */

    const userRegion =
        user.region ||
        user.regionName ||
        user.area ||
        user.지역 ||
        '';


    const authorizedRegion =
        fieldPilotAuth?.region ||
        currentRegion ||
        '';


    const targetRegion =
        userRegion ||
        authorizedRegion;


    if (
        targetRegion === '용산' ||
        authorizedRegion === '용산'
    ) {

        autoSelectYongsanPlace();

    }


    updateKakaoWorkExportSummary();

}


// ------------------------------------------------------------
// 용산 현장 자동 선택
// ------------------------------------------------------------

function autoSelectYongsanPlace() {

    const select =
        document.getElementById(
            'kakaoWorkExportPlace'
        );

    if (!select) return;


    const region =
        currentRegion ||
        fieldPilotAuth?.region ||
        '';


    if (region !== '용산') {
        return;
    }


    /*
     * 이미 용산 사용자이고
     * 용산 지역 현장만 존재하므로
     * 첫 번째 현장을 자동 선택
     */

    if (
        select.options.length > 1 &&
        select.value === ''
    ) {

        select.selectedIndex =
            1;


        onKakaoWorkExportPlaceChange();

    }

}


// ------------------------------------------------------------
// 사진 선택
// ------------------------------------------------------------

function handleKakaoWorkExportPhotos(input) {

    if (!input) return;

    // 구버전 호환: 서버 사진 선택 구조에서는 사용하지 않는다.
    kakaoWorkExportState.photos =
        Array.from(input.files || []).map(function(file) {
            return { fileName: file.name };
        });

    updateKakaoWorkExportSummary();
}


// ------------------------------------------------------------
// 사진 미리보기
// ------------------------------------------------------------

function renderKakaoWorkPhotoPreview() {

    const container =
        document.getElementById(
            'kakaoWorkExportPhotoPreview'
        );


    if (!container) return;


    container.innerHTML = '';


    kakaoWorkExportState.photos.forEach(
        function(file) {

            const reader =
                new FileReader();


            reader.onload =
                function(event) {

                    const img =
                        document.createElement(
                            'img'
                        );


                    img.src =
                        event.target.result;


                    img.style.cssText =
                        'width:100%;' +
                        'aspect-ratio:1;' +
                        'object-fit:cover;' +
                        'border-radius:7px;' +
                        'border:1px solid #e2e8f0;';


                    container.appendChild(
                        img
                    );

                };


            reader.readAsDataURL(
                file
            );

        }
    );

}


// ------------------------------------------------------------
// 전송 가능 상태
// ------------------------------------------------------------

function updateKakaoWorkExportSummary() {

    const summary =
        document.getElementById(
            'kakaoWorkExportSummary'
        );


    const send =
        document.getElementById(
            'kakaoWorkExportSendBtn'
        );

    const download = document.getElementById('kakaoWorkExportDownloadBtn');


    const user =
        kakaoWorkExportState.user;


    const place =
        kakaoWorkExportState.place;


    const photos =
        kakaoWorkExportState.photos;


    const userName =
        user
            ? (
                user.name ||
                user.user_name ||
                user.displayName ||
                '선택됨'
            )
            : '선택 안 됨';


    const placeName =
        place
            ? (
                place.name ||
                place.placeName ||
                place.title ||
                place.현장명 ||
                '선택됨'
            )
            : '선택 안 됨';


    if (summary) {

        summary.innerHTML =
            '사용자: ' +
            escapeHtml(userName) +
            '<br>' +
            '현장: ' +
            escapeHtml(placeName) +
            '<br>' +
            '사진: ' +
            photos.length +
            '장';

    }


    if (send) {

        send.disabled =
            !user ||
            !place ||
            photos.length === 0;

    }

    if (download) download.disabled = !place || photos.length === 0;

}

function openKakaoWorkPhotoPreview(url, fileName) {
    if (!url) return;
    const existing = document.getElementById('kakaoWorkOriginalPreview');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'kakaoWorkOriginalPreview';
    modal.style.cssText = 'position:fixed;inset:0;z-index:1000000;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:18px;';
    const image = document.createElement('img');
    image.src = url;
    image.alt = fileName || '원본 사진';
    image.style.cssText = 'max-width:96%;max-height:90vh;object-fit:contain;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.45);';
    modal.appendChild(image);
    modal.addEventListener('click', function() { modal.remove(); });
    document.body.appendChild(modal);
}

function downloadSelectedKakaoWorkPhotos() {
    const state = kakaoWorkExportState;
    const siteName = String(state.place?.name || state.place?.placeName || '').trim();
    const region = String(currentRegion || fieldPilotAuth?.region || '').trim();
    if (!region || !siteName || !state.photos.length) {
        alert('다운로드할 사진을 선택하세요.');
        return;
    }
    state.photos.forEach(function(photo, index) {
        setTimeout(function() {
            const link = document.createElement('a');
            link.href = photoDownloadUrl(region, siteName, photo.fileName);
            link.download = photo.fileName || ('photo_' + (index + 1) + '.jpg');
            link.rel = 'noopener';
            document.body.appendChild(link); link.click(); link.remove();
        }, index * 180);
    });
}


// ------------------------------------------------------------
// 실제 1:1 전송
// ------------------------------------------------------------

async function sendKakaoWorkDirectMessage() {

    const state =
        kakaoWorkExportState;


    if (!state.user) {

        alert(
            '사용자를 선택하세요.'
        );

        return;
    }


    if (!state.place) {

        alert(
            '현장을 선택하세요.'
        );

        return;
    }


    if (!state.photos.length) {

        alert(
            '사진을 선택하세요.'
        );

        return;
    }


    const status =
        document.getElementById(
            'kakaoWorkExportStatus'
        );


    const button =
        document.getElementById(
            'kakaoWorkExportSendBtn'
        );


    if (button) {

        button.disabled =
            true;

        button.textContent =
            '⏳ 전송 중...';

    }


    try {

        const siteName =
            typeof state.place === 'string'
                ? state.place.trim()
                : String(
                    state.place?.name ||
                    state.place?.placeName ||
                    state.place?.title ||
                    state.place?.현장명 ||
                    ''
                ).trim();

        const fileNames =
            (Array.isArray(state.photos)
                ? state.photos
                : []
            )
            .map(function(file) {
                return String(
                    file?.name ||
                    file?.fileName ||
                    ''
                ).trim();
            })
            .filter(Boolean);

        if (!siteName) {
            throw new Error('현장이 선택되지 않았습니다.');
        }

        if (!fileNames.length) {
            throw new Error('전송할 사진이 없습니다.');
        }

        const result =
            await serverPost(
                '/api/export/one-to-one',
                {
                    region:
                        currentRegion ||
                        fieldPilotAuth?.region ||
                        '',
                    siteName,
                    fileNames
                }
            );

        if (!result || result.ok === false) {

            throw new Error(
                result?.message ||
                result?.error ||
                '전송 실패'
            );

        }


        if (status) {

            status.style.color =
                '#38a169';

            status.textContent =
                '✅ 카카오워크 1:1 전송 완료';

        }


        alert(
            '✅ 카카오워크 1:1 전송이 완료되었습니다.'
        );


        setTimeout(
            closeKakaoWorkExportModal,
            500
        );


    } catch (error) {

        console.error(
            '[KakaoWork] 1:1 전송 실패:',
            error
        );


        if (status) {

            status.style.color =
                '#e53e3e';

            status.textContent =
                '❌ ' +
                error.message;

        }


        alert(
            '❌ 카카오워크 전송 실패\n\n' +
            error.message
        );


    } finally {

        if (button) {

            button.disabled =
                false;

            button.textContent =
                '📤 1:1 전송';

            updateKakaoWorkExportSummary();

        }

    }

}


// ------------------------------------------------------------
// File → Base64
// ------------------------------------------------------------

function fileToBase64(file) {

    return new Promise(
        function(resolve, reject) {

            const reader =
                new FileReader();


            reader.onload =
                function() {

                    const result =
                        String(
                            reader.result ||
                            ''
                        );


                    const comma =
                        result.indexOf(',');


                    resolve(
                        comma >= 0
                            ? result.slice(
                                comma + 1
                            )
                            : result
                    );

                };


            reader.onerror =
                function() {

                    reject(
                        new Error(
                            '사진을 읽을 수 없습니다.'
                        )
                    );

                };


            reader.readAsDataURL(
                file
            );

        }
    );

}


// ------------------------------------------------------------
// HTML escape
// ------------------------------------------------------------



function selectWorkAddPlace(placeId) {
    var place = places.find(function(p) { return String(p.id) === String(placeId); });
    if (!place) return;

    var hidden = document.getElementById('workAddPlace');
    var search = document.getElementById('workAddPlaceSearch');
    var results = document.getElementById('workAddPlaceResults');
    var selectedEl = document.getElementById('workAddSelectedPlace');

    if (hidden) hidden.value = place.name;
    if (search) search.value = place.name;

    // ★ 임시 작업 기록에 현장을 즉시 반영
    var draftWork = currentWork || loadWorkFromLocalStorage();
    if (draftWork && Array.isArray(draftWork.workHistory)) {
        var draftWorkId = hidden ? hidden.getAttribute('data-work-id') : '';
        var draftRecord = draftWork.workHistory.find(function(w) {
            return String(w.id) === String(draftWorkId) && w._draft;
        });
        if (draftRecord) {
            draftRecord.placeName = place.name;
            draftWork.lastUpdated = new Date().toISOString();
            currentWork = draftWork;
            saveWorkToLocalStorage(draftWork);
        }
    }
    if (results) {
        results.innerHTML = '';
        results.style.display = 'none';
    }
    if (selectedEl) selectedEl.innerHTML = '✅ 선택된 현장: <strong>' + escapeHtml(place.name) + '</strong>';
}

async function saveWorkAdd(dateStr, workId) {
    var placeNameEl = document.getElementById('workAddPlace');
    var placeName = placeNameEl ? placeNameEl.value.trim() : '';
    var contentEl = document.getElementById('workAddContent');
    var content = contentEl ? contentEl.value.trim() : '';
    var cameraEl = document.getElementById('workAddCamera');
    var camera = cameraEl ? cameraEl.value.trim() : '';

    if (!placeName) {
        showTabStatus('tab-work', '⚠️ 현장을 검색해서 선택하세요.', 'warning');
        var search = document.getElementById('workAddPlaceSearch');
        if (search) search.focus();
        return;
    }

    var work = currentWork || loadWorkFromLocalStorage();
    if (!work || !Array.isArray(work.workHistory)) {
        work = { version: 1, categories: [], workHistory: [], lastUpdated: null };
    }

    var now = new Date();
    var timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    var record = work.workHistory.find(function(w) {
        return String(w.id) === String(workId);
    });

    if (!record) {
        record = {
            id: workId,
            date: dateStr,
            time: timeStr,
            timestamp: now.getTime(),
            placeName: placeName,
            dong: '',
            worker: workerName || '미설정',
            category: '',
            content: content,
            camera: camera,
            fromStats: false
        };
        work.workHistory.push(record);
    } else {
        record.date = dateStr;
        record.time = record.time || timeStr;
        record.timestamp = record.timestamp || now.getTime();
        record.placeName = placeName;
        record.worker = workerName || record.worker || '미설정';
        record.content = content;
        record.camera = camera;
        record._draft = false;
    }

    work.lastUpdated = now.toISOString();
    currentWork = work;
    saveWorkToLocalStorage(work);

    var modal = document.getElementById('workAddModal');
    if (modal) modal.remove();

    var uploaded = await uploadWorkToGitHub(work);
    renderWorkTab();
    showWorkDateDetail(dateStr);
    showTabStatus('tab-work', uploaded ? '✅ 처리내역 추가 완료 (⏰ ' + timeStr + ' 기록)' : '⚠️ 추가됨. GitHub 업로드 실패', uploaded ? 'ok' : 'warning');
}

function openCategoryManager() {
    showTabStatus('tab-work', 'ℹ️ 처리구분 기능이 제거되었습니다.', 'info');
return;
    let work = currentWork || loadWorkFromLocalStorage();
    let categories = work.categories || [];
    let existing = document.getElementById('categoryManagerModal');
    if (existing) existing.remove();

    let listHtml = '';
    for (let i = 0; i < categories.length; i++) {
        listHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#f7fafc;border-radius:6px;margin-bottom:4px;">';
        listHtml += '<span style="font-size:13px;">' + escapeHtml(categories[i]) + '</span>';
        listHtml += '<div style="display:flex;gap:4px;">';
        listHtml += '<button class="btn btn-outline btn-sm" onclick="renameCategory(' + i + ')" style="padding:2px 8px;font-size:11px;">수정</button>';
        listHtml += '<button class="btn btn-danger btn-sm" onclick="deleteCategory(' + i + ')" style="padding:2px 8px;font-size:11px;">삭제</button>';
        listHtml += '</div></div>';
    }

    let modalHtml = '<div id="categoryManagerModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:999999;display:flex;justify-content:center;align-items:center;padding:20px;" onclick="if(event.target===this)this.remove()">';
    modalHtml += '<div style="background:white;border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);max-height:80vh;overflow-y:auto;" onclick="event.stopPropagation()">';
    modalHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
    modalHtml += '<button onclick="document.getElementById(\'categoryManagerModal\').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#a0aec0;">×</button>';
    modalHtml += '</div>';
    modalHtml += '<div style="margin-bottom:12px;">' + listHtml + '</div>';
    modalHtml += '<div style="display:flex;gap:8px;">';
    modalHtml += '<input type="text" id="newCategoryInput" placeholder="새 구분명" style="flex:1;padding:8px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:13px;" onkeydown="if(event.key===\'Enter\')addCategory()">';
    modalHtml += '<button class="btn btn-primary btn-sm" onclick="addCategory()" style="padding:6px 14px;">추가</button>';
    modalHtml += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function addCategory() {
    let input = document.getElementById('newCategoryInput');
    if (!input) return;
    let name = input.value.trim();
    if (!name) return;
    let work = currentWork || loadWorkFromLocalStorage();
    if (work.categories.includes(name)) {
        showTabStatus('tab-work', '⚠️ 이미 존재하는 구분입니다.', 'warning');
        return;
    }
    work.categories.push(name);
    saveWorkToLocalStorage(work);
    uploadWorkToGitHub(work);
    document.getElementById('categoryManagerModal').remove();
    openCategoryManager();
    showTabStatus('tab-work', '✅ "' + name + '" 구분 추가됨', 'ok');
}

function deleteCategory(index) {
    let work = currentWork || loadWorkFromLocalStorage();
    let name = work.categories[index];
    showConfirmModal('🗑️ 구분 삭제', '"' + name + '" 구분을 삭제하시겠습니까?', function() {
        work.categories.splice(index, 1);
        saveWorkToLocalStorage(work);
        uploadWorkToGitHub(work);
        document.getElementById('categoryManagerModal').remove();
        openCategoryManager();
        showTabStatus('tab-work', '✅ "' + name + '" 구분 삭제됨', 'ok');
    });
}

function renameCategory(index) {
    let work = currentWork || loadWorkFromLocalStorage();
    let oldName = work.categories[index];
    showPromptModal('✏️ 구분 수정', '새 이름을 입력하세요:', oldName, function(newName) {
        if (!newName || newName === oldName) return;
        work.workHistory.forEach(function(w) {
            if (w.category === oldName) w.category = newName;
        });
        work.categories[index] = newName;
        saveWorkToLocalStorage(work);
        uploadWorkToGitHub(work);
        document.getElementById('categoryManagerModal').remove();
        openCategoryManager();
        showTabStatus('tab-work', '✅ "' + oldName + '" → "' + newName + '" 수정됨', 'ok');
    });
}
let helpEasterEggCount = 0;
let lastHelpClickTime = 0;
let lunchGameSpinning = false;
const LUNCH_HISTORY_KEY = 'lunchGameHistory';

function handleHelpEasterEgg() {
    let now = Date.now();
    // 2초 이내 연속 클릭만 카운트
    if (now - lastHelpClickTime > 2000) {
        helpEasterEggCount = 0;
    }
    lastHelpClickTime = now;
    helpEasterEggCount++;
    if (helpEasterEggCount >= 5) {
        helpEasterEggCount = 0;
        openLunchGame();
    }
}

function openLunchGame() {
    let existing = document.getElementById('lunchGameModal');
    if (existing) existing.remove();

    let modalHtml = '<div id="lunchGameModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:999999;display:flex;justify-content:center;align-items:center;padding:20px;" onclick="if(event.target===this)this.remove()">';
    modalHtml += '<div class="lunch-game-panel" style="background:white;border-radius:24px;padding:24px 20px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:88vh;overflow-y:auto;" onclick="event.stopPropagation()">';
    modalHtml += '<div style="text-align:center;">';
    modalHtml += '<div style="font-size:48px;margin-bottom:8px;">🍱</div>';
    modalHtml += '<h3 style="font-size:20px;font-weight:700;color:#1a202c;margin-bottom:4px;">오늘 점심은 뭐 먹지?</h3>';
    modalHtml += '<div style="font-size:12px;color:#718096;margin-bottom:14px;">종류를 고르고 돌리면 직전 메뉴는 자동으로 피합니다.</div>';
    modalHtml += '</div>';
    modalHtml += '<div class="lunch-game-options" style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:12px;">';
    modalHtml += '<select id="lunchCategoryFilter" onchange="updateLunchMenuPoolInfo()" aria-label="점심 메뉴 종류" style="width:100%;min-height:38px;border:1px solid #cbd5e0;border-radius:9px;padding:6px 9px;background:white;color:#2d3748;font-size:13px;"><option value="all">전체 메뉴</option><option value="한식">한식</option><option value="면·중식">면·중식</option><option value="일식">일식</option><option value="양식·간편">양식·간편</option><option value="건강식">건강식</option></select>';
    modalHtml += '<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#4a5568;white-space:nowrap;cursor:pointer;"><input id="lunchExcludeSpicy" type="checkbox" onchange="updateLunchMenuPoolInfo()"> 🌶️ 매운맛 제외</label>';
    modalHtml += '</div>';
    modalHtml += '<div id="lunchPoolInfo" style="font-size:11px;color:#718096;margin:-4px 0 10px;text-align:center;"></div>';
    modalHtml += '<div id="lunchDisplayBg" style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:16px;padding:24px 16px;margin-bottom:20px;min-height:90px;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all 0.3s;">';
    modalHtml += '<div id="lunchMenuDisplay" style="font-size:26px;font-weight:800;color:white;">❓</div>';
    modalHtml += '<div id="lunchResultMsg" style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">버튼을 눌러 메뉴를 골라보세요!</div>';
    modalHtml += '</div>';
    modalHtml += '<div id="lunchRestaurantList" style="display:none;margin-bottom:16px;"></div>';
    modalHtml += '<div id="lunchRecentHistory" style="margin-bottom:12px;"></div>';
    modalHtml += '<button id="lunchSpinBtn" onclick="spinLunchMenu()" style="width:100%;padding:14px;background:#38a169;color:white;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;margin-bottom:8px;">🎰 메뉴 돌리기!</button>';
    modalHtml += '<button onclick="document.getElementById(\'lunchGameModal\').remove()" style="width:100%;padding:10px;background:#f7fafc;color:#718096;border:1px solid #e2e8f0;border-radius:12px;font-size:13px;cursor:pointer;">닫기</button>';
    modalHtml += '</div></div>';

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    updateLunchMenuPoolInfo();
    if (navigator.vibrate) navigator.vibrate(50);
}

function getLunchMenuItems() {
    return [
        ['🍲 김치찌개','한식',true], ['🥘 된장찌개','한식',false], ['🍖 제육볶음','한식',true], ['🍚 순두부찌개','한식',true],
        ['🍚 비빔밥','한식',false], ['🐔 삼계탕','한식',false], ['🍖 설렁탕','한식',false], ['🍲 해장국','한식',true],
        ['🥘 부대찌개','한식',true], ['🍖 갈비탕','한식',false], ['🌶️ 육개장','한식',true], ['🍛 덮밥','한식',false], ['🍚 볶음밥','한식',false], ['🍢 어묵탕','한식',false],
        ['🍜 칼국수','면·중식',false], ['🥟 짜장면','면·중식',false], ['🌶️ 짬뽕','면·중식',true], ['🍧 냉면','면·중식',false],
        ['🍜 콩국수','면·중식',false], ['🍜 잔치국수','면·중식',false], ['🍜 라면','면·중식',true], ['🍜 우동','면·중식',false],
        ['🌶️ 마라탕','면·중식',true], ['🍜 쌀국수','면·중식',false], ['🥟 만두','면·중식',false],
        ['🍱 돈까스','일식',false], ['🍙 김밥','일식',false], ['🍣 초밥','일식',false],
        ['🍔 햄버거','양식·간편',false], ['🥪 샌드위치','양식·간편',false], ['🍗 치킨','양식·간편',false], ['🍕 피자','양식·간편',false],
        ['🍛 카레','양식·간편',false], ['🍳 오므라이스','양식·간편',false], ['🍝 파스타','양식·간편',false], ['🥗 샐러드','건강식',false]
    ].map(function(item) {
        return { label: item[0], category: item[1], spicy: item[2] };
    });
}

function getLunchHistory() {
    try {
        const history = JSON.parse(localStorage.getItem(LUNCH_HISTORY_KEY) || '[]');
        return Array.isArray(history) ? history.slice(0, 5) : [];
    } catch (e) {
        return [];
    }
}

function saveLunchHistory(menu) {
    const next = [menu].concat(getLunchHistory().filter(function(item) { return item !== menu; })).slice(0, 5);
    localStorage.setItem(LUNCH_HISTORY_KEY, JSON.stringify(next));
}

function getLunchMenus() {
    const category = document.getElementById('lunchCategoryFilter')?.value || 'all';
    const excludeSpicy = !!document.getElementById('lunchExcludeSpicy')?.checked;
    return getLunchMenuItems().filter(function(item) {
        return (category === 'all' || item.category === category) && (!excludeSpicy || !item.spicy);
    }).map(function(item) { return item.label; });
}

function updateLunchMenuPoolInfo() {
    const info = document.getElementById('lunchPoolInfo');
    const historyEl = document.getElementById('lunchRecentHistory');
    const menus = getLunchMenus();
    if (info) info.textContent = '현재 후보 ' + menus.length + '개 · 같은 메뉴 연속 당첨 방지';
    if (historyEl) {
        const history = getLunchHistory();
        historyEl.innerHTML = history.length
            ? '<div style="font-size:11px;color:#718096;margin-bottom:5px;">최근 결과</div><div style="display:flex;gap:5px;flex-wrap:wrap;">' + history.map(function(menu) { return '<span style="background:#edf2f7;color:#4a5568;border-radius:999px;padding:4px 8px;font-size:11px;">' + escapeHtml(menu) + '</span>'; }).join('') + '</div>'
            : '<div style="font-size:11px;color:#a0aec0;text-align:center;">아직 최근 결과가 없습니다.</div>';
    }
}

function chooseLunchMenu(menus) {
    const previous = getLunchHistory()[0];
    const candidates = menus.length > 1 ? menus.filter(function(menu) { return menu !== previous; }) : menus;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function getLunchMenuSearchText(menu) {
    return String(menu || '').replace(/^[^\s]+\s/, '');
}

function spinLunchMenu() {
    if (lunchGameSpinning) return;
    lunchGameSpinning = true;

    let menus = getLunchMenus();
    let display = document.getElementById('lunchMenuDisplay');
    let resultMsg = document.getElementById('lunchResultMsg');
    let btn = document.getElementById('lunchSpinBtn');
    let bg = document.getElementById('lunchDisplayBg');
    let restaurantList = document.getElementById('lunchRestaurantList');
    if (!display || !btn) { lunchGameSpinning = false; return; }
    if (!menus.length) {
        lunchGameSpinning = false;
        if (resultMsg) resultMsg.textContent = '조건에 맞는 메뉴가 없습니다.';
        return;
    }

    if (restaurantList) { restaurantList.style.display = 'none'; restaurantList.innerHTML = ''; }
    btn.textContent = '🎰 고르는 중...';
    btn.style.background = '#a0aec0';
    btn.disabled = true;
    display.style.fontSize = '26px';
    if (resultMsg) resultMsg.textContent = '두근두근...';
    if (bg) bg.style.background = 'linear-gradient(135deg,#667eea,#764ba2)';

    let totalSpins = 20 + Math.floor(Math.random() * 7);
    let currentSpin = 0;
    let finalMenu = chooseLunchMenu(menus);

    function doSpin() {
        currentSpin++;
        let randomMenu = menus[Math.floor(Math.random() * menus.length)];
        display.textContent = randomMenu;
        if (navigator.vibrate) navigator.vibrate(20);

        if (currentSpin >= totalSpins) {
            display.textContent = finalMenu;
            display.style.fontSize = '30px';
            if (resultMsg) resultMsg.textContent = '🎉 결정 완료! 근처 식당을 찾아볼게요~';
            if (bg) bg.style.background = 'linear-gradient(135deg,#f6ad55,#ed8936)';
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            saveLunchHistory(finalMenu);
            updateLunchMenuPoolInfo();

            // ★ 이모지 제거 후 식당 검색
            let menuText = getLunchMenuSearchText(finalMenu);
            searchLunchRestaurants(menuText);

            setTimeout(function() {
                btn.textContent = '🔄 다시 돌리기';
                btn.style.background = '#38a169';
                btn.disabled = false;
                lunchGameSpinning = false;
            }, 800);
            return;
        }

        let progress = currentSpin / totalSpins;
        let delay = 45 + Math.floor(progress * progress * 180);
        setTimeout(doSpin, delay);
    }

    doSpin();
}

function searchLunchRestaurants(menu) {
    let restaurantList = document.getElementById('lunchRestaurantList');
    if (!restaurantList) return;

    restaurantList.style.display = 'block';
    restaurantList.innerHTML = '<div style="text-align:center;padding:12px;color:#a0aec0;font-size:13px;">📍 "' + escapeHtml(menu) + '" 식당 검색 중...</div>';

    let coords = (typeof userGpsCoords !== 'undefined' && userGpsCoords) ? userGpsCoords : null;

    function doSearch(lat, lng, isGps) {
        let restKey = settings.kakaoRestKey || 'server-proxy'; // 서버가 실제 키 보유, 클라이언트는 게이트 통과용
        if (!restKey) {
            restaurantList.innerHTML = '<div style="text-align:center;padding:12px;color:#e53e3e;font-size:13px;">⚠️ 카카오 REST API 키가 필요합니다.</div>';
            return;
        }
        let query = menu + ' 맛집';
        let apiUrl = '/api/places/search?q=' + encodeURIComponent(query) + '&lat=' + lat + '&lng=' + lng;
        serverGet(apiUrl)
            .then(function(data) {
                if (!data.documents || data.documents.length === 0) {
                    let apiUrl2 = '/api/places/search?q=' + encodeURIComponent(menu) + '&lat=' + lat + '&lng=' + lng;
                    serverGet(apiUrl2)
                        .then(function(data2) {
                            renderRestaurantResults(data2.documents || [], menu, isGps);
                        })
                        .catch(function() {
                            restaurantList.innerHTML = '<div style="text-align:center;padding:12px;color:#e53e3e;font-size:13px;">❌ 검색 실패</div>';
                        });
                    return;
                }
                renderRestaurantResults(data.documents, menu, isGps);
            })
            .catch(function() {
                restaurantList.innerHTML = '<div style="text-align:center;padding:12px;color:#e53e3e;font-size:13px;">❌ 검색 실패</div>';
            });
    }

    if (coords) {
        doSearch(coords.lat, coords.lng, true);
    } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                doSearch(position.coords.latitude, position.coords.longitude, true);
            },
            function() {
                let center = getRegionCenter(currentRegion);
                doSearch(center.lat, center.lng, false);
            },
            { timeout: 8000 }
        );
    } else {
        let center = getRegionCenter(currentRegion);
        doSearch(center.lat, center.lng, false);
    }
}

function renderRestaurantResults(documents, menu, isGps) {
    let restaurantList = document.getElementById('lunchRestaurantList');
    if (!restaurantList) return;

    let locationMsg = isGps ? '📍 내 위치 기준' : '🗺️ 지역 중심 기준';
    let html = '<div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#1a202c;">🍽️ "' + escapeHtml(menu) + '" 추천 식당</div>';
    html += '<div style="font-size:11px;color:#718096;margin-bottom:8px;">' + locationMsg + ' · 반경 3km · 거리순</div>';

    if (documents.length === 0) {
        html += '<div style="text-align:center;padding:12px;color:#a0aec0;font-size:13px;">근처에 "' + escapeHtml(menu) + '" 식당이 없어요 😢</div>';
        restaurantList.innerHTML = html;
        return;
    }

    let topList = documents.slice(0, 5);
    for (let i = 0; i < topList.length; i++) {
        let place = topList[i];
        let distance = place.distance ? (place.distance >= 1000 ? (place.distance / 1000).toFixed(1) + 'km' : place.distance + 'm') : '';
        let safeName = escapeHtml(place.place_name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        html += '<div class="lunch-restaurant-item" onclick="openLunchRestaurantInMap(this)" data-id="' + escapeHtml(place.id || '') + '" data-name="' + safeName + '" data-lat="' + place.y + '" data-lng="' + place.x + '" style="display:flex;align-items:center;gap:10px;padding:10px;background:#f7fafc;border-radius:10px;margin-bottom:6px;cursor:pointer;border-left:3px solid #38a169;">';
        html += '<div style="font-size:20px;font-weight:700;color:#38a169;min-width:28px;">' + (i + 1) + '</div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-weight:600;font-size:13px;color:#1a202c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(place.place_name) + '</div>';
        html += '<div style="font-size:11px;color:#718096;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(place.address_name || '') + '</div>';
        if (place.phone) {
            html += '<div style="font-size:11px;color:#4a5568;margin-top:1px;">📞 ' + escapeHtml(place.phone) + '</div>';
        }
        html += '</div>';
        if (distance) {
            html += '<div style="font-size:11px;font-weight:600;color:#38a169;flex-shrink:0;">' + distance + '</div>';
        }
        html += '</div>';
    }

    if (documents.length > 5) {
        html += '<div style="text-align:center;font-size:11px;color:#a0aec0;margin-top:4px;">그 외 ' + (documents.length - 5) + '개 식당이 더 있어요</div>';
    }

    restaurantList.innerHTML = html;
}

// ★ 식당 클릭 → 카카오맵 앱에서 장소 표시
function openLunchRestaurantInMap(el) {
    if (!el || !el.dataset) {
        showTabStatus('tab-help', '⚠️ 식당 정보를 찾을 수 없습니다. 다시 돌려주세요.', 'warning');
        return;
    }
    let name = el.dataset.name || '';
    let id = el.dataset.id || '';
    let lat = el.dataset.lat;
    let lng = el.dataset.lng;
    let isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    showTabStatus('tab-help', '🗺️ "' + name + '" 카카오맵 여는 중...', 'info');

    // ★ 1순위: 장소 상세 보기 (식당 마커 + 상세정보 + 별점)
    // ★ 2순위: 키워드 + 좌표 검색
    let appScheme = id
        ? 'kakaomap://place?id=' + id
        : 'kakaomap://search?q=' + encodeURIComponent(name) + '&p=' + lat + ',' + lng;

    // 웹 폴백: 카카오맵 장소 상세 페이지
    let webUrl = id
        ? 'https://place.map.kakao.com/' + id
        : 'https://map.kakao.com/?q=' + encodeURIComponent(name);

    if (!isMobile) {
        // PC: 웹 장소 페이지
        window.open(webUrl, '_blank');
        return;
    }

    // 모바일: 앱 스킴 실행
    window.location.href = appScheme;
    // ★ 앱이 안 열렸으면(미설치) 웹으로 폴백
    setTimeout(function() {
        if (!document.hidden) {
            window.location.href = webUrl;
        }
    }, 1500);
}
// ============================================================
// 47. 사진 저장소 (노트북 서버 /api/photos 로 직접 저장 - IndexedDB 제거됨)
// 기존 IndexedDB 기반 함수와 이름/시그니처를 동일하게 유지해서
// 이 밑의 업로드/표시/삭제/전송 코드는 손대지 않아도 되도록 함.
// photoInfoCache: 화면에 렌더링된 사진의 opaque id -> 서버 위치 매핑 (메모리 캐시)
// ============================================================
let photoInfoCache = new Map();

function findWorkRecordById(workId) {
    let work = currentWork || loadWorkFromLocalStorage();
    if (!work || !Array.isArray(work.workHistory)) return null;
    return work.workHistory.find(function(w) { return w.id === workId; }) || null;
}

function photoDownloadUrl(region, siteName, fileName) {
    return serverBase() + '/api/photo'
        + '?region=' + encodeURIComponent(region)
        + '&siteName=' + encodeURIComponent(siteName)
        + '&fileName=' + encodeURIComponent(fileName);
}

function photoThumbnailUrl(region, siteName, fileName) {
    return serverBase() + '/api/photo/thumbnail'
        + '?region=' + encodeURIComponent(region)
        + '&siteName=' + encodeURIComponent(siteName)
        + '&fileName=' + encodeURIComponent(fileName);
}

function newPhotoId() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function savePhotoToDB(photo) {
    let record = findWorkRecordById(photo.workId);

    // ★ 신규 작업 사진을 먼저 촬영한 경우의 안전망
    if (!record) {
        let work = currentWork || loadWorkFromLocalStorage();
        if (!work || !Array.isArray(work.workHistory)) {
            work = { version: 1, categories: [], workHistory: [], lastUpdated: null };
        }

        record = {
            id: photo.workId,
            date: new Date().toISOString().slice(0, 10),
            time: '',
            timestamp: Date.now(),
            placeName: '',
            dong: '',
            worker: workerName || '미설정',
            category: '',
            content: '',
            camera: '',
            fromStats: false,
            _draft: true
        };

        work.workHistory.push(record);
        work.lastUpdated = new Date().toISOString();
        currentWork = work;
        saveWorkToLocalStorage(work);
    }
    let region = record.region || currentRegion || '미지정지역';
    let siteName = record.placeName || '미지정현장';

    let result = await uploadPhotoMultipart({
        ...photo,
        region: region,
        siteName: siteName,
        date: record.date || '',
        time: record.time || '',
        worker: record.worker || '',
        camera: record.camera || '',
        content: record.content || ''
    });

    let id = newPhotoId();
    photoInfoCache.set(id, {
        id: id,
        workId: photo.workId,
        region: region,
        siteName: siteName,
        fileName: result.fileName || photo.fileName || '',
        dataUrl: result.queued
            ? (photo.dataUrl || result.previewUrl || '')
            : photoDownloadUrl(region, siteName, result.fileName),
        thumbnailUrl: result.queued
            ? (photo.dataUrl || result.previewUrl || '')
            : photoThumbnailUrl(region, siteName, result.fileName),
        fileSize: photo.fileSize,
        uploadedAt: photo.uploadedAt,
        capturedAt: photo.capturedAt || photo.uploadedAt,
        worker: record.worker || '',
        date: record.date || '',
        time: record.time || '',
        queued: result.queued === true
    });
    return id;
}

async function getPhotosByWorkId(workId) {
    let record = findWorkRecordById(workId);
    if (!record) return [];
    let region = record.region || currentRegion || '미지정지역';
    let siteName = record.placeName || '미지정현장';

    let data = { photos: [] };
    try {
        data = await serverGet('/api/photos?region=' + encodeURIComponent(region) + '&siteName=' + encodeURIComponent(siteName));
    } catch (e) {
        console.warn('[FieldPilot] 서버 사진 목록 조회 실패, 대기 사진 표시:', e);
    }
    let rows = (data.photos || []).filter(function(p) { return String(p.workId) === String(workId); });
    if (!rows.length && navigator.onLine) {
        try {
            const recovered = await serverGet('/api/photos/by-work?region=' + encodeURIComponent(region) + '&workId=' + encodeURIComponent(workId));
            rows = Array.isArray(recovered.photos) ? recovered.photos : [];
        } catch (error) {
            console.warn('[FieldPilot] 이전 위치 사진 복구 조회 실패:', error);
        }
    }
    let serverPhotos = rows.map(function(p) {
        const photoSiteName = p.siteName || siteName;
        const photoVersion = encodeURIComponent(p.editedAt || p.modifiedAt || p.savedAt || '');
        let id = newPhotoId();
        let entry = {
            id: id,
            workId: workId,
            region: region,
            siteName: photoSiteName,
            fileName: p.fileName,
            dataUrl: photoDownloadUrl(region, photoSiteName, p.fileName) + (photoVersion ? '&v=' + photoVersion : ''),
            thumbnailUrl: photoThumbnailUrl(region, photoSiteName, p.fileName) + (photoVersion ? '&v=' + photoVersion : ''),
            fileSize: p.size,
            uploadedAt: p.savedAt || p.modifiedAt,
            capturedAt: p.capturedAt || p.modifiedAt,
            worker: p.worker || record.worker || '',
            date: p.date || record.date || '',
            time: p.time || record.time || ''
        };
        photoInfoCache.set(id, entry);
        return entry;
    });
    const serverKeys = new Set(serverPhotos.map(function(p) {
        return [p.region, p.siteName, p.fileName].join('::');
    }));
    const pendingPhotos = Array.from(photoInfoCache.values()).filter(function(p) {
        return p.queued === true && String(p.workId) === String(workId) &&
            !serverKeys.has([p.region, p.siteName, p.fileName].join('::'));
    });
    return serverPhotos.concat(pendingPhotos);
}

async function deletePhotoFromDB(photoId) {
    let info = photoInfoCache.get(photoId);
    if (!info) return;
    try {
        await fetch(serverBase() + '/api/photo'
            + '?region=' + encodeURIComponent(info.region)
            + '&siteName=' + encodeURIComponent(info.siteName)
            + '&fileName=' + encodeURIComponent(info.fileName), { method: 'DELETE' });
    } finally {
        photoInfoCache.delete(photoId);
    }
}

async function getAllPhotos() {
    // 서버 전체를 스캔하지 않고, 지금까지 화면에 표시되어 캐시에 올라온 사진만 반환한다.
    // (viewPhoto 등은 항상 렌더링 직후에 호출되므로 캐시에 존재함)
    return Array.from(photoInfoCache.values());
}

// ============================================================
// 48. 사진 업로드 / 표시 / 삭제
// ============================================================
async function handleWorkPhotoUpload(event) {
    const input = event.target;
    const files = Array.from(input.files || []);
    if (files.length === 0) {
        const emptyStatus = document.getElementById('workPhotoStatus');
        if (emptyStatus) emptyStatus.textContent = 'ℹ️ 사진 선택이 취소되었습니다.';
        return;
    }
    let workId = input.getAttribute('data-work-id');
    let statusEl = document.getElementById('workPhotoStatus');
    if (statusEl) statusEl.textContent = '📷 사진 업로드 중...';

    let uploadedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;
    let oversizedCount = 0;
    let firstError = '';
    const record = findWorkRecordById(workId);

    if (!workId || !record) {
        if (statusEl) statusEl.textContent = '❌ 사진을 연결할 작업 기록을 찾지 못했습니다. 기록 화면을 다시 열어주세요.';
        input.value = '';
        return;
    }

    if (record._draft && !String(record.placeName || '').trim()) {
        if (statusEl) statusEl.textContent = '⚠️ 현장을 먼저 검색해 선택한 뒤 사진을 추가하세요.';
        input.value = '';
        const placeSearch = document.getElementById('workAddPlaceSearch');
        if (placeSearch) placeSearch.focus();
        return;
    }

    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        if (file.size > 15 * 1024 * 1024) {
            oversizedCount += 1;
            continue;
        }
        try {
            const capturedAt = new Date(file.lastModified || Date.now()).toISOString();
            await savePhotoToDB({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5) + '_' + i,
                workId: workId,
                file: file,
                fileName: file.name,
                fileSize: file.size,
                uploadedAt: new Date().toISOString(),
                capturedAt: capturedAt
            });
            uploadedCount += 1;
        } catch (error) {
            if (error?.status === 409 && error?.data?.error === 'duplicate_photo') {
                duplicateCount += 1;
                continue;
            }
            console.error('[FieldPilot] 사진 업로드 실패:', error);
            failedCount += 1;
            if (!firstError) firstError = error?.message || '알 수 없는 오류';
        }
    }

    if (statusEl) {
        const parts = [];
        if (uploadedCount) parts.push('업로드 ' + uploadedCount + '장');
        if (duplicateCount) parts.push('중복 제외 ' + duplicateCount + '장');
        if (oversizedCount) parts.push('15MB 초과 ' + oversizedCount + '장');
        if (failedCount) parts.push('실패 ' + failedCount + '장');
        statusEl.style.color = failedCount ? '#e53e3e' : (uploadedCount ? '#38a169' : '#718096');
        statusEl.textContent = (failedCount ? '❌ ' : (uploadedCount ? '✅ ' : 'ℹ️ ')) + parts.join(' · ')
            + (firstError ? ' — ' + firstError : '');
    }
    input.value = '';
    await renderWorkPhotoList(workId);
}

async function renderWorkPhotoList(workId) {
    let container = document.getElementById('workPhotoList');
    if (!container) return;
    let photos;
    try {
        photos = await getPhotosByWorkId(workId);
    } catch (error) {
        console.error('[FieldPilot] 사진 목록 표시 실패:', error);
        container.innerHTML = '<div style="text-align:center;padding:8px;color:#e53e3e;font-size:12px;">❌ 사진 목록을 불러오지 못했습니다: ' + escapeHtml(error.message || '') + '</div>';
        return;
    }

    if (photos.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:8px;color:#a0aec0;font-size:12px;">📷 사진이 없습니다</div>';
        return;
    }

    let html = '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    for (let i = 0; i < photos.length; i++) {
        let p = photos[i];
        html += '<div style="position:relative;width:70px;height:70px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">';
        html += '<img src="' + (p.thumbnailUrl || p.dataUrl) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="viewPhoto(\'' + p.id + '\')">';
        if (p.queued) html += '<span style="position:absolute;left:2px;bottom:2px;background:rgba(214,158,46,.95);color:white;border-radius:5px;padding:1px 4px;font-size:9px;">전송 대기</span>';
        html += '<button onclick="event.stopPropagation();deleteWorkPhoto(\'' + p.id + '\',\'' + workId + '\')" style="position:absolute;top:2px;right:2px;background:rgba(229,62,62,0.9);color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>';
        if (!p.queued) html += '<button onclick="event.stopPropagation();editWorkPhoto(\'' + p.id + '\',\'' + workId + '\')" style="position:absolute;right:2px;bottom:2px;background:rgba(49,130,206,0.94);color:white;border:none;border-radius:5px;padding:3px 5px;font-size:9px;font-weight:700;cursor:pointer;">편집</button>';
        html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

async function editWorkPhoto(photoId, workId) {
    const info = photoInfoCache.get(photoId);
    const statusEl = document.getElementById('workPhotoStatus');
    if (!info) {
        if (statusEl) statusEl.textContent = '❌ 편집할 사진 정보를 찾지 못했습니다. 목록을 다시 열어주세요.';
        return;
    }
    if (info.queued) {
        if (statusEl) statusEl.textContent = '⚠️ 전송 대기 사진은 서버 저장이 완료된 뒤 편집할 수 있습니다.';
        return;
    }
    if (!navigator.onLine) {
        if (statusEl) statusEl.textContent = '⚠️ 저장된 사진 편집은 서버 연결 상태에서 사용할 수 있습니다.';
        return;
    }
    try {
        if (statusEl) {
            statusEl.style.color = '#4a5568';
            statusEl.textContent = '⏳ 원본 사진 불러오는 중...';
        }
        const headers = {};
        if (getAuthToken()) headers.Authorization = 'Bearer ' + getAuthToken();
        const response = await fetch(photoDownloadUrl(info.region, info.siteName, info.fileName), { headers, cache: 'no-store' });
        if (!response.ok) throw new Error('원본 사진 조회 실패: ' + response.status);
        const blob = await response.blob();
        const original = new File([blob], info.fileName || 'photo.jpg', {
            type: blob.type || 'image/jpeg',
            lastModified: Date.parse(info.capturedAt || info.uploadedAt || '') || Date.now()
        });
        const core = fieldPilotCore();
        if (!core?.editPhoto) throw new Error('사진 편집 모듈을 불러오지 못했습니다. 페이지를 새로고침하세요.');
        const edited = await core.editPhoto(original, { siteName: info.siteName, worker: info.worker || workerName || '' });
        if (!edited) {
            if (statusEl) statusEl.textContent = 'ℹ️ 사진 편집을 취소했습니다.';
            return;
        }
        if (statusEl) statusEl.textContent = '⏳ 편집한 사진 저장 중...';
        const resized = core.resizeImage ? await core.resizeImage(edited) : edited;
        const thumbnail = core.createPhotoThumbnail ? await core.createPhotoThumbnail(resized) : null;
        const form = new FormData();
        form.append('region', info.region);
        form.append('siteName', info.siteName);
        form.append('fileName', info.fileName);
        form.append('photo', resized, resized.name || info.fileName);
        if (thumbnail) form.append('thumbnail', thumbnail, 'thumbnail.jpg');

        let result;
        if (core?.api) {
            result = (await core.api.postForm('/api/photos/replace', form)).data;
        } else {
            const replaceResponse = await fetch(serverBase() + '/api/photos/replace', {
                method: 'POST', headers: getAuthToken() ? { Authorization: 'Bearer ' + getAuthToken() } : {}, body: form
            });
            const data = await replaceResponse.json().catch(function() { return {}; });
            if (!replaceResponse.ok) throw new Error(data.message || data.error || ('편집 사진 저장 실패: ' + replaceResponse.status));
            result = data;
        }
        const newFileName = result.fileName || info.fileName;
        info.fileName = newFileName;
        const version = Date.now();
        info.dataUrl = photoDownloadUrl(info.region, info.siteName, newFileName) + '&v=' + version;
        info.thumbnailUrl = photoThumbnailUrl(info.region, info.siteName, newFileName) + '&v=' + version;
        info.uploadedAt = new Date().toISOString();
        photoInfoCache.set(photoId, info);
        if (statusEl) {
            statusEl.style.color = '#38a169';
            statusEl.textContent = '✅ 사진 편집 내용이 저장되었습니다.';
        }
        await renderWorkPhotoList(workId);
    } catch (error) {
        console.error('[FieldPilot] 저장 사진 편집 실패:', error);
        if (statusEl) {
            statusEl.style.color = '#e53e3e';
            statusEl.textContent = '❌ 사진 편집 실패: ' + (error.message || '알 수 없는 오류');
        }
    }
}

async function viewPhoto(photoId) {
    let photos = await getAllPhotos();
    let photo = photos.find(function(p) { return p.id === photoId; });
    if (!photo) return;
    let existing = document.getElementById('photoViewerModal');
    if (existing) existing.remove();
    let modalHtml = '<div id="photoViewerModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:999999;display:flex;justify-content:center;align-items:center;padding:20px;" onclick="this.remove()">';
    modalHtml += '<img src="' + photo.dataUrl + '" style="max-width:95%;max-height:90vh;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">';
    modalHtml += '<button onclick="event.stopPropagation();this.closest(\'#photoViewerModal\').remove()" style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.2);color:white;border:none;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;">✕</button>';
    modalHtml += '</div>';
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function deleteWorkPhoto(photoId, workId) {
    await deletePhotoFromDB(photoId);
    renderWorkPhotoList(workId);
    showTabStatus('tab-work', '✅ 사진 삭제됨', 'ok');
}

// ============================================================
// 49. 기록 탭 현장 검색
// ============================================================
function searchWorkHistory() {
    let keyword = document.getElementById('workSearchInput').value.trim();
    let container = document.getElementById('workSearchResults');
    if (!container) return;

    if (!keyword) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    let work = currentWork || loadWorkFromLocalStorage();
    let results = work.workHistory.filter(function(w) {
        return (w.placeName && w.placeName.includes(keyword)) ||
               (w.content && w.content.includes(keyword)) ||
               (w.camera && w.camera.includes(keyword)) ||
               (w.worker && w.worker.includes(keyword)) ||
               (w.date && w.date.includes(keyword));
    });
    results.sort(function(a, b) { return b.timestamp - a.timestamp; });
    renderWorkSearchResults(results, keyword);
}

function renderWorkSearchResults(results, keyword) {
    let container = document.getElementById('workSearchResults');
    if (!container) return;

    if (results.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:16px;color:#a0aec0;">"' + escapeHtml(keyword) + '" 검색 결과가 없습니다</div>';
        container.style.display = 'block';
        return;
    }

    let html = '<div style="font-weight:600;font-size:13px;margin-bottom:8px;">🔍 검색 결과 (' + results.length + '건)</div>';
    let dateGroups = {};
    for (let i = 0; i < results.length; i++) {
        let r = results[i];
        if (!dateGroups[r.date]) dateGroups[r.date] = [];
        dateGroups[r.date].push(r);
    }
    let dates = Object.keys(dateGroups).sort(function(a, b) { return b.localeCompare(a); });

    for (let i = 0; i < dates.length; i++) {
        let date = dates[i];
        let records = dateGroups[date];
        let dateObj = new Date(date + 'T00:00:00');
        let weekdays = ['일','월','화','수','목','금','토'];
        let dayLabel = (dateObj.getMonth() + 1) + '/' + dateObj.getDate() + '(' + weekdays[dateObj.getDay()] + ')';
        html += '<div style="margin-bottom:10px;">';
        html += '<div style="font-weight:700;font-size:13px;color:#4f7eb3;margin-bottom:6px;">📅 ' + dayLabel + '</div>';
        for (let j = 0; j < records.length; j++) {
            let r = records[j];
            let hasContent = r.content && r.content.trim() !== '';
            let safeName = escapeHtml(r.placeName).replace(/'/g, "\\'");
            html += '<div onclick="showPlaceHistory(\'' + safeName + '\')" style="background:#f7fafc;border-radius:8px;padding:10px;margin-bottom:4px;cursor:pointer;border-left:3px solid ' + (hasContent ? '#38a169' : '#e53e3e') + ';">';
            html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
            html += '<span style="font-size:11px;color:#718096;">⏰ ' + (r.time || '--:--') + '</span>';
            html += '<span style="font-weight:600;font-size:13px;">' + escapeHtml(r.placeName) + '</span>';
            if (r.camera) {
                html += '<span style="background:#ebf8ff;color:#3182ce;font-size:10px;padding:1px 6px;border-radius:8px;">📷 ' + escapeHtml(r.camera) + '</span>';
            }
            html += '</div>';
            if (r.content) {
                html += '<div style="font-size:12px;color:#4a5568;margin-top:4px;padding:4px 6px;background:#fff;border-radius:4px;">' + escapeHtml(r.content) + '</div>';
            }
            html += '<div style="font-size:11px;color:#a0aec0;margin-top:2px;">👤 ' + escapeHtml(r.worker || '미설정') + '</div>';
            html += '</div>';
        }
        html += '</div>';
    }
    container.innerHTML = html;
    container.style.display = 'block';
}

// ============================================================
// 50. 현장 히스토리 모달
// ============================================================
async function showPlaceHistory(placeName) {
    let work = currentWork || loadWorkFromLocalStorage();
    let history = work.workHistory.filter(function(w) { return w.placeName === placeName; });
    history.sort(function(a, b) { return b.timestamp - a.timestamp; });

    let existing = document.getElementById('placeHistoryModal');
    if (existing) existing.remove();

    let html = '<div id="placeHistoryModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:999999;display:flex;justify-content:center;align-items:center;padding:20px;" onclick="if(event.target===this)this.remove()">';
    html += '<div style="background:white;border-radius:16px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);max-height:80vh;overflow-y:auto;" onclick="event.stopPropagation()">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
    html += '<h3 style="font-size:17px;font-weight:700;color:#1a202c;">📋 ' + escapeHtml(placeName) + ' 작업 히스토리</h3>';
    html += '<button onclick="document.getElementById(\'placeHistoryModal\').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#a0aec0;">×</button>';
    html += '</div>';

    if (history.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:#a0aec0;">작업 기록이 없습니다</div>';
    } else {
        html += '<div style="font-size:12px;color:#718096;margin-bottom:12px;">총 ' + history.length + '건의 기록</div>';
        for (let i = 0; i < history.length; i++) {
            let r = history[i];
            let hasContent = r.content && r.content.trim() !== '';
            let photos = await getPhotosByWorkId(r.id);
            html += '<div style="background:#f7fafc;border-radius:8px;padding:12px;margin-bottom:8px;border-left:3px solid ' + (hasContent ? '#38a169' : '#e53e3e') + ';">';
            html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">';
            html += '<span style="font-size:12px;font-weight:600;color:#4a5568;">📅 ' + r.date + '</span>';
            html += '<span style="font-size:11px;color:#718096;">⏰ ' + (r.time || '--:--') + '</span>';
            if (r.camera) {
                html += '<span style="background:#ebf8ff;color:#3182ce;font-size:10px;padding:1px 6px;border-radius:8px;">📷 ' + escapeHtml(r.camera) + '</span>';
            }
            html += '</div>';
            if (r.content) {
                html += '<div style="font-size:13px;color:#2d3748;margin-bottom:4px;padding:6px 8px;background:#fff;border-radius:4px;border-left:2px solid #2b6cb0;">' + escapeHtml(r.content) + '</div>';
            } else {
                html += '<div style="font-size:12px;color:#e53e3e;margin-bottom:4px;">⚠️ 처리내용 미작성</div>';
            }
            html += '<div style="font-size:11px;color:#a0aec0;">👤 ' + escapeHtml(r.worker || '미설정') + '</div>';
            if (photos.length > 0) {
                html += '<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">';
                for (let j = 0; j < Math.min(photos.length, 3); j++) {
                    html += '<img src="' + (photos[j].thumbnailUrl || photos[j].dataUrl) + '" loading="lazy" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;cursor:pointer;" onclick="event.stopPropagation();viewPhoto(\'' + photos[j].id + '\')">';
                }
                if (photos.length > 3) {
                    html += '<div style="width:50px;height:50px;background:#e2e8f0;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#718096;">+' + (photos.length - 3) + '</div>';
                }
                html += '</div>';
            }
            html += '</div>';
        }
    }
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
}

// ============================================================
// 51. 카카오 챗봇 전송
// ============================================================
async function sendToKakaoChatbot(record) {
    try {
        const region = record?.region || currentRegion || '';
        const result = await serverPost(
            '/api/records/send-group',
            {
                region: region,
                record: { ...(record || {}), region: region }
            }
        );

        if (!result || result.sent !== true) {
            throw new Error(
                result?.reason ||
                result?.error ||
                '카카오워크 그룹방 전송 실패'
            );
        }

        showTabStatus(
            'tab-work',
            '✅ 카카오워크 전송 완료',
            'ok'
        );

        return true;
    } catch (error) {
        console.error(
            '[FieldPilot] KakaoWork group send failed:',
            error
        );

        showTabStatus(
            'tab-work',
            '❌ 카카오워크 전송 실패: ' +
                error.message,
            'error'
        );

        return false;
    }
}

// ============================================================
// 52. 사진 내보내기 (더 이상 필요 없음)
// 사진은 촬영 즉시 savePhotoToDB()를 통해 노트북 서버 /api/photos 에 바로 저장되므로
// 별도의 "내보내기" 단계가 필요 없어짐. 기존 버튼이 이 함수를 계속 호출해도
// 안내 메시지만 보여주고 끝나도록 남겨둠 (하위 호환용).
// ============================================================
async function exportPhotosToServer() {
    showTabStatus('tab-work', 'ℹ️ 사진은 촬영 즉시 서버에 자동 저장됩니다. 별도 내보내기가 필요 없습니다.', 'info');
}
// 카카오 챗봇 설정 저장
function saveKakaoChatbot() {
    settings.kakaoChatbotKey = document.getElementById('kakaoChatbotKey').value.trim();
    settings.kakaoChatbotUserId = document.getElementById('kakaoChatbotUserId').value.trim();
    saveSettings();
    updateKakaoChatbotStatus();
    showTabStatus('tab-settings', '✅ 카카오 챗봇 설정 저장됨', 'ok');
}

function updateKakaoChatbotStatus() {
    let el = document.getElementById('kakaoChatbotStatus');
    if (!el) return;
    if (settings.kakaoChatbotKey && settings.kakaoChatbotUserId) {
        el.textContent = '✅ 챗봇 설정됨';
        el.className = 'badge badge-ok';
    } else {
        el.textContent = '⏳ 미설정';
        el.className = 'badge badge-wait';
    }
}

async function testKakaoChatbot() {
    let key = document.getElementById('kakaoChatbotKey').value.trim();
    let userId = document.getElementById('kakaoChatbotUserId').value.trim();
    if (!key || !userId) {
        showTabStatus('tab-settings', '⚠️ 챗봇 키와 사용자 ID를 입력하세요', 'warning');
        return;
    }
    try {
        let response = await fetch('https://api.kakaocorp.com/v1/chatbot/message/send', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId, content: '✅ 경로 최적화 앱 테스트 메시지입니다.' })
        });
        if (response.ok) {
            showTabStatus('tab-settings', '✅ 챗봇 테스트 성공! 카카오톡 확인', 'ok');
        } else {
            showTabStatus('tab-settings', '❌ 챗봇 테스트 실패: ' + response.status, 'error');
        }
    } catch (error) {
        showTabStatus('tab-settings', '❌ 챗봇 연결 실패: ' + error.message, 'error');
    }
}
// ============================================================
// FieldPilot 인가
// ============================================================
async function authorizeFieldPilot() {
    const input =
        document.getElementById('fieldPilotAuthCode');

    const code =
        String(input?.value || '').trim();

    if (!code) {
        alert('인가코드를 입력하세요.');
        return;
    }

    const base = serverBase();

    if (!base) {
        alert(
            '서버 주소가 설정되지 않았습니다.'
        );
        return;
    }

    try {
        const response = await fetch(
            base + '/api/auth/login',
            {
                method: 'POST',
                headers: {
                    'Content-Type':
                        'application/json'
                },
                body: JSON.stringify({
                    code
                })
            }
        );

        const data =
            await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(
                data.message ||
                data.error ||
                '인가에 실패했습니다.'
            );
        }

        fieldPilotAuth = {
            authorized: true,
            role: data.role || '',
            region: data.region || '',
            token: data.token || '',
            expiresAt: data.expiresAt || 0,
            kakaoWorkUserId:
                data.kakaoWorkUserId || '',
            kakaoWorkUserName:
                data.kakaoWorkUserName || ''
        };

        localStorage.setItem(
            AUTH_STORAGE_KEY,
            JSON.stringify(fieldPilotAuth)
        );

        input.value = '';

        applyAuthorizationState();
        loadRegionList();

if (
    fieldPilotAuth.role === 'region' &&
    fieldPilotAuth.region
) {
    currentRegion =
        fieldPilotAuth.region;

    await loadPlacesFromServer(
        currentRegion,
        true
    );

    renderPlaces();
    updateStorageInfo();
}
        if (fieldPilotAuth.role === 'master') {
            alert(
                '✅ 마스터 권한으로 인가되었습니다.'
            );
        } else {
            alert(
                '✅ ' +
                fieldPilotAuth.region +
                ' 지역으로 인가되었습니다.'
            );
        }

    } catch (error) {
        console.error(
            '[FieldPilot Auth]',
            error
        );

        alert(
            '❌ 인가 실패\n\n' +
            error.message
        );
    }
}
function applyAuthorizationState() {

    const authorized =
        isAuthorized();

    const status =
        document.getElementById(
            'fieldPilotAuthStatus'
        );

    const authInput =
        document.getElementById(
            'fieldPilotAuthCode'
        );

    const logoutButton =
        document.getElementById(
            'fieldPilotLogoutBtn'
        );

    if (status) {

        if (!authorized) {

            status.textContent =
                '🔒 미인가 - 기능 사용 불가';

            status.className =
                'badge badge-wait';

        } else if (isMaster()) {

            status.textContent =
                '👑 마스터 - 전체 지역 사용 가능';

            status.className =
                'badge badge-ok';

        } else {

            status.textContent =
                '📍 ' +
                fieldPilotAuth.region +
                ' 지역으로 인가됨';

            status.className =
                'badge badge-ok';
        }
    }

    if (authInput) {
        authInput.style.display =
            authorized ? 'none' : '';
    }

    if (logoutButton) {
        logoutButton.style.display =
            authorized ? '' : 'none';
    }

    applyRegionLock();
    updateFeatureLockState();

    updateAuthorizationUI();
    updateSettingsConnectionUI();
}
function applyRegionLock() {

    const select =
        document.getElementById(
            'regionSelect'
        );

    const regionDisplay =
        document.getElementById(
            'regionDisplay'
        );

    const regionManager =
        document.getElementById(
            'regionManager'
        );

    if (!isAuthorized()) {

        if (select) {
            select.disabled = true;
        }

        if (regionManager) {
            regionManager.style.display =
                'none';
        }

        return;
    }

    // 마스터
    if (isMaster()) {

        if (select) {
            select.disabled = false;
        }

        if (regionManager) {
            regionManager.style.display =
                '';
        }

        if (regionDisplay) {
            regionDisplay.style.cursor =
                'pointer';
        }

        return;
    }

    // 일반 지역 사용자
    const authorizedRegion =
        fieldPilotAuth.region;

    currentRegion =
        authorizedRegion;

    localStorage.setItem(
        SELECTED_REGION_KEY,
        authorizedRegion
    );

    if (select) {

        select.value =
            authorizedRegion;

        select.disabled =
            true;
    }

    // 지역관리 자체를 숨김
    if (regionManager) {
        regionManager.style.display =
            'none';
    }

    if (regionDisplay) {
        regionDisplay.style.cursor =
            'default';

        regionDisplay.onclick =
            null;
    }
}
function updateFeatureLockState() {

    const locked =
        !isAuthorized();

    document.body.classList.toggle(
        'fieldpilot-locked',
        locked
    );

    const selectors = [
        '#tab-list button',
        '#tab-places button',
        '#tab-route button',
        '#tab-work button',
        '#tab-stats button',
        '#tab-list input',
        '#tab-places input',
        '#tab-route input',
        '#tab-work input',
        '#tab-stats input',
        '#tab-list select',
        '#tab-places select',
        '#tab-route select',
        '#tab-work select',
        '#tab-stats select'
    ];

    selectors.forEach(function(selector) {

        document
            .querySelectorAll(selector)
            .forEach(function(el) {

                // 설정탭은 제외
                if (
                    el.closest(
                        '#tab-settings'
                    )
                ) {
                    return;
                }

                el.disabled =
                    locked;
            });
    });
}
async function restoreFieldPilotAuth() {

    const saved =
        localStorage.getItem(AUTH_STORAGE_KEY);

    // --------------------------------------------------------
    // 저장된 인증정보 없음
    // --------------------------------------------------------

    if (!saved) {

        fieldPilotAuth = {
            authorized: false,
            role: '',
            region: '',
            token: '',
            expiresAt: 0
        };

        applyAuthorizationState();

        return false;
    }

    try {

        const parsed =
            JSON.parse(saved);

        if (
            !parsed.token ||
            !parsed.role
        ) {

            throw new Error(
                '저장된 인증정보가 올바르지 않습니다.'
            );
        }

        // ----------------------------------------------------
        // 1. 로컬 인증정보 우선 복구
        // ----------------------------------------------------

        fieldPilotAuth = {

            authorized: true,

            role:
                parsed.role || '',

            region:
                parsed.region || '',

            token:
                parsed.token || '',

            expiresAt:
                parsed.expiresAt || 0,

            kakaoWorkUserId:
                parsed.kakaoWorkUserId || '',

            kakaoWorkUserName:
                parsed.kakaoWorkUserName || ''
        };

        // 지역 사용자라면 저장된 지역을 즉시 적용
        if (
            fieldPilotAuth.role === 'region' &&
            fieldPilotAuth.region
        ) {

            currentRegion =
                fieldPilotAuth.region;

            localStorage.setItem(
                SELECTED_REGION_KEY,
                currentRegion
            );
        }

        applyAuthorizationState();

        console.log(
            '[Auth] 로컬 인증 복구:',
            fieldPilotAuth.role,
            fieldPilotAuth.region
        );

        // ----------------------------------------------------
        // 2. 서버 세션 확인
        // ----------------------------------------------------

        const base =
            serverBase();

        if (!base) {

            console.warn(
                '[Auth] 서버 주소 없음 → 로컬 인증 유지'
            );

            return true;
        }

        try {

            const response =
                await fetch(
                    base + '/api/auth/status',
                    {
                        method: 'GET',
                        headers: {
                            Authorization:
                                'Bearer ' +
                                fieldPilotAuth.token
                        }
                    }
                );

            if (response.ok) {

                const data =
                    await response.json();

                if (data.ok) {

                    fieldPilotAuth = {

                        authorized: true,

                        role:
                            data.role ||
                            fieldPilotAuth.role ||
                            '',

                        region:
                            data.region ||
                            fieldPilotAuth.region ||
                            '',

                        token:
                            fieldPilotAuth.token,

                        expiresAt:
                            data.expiresAt ||
                            fieldPilotAuth.expiresAt ||
                            0,

                        kakaoWorkUserId:
                            data.kakaoWorkUserId ||
                            fieldPilotAuth.kakaoWorkUserId ||
                            '',

                        kakaoWorkUserName:
                            data.kakaoWorkUserName ||
                            fieldPilotAuth.kakaoWorkUserName ||
                            ''
                    };

                    localStorage.setItem(
                        AUTH_STORAGE_KEY,
                        JSON.stringify(
                            fieldPilotAuth
                        )
                    );

                    if (
                        fieldPilotAuth.role ===
                            'region' &&
                        fieldPilotAuth.region
                    ) {

                        currentRegion =
                            fieldPilotAuth.region;

                        localStorage.setItem(
                            SELECTED_REGION_KEY,
                            currentRegion
                        );
                    }

                    applyAuthorizationState();

                    console.log(
                        '[Auth] 서버 인증 확인 완료:',
                        fieldPilotAuth.role,
                        fieldPilotAuth.region
                    );

                    return true;
                }
            }

            // ------------------------------------------------
            // 서버 인증 실패
            //
            // 중요:
            // 여기서 localStorage를 삭제하지 않는다.
            // ------------------------------------------------

            console.warn(
                '[Auth] 서버 세션 확인 실패 → 로컬 인증 유지'
            );

            applyAuthorizationState();

            return true;

        } catch (serverError) {

            console.warn(
                '[Auth] 서버 확인 불가 → 로컬 인증 유지:',
                serverError
            );

            applyAuthorizationState();

            return true;
        }

    } catch (error) {

        console.error(
            '[Auth Restore] 저장된 인증정보 복구 실패:',
            error
        );

        localStorage.removeItem(
            AUTH_STORAGE_KEY
        );

        fieldPilotAuth = {

            authorized: false,
            role: '',
            region: '',
            token: '',
            expiresAt: 0
        };

        currentRegion = '';
        places = [];

        applyAuthorizationState();

        return false;
    }
}
function handleAuthExpired() {

    localStorage.removeItem(
        AUTH_STORAGE_KEY
    );

    fieldPilotAuth = {
        authorized: false,
        role: '',
        region: '',
        token: ''
    };

    currentRegion = '';
    places = [];

    applyAuthorizationState();

    alert(
        '🔒 인가 세션이 만료되었습니다.\n' +
        '설정 탭에서 다시 인가코드를 입력하세요.'
    );
}
async function logoutFieldPilot() {

    try {

        const token =
            getAuthToken();

        if (token) {

            const base =
                serverBase();

            await fetch(
                base +
                '/api/auth/logout',
                {
                    method: 'POST',
                    headers: {
                        Authorization:
                            'Bearer ' +
                            token
                    }
                }
            );
        }

    } catch (e) {
        console.warn(
            '[Logout]',
            e
        );
    }

    localStorage.removeItem(
        AUTH_STORAGE_KEY
    );

    fieldPilotAuth = {
        authorized: false,
        role: '',
        region: '',
        token: ''
    };

    currentRegion = '';
    places = [];

    applyAuthorizationState();

    loadRegionList();

    showTabStatus(
        'tab-settings',
        '🔒 로그아웃되었습니다.',
        'info'
    );
}
window.switchTab = switchTab;

// ============================================================
// 54. 보안·대용량 처리 호환 계층
// 기존 전역 함수와 인라인 이벤트를 유지하면서 신규 모듈/서버 API로 점진 전환한다.
// ============================================================
function fieldPilotCore() {
    return window.FieldPilotCore || null;
}

function isGitHubConfigured() {
    return !!settings?.githubConfigured;
}

async function loadRuntimeConfiguration() {
    const base = serverBase();
    if (!base) return null;

    try {
        const response = await fetch(base + '/api/public-config', { cache: 'no-store' });
        if (!response.ok) throw new Error('서버 오류 ' + response.status);
        const runtime = await response.json();
        KAKAO_JAVASCRIPT_KEY = String(runtime.kakaoJavascriptKey || '').trim();
        settings.githubConfigured = runtime.githubConfigured === true;

        const jsInput = document.getElementById('kakaoJsKey');
        if (jsInput) {
            jsInput.value = KAKAO_JAVASCRIPT_KEY ? '서버에서 설정됨' : '';
            jsInput.placeholder = '노트북서버/config.json의 jsKey에서 설정';
            jsInput.readOnly = true;
        }

        const githubInput = document.getElementById('githubToken');
        if (githubInput) {
            githubInput.value = '';
            githubInput.placeholder = '노트북서버/config.json의 github.token에서 설정';
            githubInput.autocomplete = 'off';
        }

        updateSettingsConnectionUI();

        return runtime;
    } catch (error) {
        console.warn('[FieldPilot] 런타임 설정 로드 실패:', error);
        return null;
    }
}

// GitHub PAT·지도/REST 키는 더 이상 localStorage에 남기지 않는다.
function loadSettings() {
    let parsed = {};
    try { parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) {}

    const hadLegacySecrets = !!(parsed.githubToken || parsed.kakaoJsKey || parsed.kakaoRestKey);
    delete parsed.githubToken;
    delete parsed.kakaoJsKey;
    delete parsed.kakaoRestKey;
    if (hadLegacySecrets) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
    }

    settings = {
        githubConfigured: false,
        kakaoJsKey: '',
        kakaoRestKey: 'server-proxy',
        kakaoChatbotKey: decodeKey(parsed.kakaoChatbotKey || ''),
        kakaoChatbotUserId: decodeKey(parsed.kakaoChatbotUserId || '')
    };

    const workerInput = document.getElementById('workerName');
    if (workerInput) workerInput.value = workerName || '';
    updateWorkerNameStatus();
    updateSettingsStatus();
    updateSettingsConnectionUI();
    updateAuthorizationUI();

    if (hadLegacySecrets) {
        setTimeout(function() {
            showTabStatus('tab-settings', '🔐 이전 브라우저 키를 삭제했습니다. 노트북 서버 설정을 사용합니다.', 'info');
        }, 0);
    }
}

function saveSettings() {
    const encoded = {
        kakaoChatbotKey: encodeKey(settings.kakaoChatbotKey || ''),
        kakaoChatbotUserId: encodeKey(settings.kakaoChatbotUserId || '')
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(encoded));
    updateSettingsStatus();
}

function saveGitHubToken() {
    const input = document.getElementById('githubToken');
    if (input) input.value = '';
    showTabStatus('tab-settings', '🔐 GitHub 토큰은 브라우저에 저장하지 않습니다. 노트북서버/config.json의 github.token을 설정하세요.', 'info');
}

function saveKakaoKeys() {
    const jsInput = document.getElementById('kakaoJsKey');
    const restInput = document.getElementById('kakaoRestKey');
    if (jsInput) jsInput.value = KAKAO_JAVASCRIPT_KEY ? '서버에서 설정됨' : '';
    if (restInput) {
        restInput.value = '서버 프록시 사용';
        restInput.readOnly = true;
    }
    showTabStatus('tab-settings', '🔐 카카오 키는 노트북서버/config.json에서 관리합니다.', 'info');
}

async function testGitHubToken() {
    const status = document.getElementById('githubStatus');
    if (status) {
        status.textContent = '⏳ 서버 설정 확인 중...';
        status.className = 'badge badge-wait';
    }
    try {
        const data = await serverGet('/api/github/status');
        settings.githubConfigured = data.configured === true;
        if (status) {
            status.textContent = settings.githubConfigured
                ? '✅ 서버 GitHub 연결됨' : '⏳ 서버 GitHub 미설정';
            status.className = settings.githubConfigured ? 'badge badge-ok' : 'badge badge-wait';
        }
    } catch (error) {
        if (status) {
            status.textContent = '❌ 서버 확인 실패';
            status.className = 'badge badge-fail';
        }
    }
}

async function githubSync(kind, region, data, message) {
    if (!isGitHubConfigured() || !navigator.onLine || !region) return false;
    try {
        await serverPost('/api/github/sync', { kind: kind, region: region, data: data, message: message });
        localStorage.setItem('fieldPilotLastGithubSync', new Date().toISOString());
        refreshGlobalConnectionStatus();
        return true;
    } catch (error) {
        console.warn('[FieldPilot] GitHub 서버 동기화 실패:', error);
        return false;
    }
}

async function githubData(kind, region, ref) {
    region = String(region || '').trim();
    // 인증/지역 복원 전에 기록 탭 렌더링이 먼저 실행될 수 있다. 이 시점에는
    // 서버가 거부할 빈 region 요청을 보내지 않고 지역 선택 완료를 기다린다.
    if (!region) return { found: false, data: null, skipped: true };
    let query = '/api/github/data?kind=' + encodeURIComponent(kind) + '&region=' + encodeURIComponent(region);
    if (ref) query += '&ref=' + encodeURIComponent(ref);
    return serverGet(query);
}

async function uploadToGitHub(silent) {
    if (!currentRegion) {
        if (!silent) showTabStatus('tab-settings', '⚠️ 현재 선택된 지역이 없습니다.', 'warning');
        return false;
    }
    const uploaded = await githubSync('places', currentRegion, places,
        'FieldPilot places sync: ' + currentRegion);
    if (!silent) {
        showTabStatus('tab-settings', uploaded
            ? '✅ GitHub 업로드 완료! (' + places.length + '개)'
            : '⚠️ GitHub 서버 설정 또는 연결을 확인하세요.', uploaded ? 'ok' : 'warning');
    }
    return uploaded;
}

async function downloadFromGitHub() {
    try {
        const data = await serverGet('/api/github/regions');
        const regions = data.regions || [];
        if (!regions.length) {
            showTabStatus('tab-settings', '📭 GitHub에 저장된 지역 데이터가 없습니다.', 'warning');
            return;
        }
        showRegionSelectModal(regions, function(region) {
            if (region) processDownloadFromGitHub(region);
        });
    } catch (error) {
        showTabStatus('tab-settings', '❌ 목록 조회 실패: ' + error.message, 'error');
    }
}

async function processDownloadFromGitHub(region) {
    try {
        const result = await githubData('places', region);
        if (!result.found) throw new Error('저장된 지역 데이터가 없습니다.');
        places = Array.isArray(result.data) ? result.data : (result.data?.places || []);
        currentRegion = region;
        localStorage.setItem(SELECTED_REGION_KEY, region);
        savePlaces();
        renderPlaces();
        updateRegionDisplay();
        showTabStatus('tab-settings', '✅ GitHub에서 ' + region + ' 데이터를 불러왔습니다.', 'ok');
    } catch (error) {
        showTabStatus('tab-settings', '❌ 다운로드 실패: ' + error.message, 'error');
    }
}

async function showGitHubHistory() {
    const historyDiv = document.getElementById('githubHistory');
    if (!historyDiv || !currentRegion) return;
    historyDiv.style.display = 'block';
    historyDiv.textContent = '⏳ 변경 이력 불러오는 중...';
    try {
        const result = await serverGet('/api/github/history?kind=places&region=' + encodeURIComponent(currentRegion));
        const commits = result.commits || [];
        historyDiv.innerHTML = commits.length ? commits.map(function(commit) {
            return '<div style="padding:8px;border-bottom:1px solid #e2e8f0;">'
                + '<strong>' + escapeHtml(commit.message || '변경') + '</strong><br>'
                + '<small>' + escapeHtml(new Date(commit.date).toLocaleString()) + '</small> '
                + '<button class="restore-btn" onclick="restoreFromGitHub(\'' + escapeJsString(commit.sha) + '\')">복원</button></div>';
        }).join('') : '📭 변경 이력이 없습니다.';
    } catch (error) {
        historyDiv.textContent = '❌ 이력 조회 실패: ' + error.message;
    }
}

async function restoreFromGitHub(sha) {
    if (!currentRegion || !sha) return;
    try {
        const result = await githubData('places', currentRegion, sha);
        if (!result.found) throw new Error('해당 버전의 데이터를 찾을 수 없습니다.');
        places = Array.isArray(result.data) ? result.data : (result.data?.places || []);
        savePlaces();
        renderPlaces();
        showTabStatus('tab-settings', '✅ 선택한 버전으로 복원했습니다.', 'ok');
    } catch (error) {
        showTabStatus('tab-settings', '❌ 복원 실패: ' + error.message, 'error');
    }
}

async function uploadStatsToGitHub(stats) {
    return githubSync('stats', currentRegion, stats, 'FieldPilot stats sync: ' + currentRegion);
}

async function refreshStatsFromGitHub() {
    try {
        const result = await githubData('stats', currentRegion);
        if (result.found) {
            currentStats = result.data;
            saveStatsToLocalStorage(currentStats);
        }
        renderStatsTab();
    } catch (error) {
        renderStatsTab();
        showTabStatus('tab-stats', '⚠️ 서버 통계 동기화 실패: ' + error.message, 'warning');
    }
}

async function uploadWorkToGitHub(work) {
    const uploaded = await githubSync('work', currentRegion, work, 'FieldPilot work sync: ' + currentRegion);
    if (uploaded) pendingWorkUpload = false;
    return uploaded;
}

async function refreshWorkFromGitHub() {
    try {
        const result = await githubData('work', currentRegion);
        if (result.found) {
            currentWork = result.data;
            saveWorkToLocalStorage(currentWork);
        }
        renderWorkTab();
    } catch (error) {
        renderWorkTab();
        showTabStatus('tab-work', '⚠️ 서버 작업기록 동기화 실패: ' + error.message, 'warning');
    }
}

function updateOnlineStatus() {
    const banner = document.getElementById('offlineBanner');
    if (banner) banner.classList.toggle('show', !navigator.onLine);
    if (!navigator.onLine) {
        showTabStatus('tab-settings', '📡 오프라인 - 변경사항을 안전하게 대기열에 보관합니다.', 'warning');
        refreshGlobalConnectionStatus();
        return;
    }

    fieldPilotCore()?.flushQueue?.().then(function(result) {
        if (result.sent) showTabStatus('tab-settings', '✅ 오프라인 대기 작업 ' + result.sent + '건을 전송했습니다.', 'ok');
    }).catch(function(error) {
        console.warn('[FieldPilot] 오프라인 대기열 전송 실패:', error);
    });
    if (isGitHubConfigured()) {
        setTimeout(function() { uploadToGitHub(true); }, 1000);
        if (pendingWorkUpload) setTimeout(function() { uploadWorkToGitHub(currentWork || loadWorkFromLocalStorage()); }, 1500);
    }
    refreshGlobalConnectionStatus();
}

function setGlobalConnectionChip(id, text, state) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = text;
    element.className = 'connection-status-chip' + (state ? ' is-' + state : '');
}

async function refreshGlobalConnectionStatus() {
    if (!navigator.onLine) {
        setGlobalConnectionChip('globalServerStatus', '서버 오프라인', 'error');
    } else if (!serverBase()) {
        setGlobalConnectionChip('globalServerStatus', '서버 주소 미설정', 'error');
    } else {
        try {
            const response = await fetch(serverBase() + '/api/health', { cache: 'no-store' });
            if (!response.ok) throw new Error('health ' + response.status);
            setGlobalConnectionChip('globalServerStatus', '서버 연결됨', 'ok');
        } catch (error) {
            setGlobalConnectionChip('globalServerStatus', '서버 연결 실패', 'error');
        }
    }

    const lastSync = localStorage.getItem('fieldPilotLastGithubSync');
    if (!navigator.onLine) {
        setGlobalConnectionChip('globalGithubStatus', 'GitHub 동기화 대기', 'warn');
    } else if (lastSync) {
        setGlobalConnectionChip('globalGithubStatus', 'GitHub 동기화 완료', 'ok');
    } else if (isGitHubConfigured()) {
        setGlobalConnectionChip('globalGithubStatus', 'GitHub 연결됨', 'ok');
    } else {
        setGlobalConnectionChip('globalGithubStatus', 'GitHub 미설정', 'warn');
    }

    try {
        const pending = await fieldPilotCore()?.storage?.queuedRequestCount?.() || 0;
        setGlobalConnectionChip(
            'globalOfflineQueueStatus',
            pending ? '오프라인 대기 ' + pending + '건' : '오프라인 대기 없음',
            pending ? 'warn' : 'ok'
        );
    } catch (error) {
        setGlobalConnectionChip('globalOfflineQueueStatus', '대기열 확인 실패', 'warn');
    }
}

window.addEventListener('fieldpilot:queue-changed', refreshGlobalConnectionStatus);

function autoSyncStats() {
    if (isGitHubConfigured() && navigator.onLine) refreshStatsFromGitHub();
    else renderStatsTab();
}

function autoSyncWork() {
    if (isGitHubConfigured() && navigator.onLine) refreshWorkFromGitHub();
    else renderWorkTab();
}

function queueServerWrite(path, json) {
    const core = fieldPilotCore();
    if (!core?.queueWhenOffline) return Promise.resolve(null);
    return core.queueWhenOffline({ method: 'POST', path: path, json: json })
        .catch(function(error) {
            console.warn('[FieldPilot] 오프라인 대기열 추가 실패:', error);
            return null;
        });
}

async function uploadPhotoMultipart(photo) {
    let file = photo.file;
    if (!file && photo.dataUrl) {
        const blob = await (await fetch(photo.dataUrl)).blob();
        file = new File([blob], photo.fileName || 'photo.jpg', { type: blob.type || 'image/jpeg' });
    }
    if (!file) throw new Error('사진 파일을 찾을 수 없습니다.');

    const core = fieldPilotCore();
    const resized = core?.resizeImage ? await core.resizeImage(file) : file;
    let thumbnail = null;
    try {
        thumbnail = core?.createPhotoThumbnail ? await core.createPhotoThumbnail(resized) : null;
    } catch (error) {
        console.warn('[FieldPilot] 사진 썸네일 생성 실패, 원본 폴백 사용:', error);
    }
    const fields = {
        region: photo.region,
        siteName: photo.siteName,
        fileName: resized.name || photo.fileName || 'photo.jpg',
        workId: photo.workId || '',
        date: photo.date || '',
        time: photo.time || '',
        worker: photo.worker || '',
        camera: photo.camera || '',
        content: photo.content || '',
        capturedAt: photo.capturedAt || new Date(file.lastModified || Date.now()).toISOString()
    };
    const form = new FormData();
    Object.entries(fields).forEach(function(entry) { form.append(entry[0], entry[1]); });
    form.append('photo', resized, fields.fileName);
    if (thumbnail) form.append('thumbnail', thumbnail, 'thumbnail.jpg');

    try {
        if (core?.api) return (await core.api.postForm('/api/photos', form)).data;
        const response = await fetch(serverBase() + '/api/photos', {
            method: 'POST', headers: { Authorization: 'Bearer ' + getAuthToken() }, body: form
        });
        if (!response.ok) throw new Error('사진 업로드 실패: ' + response.status);
        return response.json();
    } catch (error) {
        const retriable = !navigator.onLine || error?.retriable || error?.code === 'network_error' || error instanceof TypeError;
        if (!retriable || !core?.queueWhenOffline) throw error;
        await core.queueWhenOffline({
            method: 'POST', path: '/api/photos',
            form: { fields: fields, photo: resized, thumbnail: thumbnail, fileName: fields.fileName }
        });
        return { queued: true, previewUrl: URL.createObjectURL(resized) };
    }
}
