// ============================================================
// 경로 최적화 PWA - 전체 코드
// ============================================================

// --- 저장소 키 ---
const STORAGE_KEY_PREFIX = 'places_';
const SELECTED_REGION_KEY = 'selectedRegion';
const SETTINGS_KEY = 'app_settings';
const OPTIMIZE_MODE_KEY = 'optimizeMode';
const PRESETS_KEY = 'route_presets';

// --- 지역별 중심 좌표 ---
const REGION_CENTERS = {
    // 서울시 25개 구 (구청 기준)
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
    // 기타 주요 지역
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
// 전역 색상 배열 (경로/마커 통일)
// ============================================================

const COLORS = [
    '#FF6B6B', // 빨강
    '#FF9F43', // 주황
    '#FECA57', // 노랑
    '#48DBFB', // 하늘
    '#0ABDE3', // 파랑
    '#10AC84', // 초록
    '#EE5A24', // 진주황
    '#5F27CD', // 보라
    '#1DD1A1', // 민트
    '#F368E0', // 분홍
    '#00D2D3', // 청록
    '#54A0FF', // 파랑
    '#FF9FF3', // 연분홍
    '#F368E0'  // 분홍
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

// --- 마커/검색 상태 ---
let startMarker = null;
let routeMarkers = [];
let placeMarkers = [];
let singlePlaceMarker = null;
let singlePlaceInfoWindow = null;
let autoSyncTimer = null;
let sdkLoading = false;
let isShowingRouteMarkers = false;

//  검색 인덱스 상태 (키보드 네비게이션용)
const searchIndexState = {
    selected: -1,
    waypoint: -1,
    addr: -1
};

// ============================================================
// 1. 유틸리티 함수
// ============================================================

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = (str == null) ? '' : String(str);
    return div.innerHTML;
}

function haversineKm(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shortenAddress(address) {
    if (!address) return '';
    var parts = address.split(' ');
    var result = [];
    var skipWords = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', 
                     '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
                     '시', '도', '군', '구'];
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (skipWords.some(function(w) { return part === w || part.endsWith(w); })) {
            continue;
        }
        result.push(part);
    }
    return result.join(' ') || address;
}

function getRegionCenter(region) {
    if (REGION_CENTERS[region]) return REGION_CENTERS[region];
    for (var key in REGION_CENTERS) {
        if (region.includes(key) || key.includes(region)) return REGION_CENTERS[key];
    }
    return { lat: 37.5665, lng: 126.9780 };
}

function getStorageKey(region) { return STORAGE_KEY_PREFIX + region; }

function normalizeName(name) { return name.trim().toLowerCase(); }

// ============================================================
// 2. 탭 전환
// ============================================================

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.bottom-tab').forEach(function(el) { el.classList.remove('active'); });
    var targetContent = document.getElementById(tabId);
    if (targetContent) targetContent.classList.add('active');
    var targetTab = document.querySelector('.bottom-tab[data-tab="' + tabId + '"]');
    if (targetTab) targetTab.classList.add('active');
    
    if (tabId === 'tab-route') {
        setTimeout(function() {
            if (kakaoMap) {
                // ===== 🔥 지도 탭 전환 시 드래그 강제 활성화 =====
                kakaoMap.setDraggable(true);
                kakaoMap.setZoomable(true);
                kakaoMap.relayout();
                console.log('🗺️ 지도 탭 전환 - 드래그 활성화');
            } else {
                initMap();
            }
        }, 100);
        return;
    }
    if (tabId === 'tab-list') renderPlaces();
}

function showTabStatus(tabId, msg, type) {
    var statusEl = document.getElementById(tabId + 'Status');
    if (!statusEl) {
        var tabContent = document.getElementById(tabId);
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
        statusEl._hideTimer = setTimeout(function() { statusEl.classList.remove('show'); }, 5000);
    }
}

// ============================================================
// 3. 설정 관리
// ============================================================

function loadSettings() {
    var saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
        try {
            settings = JSON.parse(saved);
            document.getElementById('githubToken').value = settings.githubToken || '';
            document.getElementById('kakaoJsKey').value = settings.kakaoJsKey || '';
            document.getElementById('kakaoRestKey').value = settings.kakaoRestKey || '';
            updateSettingsStatus();
        } catch(e) {}
    }
}

function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    updateSettingsStatus();
}

function updateSettingsStatus() {
    var gs = document.getElementById('githubStatus');
    if (settings.githubToken) { gs.textContent = '✅ 토큰 설정됨'; gs.className = 'badge badge-ok'; } 
    else { gs.textContent = '⏳ 토큰 미설정'; gs.className = 'badge badge-wait'; }
    var ks = document.getElementById('kakaoStatus');
    if (settings.kakaoJsKey && settings.kakaoRestKey) { ks.textContent = '✅ API 키 설정됨'; ks.className = 'badge badge-ok'; } 
    else { ks.textContent = '⏳ API 키 미설정'; ks.className = 'badge badge-wait'; }
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
    var container = document.getElementById('map');
    if (container) {
        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#d69e2e;font-size:14px;background:#fffff0;border-radius:12px;">⏳ 키 저장됨, 지도 재로딩 중...</div>';
    }
    kakaoMap = null;
    setTimeout(initMap, 500);
}

async function testGitHubToken() {
    var token = settings.githubToken || document.getElementById('githubToken').value.trim();
    if (!token) { showTabStatus('tab-settings', '토큰을 입력하세요.', 'warning'); return; }
    var gs = document.getElementById('githubStatus');
    gs.textContent = '⏳ 테스트 중...';
    gs.className = 'badge badge-wait';
    try {
        var res = await fetch('https://api.github.com/user', { headers: { 'Authorization': 'token ' + token } });
        if (res.ok) {
            var user = await res.json();
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
// 4. 저장소 관리
// ============================================================

function savePlaces() {
    var key = getStorageKey(currentRegion);
    localStorage.setItem(key, JSON.stringify(places));
    renderPlaces();
    updateStorageInfo();
    scheduleAutoSync();
}

function scheduleAutoSync() {
    clearTimeout(autoSyncTimer);
    if (!settings.githubToken) return;
    autoSyncTimer = setTimeout(function() { uploadToGitHub(true); }, 5000);
}

function updateStorageInfo() {
    var size = 0;
    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key) size += localStorage.getItem(key).length * 2;
    }
    document.getElementById('storageInfo').textContent = '저장소: ' + (size / 1024).toFixed(1) + ' KB';
}

function loadRegionList() {
    var select = document.getElementById('regionSelect');
    select.innerHTML = '';
    var regions = [];
    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
            var region = key.replace(STORAGE_KEY_PREFIX, '');
            if (region && !regions.includes(region)) regions.push(region);
        }
    }
    if (regions.length === 0) return;
    regions.sort();
    for (var i = 0; i < regions.length; i++) {
        var opt = document.createElement('option');
        opt.value = regions[i];
        opt.textContent = regions[i];
        select.appendChild(opt);
    }
    if (currentRegion && regions.includes(currentRegion)) select.value = currentRegion;
    else { select.value = ''; currentRegion = ''; localStorage.removeItem(SELECTED_REGION_KEY); }
}

