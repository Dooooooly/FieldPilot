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
let tempSettings = {};
let routeObjective = 'distance';
let useRoadOptimization = true;
let useDirectionHint = true;

// --- 마커/검색 상태 ---
let startMarker = null;
let routeMarkers = [];
let placeMarkers = [];
let singlePlaceMarker = null;
let singlePlaceInfoWindow = null;
let autoSyncTimer = null;
let sdkLoading = false;
let isShowingRouteMarkers = false;
let pendingMapCenter = null;
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
function switchTab(tabId) {
    if (!tabId) {
        console.warn('switchTab: tabId 없음');
        return;
    }

    let target = document.getElementById(tabId);
    if (!target) {
        console.warn('switchTab: 탭 요소 없음 -', tabId);
        return;
    }

    document.querySelectorAll('.tab-content').forEach(function(el) {
        el.classList.remove('active');
    });
    target.classList.add('active');

    document.querySelectorAll('.bottom-tab').forEach(function(btn) {
        let isActive = btn.getAttribute('data-tab') === tabId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    if (tabId === 'tab-route') {
        setTimeout(function() {
            if (typeof kakaoMap !== 'undefined' && kakaoMap) {
                kakaoMap.setDraggable(true);
                kakaoMap.setZoomable(true);
                kakaoMap.relayout();
            } else if (typeof initMap === 'function') {
                initMap();
            }
        }, 100);
    }

    if (tabId === 'tab-list' && typeof renderPlaces === 'function') {
        renderPlaces();
    }

    if (window.innerWidth < 700) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
            settings.githubToken = decodeKey(parsed.githubToken || '');
            settings.kakaoJsKey = decodeKey(parsed.kakaoJsKey || '');
            settings.kakaoRestKey = decodeKey(parsed.kakaoRestKey || '');
        } catch(e) {
            console.warn('⚠️ 설정 복원 오류, 기본값으로 초기화합니다.', e);
            settings.githubToken = '';
            settings.kakaoJsKey = '';
            settings.kakaoRestKey = '';
        }
    } else {
        settings.githubToken = '';
        settings.kakaoJsKey = '';
        settings.kakaoRestKey = '';
    }
    document.getElementById('githubToken').value = settings.githubToken || '';
    document.getElementById('kakaoJsKey').value = settings.kakaoJsKey || '';
    document.getElementById('kakaoRestKey').value = settings.kakaoRestKey || '';
    updateSettingsStatus();
}

function saveSettings() {
    if (!settings) {
        settings = { githubToken: '', kakaoJsKey: '', kakaoRestKey: '' };
    }
    let encoded = {
        githubToken: encodeKey(settings.githubToken || ''),
        kakaoJsKey: encodeKey(settings.kakaoJsKey || ''),
        kakaoRestKey: encodeKey(settings.kakaoRestKey || '')
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(encoded));
    updateSettingsStatus();
}

function updateSettingsStatus() {
    let gs = document.getElementById('githubStatus');
    if (settings.githubToken) {
        gs.textContent = '✅ 토큰 설정됨';
        gs.className = 'badge badge-ok';
    } else {
        gs.textContent = '⏳ 토큰 미설정';
        gs.className = 'badge badge-wait';
    }
    let ks = document.getElementById('kakaoStatus');
    if (settings.kakaoJsKey && settings.kakaoRestKey) {
        ks.textContent = '✅ API 키 설정됨';
        ks.className = 'badge badge-ok';
    } else {
        ks.textContent = '⏳ API 키 미설정';
        ks.className = 'badge badge-wait';
    }
}

function saveGitHubToken() {
    settings.githubToken = document.getElementById('githubToken').value.trim();
    saveSettings();
    showTabStatus('tab-settings', '✅ GitHub 토큰 저장됨', 'ok');
}

function saveKakaoKeys() {
    settings.kakaoJsKey = document.getElementById('kakaoJsKey').value.trim();
    settings.kakaoRestKey = document.getElementById('kakaoRestKey').value.trim();
    saveSettings();
    showTabStatus('tab-settings', '✅ 카카오 API 키 저장됨', 'ok');
    let container = document.getElementById('map');
    if (container) {
        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#d69e2e;font-size:14px;background:#fffff0;border-radius:12px;">⏳ 키 저장됨, 지도 재로딩 중...</div>';
    }
    kakaoMap = null;
    setTimeout(initMap, 500);
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
    let key = getStorageKey(currentRegion);
    localStorage.setItem(key, JSON.stringify(places));
    renderPlaces();
    updateStorageInfo();
    scheduleAutoSync();
}

function scheduleAutoSync() {
    clearTimeout(autoSyncTimer);
    if (!settings.githubToken) return;
    if (!navigator.onLine) {
        showTabStatus('tab-settings', '📡 오프라인 - GitHub 동기화 보류됨', 'warning');
        return;
    }
    autoSyncTimer = setTimeout(function() {
        uploadToGitHub(true);
    }, 5000);
}