function switchRegion(region) {
    console.log('🔄 switchRegion 호출됨:', region);
    
    clearTimeout(autoSyncTimer);
    currentRegion = region;
    localStorage.setItem(SELECTED_REGION_KEY, region);
    
    // 해당 지역 데이터 로드
    var key = getStorageKey(region);
    var data = localStorage.getItem(key);
    places = data ? JSON.parse(data) : [];
    console.log('📊 로드된 현장 수:', places.length);
    
    // UI 갱신
    renderPlaces();
    updateStorageInfo();
    document.getElementById('regionSelect').value = region;
    
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
    
    // 카카오맵 버튼 숨기기
    var btnContainer = document.getElementById('kakaoMapButtonContainer');
    if (btnContainer) {
        btnContainer.style.display = 'none';
    }
    currentPlaceId = null;
    
    if (kakaoMap) {
        var center = getRegionCenter(region);
        kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
        kakaoMap.setLevel(5);
        kakaoMap.relayout();
    }
    
    var activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
        showTabStatus(activeTab.id, '📍 ' + region + ' 지역으로 전환됨 (' + places.length + '개 현장)', 'info');
    }
    fetchWeather();
    console.log('✅ 지역 전환 완료:', region, '현장 수:', places.length);
}
function addRegion() {
    console.log('🔄 addRegion 호출됨');
    
    // 기존 모달 제거
    var existing = document.getElementById('customRegionModal');
    if (existing) existing.remove();
    
    // 🔥 자체 모달 HTML 생성 (showPromptModal 의존 없음)
    var modalHtml = `
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
                <input id="customRegionInput" type="text" placeholder="예: 용산" 
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
    
    // 입력창에 포커스
    setTimeout(function() {
        var input = document.getElementById('customRegionInput');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
    
    // 🔥 확인 버튼 클릭 이벤트
    document.getElementById('customRegionConfirmBtn').addEventListener('click', function() {
        var input = document.getElementById('customRegionInput');
        var name = input ? input.value.trim() : '';
        document.getElementById('customRegionModal').remove();
        
        console.log('📥 입력된 지역명:', name);
        
        if (!name) {
            showTabStatus('tab-settings', '⚠️ 지역명을 입력하세요.', 'warning');
            return;
        }
        
        var region = name.replace(/[\/\\:*?"<>|]/g, '');
        if (!region) {
            showTabStatus('tab-settings', '⚠️ 사용할 수 없는 지역명입니다.', 'warning');
            return;
        }
        
        var select = document.getElementById('regionSelect');
        if (!select) {
            console.error('❌ regionSelect 요소 없음');
            showTabStatus('tab-settings', '⚠️ 오류 발생, 새로고침 후 다시 시도하세요.', 'error');
            return;
        }
        
        // 중복 체크
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === region) {
                showTabStatus('tab-settings', '⚠️ 이미 존재하는 지역입니다.', 'warning');
                return;
            }
        }
        
        // 지역 저장
        var key = getStorageKey(region);
        localStorage.setItem(key, JSON.stringify([]));
        console.log('💾 localStorage 저장 완료:', key);
        
        // 드롭다운에 추가
        var opt = document.createElement('option');
        opt.value = region;
        opt.textContent = region;
        select.appendChild(opt);
        select.value = region;
        console.log('✅ 드롭다운에 추가됨:', region);
        
        // 지역 전환
        switchRegion(region);
        showTabStatus('tab-settings', '✅ "' + region + '" 지역 추가됨', 'ok');
        console.log('✅ 지역 추가 완료!');
    });
}
// ============================================================
// 5. 설정 내보내기/가져오기
// ============================================================

function exportSettings() {
    var data = {
        githubToken: settings.githubToken || '',
        kakaoJsKey: settings.kakaoJsKey || '',
        kakaoRestKey: settings.kakaoRestKey || '',
        exportDate: new Date().toISOString()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'settings_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showTabStatus('tab-settings', '✅ 설정 내보내기 완료', 'ok');
}

function importSettings(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            if (!data.githubToken && !data.kakaoJsKey && !data.kakaoRestKey) {
                showTabStatus('tab-settings', '❌ 유효한 설정 파일이 아닙니다.', 'error');
                return;
            }
            settings.githubToken = data.githubToken || '';
            settings.kakaoJsKey = data.kakaoJsKey || '';
            settings.kakaoRestKey = data.kakaoRestKey || '';
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
// 검색 결과 렌더링 (onclick 강화)
// ============================================================

function renderSearchResults(container, results, onClickName, isMultiSelect) {
    if (!results || results.length === 0) {
        container.style.display = 'none';
        return;
    }
    var html = '';
    for (var i = 0; i < results.length; i++) {
        var item = results[i];
        var sourceLabel = item._source || '카카오맵';
        var checked = selectedWaypoints.some(function(w) { return w.name === item.place_name; });
        html += '<div class="result-item" data-name="' + escapeHtml(item.place_name) + '" data-address="' + escapeHtml(item.address_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '" data-index="' + i + '">';
        if (isMultiSelect) {
            html += '<input type="checkbox" class="result-check" ' + (checked ? 'checked' : '') + ' onclick="event.stopPropagation(); toggleWaypointSelection(\'' + escapeHtml(item.place_name) + '\', \'' + escapeHtml(item.address_name) + '\', ' + item.y + ', ' + item.x + ')">';
        }
        html += '<div class="result-info"><div>' + escapeHtml(item.place_name) + ' <span class="source">' + sourceLabel + '</span></div>';
        html += '<div class="addr">' + escapeHtml(item.address_name) + '</div></div></div>';
    }
    container.innerHTML = html;
    container.style.display = 'block';
    
    // 🔥 onclick 이벤트 직접 연결 (강화)
    container.querySelectorAll('.result-item').forEach(function(el) {
        el.addEventListener('click', function(e) {
            // 체크박스 클릭은 제외
            if (e.target.closest('.result-check')) return;
            
            var name = this.dataset.name;
            var address = this.dataset.address;
            var lat = parseFloat(this.dataset.lat);
            var lng = parseFloat(this.dataset.lng);
            
            // 출발지 검색 결과면 selectStartPoint 호출
            if (onClickName === 'selectStartPoint') {
                selectStartPoint(name, address, lat, lng);
            }
            // 주소 검색 결과면 selectAddress 호출
            else if (onClickName === 'selectAddress') {
                selectAddress(name, address, lat, lng);
            }
            // 그 외는 window 함수 호출
            else {
                var fn = window[onClickName];
                if (typeof fn === 'function') {
                    fn(name, address, lat, lng);
                }
            }
        });
    });
}
// ============================================================
// 검색 결과 렌더링 (체크박스 포함)
// ============================================================

function renderSearchResults(container, results, onClickName, isMultiSelect) {
    if (!results || results.length === 0) {
        container.style.display = 'none';
        return;
    }
    var html = '';
    for (var i = 0; i < results.length; i++) {
        var item = results[i];
        var sourceLabel = item._source || '카카오맵';
        var checked = selectedWaypoints.some(function(w) { return w.name === item.place_name; });
        html += '<div class="result-item" data-name="' + escapeHtml(item.place_name) + '" data-address="' + escapeHtml(item.address_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '" data-index="' + i + '">';
        if (isMultiSelect) {
            html += '<input type="checkbox" class="result-check" ' + (checked ? 'checked' : '') + ' onclick="event.stopPropagation(); toggleWaypointSelection(\'' + escapeHtml(item.place_name) + '\', \'' + escapeHtml(item.address_name) + '\', ' + item.y + ', ' + item.x + ')">';
        }
        html += '<div class="result-info"><div>' + escapeHtml(item.place_name) + ' <span class="source">' + sourceLabel + '</span></div>';
        html += '<div class="addr">' + escapeHtml(item.address_name) + '</div></div></div>';
    }
    container.innerHTML = html;
    container.style.display = 'block';
}

// ============================================================
// 여러개 추가 모드 토글 (버튼 스타일)
// ============================================================

function toggleMultiSelect() {
    multiSelectMode = !multiSelectMode;
    
    var toggleBtn = document.getElementById('multiToggleBtn');
    var addBtn = document.getElementById('addWaypointBtn');
    var input = document.getElementById('waypointInput');
    var statusEl = document.getElementById('modeStatus');
    
    if (multiSelectMode) {
        // ===== 여러개 추가 모드 ON =====
        if (toggleBtn) {
            toggleBtn.style.background = '#2b6cb0';
            toggleBtn.style.color = 'white';
            toggleBtn.style.borderColor = '#2b6cb0';
            toggleBtn.textContent = '✅ 여러개 추가 ON';
        }
        
        if (addBtn) {
            addBtn.textContent = '✅ 선택 추가';
            addBtn.style.background = '#2b6cb0';
            addBtn.style.border = 'none';
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
        // ===== 일반 모드 =====
        if (toggleBtn) {
            toggleBtn.style.background = 'white';
            toggleBtn.style.color = '#4a5568';
            toggleBtn.style.borderColor = '#cbd5e0';
            toggleBtn.textContent = '📋 여러개 추가';
        }
        
        if (addBtn) {
            addBtn.textContent = '➕ 추가';
            addBtn.style.background = '#38a169';
            addBtn.style.border = 'none';
        }
        
        if (input) {
            input.placeholder = '경유지 입력';
        }
        
        if (statusEl) {
            statusEl.textContent = '💡 일반 모드 - 경유지를 입력하고 추가하세요';
            statusEl.style.color = '#a0aec0';
        }
        
        // 선택 초기화
        selectedWaypoints = [];
        var resultsContainer = document.getElementById('waypointSearchResults');
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }
        
        showTabStatus('tab-places', '일반 모드로 전환됨', 'info');
    }
}
// ============================================================
// 경유지 선택 토글 (체크박스)
// ============================================================

// ============================================================
// 경유지 선택 토글 (체크박스)
// ============================================================

function toggleWaypointSelection(name, address, lat, lng) {
    var idx = selectedWaypoints.findIndex(function(w) { return w.name === name; });
    if (idx >= 0) {
        selectedWaypoints.splice(idx, 1);
    } else {
        if (selectedWaypoints.length >= 15) {
            showTabStatus('tab-places', '⚠️ 최대 15개까지 선택 가능', 'warning');
            return;
        }
        selectedWaypoints.push({ name: name, address: address, lat: lat, lng: lng });
    }
    // 체크박스 상태 동기화
    var container = document.getElementById('waypointSearchResults');
    if (container) {
        container.querySelectorAll('.result-item').forEach(function(el) {
            var cb = el.querySelector('.result-check');
            if (cb) {
                cb.checked = selectedWaypoints.some(function(w) { return w.name === el.dataset.name; });
            }
        });
    }
}

function addSelectedWaypoints() {
    if (selectedWaypoints.length === 0) {
        showTabStatus('tab-places', '선택된 경유지가 없습니다.', 'warning');
        return;
    }
    var added = 0;
    var toAdd = [];
    for (var i = 0; i < selectedWaypoints.length; i++) {
        var w = selectedWaypoints[i];
        if (waypoints.length >= 15) {
            showTabStatus('tab-places', '⚠️ 최대 15개까지 가능', 'warning');
            break;
        }
        if (!waypoints.some(function(ex) { return ex.name === w.name; })) {
            waypoints.push({ name: w.name, lat: w.lat, lng: w.lng, address: w.address });
            added++;
        }
    }
    renderWaypointList();
    selectedWaypoints = [];
    document.getElementById('waypointSearchResults').style.display = 'none';
    document.getElementById('multiSelectMode').checked = false;
    multiSelectMode = false;
    document.getElementById('addSelectedBtn').style.display = 'none';
    showTabStatus('tab-places', '✅ ' + added + '개 경유지 추가됨', 'ok');
}

function getRecentStartPoints() {
    try {
        var key = 'recentStartPoints_' + currentRegion;
        var data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

function saveRecentStartPoint(name, address, lat, lng) {
    var recent = getRecentStartPoints();
    recent = recent.filter(function(item) { return item.name !== name; });
    recent.unshift({ name: name, address: address, lat: lat, lng: lng });
    recent = recent.slice(0, 3);
    var key = 'recentStartPoints_' + currentRegion;
    localStorage.setItem(key, JSON.stringify(recent));
}

// ============================================================
// 출발지 검색
// ============================================================

function searchStartPoint(query) {
    var container = document.getElementById('startSearchResults');
    
    if (!query || query.length === 0) {
        var recent = getRecentStartPoints();
        if (recent.length === 0) {
            container.style.display = 'none';
            return;
        }
        var html = '';
        for (var i = 0; i < recent.length; i++) {
            var item = recent[i];
            html += '<div class="result-item" data-name="' + escapeHtml(item.name) + '" data-address="' + escapeHtml(item.address) + '" data-lat="' + item.lat + '" data-lng="' + item.lng + '">';
            html += '<div>🕐 ' + escapeHtml(item.name) + ' <span style="font-size:10px;color:#a0aec0;">최근</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address) + '</div></div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        
        container.querySelectorAll('.result-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var name = this.dataset.name;
                var address = this.dataset.address;
                var lat = parseFloat(this.dataset.lat);
                var lng = parseFloat(this.dataset.lng);
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
        var allResults = [];
        var seenNames = {};
        var lowerQuery = query.toLowerCase();
        
        // 현장리스트 검색
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (p.name.toLowerCase().includes(lowerQuery) || (p.address && p.address.toLowerCase().includes(lowerQuery))) {
                var key = p.name + '|' + (p.address || '');
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
        
        // 카카오맵 검색
        var kakaoResults = await searchKakaoPlaces(query);
        kakaoResults.slice(0, 5).forEach(function(item) {
            var key = item.place_name + '|' + item.address_name;
            if (!seenNames[key]) {
                seenNames[key] = true;
                allResults.push(item);
            }
        });
        
        if (allResults.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        var html = '';
        for (var i = 0; i < allResults.length; i++) {
            var item = allResults[i];
            var sourceLabel = item._source || '카카오맵';
            html += '<div class="result-item" data-name="' + escapeHtml(item.place_name) + '" data-address="' + escapeHtml(item.address_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '">';
            html += '<div class="result-info"><div>' + escapeHtml(item.place_name) + ' <span class="source">' + sourceLabel + '</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address_name) + '</div></div></div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        
        container.querySelectorAll('.result-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var name = this.dataset.name;
                var address = this.dataset.address;
                var lat = parseFloat(this.dataset.lat);
                var lng = parseFloat(this.dataset.lng);
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
    saveRecentStartPoint(name, address, lat, lng);
    startPoint = { name: name, address: address, lat: lat, lng: lng };
    document.getElementById('startInfo').textContent = '✅ ' + name + ' (' + address + ')';
    document.getElementById('startInfo').style.color = '#22543d';
    if (kakaoMap) {
        // ===== 🔥 마커 배열 초기화 =====
        routeMarkers = [];
        if (startMarker) {
            try { startMarker.setMap(null); } catch(e) {}
            startMarker = null;
        }
        clearSingleMarker();
        isShowingRouteMarkers = false;
        addRouteMarker(startPoint.lat, startPoint.lng, '🚩 ' + name, true, -1);
        kakaoMap.setCenter(new kakao.maps.LatLng(startPoint.lat, startPoint.lng));
        kakaoMap.setLevel(5);
        kakaoMap.relayout();
    }
    showTabStatus('tab-places', '✅ 출발지 "' + name + '" 설정 완료', 'ok');
}

// ============================================================
// 현재 위치로 출발지 설정 (GPS)
// ============================================================

function setCurrentLocation() {
    if (!navigator.geolocation) {
        showTabStatus('tab-places', '⚠️ 이 브라우저는 GPS를 지원하지 않습니다.', 'warning');
        return;
    }
    
    var btn = document.querySelector('.btn-outline[onclick*="setCurrentLocation"]');
    if (btn) {
        btn.innerHTML = '<span style="font-size:14px;">⏳</span> 위치 확인 중...';
        btn.disabled = true;
    }
    
    showTabStatus('tab-places', '📍 GPS 위치 가져오는 중...', 'info');
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            var lat = position.coords.latitude;
            var lng = position.coords.longitude;
            
            if (btn) {
                btn.innerHTML = '<span style="font-size:14px;">🎯</span> 현재 위치';
                btn.disabled = false;
            }
            
            var restKey = settings.kakaoRestKey;
            if (restKey) {
                fetch('https://dapi.kakao.com/v2/local/geo/coord2address.json?x=' + lng + '&y=' + lat, {
                    headers: { 'Authorization': 'KakaoAK ' + restKey }
                })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    var address = '현재 위치';
                    if (data.documents && data.documents.length > 0) {
                        var doc = data.documents[0];
                        if (doc.road_address) {
                            address = doc.road_address.address_name;
                        } else if (doc.address) {
                            address = doc.address.address_name;
                        }
                    }
                    var shortAddr = shortenAddress(address);
                    selectStartPoint('🎯 내 위치', shortAddr || address, lat, lng);
                    showTabStatus('tab-places', '✅ 현재 위치로 설정됨: ' + (shortAddr || address), 'ok');
                })
                .catch(function() {
                    selectStartPoint('🎯 내 위치', 'GPS 좌표', lat, lng);
                    showTabStatus('tab-places', '✅ 현재 위치로 설정됨', 'ok');
                });
            } else {
                selectStartPoint('🎯 내 위치', 'GPS 좌표', lat, lng);
                showTabStatus('tab-places', '✅ 현재 위치로 설정됨', 'ok');
            }
        },
        function(error) {
            if (btn) {
                btn.innerHTML = '<span style="font-size:14px;">🎯</span> 현재 위치';
                btn.disabled = false;
            }
            
            console.error('GPS 오류:', error);
            var msg = 'GPS 위치를 가져올 수 없습니다.';
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
    var name = document.getElementById('startPoint').value.trim();
    if (!name) { showTabStatus('tab-places', '출발지를 입력하세요.', 'warning'); return; }
    var restKey = settings.kakaoRestKey;
    if (!restKey) { showTabStatus('tab-places', '⚠️ REST API 키가 필요합니다.', 'warning'); return; }
    var geo = await geocodeAddress(name, restKey);
    if (!geo) { showTabStatus('tab-places', '❌ "' + name + '" 위치를 찾을 수 없습니다.', 'error'); return; }
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
// 경유지 추가 (일반 + 여러개 통합)
// ============================================================

function addWaypoint() {
    var input = document.getElementById('waypointInput');
    var name = input.value.trim();
    
    // ===== 여러개 추가 모드 =====
    if (multiSelectMode) {
        if (selectedWaypoints.length === 0) {
            showTabStatus('tab-places', '⚠️ 선택된 경유지가 없습니다. 검색 후 체크박스를 선택하세요.', 'warning');
            input.focus();
            return;
        }
        
        var added = 0;
        var duplicated = 0;
        
        for (var i = 0; i < selectedWaypoints.length; i++) {
            var w = selectedWaypoints[i];
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
        var resultsContainer = document.getElementById('waypointSearchResults');
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }
        
        var msg = '✅ ' + added + '개 경유지 추가됨';
        if (duplicated > 0) msg += ' (' + duplicated + '개 중복 제외)';
        showTabStatus('tab-places', msg, 'ok');
        return;
    }
    
    // ===== 일반 추가 모드 =====
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
    var resultsContainer = document.getElementById('waypointSearchResults');
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
    var list = document.getElementById('waypointList');
    var countEl = document.getElementById('wpCount');
    if (!list) return;
    if (countEl) countEl.textContent = '(' + waypoints.length + '개)';
    if (waypoints.length === 0) {
        list.innerHTML = '<li class="empty-msg">경유지를 추가하세요 (드래그로 순서 변경 가능)</li>';
        if (window._sortable) { window._sortable.destroy(); window._sortable = null; }
        return;
    }
    var html = '';
    for (var i = 0; i < waypoints.length; i++) {
        var wp = waypoints[i];
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
            // SortableJS onEnd 부분
onEnd: function(evt) {
    var oldIndex = evt.oldIndex - 1;
    var newIndex = evt.newIndex - 1;
    if (oldIndex === newIndex || oldIndex < 0 || newIndex < 0) return;
    
    var moved = routeResult.places.splice(oldIndex, 1)[0];
    routeResult.places.splice(newIndex, 0, moved);
    showRouteList();
    
    var allPoints = [{ name: startPoint.name, lat: startPoint.lat, lng: startPoint.lng }].concat(routeResult.places);
    
    // ===== 🔥 마커 배열 초기화 후 재생성 =====
    routeMarkers = [];
    if (startMarker) {
        try { startMarker.setMap(null); } catch(e) {}
        startMarker = null;
    }
    if (window._sectionPolylines) {
        for (var i = 0; i < window._sectionPolylines.length; i++) {
            try { window._sectionPolylines[i].setMap(null); } catch(e) {}
        }
        window._sectionPolylines = [];
    }
    
    addRouteMarker(startPoint.lat, startPoint.lng, '🚩 ' + startPoint.name, true, -1);
    for (var i = 0; i < routeResult.places.length; i++) {
        var p = routeResult.places[i];
        addRouteMarker(p.lat, p.lng, (i + 1) + '. ' + p.name, false, i);
    }
    
    var restKey = settings.kakaoRestKey;
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

// ============================================================
// 경유지 검색 (체크박스 포함)
// ============================================================

function searchWaypoint(query) {
    var container = document.getElementById('waypointSearchResults');
    if (!query || query.length < 1) { 
        container.style.display = 'none'; 
        return; 
    }
    clearTimeout(window._waypointSearchTimer);
    window._waypointSearchTimer = setTimeout(async function() {
        var placeResults = [];
        var lowerQuery = query.toLowerCase();
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
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
        var kakaoResults = await searchKakaoPlaces(query, 5);
        kakaoResults = kakaoResults.slice(0, 5);
        var allResults = [];
        var seenNames = {};
        placeResults.concat(kakaoResults).forEach(function(item) {
            var key = item.place_name + '|' + item.address_name;
            if (!seenNames[key]) { 
                seenNames[key] = true; 
                allResults.push(item); 
            }
        });
        if (allResults.length === 0) { 
            container.style.display = 'none'; 
            return; 
        }
        
        var html = '';
        var isMulti = multiSelectMode;
        for (var i = 0; i < allResults.length; i++) {
            var item = allResults[i];
            var sourceLabel = item._source || '카카오맵';
            var checked = selectedWaypoints.some(function(w) { return w.name === item.place_name; });
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
                var name = this.dataset.name;
                var address = this.dataset.address;
                var lat = parseFloat(this.dataset.lat);
                var lng = parseFloat(this.dataset.lng);
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
    var container = document.getElementById('addrSearchResults');
    if (!query || query.length < 2) { container.style.display = 'none'; return; }
    clearTimeout(window._addrSearchTimer);
    window._addrSearchTimer = setTimeout(async function() {
        var results = await searchKakaoPlaces(query);
        if (results.length === 0) { container.style.display = 'none'; return; }
        var html = '';
        for (var i = 0; i < results.length; i++) {
            var item = results[i];
            html += '<div class="result-item" data-name="' + escapeHtml(item.place_name) + '" data-address="' + escapeHtml(item.address_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '">';
            html += '<div class="result-info"><div>' + escapeHtml(item.place_name) + ' <span class="source">카카오맵</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address_name) + '</div></div></div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        container.querySelectorAll('.result-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var name = this.dataset.name, address = this.dataset.address, lat = parseFloat(this.dataset.lat), lng = parseFloat(this.dataset.lng);
                selectAddress(name, address, lat, lng);
            });
        });
    }, 300);
}

function selectAddress(name, address, lat, lng) {
    document.getElementById('newPlaceAddr').value = address;
    document.getElementById('addrSearchResults').style.display = 'none';
    var nameInput = document.getElementById('newPlaceName');
    if (!nameInput.value.trim()) nameInput.value = name;
}

// ============================================================
// 7. 현장 관리
// ============================================================

function applySort() {
    var sortSelect = document.getElementById('sortPlaces');
    if (sortSelect) {
        var newSort = sortSelect.value;
        if (newSort !== currentSort) {
            currentSort = newSort;
            renderPlaces();
        }
    }
}

function getSortedPlaces() {
    if (!places || places.length === 0) {
        return [];
    }
    
    var sorted = [...places];
    
    if (currentSort === 'name-asc') {
        sorted.sort(function(a, b) {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return (a.name || '').localeCompare(b.name || '', 'ko');
        });
    } else if (currentSort === 'name-desc') {
        sorted.sort(function(a, b) {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return (b.name || '').localeCompare(a.name || '', 'ko');
        });
    } else if (currentSort === 'favorite') {
        sorted.sort(function(a, b) {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return (a.name || '').localeCompare(b.name || '', 'ko');
        });
    }
    return sorted;
}

function renderPlaces(filtered) {
    var list = document.getElementById('placeList');
    if (!list) {
        console.warn('⚠️ placeList 요소 없음');
        return;
    }
    
    var data = filtered || getSortedPlaces();
    
    if (!data || data.length === 0) {
        list.innerHTML = '<div class="empty-msg">등록된 현장이 없습니다</div>';
        var countEl = document.getElementById('listCount');
        if (countEl) countEl.textContent = '(0개)';
        return;
    }
    
    var countEl = document.getElementById('listCount');
    if (countEl) countEl.textContent = '(' + data.length + '개)';
    
    var html = '';
    for (var i = 0; i < data.length; i++) {
        var p = data[i];
        var shortAddr = shortenAddress(p.address || '');
        var starIcon = p.favorite ? '★' : '☆';
        var starClass = p.favorite ? 'fav active' : 'fav inactive';
        var remarkDisplay = p.remark ? '<span class="remark">' + escapeHtml(p.remark) + '</span>' : '';
        html += '<div class="place-item" onclick="openEditModal(\'' + p.id + '\')" title="클릭하여 편집">';
        html += '<div class="info"><span class="name">' + escapeHtml(p.name) + '</span>';
        html += '<span class="addr">' + escapeHtml(shortAddr) + '</span>';
        html += remarkDisplay;
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
    var keyword = document.getElementById('searchPlace').value.trim();
    if (!keyword) { 
        renderPlaces(); 
        return; 
    }
    
    var results = places.filter(function(p) {
        return (p.name && p.name.includes(keyword)) || (p.address && p.address.includes(keyword));
    });
    
    var sortedResults = [...results];
    if (currentSort === 'name-asc' || currentSort === 'favorite') {
        sortedResults.sort(function(a, b) {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return (a.name || '').localeCompare(b.name || '', 'ko');
        });
    } else if (currentSort === 'name-desc') {
        sortedResults.sort(function(a, b) {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return (b.name || '').localeCompare(a.name || '', 'ko');
        });
    }
    
    renderPlaces(sortedResults);
}

// ============================================================
// 현장추가 모달 (내부 팝업)
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
    var name = document.getElementById('modalPlaceName').value.trim();
    var address = document.getElementById('modalPlaceAddr').value.trim();
    var remark = document.getElementById('modalPlaceRemark').value.trim();
    
    if (!name) {
        showTabStatus('tab-list', '⚠️ 현장명을 입력하세요.', 'warning');
        document.getElementById('modalPlaceName').focus();
        return;
    }
    
    // 중복 체크
    if (places.some(function(p) { return normalizeName(p.name) === normalizeName(name); })) {
        showTabStatus('tab-list', '⚠️ 이미 존재하는 현장명입니다.', 'warning');
        document.getElementById('modalPlaceName').focus();
        return;
    }
    
    var lat = 0, lng = 0, fullAddress = address;
    var restKey = settings.kakaoRestKey;
    
    if (address && restKey) {
        geocodeAddress(address, restKey).then(function(geo) {
            if (geo) {
                lat = geo.lat;
                lng = geo.lng;
                fullAddress = geo.address || address;
            }
            savePlaceFromModal(name, fullAddress, lat, lng, remark);
        });
    } else {
        savePlaceFromModal(name, fullAddress, lat, lng, remark);
    }
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

// ============================================================
// 모달 주소 검색
// ============================================================

function searchAddressForModal(query) {
    var container = document.getElementById('modalAddrSearchResults');
    if (!query || query.length < 2) {
        container.style.display = 'none';
        return;
    }
    clearTimeout(window._modalAddrSearchTimer);
    window._modalAddrSearchTimer = setTimeout(async function() {
        var results = await searchKakaoPlaces(query);
        if (results.length === 0) {
            container.style.display = 'none';
            return;
        }
        var html = '';
        for (var i = 0; i < results.length; i++) {
            var item = results[i];
            html += '<div class="result-item" data-address="' + escapeHtml(item.address_name) + '" data-name="' + escapeHtml(item.place_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '">';
            html += '<div class="result-info"><div>' + escapeHtml(item.place_name) + ' <span class="source">카카오맵</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address_name) + '</div></div></div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        
        container.querySelectorAll('.result-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var name = this.dataset.name;
                var address = this.dataset.address;
                var lat = parseFloat(this.dataset.lat);
                var lng = parseFloat(this.dataset.lng);
                // 주소 입력창에 채우기
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
// 시스템 팝업 → 내부 모달로 변환 (confirm 대체)
// ============================================================

function showConfirmModal(title, message, onConfirm, onCancel) {
    // 기존 confirm 모달이 있으면 제거
    var existing = document.getElementById('confirmModal');
    if (existing) existing.remove();
    
    var modalHtml = `
        <div id="confirmModal" style="
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
                max-width: 360px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            ">
                <h3 style="font-size:17px; font-weight:700; color:#1a202c; margin-bottom:8px;">${escapeHtml(title)}</h3>
                <p style="font-size:14px; color:#4a5568; margin-bottom:20px; line-height:1.6;">${escapeHtml(message)}</p>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button class="btn btn-outline btn-sm" onclick="document.getElementById('confirmModal').remove(); if(typeof onCancel==='function') onCancel();" style="padding:6px 16px;">취소</button>
                    <button class="btn btn-primary btn-sm" onclick="document.getElementById('confirmModal').remove(); if(typeof onConfirm==='function') onConfirm();" style="padding:6px 16px;">확인</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ============================================================
// 기존 confirm 사용 함수들을 모달로 변경
// ============================================================

// 예: deletePlace 함수 수정
function deletePlace(id) {
    var target = places.find(function(p) { return p.id === id; });
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

// resetRoute 함수 수정
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
            clearRouteMarkers();
            clearSingleMarker();
            isShowingRouteMarkers = false;
            if (kakaoMap && currentRegion) {
                var center = getRegionCenter(currentRegion);
                kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
                kakaoMap.setLevel(5);
                kakaoMap.relayout();
            }
            showTabStatus('tab-places', '🔄 모든 경로 데이터가 초기화되었습니다.', 'ok');
        }
    );
}