function updateStorageInfo() {
    let size = 0;
    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);
        if (key) size += localStorage.getItem(key).length * 2;
    }
    document.getElementById('storageInfo').textContent = '저장소: ' + (size / 1024).toFixed(1) + ' KB';
}

function loadRegionList() {
    let select = document.getElementById('regionSelect');
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
    
    let key = getStorageKey(currentRegion);
    let data = localStorage.getItem(key);
    places = data ? JSON.parse(data) : [];
    renderPlaces();
    updateStorageInfo();
    
    if (kakaoMap) {
        let center = getRegionCenter(currentRegion);
        kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
        kakaoMap.setLevel(5);
        kakaoMap.relayout();
    }
}

function switchRegion(region) {
    if (!region || region === '') return;
    
    clearTimeout(autoSyncTimer);
    currentRegion = region;
    localStorage.setItem(SELECTED_REGION_KEY, region);
    
    let select = document.getElementById('regionSelect');
    if (select) {
        select.value = region;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === region) {
                select.selectedIndex = i;
                break;
            }
        }
    }
    
    updateRegionDisplay();
    
    let key = getStorageKey(region);
    let data = localStorage.getItem(key);
    places = data ? JSON.parse(data) : [];
    
    renderPlaces();
    updateStorageInfo();
    
    waypoints = [];
    routeResult = null;
    startPoint = null;
    renderWaypointList();
    clearRouteMarkers();
    clearSingleMarker();
    isShowingRouteMarkers = false;
    
    document.getElementById('startInfo').textContent = '⏳ 출발지를 검색하거나 현재 위치 버튼을 눌러 설정하세요';
    document.getElementById('startInfo').style.color = '#718096';
    document.getElementById('placeCount').textContent = '0개소';
    document.getElementById('totalDistance').textContent = '0.00 km';
    document.getElementById('totalTime').textContent = '0 분';
    document.getElementById('optimizeMode').textContent = '-';
    document.getElementById('routeList').innerHTML = '';
    document.getElementById('savedRow').style.display = 'none';
    
    let btnContainer = document.getElementById('kakaoMapButtonContainer');
    if (btnContainer) {
        btnContainer.style.display = 'none';
    }
    currentPlaceId = null;
    
    if (kakaoMap) {
        let center = getRegionCenter(region);
        kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
        kakaoMap.setLevel(5);
        kakaoMap.relayout();
    }
    
    let activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
        showTabStatus(activeTab.id, '📍 ' + region + ' 지역으로 전환됨 (' + places.length + '개 현장)', 'info');
    }
    fetchWeather();
    
    if (settings.githubToken && navigator.onLine) {
        setTimeout(function() {
            uploadToGitHub(true);
        }, 3000);
    }
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
    let data = {
        githubToken: settings.githubToken || '',
        kakaoJsKey: settings.kakaoJsKey || '',
        kakaoRestKey: settings.kakaoRestKey || '',
        routeApi: routeApi || 'kakao',
        exportDate: new Date().toISOString()
    };
    let blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = 'settings_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showTabStatus('tab-settings', '✅ 설정 내보내기 완료', 'ok');
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
            
            if (btn) {
                btn.innerHTML = '<span style="font-size:14px;">🎯</span> 현재 위치';
                btn.disabled = false;
            }
            
            let restKey = settings.kakaoRestKey;
            if (restKey) {
                fetch('https://dapi.kakao.com/v2/local/geo/coord2address.json?x=' + lng + '&y=' + lat, {
                    headers: { 'Authorization': 'KakaoAK ' + restKey }
                })
                .then(function(res) { return res.json(); })
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
    let restKey = settings.kakaoRestKey;
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
    if (waypoints.length === 0) {
        list.innerHTML = '<li class="empty-msg">경유지를 추가하세요 (드래그로 순서 변경 가능)</li>';
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
        html += '<div style="display:flex;align-items:center;flex:1;"><span class="drag-handle">⠿</span>';
        html += '<span class="idx">' + (i + 1) + '</span>';
        html += '<span>' + escapeHtml(wp.name) + '</span></div>';
        html += '<span class="remove" onclick="event.stopPropagation(); removeWaypoint(' + i + ')">✕</span></li>';
    }
    list.innerHTML = html;
    
    if (window.Sortable) {
        if (window._sortable) window._sortable.destroy();
        window._sortable = new Sortable(list, {
            handle: '.drag-handle',
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
}

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
}

function saveAddPlaceModal() {
    let name = document.getElementById('modalPlaceName').value.trim();
    let address = document.getElementById('modalPlaceAddr').value.trim();
    let lat = parseFloat(document.getElementById('modalPlaceLat').value);
    let lng = parseFloat(document.getElementById('modalPlaceLng').value);
    let remark = document.getElementById('modalPlaceRemark').value.trim();

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
        let restKey = settings.kakaoRestKey;
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
                savePlaceFromModal(name, fullAddress, finalLat, finalLng, remark);
            });
            return;
        } else {
            showTabStatus('tab-list', '⚠️ 카카오 REST API 키가 없습니다. 위도/경도를 직접 입력하세요.', 'warning');
            return;
        }
    }

    savePlaceFromModal(name, fullAddress, finalLat, finalLng, remark);
}