// loadPreset 함수 수정
function loadPreset(index) {
    var preset = presets[index];
    if (!preset) return;
    
    showConfirmModal(
        '📂 프리셋 불러오기',
        '"' + preset.name + '" 프리셋을 불러오시겠습니까?\n현재 데이터는 초기화됩니다.',
        function() {
            var sp = preset.startPoint;
            if (sp && sp.lat && sp.lng) {
                selectStartPoint(sp.name, sp.address, sp.lat, sp.lng);
            } else {
                showTabStatus('tab-places', '⚠️ 출발지 정보가 없습니다.', 'warning');
                return;
            }
            waypoints = [];
            for (var i = 0; i < preset.waypoints.length; i++) {
                var w = preset.waypoints[i];
                waypoints.push({ name: w.name, address: w.address || '', lat: w.lat || 0, lng: w.lng || 0 });
            }
            renderWaypointList();
            routeResult = null;
            document.getElementById('placeCount').textContent = '0개소';
            document.getElementById('totalDistance').textContent = '0.00 km';
            document.getElementById('totalTime').textContent = '0 분';
            document.getElementById('optimizeMode').textContent = '-';
            document.getElementById('routeList').innerHTML = '';
            clearRouteMarkers(); clearSingleMarker(); isShowingRouteMarkers = false;
            if (kakaoMap && sp && sp.lat && sp.lng) {
                kakaoMap.setCenter(new kakao.maps.LatLng(sp.lat, sp.lng));
                kakaoMap.setLevel(5);
                kakaoMap.relayout();
            }
            showTabStatus('tab-places', '✅ 프리셋 "' + preset.name + '" 불러오기 완료!', 'ok');
        }
    );
}

// resetAll 함수 수정
function resetAll() {
    showConfirmModal(
        '⚠️ 모든 데이터 초기화',
        '모든 데이터를 초기화하시겠습니까?\n(현장리스트, 경로, 설정 모두 삭제됩니다)',
        function() {
            var keys = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && (key.startsWith(STORAGE_KEY_PREFIX) || key === SETTINGS_KEY || key === SELECTED_REGION_KEY || key === OPTIMIZE_MODE_KEY || key === PRESETS_KEY)) {
                    keys.push(key);
                }
            }
            for (var i = 0; i < keys.length; i++) localStorage.removeItem(keys[i]);
            places = []; waypoints = []; routeResult = null; startPoint = null; presets = [];
            renderPlaces(); renderWaypointList(); renderPresets();
            clearRouteMarkers(); clearSingleMarker();
            document.getElementById('placeCount').textContent = '0개소';
            document.getElementById('totalDistance').textContent = '0.00 km';
            document.getElementById('totalTime').textContent = '0 분';
            document.getElementById('optimizeMode').textContent = '-';
            document.getElementById('routeList').innerHTML = '';
            document.getElementById('startInfo').textContent = '⏳ 출발지를 검색하거나 현재 위치 버튼을 눌러 설정하세요';
            updateStorageInfo();
            showTabStatus('tab-settings', '✅ 초기화 완료', 'ok');
            loadRegionList();
        }
    );
}

function savePlace(name, address, lat, lng, remark) {
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
    document.getElementById('newPlaceName').value = '';
    document.getElementById('newPlaceAddr').value = '';
    document.getElementById('newPlaceRemark').value = '';
    document.getElementById('newPlaceName').focus();
    showTabStatus('tab-list', '✅ "' + name + '" 추가됨', 'ok');
}

function deletePlace(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    var target = places.find(function(p) { return p.id === id; });
    places = places.filter(function(p) { return p.id !== id; });
    if (target) {
        waypoints = waypoints.filter(function(w) { return w.name !== target.name; });
        renderWaypointList();
        if (singlePlaceMarker && singlePlaceMarker._placeId === id) clearSingleMarker();
    }
    savePlaces();
    showTabStatus('tab-list', '✅ 삭제 완료', 'ok');
}

function toggleFavorite(id) {
    var place = places.find(function(p) { return p.id === id; });
    if (!place) return;
    place.favorite = !place.favorite;
    savePlaces();
    renderPlaces();
    showTabStatus('tab-list', place.favorite ? '⭐ 즐겨찾기 추가됨' : '⭐ 즐겨찾기 해제됨', 'info');
}

function openEditModal(id) {
    var place = places.find(function(p) { return p.id === id; });
    if (!place) return;
    document.getElementById('modalTitle').textContent = '✏️ 현장 편집';
    document.getElementById('modalName').value = place.name;
    document.getElementById('modalAddress').value = place.address || '';
    document.getElementById('modalRemark').value = place.remark || '';
    document.getElementById('modalId').value = id;
    document.getElementById('modal').classList.add('active');
}