function savePlaceFromModal(name, address, lat, lng, remark) {
    places.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: name,
        address: address,
        lat: lat,
        lng: lng,
        remark: remark || '',
        favorite: false
    });
    savePlaces();
    closeAddPlaceModal();
    showTabStatus('tab-list', '✅ "' + name + '" 추가됨', 'ok');
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
        let restKey = settings.kakaoRestKey;
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

    savePlaces();
    closeModal();
    renderPlaces();
    showTabStatus('tab-list', '✅ "' + name + '" 수정 완료', 'ok');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
    document.getElementById('modalName').value = '';
    document.getElementById('modalAddress').value = '';
    document.getElementById('modalLat').value = '';
    document.getElementById('modalLng').value = '';
    document.getElementById('modalRemark').value = '';
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
    retries = retries || 1;
    if (!address || !restKey) return null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            let res = await fetch(
                'https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent(address),
                { headers: { 'Authorization': 'KakaoAK ' + restKey } }
            );
            if (!res.ok) {
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 500));
                    continue;
                }
                return null;
            }
            let data = await res.json();
            if (data.documents && data.documents.length > 0) {
                let doc = data.documents[0];
                let road = doc.road_address;
                if (road) {
                    return { lat: parseFloat(road.y), lng: parseFloat(road.x), address: road.address_name };
                }
                let addr = doc.address;
                return { lat: parseFloat(addr.y), lng: parseFloat(addr.x), address: addr.address_name };
            }
            return null;
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
        let url = 'https://apis-navi.kakaomobility.com/v1/directions'
            + '?origin=' + Number(from.lng) + ',' + Number(from.lat)
            + '&destination=' + Number(to.lng) + ',' + Number(to.lat)
            + '&priority=RECOMMEND';

        let response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': 'KakaoAK ' + restKey
            }
        });

        if (!response.ok) throw new Error('HTTP ' + response.status);
        let data = await response.json();

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
        method: '도로거리 기반 Greedy + Multi-start + 2-opt'
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
        
        let restKey = settings.kakaoRestKey;
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
        clearSingleMarker();
        isShowingRouteMarkers = true;
        
        addRouteMarker(startPoint.lat, startPoint.lng, startPoint.name, true, -1);
        
        for (let i = 0; i < sorted.length; i++) {
            let p = sorted[i];
            addRouteMarker(p.lat, p.lng, (i + 1) + '. ' + p.name, false, i);
        }
        
        let allPoints = [{
            name: startPoint.name,
            lat: startPoint.lat,
            lng: startPoint.lng,
            address: startPoint.address || ''
        }].concat(sorted);
        
        let routeData = await callKakaoMobilityRoute(allPoints, restKey);
        
        if (routeData) {
            drawRoadRoute(routeData);
        } else {
            drawRoute(allPoints);
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
        
        if (startPoint && startPoint.lat && startPoint.lng) {
            focusRouteStart();
        }
        
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
        
        switchTab('tab-route');
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

    // ===== 1. 기존 routeList HTML 생성 (생략 없이 전체 코드) =====
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
        html += '<div class="info">';
        html += '<div class="name">' + escapeHtml(p.name) + ' ' + remarkDisplay + '</div>';
        html += addrDisplay;
        html += '</div>';
        html += '<div class="dist" style="text-align:right;font-size:12px;font-weight:600;flex-shrink:0;min-width:80px;color:' + color + ';">';
        html += segDist.toFixed(1) + 'km<br><span style="font-size:10px;color:#718096;">' + segTime + '분</span></div>';
        
        html += '<button class="btn btn-outline kakao-route-btn" style="margin-left:4px;padding:4px 8px;font-size:12px;flex-shrink:0;min-height:32px;border-radius:4px;position:relative;z-index:10;" onclick="openKakaoMapFromRoute(this)" title="길찾기"';
        html += ' data-from-name="' + escapeHtml(prev.name) + '"';
        html += ' data-from-lat="' + prev.lat + '"';
        html += ' data-from-lng="' + prev.lng + '"';
        html += ' data-to-name="' + escapeHtml(p.name) + '"';
        html += ' data-to-lat="' + p.lat + '"';
        html += ' data-to-lng="' + p.lng + '">';
        html += '🗺️';
        html += '</button>';
        
        html += '<span class="drag-handle" style="color:#a0aec0;font-size:20px;cursor:grab;padding:4px 6px;user-select:none;margin-left:2px;" title="드래그하여 순서 변경">⠿</span>';
        html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;

    // ===== 2. SortableJS 초기화 (기존 코드) =====
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
                let restKey = settings.kakaoRestKey;
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

    // ===== 3. ★ 새로 추가: 전체 경유지 연결 버튼 (routeList 아래) =====
    const totalPoints = sorted.length + 1; // 출발지 포함
    const maxPoints = 10;
    const displayCount = Math.min(totalPoints, maxPoints);
    const isOverLimit = totalPoints > maxPoints;

    // 기존에 추가된 버튼이 있다면 제거 (중복 방지)
    const existingNav = document.getElementById('route-nav-container');
    if (existingNav) existingNav.remove();

    const navContainer = document.createElement('div');
    navContainer.id = 'route-nav-container';
    navContainer.style.marginTop = '12px';
    navContainer.style.display = 'flex';
    navContainer.style.flexDirection = 'column';
    navContainer.style.gap = '6px';
    navContainer.style.alignItems = 'center';

    // 버튼 생성
    const navBtn = document.createElement('button');
    navBtn.className = 'btn btn-primary';
    navBtn.style.width = '100%';
    navBtn.style.padding = '10px 16px';
    navBtn.style.fontSize = '14px';
    navBtn.style.fontWeight = '600';
    navBtn.style.borderRadius = '8px';
    navBtn.style.display = 'flex';
    navBtn.style.alignItems = 'center';
    navBtn.style.justifyContent = 'center';
    navBtn.style.gap = '6px';

    const apiLabel = routeApi === 'tmap' ? 'TMap' : '카카오내비';
    const icon = routeApi === 'tmap' ? '🚗' : '🗺️';
    navBtn.textContent = `${icon} ${apiLabel}으로 전체 경로 열기 (${displayCount}개 지점)`;
    navBtn.style.background = routeApi === 'tmap' ? '#0064d8' : '#fee500';
    navBtn.style.color = routeApi === 'tmap' ? 'white' : '#333';
    navBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        openMultiStopNavigation();
    });

    navContainer.appendChild(navBtn);

    // 제한 초과 안내 메시지
    if (isOverLimit) {
        const limitMsg = document.createElement('div');
        limitMsg.style.fontSize = '0.7rem';
        limitMsg.style.color = '#e53e3e';
        limitMsg.style.textAlign = 'center';
        limitMsg.style.padding = '2px 0';
        limitMsg.textContent = `⚠️ ${totalPoints}개의 지점 중 처음 ${maxPoints}개만 전달됩니다.`;
        navContainer.appendChild(limitMsg);
    } else {
        // 선택 사항: 작은 안내 메시지
        const infoMsg = document.createElement('div');
        infoMsg.style.fontSize = '0.65rem';
        infoMsg.style.color = 'var(--text-muted)';
        infoMsg.style.textAlign = 'center';
        infoMsg.style.padding = '2px 0';
        infoMsg.textContent = `✅ ${totalPoints}개 지점 전체 전달`;
        navContainer.appendChild(infoMsg);
    }

    // routeList 뒤에 추가
    container.parentNode.insertBefore(navContainer, container.nextSibling);
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
    if (!restKey || points.length < 2) return null;
    try {
        let origin = points[0], destination = points[points.length - 1], waypoints = points.slice(1, -1);
        let url = 'https://apis-navi.kakaomobility.com/v1/waypoints/directions';
        let payload = {
            origin: { name: origin.name || '출발지', x: origin.lng, y: origin.lat },
            destination: { name: destination.name || '도착지', x: destination.lng, y: destination.lat },
            priority: 'RECOMMEND'
        };
        if (waypoints.length > 0) {
            payload.waypoints = waypoints.map(function(w) {
                return { name: w.name || '경유지', x: w.lng, y: w.lat };
            });
        }
        let response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'KakaoAK ' + restKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) return null;
        return await response.json();
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
    if (!sdkLoading) { try { initMap(); } catch (e) {} }
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

// ============================================================
// 23. 지도 초기화
// ============================================================
function initMap() {
    let container = document.getElementById('map');
    if (!container) return;
    let jsKey = settings.kakaoJsKey;
    if (!jsKey) {
        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;border-radius:12px;padding:20px;text-align:center;">⚠️ 설정 탭에서<br>카카오 JavaScript 키를 입력하세요</div>';
        showTabStatus('tab-settings', '⚠️ 카카오 JavaScript 키가 필요합니다.', 'warning');
        return;
    }
    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#d69e2e;font-size:14px;background:#fffff0;border-radius:12px;">⏳ 카카오 지도 로딩 중...</div>';
    
    // ★ SDK 로드 상태 체크 강화
    if (typeof kakao === 'undefined' || !kakao.maps) {
        if (sdkLoading) return;
        sdkLoading = true;
        let script = document.createElement('script');
        script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + jsKey + '&autoload=false&libraries=services';
        script.async = true;
        script.defer = true;
        script.onload = function() {
            sdkLoading = false;
            kakao.maps.load(function() { 
                createMap(container);
                // ★ 지도 생성 후 드래그 활성화 재확인
                if (kakaoMap) {
                    kakaoMap.setDraggable(true);
                    kakaoMap.setZoomable(true);
                }
            });
        };
        script.onerror = function() {
            sdkLoading = false;
            container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;border-radius:12px;padding:20px;text-align:center;">❌ SDK 로드 실패</div>';
        };
        document.head.appendChild(script);
        return;
    }
    kakao.maps.load(function() { 
        createMap(container);
        if (kakaoMap) {
            kakaoMap.setDraggable(true);
            kakaoMap.setZoomable(true);
        }
    });
}
function createMap(container) {
    try {
        let region = currentRegion || '서울';
        let centerInfo = getRegionCenter(region);
        let centerLat = centerInfo.lat, centerLng = centerInfo.lng;
        let zoomLevel = 5;
        let isStartValid = startPoint && typeof startPoint.lat === 'number' && typeof startPoint.lng === 'number' &&
                           startPoint.lat > 33 && startPoint.lat < 39 && startPoint.lng > 124 && startPoint.lng < 132 &&
                           !(startPoint.lat === 0 && startPoint.lng === 0);
        if (isStartValid && !singlePlaceMarker && !isShowingRouteMarkers) {
            centerLat = startPoint.lat;
            centerLng = startPoint.lng;
        }
        
        let options = {
            center: new kakao.maps.LatLng(centerLat, centerLng),
            level: zoomLevel,
            draggable: true,
            zoomable: true,
            zoomControl: true,
            scrollwheel: true,
            disableKineticPan: false
        };
        kakaoMap = new kakao.maps.Map(container, options);
        kakaoMap.setDraggable(true);
        kakaoMap.setZoomable(true);
        kakaoMap.setCenter(new kakao.maps.LatLng(centerLat, centerLng));
        kakaoMap.relayout();
        container.style.touchAction = 'auto';
        applyPendingMapCenter();
        
        let zoomControl = new kakao.maps.ZoomControl();
        kakaoMap.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);
        kakaoMap.setZoomable(true);
        
        showTabStatus('tab-route', '🗺️ 지도 로드 완료', 'ok');
    } catch(e) {
        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;border-radius:12px;padding:20px;text-align:center;">❌ 지도 생성 실패</div>';
        showTabStatus('tab-settings', '⚠️ 지도 생성 실패', 'error');
    }
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
                        await uploadToGitHub(silent);
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
            if (file.name.endsWith('.json') && file.name !== '.json') {
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
    let restKey = settings.kakaoRestKey;
    let rowsToGeocode = [];
    for (let i = 0; i < data.length; i++) {
        let row = data[i];
        let name = String(row['현장명'] || row['개소명'] || row['name'] || row['Name'] || '').trim();
        let address = String(row['도로명주소'] || row['address'] || row['Address'] || '').trim();
        let remark = String(row['비고'] || row['remark'] || row['Remark'] || '').trim();
        if (!name) continue;
        let normalized = normalizeName(name);
        let existing = places.find(function(p) { return normalizeName(p.name) === normalized; });
        if (existing) {
            if (existing.address !== address || existing.remark !== remark) {
                existing.address = address;
                existing.remark = remark;
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
            }
        }
    }
    if (added > 0 || updated > 0) savePlaces();
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

function exportData() {
    let data = [];
    if (places.length === 0) {
        data = [
            { '현장명': '예시_현장명_1', '도로명주소': '서울시 강남구 테헤란로 123', '비고': '', '위도': 0, '경도': 0 },
            { '현장명': '예시_현장명_2', '도로명주소': '서울시 서초구 서초대로 456', '비고': '', '위도': 0, '경도': 0 },
            { '현장명': '예시_현장명_3', '도로명주소': '서울시 종로구 종로 789', '비고': '', '위도': 0, '경도': 0 }
        ];
        showTabStatus('tab-list', '📄 예시 양식이 다운로드됩니다.', 'info');
    } else {
        data = places.map(function(p) {
            return {
                '현장명': p.name,
                '도로명주소': p.address || '',
                '비고': p.remark || '',
                '위도': p.lat || 0,
                '경도': p.lng || 0,
                '즐겨찾기': p.favorite ? 'Y' : 'N',
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
        let apiKey = 'b84c1b9a09d8316b679320cceb3a1097';
        let center = getRegionCenter(currentRegion);
        let url = 'https://api.openweathermap.org/data/2.5/weather?lat=' + center.lat + '&lon=' + center.lng + '&appid=' + apiKey + '&units=metric&lang=kr';
        let response = await fetch(url);
        if (!response.ok) throw new Error('날씨 API 호출 실패');
        let data = await response.json();
        let temp = Math.round(data.main.temp);
        let icon = data.weather[0].icon;
        
        let iconMap = {
            '01d': '☀️ 맑음', '01n': '🌙 맑음',
            '02d': '⛅ 구름조금', '02n': '⛅ 구름조금',
            '03d': '☁️ 구름많음', '03n': '☁️ 구름많음',
            '04d': '☁️ 흐림', '04n': '☁️ 흐림',
            '09d': '🌧️ 비', '09n': '🌧️ 비',
            '10d': '🌦️ 비', '10n': '🌦️ 비',
            '11d': '⛈️ 천둥번개', '11n': '⛈️ 천둥번개',
            '13d': '❄️ 눈', '13n': '❄️ 눈',
            '50d': '🌫️ 안개', '50n': '🌫️ 안개'
        };
        
        let desc = iconMap[icon] || '🌡️ ' + data.weather[0].description;
        weatherEl.innerHTML = '<span style="font-size:13px;">' + desc + '</span><span class="temp" style="margin-left:4px;">' + temp + '°C</span>';
        return true;
    } catch(error) {
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
    let center = getRegionCenter(currentRegion);
    let apiKey = 'b84c1b9a09d8316b679320cceb3a1097';
    try {
        let url = 'https://api.openweathermap.org/data/2.5/forecast?lat=' + center.lat + '&lon=' + center.lng + '&appid=' + apiKey + '&units=metric&lang=kr';
        let response = await fetch(url);
        if (!response.ok) throw new Error('예보 조회 실패');
        let data = await response.json();
        let dailyMap = {};
        data.list.forEach(function(item) {
            let date = item.dt_txt.split(' ')[0];
            if (!dailyMap[date]) {
                dailyMap[date] = { temps: [], icons: [], descs: [], date: date };
            }
            dailyMap[date].temps.push(item.main.temp);
            dailyMap[date].icons.push(item.weather[0].icon);
            dailyMap[date].descs.push(item.weather[0].description);
        });
        let dailyList = Object.values(dailyMap).slice(0, 5);
        let modalHtml = '<div id="weekWeatherModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:9999;display:flex;justify-content:center;align-items:center;padding:20px;" onclick="this.remove()"><div style="background:white;border-radius:24px;padding:24px 20px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:80vh;overflow-y:auto;" onclick="event.stopPropagation()"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 style="font-size:18px;font-weight:700;color:#2d3748;">📅 5일 예보 (' + currentRegion + ')</h3><button onclick="document.getElementById(\'weekWeatherModal\').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#a0aec0;">&times;</button></div><div style="display:flex;flex-direction:column;gap:10px;">';
        let iconMap = {
            '01d': '☀️', '01n': '🌙', '02d': '⛅', '02n': '☁️',
            '03d': '☁️', '03n': '☁️', '04d': '☁️', '04n': '☁️',
            '09d': '🌧️', '09n': '🌧️', '10d': '🌦️', '10n': '🌦️',
            '11d': '⛈️', '11n': '⛈️', '13d': '❄️', '13n': '❄️',
            '50d': '🌫️', '50n': '🌫️'
        };
        dailyList.forEach(function(day) {
            let minTemp = Math.round(Math.min.apply(null, day.temps));
            let maxTemp = Math.round(Math.max.apply(null, day.temps));
            let iconCode = day.icons[0] || '01d';
            let iconEmoji = iconMap[iconCode] || '🌡️';
            let desc = day.descs[0] || '';
            let dateObj = new Date(day.date + 'T00:00:00');
            let weekdays = ['일', '월', '화', '수', '목', '금', '토'];
            let dayLabel = weekdays[dateObj.getDay()] + '요일';
            let dateLabel = (dateObj.getMonth() + 1) + '/' + dateObj.getDate();
            modalHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f7fafc;border-radius:14px;border-left:4px solid #2563eb;"><div style="display:flex;align-items:center;gap:12px;min-width:80px;"><span style="font-size:22px;">' + iconEmoji + '</span><div><div style="font-weight:600;font-size:14px;">' + dayLabel + '</div><div style="font-size:11px;color:#a0aec0;">' + dateLabel + '</div></div></div><div style="text-align:center;flex:1;"><span style="font-size:13px;color:#718096;">' + desc + '</span></div><div style="text-align:right;font-weight:700;font-size:15px;">' + maxTemp + '° <span style="color:#a0aec0;font-weight:400;">/</span> ' + minTemp + '°</div></div>';
        });
        modalHtml += '</div><div style="margin-top:14px;font-size:11px;color:#a0aec0;text-align:center;">* 3시간 간격 예보를 평균/최고/최저로 표시했어요</div></div></div>';
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch(error) {
        showTabStatus('tab-settings', '❌ 날씨 예보를 불러오지 못했습니다.', 'error');
    }
}

// ============================================================
// 29. Service Worker
// ============================================================
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/route-optimizer-pwa/sw.js')
            .then(function(reg) {})
            .catch(function(err) {});
    }
}

function displayAppVersion() {
    let statusEl = document.getElementById('updateStatus');
    if (!statusEl) return;
    
    fetch('/route-optimizer-pwa/sw.js?v=' + Date.now())
        .then(function(response) {
            if (!response.ok) throw new Error('sw.js 로드 실패');
            return response.text();
        })
        .then(function(text) {
            let match = text.match(/CACHE_NAME\s*=\s*['"](.+)['"]/);
            if (match && match[1]) {
                let version = match[1];
                statusEl.innerHTML = '✅ 현재 버전: <strong>' + version + '</strong>';
                statusEl.style.color = '#38a169';
                localStorage.setItem('app_cache_name', version);
            } else {
                statusEl.innerHTML = '✅ 최신 버전입니다.';
                statusEl.style.color = '#38a169';
            }
        })
        .catch(function() {
            let cachedVersion = localStorage.getItem('app_cache_name');
            if (cachedVersion) {
                statusEl.innerHTML = '✅ 현재 버전: <strong>' + cachedVersion + '</strong>';
                statusEl.style.color = '#38a169';
            } else {
                statusEl.innerHTML = '✅ 최신 버전입니다.';
                statusEl.style.color = '#38a169';
            }
        });
}

function checkForUpdates() {
    let statusEl = document.getElementById('updateStatus');
    if (!statusEl) return;
    if (!('serviceWorker' in navigator)) {
        statusEl.innerHTML = '⚠️ Service Worker를 지원하지 않는 브라우저입니다.';
        statusEl.style.color = '#e53e3e';
        return;
    }
    statusEl.innerHTML = '⏳ 업데이트 확인 중...';
    statusEl.style.color = '#d69e2e';
    
    navigator.serviceWorker.ready
        .then(function(registration) {
            return registration.update();
        })
        .then(function() {
            return fetch('/route-optimizer-pwa/sw.js?v=' + Date.now());
        })
        .then(function(response) {
            if (!response.ok) throw new Error('sw.js 로드 실패');
            return response.text();
        })
        .then(function(text) {
            let match = text.match(/CACHE_NAME\s*=\s*['"](.+)['"]/);
            if (match && match[1]) {
                let version = match[1];
                statusEl.innerHTML = '✅ 새 버전 적용됨: <strong>' + version + '</strong>';
                statusEl.style.color = '#38a169';
                localStorage.setItem('app_cache_name', version);
            } else {
                statusEl.innerHTML = '✅ 최신 버전입니다.';
                statusEl.style.color = '#38a169';
            }
            setTimeout(function() {
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({ type: 'CHECK_UPDATE' });
                }
            }, 500);
        })
        .catch(function(err) {
            statusEl.innerHTML = '❌ 업데이트 확인 실패: ' + err.message;
            statusEl.style.color = '#e53e3e';
        });
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
    let nameEl = document.getElementById('currentRegionName');
    if (!nameEl) return;
    let currentRegion = localStorage.getItem(SELECTED_REGION_KEY);
    if (currentRegion) {
        nameEl.textContent = currentRegion;
    } else {
        nameEl.textContent = '지역 선택';
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
    let restKey = settings.kakaoRestKey;
    if (!query || query.length < 2 || !restKey) return [];
    try {
        let res = await fetch(
            'https://dapi.kakao.com/v2/local/search/keyword.json?query=' + encodeURIComponent(query) + '&size=' + size,
            { headers: { 'Authorization': 'KakaoAK ' + restKey } }
        );
        if (!res.ok) return [];
        let data = await res.json();
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
    let tabOrder = ['tab-places', 'tab-route', 'tab-list', 'tab-settings', 'tab-help'];
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
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
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
});

// ============================================================
// 38. 초기화 실행
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    loadRegionList();
    loadPresets();
    
    if (currentRegion) {
        let key = getStorageKey(currentRegion);
        let data = localStorage.getItem(key);
        places = data ? JSON.parse(data) : [];
    } else {
        places = [];
    }
    
    updateRegionDisplay();
    
    let sortSelect = document.getElementById('sortPlaces');
    if (sortSelect) currentSort = sortSelect.value;
    
    renderPlaces();
    renderWaypointList();
    updateOptimizationLiveSummary();
    updateStorageInfo();
    setTimeout(initMap, 500);
    setTimeout(function() {
        if (!kakaoMap && !sdkLoading) initMap();
    }, 3000);
    registerServiceWorker();
    setTimeout(displayAppVersion, 1000);
    
    function initWeather() {
        fetchWeather().then(function(success) {
            if (!success) setTimeout(initWeather, 5000);
        });
    }
    setTimeout(initWeather, 3000);
});

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

    // 최대 10개로 제한
    const limit = 10;
    const pointsToUse = allPoints.slice(0, limit);

    if (totalPoints > limit) {
        showTabStatus('tab-route', `⚠️ ${totalPoints}개의 지점 중 처음 ${limit}개만 전달됩니다.`, 'warning');
    }

    const start = pointsToUse[0];
    const waypoints = pointsToUse.slice(1);
    
    let scheme;
    let isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (routeApi === 'tmap') {
        // TMap 스킴 생성
        let baseUrl = 'tmap://route?';
        let params = [];
        
        // 출발지
        params.push('startName=' + encodeURIComponent(start.name));
        params.push('startX=' + start.lng);
        params.push('startY=' + start.lat);
        
        // 경유지 (최대 9개, waypointNames/waypointXs/waypointYs)
        if (waypoints.length > 0) {
            let wpNames = waypoints.map(p => encodeURIComponent(p.name)).join(',');
            let wpXs = waypoints.map(p => p.lng).join(',');
            let wpYs = waypoints.map(p => p.lat).join(',');
            params.push('waypointNames=' + wpNames);
            params.push('waypointXs=' + wpXs);
            params.push('waypointYs=' + wpYs);
        }
        
        scheme = baseUrl + params.join('&');
        
        // ★ iOS에서는 window.location.href 대신 window.open 사용 (스킴 실행)
        if (isIOS) {
            // iOS: 직접 열기 시도
            window.open(scheme, '_blank');
            // 2초 후에도 실행 안 되면 웹으로 fallback (TMap 앱 설치 유도)
            setTimeout(function() {
                // 웹 URL (TMap 웹 길찾기)
                let webUrl = 'https://apis-navi.tmap.co.kr/routes/'
                    + start.lat + ',' + start.lng + '/' 
                    + waypoints[waypoints.length-1].lat + ',' + waypoints[waypoints.length-1].lng
                    + '?name=' + encodeURIComponent(start.name + '→' + waypoints[waypoints.length-1].name);
                window.open(webUrl, '_blank');
            }, 2000);
        } else {
            // Android: window.location.href로 실행
            window.location.href = scheme;
            // fallback
            setTimeout(function() {
                if (!window.location.href.startsWith('tmap://')) {
                    let webUrl = 'https://apis-navi.tmap.co.kr/routes/'
                        + start.lat + ',' + start.lng + '/' 
                        + waypoints[waypoints.length-1].lat + ',' + waypoints[waypoints.length-1].lng
                        + '?name=' + encodeURIComponent(start.name + '→' + waypoints[waypoints.length-1].name);
                    window.open(webUrl, '_blank');
                }
            }, 2000);
        }
        
        showTabStatus('tab-route', `🗺️ TMap 실행 중... (${pointsToUse.length}개 지점)`, 'info');
        return;
    }

    // ===== 카카오내비 =====
    if (routeApi === 'kakao') {
        const end = waypoints.length > 0 ? waypoints[waypoints.length - 1] : null;
        let scheme = 'kakaonavi://navigate?';
        let params = [];
        
        params.push('start=' + encodeURIComponent(start.name) + ',' + start.lng + ',' + start.lat);
        if (end) {
            params.push('goal=' + encodeURIComponent(end.name) + ',' + end.lng + ',' + end.lat);
        }
        // 경유지
        for (let i = 0; i < waypoints.length - 1; i++) {
            const wp = waypoints[i];
            params.push('via=' + encodeURIComponent(wp.name) + ',' + wp.lng + ',' + wp.lat);
        }
        
        scheme = scheme + params.join('&');
        
        // iOS/Android 모두 window.location.href로 실행
        window.location.href = scheme;
        
        // fallback (카카오맵 웹)
        setTimeout(function() {
            if (!window.location.href.startsWith('kakaonavi://')) {
                let webUrl = 'https://map.kakao.com/link/from/'
                    + encodeURIComponent(start.name) + ',' + start.lat + ',' + start.lng
                    + '/to/'
                    + encodeURIComponent(end ? end.name : waypoints[waypoints.length-1].name) + ',' 
                    + (end ? end.lat : waypoints[waypoints.length-1].lat) + ',' 
                    + (end ? end.lng : waypoints[waypoints.length-1].lng);
                window.open(webUrl, '_blank');
            }
        }, 2000);
        
        showTabStatus('tab-route', `🗺️ 카카오내비 실행 중... (${pointsToUse.length}개 지점)`, 'info');
        return;
    }
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