async function saveModal() {
    var id = document.getElementById('modalId').value;
    var name = document.getElementById('modalName').value.trim();
    var address = document.getElementById('modalAddress').value.trim();
    var remark = document.getElementById('modalRemark').value.trim();
    var place = places.find(function(p) { return p.id === id; });
    if (!place) { closeModal(); return; }
    if (!name) { showTabStatus('tab-list', '현장명을 입력하세요.', 'warning'); return; }
    var existing = places.find(function(p) { return p.id !== id && normalizeName(p.name) === normalizeName(name); });
    if (existing) { showTabStatus('tab-list', '⚠️ 이미 존재하는 현장명입니다.', 'warning'); return; }
    var lat = place.lat, lng = place.lng, fullAddress = address;
    if (address && address !== place.address) {
        var restKey = settings.kakaoRestKey;
        if (restKey) {
            var geo = await geocodeAddress(address, restKey);
            if (geo) { lat = geo.lat; lng = geo.lng; fullAddress = geo.address || address; }
        }
    }
    place.name = name;
    place.address = fullAddress;
    place.lat = lat;
    place.lng = lng;
    place.remark = remark;
    savePlaces();
    closeModal();
    showTabStatus('tab-list', '✅ "' + name + '" 수정 완료', 'ok');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

function addWaypointFromList(id) {
    var place = places.find(function(p) { return p.id === id; });
    if (!place) return;
    if (waypoints.length >= 15) { showTabStatus('tab-list', '⚠️ 최대 15개까지 가능', 'warning'); return; }
    if (waypoints.some(function(w) { return w.name === place.name; })) {
        showTabStatus('tab-list', '⚠️ "' + place.name + '"은(는) 이미 경유지에 있습니다.', 'warning');
        return;
    }
    waypoints.push({ name: place.name, lat: place.lat || 0, lng: place.lng || 0, address: place.address || '' });
    renderWaypointList();
    showTabStatus('tab-list', '✅ "' + place.name + '" 경유지 추가됨!', 'ok');
}

// ============================================================
// 8. 지오코딩
// ============================================================

async function geocodeAddress(address, restKey, retries) {
    retries = retries || 1;
    if (!address || !restKey) return null;
    for (var attempt = 0; attempt <= retries; attempt++) {
        try {
            var res = await fetch(
                'https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent(address),
                { headers: { 'Authorization': 'KakaoAK ' + restKey } }
            );
            if (!res.ok) {
                if (attempt < retries) { await new Promise(r => setTimeout(r, 500)); continue; }
                return null;
            }
            var data = await res.json();
            if (data.documents && data.documents.length > 0) {
                var doc = data.documents[0];
                var road = doc.road_address;
                if (road) return { lat: parseFloat(road.y), lng: parseFloat(road.x), address: road.address_name };
                var addr = doc.address;
                return { lat: parseFloat(addr.y), lng: parseFloat(addr.x), address: addr.address_name };
            }
            return null;
        } catch(e) {
            if (attempt < retries) { await new Promise(r => setTimeout(r, 500)); continue; }
            return null;
        }
    }
    return null;
}

async function geocodeBatch(rows, restKey, batchSize, onProgress) {
    batchSize = batchSize || 5;
    var results = [];
    for (var i = 0; i < rows.length; i += batchSize) {
        var batch = rows.slice(i, i + batchSize);
        var batchResults = await Promise.all(batch.map(function(row) {
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
// 9. 경로 최적화
// ============================================================

function setOptimizeMode(mode) {
    optimizeMode = mode;
    localStorage.setItem(OPTIMIZE_MODE_KEY, mode);
    var nearestBtn = document.getElementById('modeNearest');
    var farthestBtn = document.getElementById('modeFarthest');
    if (!nearestBtn || !farthestBtn) return;
    if (mode === 'Nearest') {
        nearestBtn.className = 'segment-btn active';
        farthestBtn.className = 'segment-btn';
    } else {
        farthestBtn.className = 'segment-btn active';
        nearestBtn.className = 'segment-btn';
    }
    document.getElementById('modeInfo').textContent = '현재: ' + (mode === 'Nearest' ? '가까운순' : '먼순');
}

function calculateAngle(startX, startY, targetX, targetY) {
    var dx = targetX - startX, dy = targetY - startY;
    if (dx === 0 && dy === 0) return 0;
    if (dx === 0) return dy > 0 ? 90 : 270;
    var angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return angle;
}

function getClusterGroup16(angle) {
    var dirs = [[78.75,101.25,1],[56.25,78.75,2],[33.75,56.25,3],[11.25,33.75,4],[348.75,11.25,5],[326.25,348.75,6],[303.75,326.25,7],[281.25,303.75,8],[258.75,281.25,9],[236.25,258.75,10],[213.75,236.25,11],[191.25,213.75,12],[168.75,191.25,13],[146.25,168.75,14],[123.75,146.25,15],[101.25,123.75,16]];
    for (var i = 0; i < dirs.length; i++) {
        var min = dirs[i][0], max = dirs[i][1], group = dirs[i][2];
        if (min <= max) { if (angle >= min && angle < max) return group; }
        else { if (angle >= min || angle < max) return group; }
    }
    return 5;
}

function optimizeRouteAlgorithm(places, startLat, startLng, mode) {
    if (!places || places.length === 0) return [];
    var count = places.length;
    var groups = places.map(function(p) {
        var angle = calculateAngle(startLng, startLat, p.lng, p.lat);
        return getClusterGroup16(angle);
    });
    var visited = new Array(count).fill(false);
    var sorted = [];
    var currX = startLng, currY = startLat;
    var firstIdx = 0;
    var compVal = mode === 'Nearest' ? Infinity : -Infinity;
    for (var i = 0; i < count; i++) {
        if (visited[i]) continue;
        var dist = Math.pow(startLng - places[i].lng, 2) + Math.pow(startLat - places[i].lat, 2);
        if (mode === 'Nearest') { if (dist < compVal) { compVal = dist; firstIdx = i; } }
        else { if (dist > compVal) { compVal = dist; firstIdx = i; } }
    }
    function visitGroup(startIdx) {
        var targetGroup = groups[startIdx];
        var groupItems = [];
        for (var i = 0; i < count; i++) {
            if (!visited[i] && groups[i] === targetGroup) groupItems.push(i);
        }
        if (groupItems.length === 0) return;
        groupItems.sort(function(a, b) {
            var da = Math.pow(currX - places[a].lng, 2) + Math.pow(currY - places[a].lat, 2);
            var db = Math.pow(currX - places[b].lng, 2) + Math.pow(currY - places[b].lat, 2);
            return da - db;
        });
        for (var i = 0; i < groupItems.length; i++) {
            var idx = groupItems[i];
            sorted.push(places[idx]);
            visited[idx] = true;
            currX = places[idx].lng;
            currY = places[idx].lat;
        }
    }
    visitGroup(firstIdx);
    while (true) {
        var nearestIdx = -1, minDist = Infinity;
        for (var i = 0; i < count; i++) {
            if (visited[i]) continue;
            var dist = Math.pow(currX - places[i].lng, 2) + Math.pow(currY - places[i].lat, 2);
            if (dist < minDist) { minDist = dist; nearestIdx = i; }
        }
        if (nearestIdx === -1) break;
        visitGroup(nearestIdx);
    }
    return sorted;
}

async function runOptimize() {
    var btn = document.querySelector('.btn-primary[onclick*="runOptimize"]');
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
        
        var restKey = settings.kakaoRestKey;
        if (!restKey) {
            showTabStatus('tab-places', '⚠️ REST API 키 필요 (설정 탭)', 'warning');
            return;
        }
        
        showTabStatus('tab-places', '📍 주소 변환 중...', 'info');
        
        var wpCoords = [];
        var hasError = false;
        
        for (var i = 0; i < waypoints.length; i++) {
            var wp = waypoints[i];
            var lat = wp.lat || 0;
            var lng = wp.lng || 0;
            var address = wp.address || '';
            
            if (!lat || !lng) {
                var found = places.find(function(p) { return p.name === wp.name; });
                if (found && found.lat && found.lng) {
                    lat = found.lat;
                    lng = found.lng;
                    address = found.address || '';
                } else {
                    var geo = await geocodeAddress(wp.name, restKey, 1);
                    if (geo) {
                        lat = geo.lat;
                        lng = geo.lng;
                        address = geo.address || wp.name;
                        var place = places.find(function(p) { return p.name === wp.name; });
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
        
        var validPlaces = wpCoords.filter(function(p) { return p.lat && p.lng; });
        if (validPlaces.length === 0) {
            showTabStatus('tab-places', '좌표가 있는 경유지가 없습니다.', 'error');
            return;
        }
        
        showTabStatus('tab-places', '⚡ 16방향 클러스터링 (' + (optimizeMode === 'Nearest' ? '가까운순' : '먼순') + ')', 'info');
        var sorted = optimizeRouteAlgorithm(validPlaces, startPoint.lat, startPoint.lng, optimizeMode);
        
        if (!sorted || sorted.length === 0) {
            showTabStatus('tab-places', '⚠️ 최적화 실패', 'error');
            return;
        }
        
        // ===== 🔥 마커 배열 초기화 =====
        routeMarkers = [];
        if (startMarker) {
            try { startMarker.setMap(null); } catch(e) {}
            startMarker = null;
        }
        if (window._sectionPolylines) {
            for (var i = 0; i < window._sectionPolylines.length; i++) {
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
        
        // ===== 🔥 마커 추가 (colorIndex 명시적 전달) =====
        console.log('📍 출발지 마커 추가:', startPoint.name);
        addRouteMarker(startPoint.lat, startPoint.lng, '🚩 ' + startPoint.name, true, -1);
        
        console.log('📍 경유지 마커 추가:', sorted.length + '개');
        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            console.log('  - ' + (i + 1) + '. ' + p.name + ' (색상 인덱스: ' + i + ')');
            addRouteMarker(p.lat, p.lng, (i + 1) + '. ' + p.name, false, i);
        }
        
        var allPoints = [{ 
            name: startPoint.name, 
            lat: startPoint.lat, 
            lng: startPoint.lng,
            address: startPoint.address || ''
        }].concat(sorted);
        
        var routeData = await callKakaoMobilityRoute(allPoints, restKey);
        
        if (routeData) {
            drawRoadRoute(routeData);
        } else {
            drawRoute(allPoints);
            showTabStatus('tab-route', '⚠️ 도로 경로를 불러올 수 없어 직선으로 표시합니다.', 'warning');
        }
        
        // ===== 거리/시간 계산 =====
        var totalKm = 0;
        var totalMin = 0;
        var sectionDistances = [];
        var sectionTimes = [];
        
        if (routeData && routeData.routes && routeData.routes[0] && routeData.routes[0].sections) {
            var route = routeData.routes[0];
            
            if (route.summary) {
                totalKm = route.summary.distance / 1000;
                totalMin = Math.round(route.summary.duration / 60);
            }
            
            for (var i = 0; i < route.sections.length; i++) {
                var section = route.sections[i];
                var distKm = section.distance / 1000;
                var timeMin = Math.round(section.duration / 60);
                sectionDistances.push(distKm);
                sectionTimes.push(timeMin);
            }
            
            while (sectionDistances.length < sorted.length) {
                var idx = sectionDistances.length;
                var prev = idx === 0 ? startPoint : sorted[idx - 1];
                var curr = sorted[idx];
                if (prev && curr) {
                    var dist = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
                    sectionDistances.push(dist);
                    sectionTimes.push(Math.round(dist / 40 * 60));
                } else {
                    sectionDistances.push(0);
                    sectionTimes.push(0);
                }
            }
            
        } else {
            for (var i = 0; i < allPoints.length - 1; i++) {
                var p1 = allPoints[i];
                var p2 = allPoints[i + 1];
                var dist = haversineKm(p1.lat, p1.lng, p2.lat, p2.lng);
                totalKm += dist;
                sectionDistances.push(dist);
                sectionTimes.push(Math.round(dist / 40 * 60));
            }
            totalMin = Math.round(totalKm / 40 * 60);
        }
        
        totalKm = parseFloat(totalKm.toFixed(2));
        totalMin = Math.round(totalMin);
        
        for (var i = 0; i < sorted.length; i++) {
            var dist = sectionDistances[i] || 0;
            var time = sectionTimes[i] || 0;
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
        
        showRouteList();
        
        // ===== 🔥 지도 중심을 출발지로 이동 (강제) =====
        if (kakaoMap && startPoint && startPoint.lat && startPoint.lng) {
            var center = new kakao.maps.LatLng(startPoint.lat, startPoint.lng);
            kakaoMap.setCenter(center);
            kakaoMap.setLevel(5);
            kakaoMap.relayout();
            console.log('🗺️ 지도 중심을 출발지로 이동:', startPoint.name);
        } else if (!kakaoMap) {
            initMap();
            setTimeout(function() {
                if (kakaoMap && startPoint && startPoint.lat && startPoint.lng) {
                    kakaoMap.setCenter(new kakao.maps.LatLng(startPoint.lat, startPoint.lng));
                    kakaoMap.setLevel(5);
                    kakaoMap.relayout();
                }
            }, 500);
        }
        
        switchTab('tab-route');
        showTabStatus('tab-route', '✅ 최적화 완료! ' + validPlaces.length + '개소', 'ok');
        
    } catch(e) {
        console.error('최적화 오류:', e);
        showTabStatus('tab-places', '❌ 오류 발생: ' + e.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}
// ============================================================
// 10. 경로 표시
// ============================================================

function showRouteList() {
    if (!routeResult) return;
    var container = document.getElementById('routeList');
    var { places: sorted, startPoint, totalKm, totalMin } = routeResult;
    if (!sorted || sorted.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#a0aec0;">최적화된 경로가 없습니다.</div>';
        return;
    }
    
    var html = '<div style="font-weight:600;font-size:14px;margin-bottom:8px;">📋 최적 경로 (드래그로 순서 변경 가능)</div>';
    html += '<div id="routeSortable">';
    
    // 출발지 (드래그 불가)
    html += '<div class="route-item route-start" data-no-drag="true" data-lat="' + startPoint.lat + '" data-lng="' + startPoint.lng + '" data-name="' + escapeHtml(startPoint.name) + '" onclick="moveToRoutePoint(this)" style="cursor:pointer;">';
    html += '<div class="idx" style="background:#4a5568;color:white;">🚩</div>';
    html += '<div class="info"><div class="name">' + escapeHtml(startPoint.name) + '</div><div class="addr">' + escapeHtml(startPoint.address || '') + '</div></div>';
    html += '</div>';
    
    // 경유지들
    for (var i = 0; i < sorted.length; i++) {
        var p = sorted[i];
        var prev = i === 0 ? startPoint : sorted[i - 1];
        var segDist = p._segDist || haversineKm(prev.lat, prev.lng, p.lat, p.lng);
        var segTime = p._segTime || Math.round(segDist / 40 * 60);
        var color = COLORS[i % COLORS.length];
        var addrDisplay = p.address ? '<div class="addr">' + escapeHtml(shortenAddress(p.address)) + '</div>' : '';
        var remarkDisplay = p.remark ? '<span class="remark">' + escapeHtml(p.remark) + '</span>' : '';
        
        html += '<div class="route-item sortable-item" data-index="' + i + '" data-lat="' + p.lat + '" data-lng="' + p.lng + '" data-name="' + escapeHtml(p.name) + '" onclick="moveToRoutePoint(this)" style="cursor:grab;border-left-color:' + color + ';">';
        html += '<div class="idx" style="background:' + color + ';color:white;">' + (i + 1) + '</div>';
        html += '<div class="info"><div class="name">' + escapeHtml(p.name) + ' ' + remarkDisplay + '</div>' + addrDisplay + '</div>';
        html += '<div class="dist" style="text-align:right;font-size:12px;font-weight:600;flex-shrink:0;min-width:80px;color:' + color + ';">';
        html += segDist.toFixed(1) + 'km<br><span style="font-size:10px;color:#718096;">' + segTime + '분</span></div>';
        html += '<button class="btn btn-outline" style="margin-left:4px;padding:2px 6px;font-size:10px;flex-shrink:0;min-height:28px;border-radius:4px;" onclick="event.stopPropagation(); openKakaoMap(\'' + escapeHtml(prev.name) + '\', ' + prev.lat + ', ' + prev.lng + ', \'' + escapeHtml(p.name) + '\', ' + p.lat + ', ' + p.lng + ')" title="카카오맵에서 구간 길찾기">🗺️</button>';
        html += '</div>';
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    // SortableJS
    var sortableEl = document.getElementById('routeSortable');
    if (sortableEl && window.Sortable) {
        if (window._routeSortable) window._routeSortable.destroy();
        window._routeSortable = new Sortable(sortableEl, {
    handle: '.sortable-item',
    animation: 150,
    onMove: function(evt) {
        if (evt.toIndex === 0) {
            showTabStatus('tab-route', '⚠️ 출발지 위치로는 이동할 수 없습니다.', 'warning');
            return false;
        }
        return true;
    },
    onEnd: function(evt) {
        var oldIndex = evt.oldIndex - 1;
        var newIndex = evt.newIndex - 1;
        if (oldIndex === newIndex || oldIndex < 0 || newIndex < 0) return;
        
        var moved = routeResult.places.splice(oldIndex, 1)[0];
        routeResult.places.splice(newIndex, 0, moved);
        showRouteList();
        
        var allPoints = [{ name: startPoint.name, lat: startPoint.lat, lng: startPoint.lng }].concat(routeResult.places);
        clearRouteMarkers();
        // 🔥 마커 재생성 시 인덱스 전달
        addRouteMarker(startPoint.lat, startPoint.lng, '🚩 ' + startPoint.name, true, -1);
        for (var i = 0; i < routeResult.places.length; i++) {
            var p = routeResult.places[i];
            addRouteMarker(p.lat, p.lng, (i + 1) + '. ' + p.name, false, i);
        }
        var restKey = settings.kakaoRestKey;
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

function moveToRoutePoint(el) {
    var lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng), name = el.dataset.name || '장소';
    if (!lat || !lng || !kakaoMap) {
        showTabStatus('tab-route', '⚠️ 위치 정보가 없거나 지도가 준비되지 않았습니다.', 'warning');
        return;
    }
    kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
    kakaoMap.setLevel(4);
    document.querySelectorAll('.route-item').forEach(function(item) {
        item.style.background = ''; item.style.borderLeftColor = '';
    });
    el.style.background = '#ebf8ff';
    el.style.borderLeftColor = '#2b6cb0';
    showTabStatus('tab-route', '📍 "' + name + '" 위치로 이동했습니다.', 'info');
}

function openKakaoMap(fromName, fromLat, fromLng, toName, toLat, toLng) {
    if (!toName || !toLat || !toLng) { 
        showTabStatus('tab-route', '⚠️ 목적지 정보가 없습니다.', 'warning'); 
        return; 
    }
    if (!fromName || !fromLat || !fromLng) { 
        showTabStatus('tab-route', '⚠️ 출발지 정보가 없습니다.', 'warning'); 
        return; 
    }
    
    var url = 'https://map.kakao.com/link/from/' 
        + encodeURIComponent(fromName) + ',' + fromLat + ',' + fromLng 
        + '/to/' 
        + encodeURIComponent(toName) + ',' + toLat + ',' + toLng;
    
    // 🔥 모바일에서는 카카오맵 앱 스킴 사용
    var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
        var appUrl = url.replace('https://map.kakao.com/link/', 'kakaomap://');
        window.location.href = appUrl;
        // 앱이 없으면 웹으로 fallback
        setTimeout(function() {
            window.open(url, '_blank');
        }, 500);
    } else {
        window.open(url, '_blank');
    }
    
    showTabStatus('tab-route', '🗺️ 카카오맵 길찾기: ' + fromName + ' → ' + toName, 'info');
}

// ============================================================
// 11. 지도 표시
// ============================================================

function showPlaceOnMap(id) {
    var place = places.find(function(p) { return p.id === id; });
    if (!place) { showTabStatus('tab-list', '❌ 현장을 찾을 수 없습니다.', 'error'); return; }
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
    if (!kakaoMap) { initMap(); setTimeout(function() { showPlaceOnMap(id); }, 500); return; }
    var pos = new kakao.maps.LatLng(place.lat, place.lng);
    var content = '<div style="background:rgba(255,255,255,0.95);padding:8px 18px;border-radius:24px;border:2.5px solid rgba(37,99,235,0.5);box-shadow:0 8px 32px rgba(37,99,235,0.2);font-size:14px;font-weight:700;color:#1a202c;white-space:nowrap;backdrop-filter:blur(12px);">📍 ' + escapeHtml(place.name) + '</div>';
    var customOverlay = new kakao.maps.CustomOverlay({ map: kakaoMap, position: pos, content: content, yAnchor: 1.4, xAnchor: 0.5 });
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
// 12. 카카오모빌리티 API
// ============================================================

async function callKakaoMobilityRoute(points, restKey) {
    if (!restKey || points.length < 2) return null;
    try {
        var origin = points[0], destination = points[points.length - 1], waypoints = points.slice(1, -1);
        var url = 'https://apis-navi.kakaomobility.com/v1/waypoints/directions';
        var payload = {
            origin: { name: origin.name || '출발지', x: origin.lng, y: origin.lat },
            destination: { name: destination.name || '도착지', x: destination.lng, y: destination.lat },
            priority: 'RECOMMEND'
        };
        if (waypoints.length > 0) {
            payload.waypoints = waypoints.map(function(w) { return { name: w.name || '경유지', x: w.lng, y: w.lat }; });
        }
        var response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': 'KakaoAK ' + restKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) return null;
        return await response.json();
    } catch(e) { console.warn('도로 경로 API 호출 실패:', e); return null; }
}

function drawRoadRoute(routeData) {
    if (!kakaoMap || !routeData) return;
    try {
        var route = routeData.routes[0];
        if (!route || !route.sections) return;
        
        if (kakaoPolyline) { kakaoPolyline.setMap(null); kakaoPolyline = null; }
        if (window._sectionPolylines) {
            for (var i = 0; i < window._sectionPolylines.length; i++) {
                try { window._sectionPolylines[i].setMap(null); } catch(e) {}
            }
            window._sectionPolylines = [];
        }
        
        var totalBounds = new kakao.maps.LatLngBounds();
        var sectionIndex = 0;
        
        for (var s = 0; s < route.sections.length; s++) {
            var section = route.sections[s];
            if (!section.roads) continue;
            var sectionPath = [];
            for (var r = 0; r < section.roads.length; r++) {
                var road = section.roads[r];
                if (road.vertexes) {
                    for (var v = 0; v < road.vertexes.length; v += 2) {
                        var lng = road.vertexes[v];
                        var lat = road.vertexes[v + 1];
                        if (lat && lng) {
                            var point = new kakao.maps.LatLng(lat, lng);
                            sectionPath.push(point);
                            totalBounds.extend(point);
                        }
                    }
                }
            }
            if (sectionPath.length > 1) {
                var color = COLORS[sectionIndex % COLORS.length];
                
                var polyline = new kakao.maps.Polyline({
                    map: kakaoMap,
                    path: sectionPath,
                    strokeWeight: 6,
                    strokeColor: color,
                    strokeOpacity: 0.85,
                    strokeStyle: 'solid',
                    zIndex: 1
                });
                
                var glowPolyline = new kakao.maps.Polyline({
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
            var sw = totalBounds.getSouthWest();
            var ne = totalBounds.getNorthEast();
            var latMargin = (ne.getLat() - sw.getLat()) * 0.2;
            var lngMargin = (ne.getLng() - sw.getLng()) * 0.2;
            var newSw = new kakao.maps.LatLng(sw.getLat() - latMargin, sw.getLng() - lngMargin);
            var newNe = new kakao.maps.LatLng(ne.getLat() + latMargin, ne.getLng() + lngMargin);
            var newBounds = new kakao.maps.LatLngBounds(newSw, newNe);
            kakaoMap.setBounds(newBounds);
        }
        
        setTimeout(function() {
            kakaoMap.relayout();
        }, 100);
        
        console.log('✅ 컬러 경로 표시 완료');
    } catch(e) {
        console.error('도로 경로 그리기 실패:', e);
    }
}
function drawRoute(path) {
    if (!kakaoMap || !path || path.length < 2) return;
    try {
        if (kakaoPolyline) { kakaoPolyline.setMap(null); kakaoPolyline = null; }
        if (window._sectionPolylines) {
            for (var i = 0; i < window._sectionPolylines.length; i++) {
                try { window._sectionPolylines[i].setMap(null); } catch(e) {}
            }
            window._sectionPolylines = [];
        }
        
        var bounds = new kakao.maps.LatLngBounds();
        var allPoints = [];
        for (var i = 0; i < path.length; i++) {
            var p = path[i];
            var latlng = new kakao.maps.LatLng(p.lat, p.lng);
            allPoints.push(latlng);
            bounds.extend(latlng);
        }
        
        for (var i = 0; i < allPoints.length - 1; i++) {
            var color = COLORS[i % COLORS.length];
            var polyline = new kakao.maps.Polyline({
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
            var sw = bounds.getSouthWest();
            var ne = bounds.getNorthEast();
            var latMargin = (ne.getLat() - sw.getLat()) * 0.2;
            var lngMargin = (ne.getLng() - sw.getLng()) * 0.2;
            var newSw = new kakao.maps.LatLng(sw.getLat() - latMargin, sw.getLng() - lngMargin);
            var newNe = new kakao.maps.LatLng(ne.getLat() + latMargin, ne.getLng() + lngMargin);
            var newBounds = new kakao.maps.LatLngBounds(newSw, newNe);
            kakaoMap.setBounds(newBounds);
        }
        
        setTimeout(function() {
            kakaoMap.relayout();
        }, 100);
        
        console.log('✅ 컬러 직선 경로 표시 완료');
    } catch(e) {
        console.error('경로 그리기 실패:', e);
    }
}

// ============================================================
// 13. 지도 초기화
// ============================================================

function initMap() {
    var container = document.getElementById('map');
    if (!container) return;
    var jsKey = settings.kakaoJsKey;
    if (!jsKey) {
        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;border-radius:12px;padding:20px;text-align:center;">⚠️ 설정 탭에서<br>카카오 JavaScript 키를 입력하세요</div>';
        showTabStatus('tab-settings', '⚠️ 카카오 JavaScript 키가 필요합니다.', 'warning');
        return;
    }
    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#d69e2e;font-size:14px;background:#fffff0;border-radius:12px;">⏳ 카카오 지도 로딩 중...</div>';
    if (typeof kakao === 'undefined' || !kakao.maps) {
        if (sdkLoading) return;
        sdkLoading = true;
        var script = document.createElement('script');
        script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + jsKey + '&autoload=false&libraries=services';
        script.async = true;
        script.defer = true;
        script.onload = function() { sdkLoading = false; kakao.maps.load(function() { createMap(container); }); };
        script.onerror = function() { sdkLoading = false; container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;border-radius:12px;padding:20px;text-align:center;">❌ SDK 로드 실패</div>'; };
        document.head.appendChild(script);
        return;
    }
    kakao.maps.load(function() { createMap(container); });
}

function createMap(container) {
    try {
        var region = currentRegion || '서울';
        var centerInfo = getRegionCenter(region);
        var centerLat = centerInfo.lat, centerLng = centerInfo.lng;
        var zoomLevel = 5;
        var isStartValid = startPoint && typeof startPoint.lat === 'number' && typeof startPoint.lng === 'number' &&
                           startPoint.lat > 33 && startPoint.lat < 39 && startPoint.lng > 124 && startPoint.lng < 132 &&
                           !(startPoint.lat === 0 && startPoint.lng === 0);
        if (isStartValid && !singlePlaceMarker && !isShowingRouteMarkers) { centerLat = startPoint.lat; centerLng = startPoint.lng; }
        
        var options = {
            center: new kakao.maps.LatLng(centerLat, centerLng),
            level: zoomLevel,
            draggable: true,
            zoomable: true,
            zoomControl: true,
            scrollwheel: true,
            disableKineticPan: false
        };
        kakaoMap = new kakao.maps.Map(container, options);
        
        // ===== 🔥 PC 드래그 강제 활성화 =====
        kakaoMap.setDraggable(true);
        kakaoMap.setZoomable(true);
        
        // ===== 🔥 드래그 이벤트 강제 실행 =====
        kakaoMap.setCenter(new kakao.maps.LatLng(centerLat, centerLng));
        kakaoMap.relayout();
        
        var zoomControl = new kakao.maps.ZoomControl();
        kakaoMap.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);
        
        // ===== 🔥 추가: mousewheel 이벤트 활성화 =====
        kakaoMap.setZoomable(true);
        
        showTabStatus('tab-route', '🗺️ 지도 로드 완료', 'ok');
        console.log('🗺️ 지도 생성 완료:', centerLat, centerLng);
    } catch(e) {
        console.error('지도 생성 실패:', e);
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
            for (var i = routeMarkers.length - 1; i >= 0; i--) {
                if (routeMarkers[i] === startMarker) routeMarkers.splice(i, 1);
            }
        }
        var pos = new kakao.maps.LatLng(lat, lng);
        var content;
        
        if (isStart) {
            // ===== 출발지: 흰색 배경 + 검정 글자 (고정) =====
            content = '<div style="background:white;padding:6px 14px;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.15);font-size:13px;font-weight:700;color:#1a202c;white-space:nowrap;border:2px solid #2d3748;z-index:10;">🚩 ' + escapeHtml(title) + '</div>';
        } else {
            // ===== 🔥 경유지: colorIndex 사용 (없으면 0) =====
            var idx = (colorIndex !== undefined && colorIndex !== null) ? colorIndex : 0;
            var color = COLORS[idx % COLORS.length];
            console.log('🎨 마커 색상:', title, '인덱스:', idx, '색상:', color);
            content = '<div style="background:' + color + ';padding:6px 14px;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.15);font-size:13px;font-weight:700;color:white;white-space:nowrap;border:1px solid rgba(255,255,255,0.3);z-index:5;">📍 ' + escapeHtml(title) + '</div>';
        }
        
        var customOverlay = new kakao.maps.CustomOverlay({
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
        console.error('마커 추가 실패:', e);
    }
}
function clearRouteMarkers() {
    for (var i = 0; i < routeMarkers.length; i++) { try { routeMarkers[i].setMap(null); } catch(e) {} }
    routeMarkers = [];
    if (startMarker) { try { startMarker.setMap(null); } catch(e) {} startMarker = null; }
    if (window._sectionPolylines) {
        for (var i = 0; i < window._sectionPolylines.length; i++) { try { window._sectionPolylines[i].setMap(null); } catch(e) {} }
        window._sectionPolylines = [];
    }
    if (kakaoPolyline) { try { kakaoPolyline.setMap(null); } catch(e) {} kakaoPolyline = null; }
    isShowingRouteMarkers = false;
}

// ============================================================
// 14. 공유 및 초기화
// ============================================================

function shareRoute() {
    if (!routeResult) { showTabStatus('tab-places', '먼저 경로 최적화를 실행하세요.', 'warning'); return; }
    var text = '🚗 최적 경로\n\n📊 ' + routeResult.places.length + '개소\n📏 ' + routeResult.totalKm + ' km\n⏱️ ' + routeResult.totalMin + '분\n📐 ' + (routeResult.mode === 'Nearest' ? '가까운순' : '먼순') + '\n\n🚩 ' + routeResult.startPoint.name + '\n';
    for (var i = 0; i < routeResult.places.length; i++) { text += '  ' + (i + 1) + '. ' + routeResult.places[i].name + '\n'; }
    if (navigator.share) { navigator.share({ title: '경로 최적화', text: text }).catch(function() {}); }
    else { navigator.clipboard.writeText(text).then(function() { showTabStatus('tab-places', '✅ 클립보드 복사 완료', 'ok'); }); }
}

function resetRoute() {
    if (!confirm('출발지, 경유지, 최적화 결과를 모두 초기화하시겠습니까?')) return;
    startPoint = null;
    document.getElementById('startPoint').value = '';
    document.getElementById('startInfo').textContent = '⏳ 출발지를 검색하거나 현재 위치로 설정하세요';
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
    clearRouteMarkers();
    clearSingleMarker();
    isShowingRouteMarkers = false;
    if (kakaoMap && currentRegion) {
        var center = getRegionCenter(currentRegion);
        kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
        kakaoMap.setLevel(5);
    }
    showTabStatus('tab-places', '🔄 모든 경로 데이터가 초기화되었습니다.', 'ok');
}

function resetAll() {
    if (!confirm('⚠️ 모든 데이터를 초기화하시겠습니까?')) return;
    if (!confirm('정말로 삭제하시겠습니까?')) return;
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && (key.startsWith(STORAGE_KEY_PREFIX) || key === SETTINGS_KEY || key === SELECTED_REGION_KEY || key === OPTIMIZE_MODE_KEY || key === PRESETS_KEY)) {
            keys.push(key);
        }
    }
    for (var i = 0; i < keys.length; i++) localStorage.removeItem(keys[i]);
    places = []; waypoints = []; routeResult = null; startPoint = null; presets = [];
    renderPlaces(); renderWaypointList(); renderPresets();
    clearRouteMarkers(); clearSingleMarker();
    document.getElementById('placeCount').textContent = '0개소';
    document.getElementById('totalDistance').textContent = '0.00 km';
    document.getElementById('totalTime').textContent = '0 분';
    document.getElementById('optimizeMode').textContent = '-';
    document.getElementById('routeList').innerHTML = '';
    document.getElementById('startInfo').textContent = '⏳ 출발지를 검색하고 설정하세요';
    updateStorageInfo();
    showTabStatus('tab-settings', '✅ 초기화 완료', 'ok');
    loadRegionList();
}

// ============================================================
// 15. 프리셋 관리
// ============================================================

function loadPresets() {
    var saved = localStorage.getItem(PRESETS_KEY);
    presets = saved ? JSON.parse(saved) : [];
    renderPresets();
}

function savePresets() {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    renderPresets();
}

function renderPresets() {
    var container = document.getElementById('presetList');
    if (!container) return;
    if (presets.length === 0) {
        container.innerHTML = '<div class="empty-msg" style="padding:8px;font-size:12px;">저장된 프리셋이 없습니다</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < presets.length; i++) {
        var p = presets[i];
        html += '<div class="preset-item" onclick="loadPreset(' + i + ')">';
        html += '<div class="preset-info"><div class="preset-name">' + escapeHtml(p.name) + '</div>';
        html += '<div class="preset-detail">🚩 ' + escapeHtml(p.startPoint ? p.startPoint.name : '없음') + ' → ' + (p.waypoints ? p.waypoints.length : 0) + '개 경유지</div></div>';
        html += '<button class="preset-delete" onclick="event.stopPropagation(); deletePreset(' + i + ')">✕</button></div>';
    }
    container.innerHTML = html;
}

function addPreset() {
    if (!startPoint || !startPoint.name) { showTabStatus('tab-places', '⚠️ 출발지를 먼저 설정하세요.', 'warning'); return; }
    if (waypoints.length === 0) { showTabStatus('tab-places', '⚠️ 경유지를 최소 1개 이상 추가하세요.', 'warning'); return; }
    var name = prompt('프리셋 이름을 입력하세요:', '프리셋 ' + (presets.length + 1));
    if (!name || name.trim() === '') return;
    var preset = {
        id: Date.now(),
        name: name.trim(),
        startPoint: { name: startPoint.name, address: startPoint.address || '', lat: startPoint.lat, lng: startPoint.lng },
        waypoints: waypoints.map(function(w) { return { name: w.name, address: w.address || '', lat: w.lat || 0, lng: w.lng || 0 }; })
    };
    presets.push(preset);
    savePresets();
    showTabStatus('tab-places', '✅ 프리셋 "' + preset.name + '" 저장됨!', 'ok');
}

function loadPreset(index) {
    var preset = presets[index];
    if (!preset) return;
    if (!confirm('"' + preset.name + '" 프리셋을 불러오시겠습니까?\n현재 데이터는 초기화됩니다.')) return;
    var sp = preset.startPoint;
    if (sp && sp.lat && sp.lng) selectStartPoint(sp.name, sp.address, sp.lat, sp.lng);
    else { showTabStatus('tab-places', '⚠️ 출발지 정보가 없습니다.', 'warning'); return; }
    waypoints = [];
    for (var i = 0; i < preset.waypoints.length; i++) {
        var w = preset.waypoints[i];
        waypoints.push({ name: w.name, address: w.address || '', lat: w.lat || 0, lng: w.lng || 0 });
    }
    renderWaypointList();
    routeResult = null;
    document.getElementById('placeCount').textContent = '0개소';
    document.getElementById('totalDistance').textContent = '0.00 km';
    document.getElementById('totalTime').textContent = '0 분';
    document.getElementById('optimizeMode').textContent = '-';
    document.getElementById('routeList').innerHTML = '';
    clearRouteMarkers(); clearSingleMarker(); isShowingRouteMarkers = false;
    if (kakaoMap && sp && sp.lat && sp.lng) {
        kakaoMap.setCenter(new kakao.maps.LatLng(sp.lat, sp.lng));
        kakaoMap.setLevel(5);
    }
    showTabStatus('tab-places', '✅ 프리셋 "' + preset.name + '" 불러오기 완료!', 'ok');
}

function deletePreset(index) {
    if (!confirm('프리셋을 삭제하시겠습니까?')) return;
    presets.splice(index, 1);
    savePresets();
    showTabStatus('tab-places', '🗑️ 프리셋 삭제됨', 'ok');
}

// ============================================================
// 16. GitHub 연동
// ============================================================

function utf8ToBase64(str) {
    try {
        var bytes = new TextEncoder().encode(str);
        var binString = String.fromCodePoint.apply(null, bytes);
        return btoa(binString);
    } catch(e) { return btoa(unescape(encodeURIComponent(str))); }
}

async function uploadToGitHub(silent) {
    silent = silent || false;
    var token = settings.githubToken;
    if (!token) {
        if (!silent) showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    
    if (!currentRegion || currentRegion.trim() === '') {
        if (!silent) showTabStatus('tab-settings', '⚠️ 현재 선택된 지역이 없습니다.', 'warning');
        return;
    }
    
    try {
        if (!silent) showTabStatus('tab-settings', '☁️ GitHub 업로드 중...', 'info');
        
        // 1. 토큰 인증
        var userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) {
            throw new Error('토큰 인증 실패: ' + userRes.status);
        }
        var user = await userRes.json();
        var username = user.login;
        
        var repoName = 'route-data';
        var fileName = currentRegion + '.json';
        var content = JSON.stringify(places, null, 2);
        var b64Content = utf8ToBase64(content);
        
        // 2. 저장소 확인 (없으면 생성)
        var repoUrl = 'https://api.github.com/repos/' + username + '/' + repoName;
        var repoRes = await fetch(repoUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        if (repoRes.status === 404) {
            var isPrivate = confirm('📢 GitHub 저장소를 비공개로 생성하시겠습니까?\n(취소 시 공개 저장소로 생성됩니다)');
            var createRes = await fetch('https://api.github.com/user/repos', {
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
        
        // 3. 파일 업로드 (SHA 가져오기)
        var fileUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + encodeURIComponent(fileName);
        var fileRes = await fetch(fileUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        var sha = null;
        if (fileRes.ok) {
            var fileData = await fileRes.json();
            sha = fileData.sha;
        }
        
        // 4. PUT 요청 준비
        var putData = {
            message: 'Auto sync: ' + currentRegion + ' (' + new Date().toLocaleString() + ')',
            content: b64Content
        };
        if (sha) putData.sha = sha;
        
        var putRes = await fetch(fileUrl, {
            method: 'PUT',
            headers: {
                'Authorization': 'token ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(putData)
        });
        
        // ===== 🔥 409 Conflict 처리 =====
        if (putRes.status === 409) {
            console.warn('⚠️ 409 Conflict 발생, 최신 SHA 재조회 후 재시도...');
            
            // 최신 SHA 다시 가져오기
            var retryFileRes = await fetch(fileUrl, {
                headers: { 'Authorization': 'token ' + token }
            });
            if (retryFileRes.ok) {
                var retryData = await retryFileRes.json();
                putData.sha = retryData.sha;
                
                // 재시도
                putRes = await fetch(fileUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': 'token ' + token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(putData)
                });
                
                if (!putRes.ok) {
                    var errorText = await putRes.text();
                    throw new Error('재시도 실패: ' + putRes.status + ' - ' + errorText);
                }
            } else {
                throw new Error('SHA 재조회 실패: ' + retryFileRes.status);
            }
        }
        
        // ===== 기타 오류 처리 =====
        if (!putRes.ok) {
            var errorText = await putRes.text();
            throw new Error('업로드 실패: ' + putRes.status + ' - ' + errorText);
        }
        
        // ===== 성공 =====
        if (!silent) {
            showTabStatus('tab-settings', '✅ GitHub 업로드 완료! (' + places.length + '개)', 'ok');
        }
        console.log('✅ GitHub 업로드 성공:', currentRegion);
        
    } catch(error) {
        console.error('❌ GitHub 업로드 오류:', error);
        if (!silent) {
            showTabStatus('tab-settings', '❌ 업로드 실패: ' + error.message, 'error');
        }
    }
}

// ============================================================
// GitHub 다운로드 (지역 선택 드롭다운)
// ============================================================

async function downloadFromGitHub() {
    var token = settings.githubToken;
    if (!token) {
        showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    
    try {
        showTabStatus('tab-settings', '☁️ GitHub 저장소 목록 불러오는 중...', 'info');
        
        var userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        var user = await userRes.json();
        var username = user.login;
        
        var repoName = 'route-data';
        var repoUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents';
        var repoRes = await fetch(repoUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        if (repoRes.status === 404) {
            showTabStatus('tab-settings', '📭 GitHub에 저장된 데이터가 없습니다.\n먼저 "업로드"를 실행하세요.', 'warning');
            return;
        }
        
        if (!repoRes.ok) {
            throw new Error('저장소 조회 실패: ' + repoRes.status);
        }
        
        var files = await repoRes.json();
        var regions = [];
        files.forEach(function(file) {
            if (file.name.endsWith('.json') && file.name !== '.json') {
                var region = file.name.replace('.json', '');
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
        console.error('❌ GitHub 목록 조회 오류:', error);
        showTabStatus('tab-settings', '❌ 목록 조회 실패: ' + error.message, 'error');
    }
}

// ============================================================
// 지역 선택 드롭다운 모달
// ============================================================

function showRegionSelectModal(regions, onSelect) {
    var existing = document.getElementById('regionSelectModal');
    if (existing) existing.remove();
    
    var optionsHtml = '';
    regions.forEach(function(region) {
        optionsHtml += '<option value="' + escapeHtml(region) + '">' + escapeHtml(region) + '</option>';
    });
    
    var modalHtml = `
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
        var select = document.getElementById('regionSelectDropdown');
        var selected = select.value;
        document.getElementById('regionSelectModal').remove();
        if (selected && typeof onSelect === 'function') {
            onSelect(selected);
        } else if (!selected) {
            showTabStatus('tab-settings', '⚠️ 다운로드할 지역을 선택해주세요.', 'warning');
        }
    });
}
async function showGitHubHistory() {
    var token = settings.githubToken;
    if (!token) { showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning'); return; }
    var historyDiv = document.getElementById('githubHistory');
    if (!historyDiv) return;
    try {
        showTabStatus('tab-settings', '📋 히스토리 불러오는 중...', 'info');
        var userRes = await fetch('https://api.github.com/user', { headers: { 'Authorization': 'token ' + token } });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        var user = await userRes.json();
        var username = user.login;
        var repoName = 'route-data';
        var fileName = currentRegion + '.json';
        var url = 'https://api.github.com/repos/' + username + '/' + repoName + '/commits?path=' + encodeURIComponent(fileName) + '&per_page=10';
        var commitRes = await fetch(url, { headers: { 'Authorization': 'token ' + token } });
        if (!commitRes.ok) {
            if (commitRes.status === 404) {
                historyDiv.innerHTML = '<div style="color:#a0aec0;text-align:center;padding:8px;">📭 아직 커밋 기록이 없습니다</div>';
                showTabStatus('tab-settings', '📭 히스토리가 없습니다.', 'warning');
                return;
            }
            throw new Error('히스토리 조회 실패');
        }
        var commits = await commitRes.json();
        if (commits.length === 0) {
            historyDiv.innerHTML = '<div style="color:#a0aec0;text-align:center;padding:8px;">📭 아직 커밋 기록이 없습니다</div>';
        } else {
            var html = '<div style="font-weight:600;font-size:12px;margin-bottom:4px;">📋 최근 10개 커밋</div>';
            for (var i = 0; i < commits.length; i++) {
                var c = commits[i];
                var date = new Date(c.commit.author.date).toLocaleString();
                var msg = c.commit.message || 'No message';
                html += '<div style="padding:3px 6px;border-bottom:1px solid #e2e8f0;font-size:11px;display:flex;justify-content:space-between;">';
                html += '<span>' + escapeHtml(msg) + '</span><span style="color:#a0aec0;">' + date + '</span></div>';
            }
            historyDiv.innerHTML = html;
        }
        historyDiv.style.display = 'block';
        showTabStatus('tab-settings', '✅ 히스토리 로드 완료', 'ok');
    } catch(error) {
        console.error('히스토리 오류:', error);
        historyDiv.innerHTML = '<div style="color:#e53e3e;text-align:center;padding:8px;">❌ 히스토리 로드 실패</div>';
        historyDiv.style.display = 'block';
        showTabStatus('tab-settings', '❌ 히스토리 로드 실패', 'error');
    }
}

// ============================================================
// 17. 엑셀 처리
// ============================================================

function parseCSVLine(line) {
    var result = [], current = '', inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (inQuotes) {
            if (ch === '"' && (i + 1 < line.length && line[i + 1] === '"')) { current += '"'; i++; }
            else if (ch === '"') inQuotes = false;
            else current += ch;
        } else {
            if (ch === '"') inQuotes = true;
            else if (ch === ',') { result.push(current.trim()); current = ''; }
            else current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

function handleFile(event) {
    var file = event.target.files[0];
    if (!file) return;
    processExcelFile(file);
    event.target.value = '';
}

async function processExcelFile(file) {
    var btn = document.querySelector('.btn-outline[onclick*="document.getElementById(\'fileInput\').click()"]');
    if (btn) btn.disabled = true;
    try {
        var resultDiv = document.getElementById('uploadResult');
        resultDiv.style.display = 'block';
        var ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
            var reader = new FileReader();
            reader.onload = function(e) {
                var text = e.target.result;
                var lines = text.split('\n').filter(function(l) { return l.trim(); });
                if (lines.length === 0) { showUploadResult('❌ 데이터 없음', 'error'); return; }
                var header = parseCSVLine(lines[0]);
                var rows = [];
                for (var i = 1; i < lines.length; i++) {
                    var vals = parseCSVLine(lines[i]);
                    if (vals.length < 2) continue;
                    var row = {};
                    for (var j = 0; j < header.length; j++) row[header[j]] = vals[j] || '';
                    rows.push(row);
                }
                importPlaces(rows);
            };
            reader.readAsText(file, 'UTF-8');
            return;
        }
        if (ext === 'xlsx' || ext === 'xls') {
            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    var data = new Uint8Array(e.target.result);
                    var wb = XLSX.read(data, { type: 'array' });
                    var sheet = wb.Sheets[wb.SheetNames[0]];
                    var json = XLSX.utils.sheet_to_json(sheet);
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
    if (!data || data.length === 0) { showUploadResult('❌ 데이터 없음', 'error'); return; }
    var added = 0, updated = 0, skipped = 0;
    var restKey = settings.kakaoRestKey;
    var rowsToGeocode = [];
    for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var name = String(row['현장명'] || row['개소명'] || row['name'] || row['Name'] || '').trim();
        var address = String(row['도로명주소'] || row['address'] || row['Address'] || '').trim();
        var remark = String(row['비고'] || row['remark'] || row['Remark'] || '').trim();
        if (!name) continue;
        var normalized = normalizeName(name);
        var existing = places.find(function(p) { return normalizeName(p.name) === normalized; });
        if (existing) {
            if (existing.address !== address || existing.remark !== remark) {
                existing.address = address;
                existing.remark = remark;
                if (address && restKey) rowsToGeocode.push({ name: name, address: address, existing: existing });
                updated++;
            } else skipped++;
        } else {
            var newPlace = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                name: name,
                address: address,
                lat: 0, lng: 0,
                remark: remark,
                favorite: false
            };
            places.push(newPlace);
            if (address && restKey) rowsToGeocode.push({ name: name, address: address, existing: newPlace });
            added++;
        }
    }
    if (rowsToGeocode.length > 0 && restKey) {
        showUploadResult('📍 ' + rowsToGeocode.length + '개 주소 변환 중...', 'info');
        await geocodeBatch(rowsToGeocode, restKey, 5, function(done, total) {
            showUploadResult('📍 주소 변환 중... ' + done + '/' + total, 'info');
        });
        for (var i = 0; i < rowsToGeocode.length; i++) {
            var item = rowsToGeocode[i];
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
    var el = document.getElementById('uploadResult');
    el.textContent = msg;
    el.style.display = 'block';
    var colors = { success: '#c6f6d5', error: '#fed7d7', warning: '#fefcbf', info: '#bee3f8' };
    el.style.background = colors[type] || colors.info;
}

function exportData() {
    var data = [];
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
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, '현장리스트');
    var now = new Date();
    var timestamp = now.toISOString().slice(0,10) + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(now.getSeconds()).padStart(2,'0');
    XLSX.writeFile(wb, '현장리스트_' + currentRegion + '_' + timestamp + '.xlsx');
}

// ============================================================
// 18. 날씨
// ============================================================

async function fetchWeather() {
    var weatherEl = document.getElementById('weatherDisplay');
    if (!weatherEl) return false;
    try {
        var apiKey = 'b84c1b9a09d8316b679320cceb3a1097';
        var center = getRegionCenter(currentRegion);
        var url = 'https://api.openweathermap.org/data/2.5/weather?lat=' + center.lat + '&lon=' + center.lng + '&appid=' + apiKey + '&units=metric&lang=kr';
        var response = await fetch(url);
        if (!response.ok) throw new Error('날씨 API 호출 실패');
        var data = await response.json();
        var temp = Math.round(data.main.temp);
        var desc = data.weather[0].description;
        var icon = data.weather[0].icon;
        var iconMap = { '01d':'☀️','01n':'🌙','02d':'⛅','02n':'☁️','03d':'☁️','03n':'☁️','04d':'☁️','04n':'☁️','09d':'🌧️','09n':'🌧️','10d':'🌦️','10n':'🌦️','11d':'⛈️','11n':'⛈️','13d':'❄️','13n':'❄️','50d':'🌫️','50n':'🌫️' };
        weatherEl.innerHTML = '<span>' + (iconMap[icon] || '🌡️') + '</span><span class="temp">' + temp + '°C</span><span>' + desc + '</span>';
        return true;
    } catch(error) {
        console.error('날씨 오류:', error);
        weatherEl.innerHTML = '<span>⏳</span><span class="temp">--°C</span><span>날씨</span>';
        return false;
    }
}

async function showWeekWeather() {
    var existingModal = document.getElementById('weekWeatherModal');
    if (existingModal) { existingModal.remove(); return; }
    await fetchWeather();
    var center = getRegionCenter(currentRegion);
    var apiKey = 'b84c1b9a09d8316b679320cceb3a1097';
    try {
        var url = 'https://api.openweathermap.org/data/2.5/forecast?lat=' + center.lat + '&lon=' + center.lng + '&appid=' + apiKey + '&units=metric&lang=kr';
        var response = await fetch(url);
        if (!response.ok) throw new Error('예보 조회 실패');
        var data = await response.json();
        var dailyMap = {};
        data.list.forEach(function(item) {
            var date = item.dt_txt.split(' ')[0];
            if (!dailyMap[date]) dailyMap[date] = { temps: [], icons: [], descs: [], date: date };
            dailyMap[date].temps.push(item.main.temp);
            dailyMap[date].icons.push(item.weather[0].icon);
            dailyMap[date].descs.push(item.weather[0].description);
        });
        var dailyList = Object.values(dailyMap).slice(0, 5);
        var modalHtml = '<div id="weekWeatherModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:9999;display:flex;justify-content:center;align-items:center;padding:20px;" onclick="this.remove()"><div style="background:white;border-radius:24px;padding:24px 20px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:80vh;overflow-y:auto;" onclick="event.stopPropagation()"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 style="font-size:18px;font-weight:700;color:#2d3748;">📅 5일 예보 (' + currentRegion + ')</h3><button onclick="document.getElementById(\'weekWeatherModal\').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#a0aec0;">&times;</button></div><div style="display:flex;flex-direction:column;gap:10px;">';
        var iconMap = { '01d':'☀️','01n':'🌙','02d':'⛅','02n':'☁️','03d':'☁️','03n':'☁️','04d':'☁️','04n':'☁️','09d':'🌧️','09n':'🌧️','10d':'🌦️','10n':'🌦️','11d':'⛈️','11n':'⛈️','13d':'❄️','13n':'❄️','50d':'🌫️','50n':'🌫️' };
        dailyList.forEach(function(day) {
            var minTemp = Math.round(Math.min.apply(null, day.temps));
            var maxTemp = Math.round(Math.max.apply(null, day.temps));
            var iconCode = day.icons[0] || '01d';
            var iconEmoji = iconMap[iconCode] || '🌡️';
            var desc = day.descs[0] || '';
            var dateObj = new Date(day.date + 'T00:00:00');
            var weekdays = ['일','월','화','수','목','금','토'];
            var dayLabel = weekdays[dateObj.getDay()] + '요일';
            var dateLabel = (dateObj.getMonth() + 1) + '/' + dateObj.getDate();
            modalHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f7fafc;border-radius:14px;border-left:4px solid #2563eb;"><div style="display:flex;align-items:center;gap:12px;min-width:80px;"><span style="font-size:22px;">' + iconEmoji + '</span><div><div style="font-weight:600;font-size:14px;">' + dayLabel + '</div><div style="font-size:11px;color:#a0aec0;">' + dateLabel + '</div></div></div><div style="text-align:center;flex:1;"><span style="font-size:13px;color:#718096;">' + desc + '</span></div><div style="text-align:right;font-weight:700;font-size:15px;">' + maxTemp + '° <span style="color:#a0aec0;font-weight:400;">/</span> ' + minTemp + '°</div></div>';
        });
        modalHtml += '</div><div style="margin-top:14px;font-size:11px;color:#a0aec0;text-align:center;">* 3시간 간격 예보를 평균/최고/최저로 표시했어요</div></div></div>';
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch(error) {
        console.error('예보 오류:', error);
        alert('날씨 예보를 불러오지 못했습니다.');
    }
}

// ============================================================
// 19. Service Worker
// ============================================================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/route-optimizer-pwa/sw.js')
            .then(function(reg) { console.log('✅ Service Worker 등록 성공'); })
            .catch(function(err) { console.log('❌ Service Worker 등록 실패:', err); });
    }
}

// ============================================================
// 20. 초기화 실행
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 페이지 로드 시작');
    
    loadSettings();
    loadRegionList();
    loadPresets();
    
    // 🔥 현재 지역 데이터 로드
    if (currentRegion) {
        var key = getStorageKey(currentRegion);
        var data = localStorage.getItem(key);
        places = data ? JSON.parse(data) : [];
        console.log('📊 초기 로드된 현장 수:', places.length, '지역:', currentRegion);
    } else {
        places = [];
        console.log('📊 현재 지역 없음, 빈 배열');
    }
    
    var sortSelect = document.getElementById('sortPlaces');
    if (sortSelect) currentSort = sortSelect.value;
    
    renderPlaces();
    renderWaypointList();
    setOptimizeMode(optimizeMode);
    updateStorageInfo();
    setTimeout(initMap, 500);
    setTimeout(function() { if (!kakaoMap && !sdkLoading) initMap(); }, 3000);
    registerServiceWorker();
    
    function initWeather() {
        fetchWeather().then(function(success) {
            if (!success) setTimeout(initWeather, 5000);
        });
    }
    setTimeout(initWeather, 3000);
    
    console.log('✅ 페이지 로드 완료');
});
// ============================================================
// 카카오맵 장소 검색
// ============================================================

async function searchKakaoPlaces(query, size) {
    size = size || 5;
    var restKey = settings.kakaoRestKey;
    if (!query || query.length < 2 || !restKey) return [];
    try {
        var res = await fetch(
            'https://dapi.kakao.com/v2/local/search/keyword.json?query=' + encodeURIComponent(query) + '&size=' + size,
            { headers: { 'Authorization': 'KakaoAK ' + restKey } }
        );
        if (!res.ok) return [];
        var data = await res.json();
        return data.documents || [];
    } catch(e) {
        console.error('카카오맵 검색 오류:', e);
        return [];
    }
}

// ============================================================
// 키보드 네비게이션 함수들
// ============================================================

function handleStartKeydown(event) {
    var results = document.querySelectorAll('#startSearchResults .result-item');
    if (results.length === 0) return;
    var index = searchIndexState.selected || -1;
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
    for (var i = 0; i < results.length; i++) {
        results[i].style.background = i === index ? '#bee3f8' : '';
    }
}

function handleWaypointKeydown(event) {
    var results = document.querySelectorAll('#waypointSearchResults .result-item');
    if (results.length === 0) return;
    var index = searchIndexState.waypoint || -1;
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
    for (var i = 0; i < results.length; i++) {
        results[i].style.background = i === index ? '#bee3f8' : '';
    }
}

function handleAddrKeydown(event) {
    var results = document.querySelectorAll('#addrSearchResults .result-item');
    if (results.length === 0) return;
    var index = searchIndexState.addr || -1;
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
    for (var i = 0; i < results.length; i++) {
        results[i].style.background = i === index ? '#bee3f8' : '';
    }
}
function showPromptModal(title, message, defaultValue, onConfirm, onCancel) {
    var existing = document.getElementById('promptModal');
    if (existing) existing.remove();
    
    var modalHtml = `
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
                        var input = document.getElementById('promptInput');
                        var value = input ? input.value.trim() : '';
                        document.getElementById('promptModal').remove();
                        if(typeof onConfirm==='function') onConfirm(value);
                    " style="padding:6px 16px;">확인</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    var input = document.getElementById('promptInput');
    if (input) {
        setTimeout(function() {
            input.focus();
            input.select();
        }, 100);
    }
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
    
    showPromptModal(
        '💾 프리셋 저장',
        '프리셋 이름을 입력하세요:',
        '프리셋 ' + (presets.length + 1),
        function(name) {
            if (!name || name.trim() === '') {
                showTabStatus('tab-places', '⚠️ 프리셋 이름을 입력하세요.', 'warning');
                return;
            }
            var preset = {
                id: Date.now(),
                name: name.trim(),
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
            showTabStatus('tab-places', '✅ 프리셋 "' + preset.name + '" 저장됨!', 'ok');
        }
    );
}
// ============================================================
// GitHub 다운로드 처리 (실제 다운로드 로직)
// ============================================================

async function processDownloadFromGitHub(region) {
    var token = settings.githubToken;
    if (!token) {
        showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    
    try {
        showTabStatus('tab-settings', '☁️ GitHub 다운로드 중...', 'info');
        
        var userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        var user = await userRes.json();
        var username = user.login;
        
        var repoName = 'route-data';
        var fileName = region + '.json';
        var fileUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + encodeURIComponent(fileName);
        
        var fileRes = await fetch(fileUrl, {
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
        
        var data = await fileRes.json();
        var binaryString = atob(data.content);
        var bytes = new Uint8Array(binaryString.length);
        for (var i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        var content = new TextDecoder('utf-8').decode(bytes);
        var loadedPlaces = JSON.parse(content);
        console.log('📊 GitHub에서 로드된 현장 수:', loadedPlaces.length);
        
        // 🔥 먼저 데이터를 전역 places에 저장하고 localStorage에도 저장
        places = loadedPlaces;
        console.log('✅ places 배열 업데이트됨:', places.length);
        
        // 🔥 localStorage에 저장
        var key = getStorageKey(region);
        localStorage.setItem(key, JSON.stringify(places));
        console.log('💾 localStorage 저장 완료:', key);
        
        // 🔥 드롭다운에 지역 추가
        var select = document.getElementById('regionSelect');
        var exists = false;
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === region) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            var opt = document.createElement('option');
            opt.value = region;
            opt.textContent = region;
            select.appendChild(opt);
        }
        
        // 🔥 지역 전환 (switchRegion이 renderPlaces를 호출함)
        select.value = region;
        currentRegion = region;
        localStorage.setItem(SELECTED_REGION_KEY, region);
        
        // 🔥⚠️ 중요한 수정: switchRegion을 호출하면 places가 다시 로드됨
        // 하지만 우리는 이미 places에 데이터를 넣었으므로, switchRegion을 호출하면
        // localStorage에서 다시 읽어와서 places를 덮어쓰게 됨.
        // 따라서 switchRegion 대신 직접 renderPlaces 호출
        console.log('🔄 현장리스트 갱신 시작...');
        renderPlaces();
        updateStorageInfo();
        
        // 지도 이동
        if (kakaoMap) {
            var center = getRegionCenter(region);
            kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
            kakaoMap.setLevel(5);
            kakaoMap.relayout();
        }
        
        showTabStatus('tab-settings', '✅ GitHub 다운로드 완료! (' + loadedPlaces.length + '개)', 'ok');
        console.log('✅ 다운로드 완료, 현장 수:', places.length);
        
    } catch(error) {
        console.error('❌ GitHub 다운로드 오류:', error);
        showTabStatus('tab-settings', '❌ 다운로드 실패: ' + error.message, 'error');
    }
}
// ============================================================
// 현장탭에서 카카오맵 열기 (모바일 앱 지원)
// ============================================================

function openKakaoMapFromPlace(id) {
    var place = places.find(function(p) { return p.id === id; });
    if (!place) {
        showTabStatus('tab-list', '❌ 현장을 찾을 수 없습니다.', 'error');
        return;
    }
    
    if (!place.lat || !place.lng || place.lat === 0 || place.lng === 0) {
        showTabStatus('tab-list', '⚠️ "' + place.name + '"의 좌표가 없습니다.', 'warning');
        return;
    }
    
    var url;
    if (startPoint && startPoint.lat && startPoint.lng) {
        url = 'https://map.kakao.com/link/from/' 
            + encodeURIComponent(startPoint.name) + ',' + startPoint.lat + ',' + startPoint.lng 
            + '/to/' 
            + encodeURIComponent(place.name) + ',' + place.lat + ',' + place.lng;
        showTabStatus('tab-list', '🗺️ 카카오맵 길찾기: ' + startPoint.name + ' → ' + place.name, 'info');
    } else {
        url = 'https://map.kakao.com/link/map/' + encodeURIComponent(place.name) + ',' + place.lat + ',' + place.lng;
        showTabStatus('tab-list', '🗺️ 카카오맵에서 "' + place.name + '" 위치 열기', 'info');
    }
    
    // 🔥 모바일에서는 카카오맵 앱 스킴 사용
    var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
        var appUrl = url.replace('https://map.kakao.com/link/', 'kakaomap://');
        window.location.href = appUrl;
        // 앱이 없으면 웹으로 fallback
        setTimeout(function() {
            window.open(url, '_blank');
        }, 500);
    } else {
        window.open(url, '_blank');
    }
}
// ============================================================
// 지역 관리 팝업 (추가 + 삭제 + 선택)
// ============================================================

function openRegionManager() {
    var existing = document.getElementById('regionManagerModal');
    if (existing) {
        existing.remove();
        return;
    }
    
    var select = document.getElementById('regionSelect');
    var currentRegion = select.value || '';
    
    // 지역 목록 가져오기
    var regions = [];
    for (var i = 0; i < select.options.length; i++) {
        regions.push(select.options[i].value);
    }
    
    var listHtml = '';
    if (regions.length === 0) {
        listHtml = '<div style="text-align:center;color:#a0aec0;padding:12px;">등록된 지역이 없습니다</div>';
    } else {
        for (var i = 0; i < regions.length; i++) {
            var r = regions[i];
            var isActive = (r === currentRegion);
            listHtml += `
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    margin-bottom: 4px;
                    background: ${isActive ? '#ebf8ff' : '#f7fafc'};
                    border-radius: 6px;
                    border-left: 3px solid ${isActive ? '#4f7eb3' : 'transparent'};
                    cursor: pointer;
                    transition: background 0.15s;
                " onclick="selectRegionFromManager('${escapeHtml(r)}')" 
                   onmouseover="this.style.background='#edf2f7'" 
                   onmouseout="this.style.background='${isActive ? '#ebf8ff' : '#f7fafc'}'">
                    <span style="font-weight:${isActive ? '600' : '400'};">
                        ${isActive ? '📍 ' : ''}${escapeHtml(r)}
                    </span>
                    <button onclick="event.stopPropagation(); deleteRegionFromManager('${escapeHtml(r)}')" 
                            style="background:none; border:none; color:#e53e3e; font-size:16px; cursor:pointer; padding:0 4px;" 
                            title="지역 삭제">✕</button>
                </div>
            `;
        }
    }
    
    var modalHtml = `
        <div id="regionManagerModal" style="
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
        " onclick="if(event.target===this) document.getElementById('regionManagerModal').remove()">
            <div style="
                background: white;
                border-radius: 16px;
                padding: 24px;
                max-width: 360px;
                width: 100%;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            " onclick="event.stopPropagation()">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="font-size:17px; font-weight:700; color:#1a202c;">📍 지역 관리</h3>
                    <button onclick="document.getElementById('regionManagerModal').remove()" 
                            style="background:none; border:none; font-size:20px; cursor:pointer; color:#a0aec0;">&times;</button>
                </div>
                
                <div style="flex:1; overflow-y:auto; margin-bottom:12px; max-height:300px;">
                    ${listHtml}
                </div>
                
                <div style="border-top:1px solid #e2e8f0; padding-top:12px;">
                    <div style="display:flex; gap:6px;">
                        <input id="newRegionInput" type="text" placeholder="새 지역명 입력" 
                               style="flex:1; padding:8px 12px; border:2px solid #e2e8f0; border-radius:8px; font-size:13px;"
                               onkeydown="if(event.key==='Enter') addRegionFromManager()">
                        <button onclick="addRegionFromManager()" 
                                style="padding:8px 14px; background:#4f7eb3; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600;">
                            추가
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // 입력창에 포커스
    setTimeout(function() {
        var input = document.getElementById('newRegionInput');
        if (input) input.focus();
    }, 200);
}

// ============================================================
// 지역 관리 팝업 내부 함수들
// ============================================================

function selectRegionFromManager(region) {
    // 지역 선택 → 해당 지역으로 전환
    var select = document.getElementById('regionSelect');
    if (select) {
        select.value = region;
        switchRegion(region);
    }
    // 팝업 닫기
    var modal = document.getElementById('regionManagerModal');
    if (modal) modal.remove();
}

function deleteRegionFromManager(region) {
    var select = document.getElementById('regionSelect');
    if (!select) return;
    
    // 🔥 마지막 지역인지 확인
    if (select.options.length <= 1) {
        showTabStatus('tab-settings', '⚠️ 마지막 남은 지역은 삭제할 수 없습니다.', 'warning');
        return;
    }
    
    // 🔥 현재 선택된 지역이면 삭제 전에 다른 지역으로 전환
    var currentRegion = select.value;
    var isCurrent = (region === currentRegion);
    
    showConfirmModal(
        '🗑️ 지역 삭제',
        '"' + region + '" 지역을 삭제하시겠습니까?\n해당 지역의 모든 현장 데이터도 함께 삭제됩니다.',
        function() {
            // 1. localStorage에서 삭제
            var key = getStorageKey(region);
            localStorage.removeItem(key);
            
            // 2. 드롭다운에서 옵션 제거
            for (var i = 0; i < select.options.length; i++) {
                if (select.options[i].value === region) {
                    select.remove(i);
                    break;
                }
            }
            
            // 3. 현재 선택된 지역이 삭제된 경우 다른 지역으로 전환
            if (isCurrent && select.options.length > 0) {
                var newRegion = select.options[0].value;
                select.value = newRegion;
                switchRegion(newRegion);
            } else {
                // 현재 지역이 유지되는 경우
                switchRegion(select.value);
            }
            
            // 4. 팝업 새로고침 (목록 업데이트)
            var modal = document.getElementById('regionManagerModal');
            if (modal) {
                modal.remove();
                openRegionManager();
            }
            
            showTabStatus('tab-settings', '✅ "' + region + '" 지역 삭제됨', 'ok');
        }
    );
}

function addRegionFromManager() {
    var input = document.getElementById('newRegionInput');
    if (!input) return;
    
    var name = input.value.trim();
    if (!name) {
        showTabStatus('tab-settings', '⚠️ 지역명을 입력하세요.', 'warning');
        input.focus();
        return;
    }
    
    var region = name.replace(/[\/\\:*?"<>|]/g, '');
    if (!region) {
        showTabStatus('tab-settings', '⚠️ 사용할 수 없는 지역명입니다.', 'warning');
        return;
    }
    
    var select = document.getElementById('regionSelect');
    if (!select) return;
    
    // 중복 체크
    for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === region) {
            showTabStatus('tab-settings', '⚠️ 이미 존재하는 지역입니다.', 'warning');
            input.value = '';
            input.focus();
            return;
        }
    }
    
    // 지역 저장
    var key = getStorageKey(region);
    localStorage.setItem(key, JSON.stringify([]));
    
    // 드롭다운에 추가
    var opt = document.createElement('option');
    opt.value = region;
    opt.textContent = region;
    select.appendChild(opt);
    select.value = region;
    
    // 지역 전환
    switchRegion(region);
    
    // 팝업 새로고침
    var modal = document.getElementById('regionManagerModal');
    if (modal) {
        modal.remove();
        openRegionManager();
    }
    
    showTabStatus('tab-settings', '✅ "' + region + '" 지역 추가됨', 'ok');
}
// ============================================================
// 검색 결과 팝업 외부 클릭 시 닫기
// ============================================================

document.addEventListener('click', function(event) {
    // 출발지 검색 결과
    var startContainer = document.getElementById('startSearchResults');
    var startInput = document.getElementById('startPoint');
    if (startContainer && startContainer.style.display === 'block') {
        if (!startContainer.contains(event.target) && event.target !== startInput) {
            startContainer.style.display = 'none';
        }
    }
    
    // 경유지 검색 결과
    var waypointContainer = document.getElementById('waypointSearchResults');
    var waypointInput = document.getElementById('waypointInput');
    if (waypointContainer && waypointContainer.style.display === 'block') {
        if (!waypointContainer.contains(event.target) && event.target !== waypointInput) {
            waypointContainer.style.display = 'none';
        }
    }
    
    // 주소 검색 결과
    var addrContainer = document.getElementById('addrSearchResults');
    var addrInput = document.getElementById('newPlaceAddr');
    if (addrContainer && addrContainer.style.display === 'block') {
        if (!addrContainer.contains(event.target) && event.target !== addrInput) {
            addrContainer.style.display = 'none';
        }
    }
});
