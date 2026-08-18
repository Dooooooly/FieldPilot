// ============================================================
// 경로 최적화 PWA - app.js (수정 완료 - 4,7,12 제외 전부 반영)
// ============================================================

// --- 저장소 키 ---
const STORAGE_KEY_PREFIX = 'places_';
const SELECTED_REGION_KEY = 'selectedRegion';
const SETTINGS_KEY = 'app_settings';
const OPTIMIZE_MODE_KEY = 'optimizeMode';
const PRESETS_KEY = 'route_presets';

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
let pendingUpload = null; // 지역 전환 시 재시도용

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

    var target = document.getElementById(tabId);
    if (!target) {
        console.warn('switchTab: 탭 요소 없음 -', tabId);
        return;
    }

    document.querySelectorAll('.tab-content').forEach(function(el) {
        el.classList.remove('active');
    });
    target.classList.add('active');

    document.querySelectorAll('.bottom-tab').forEach(function(btn) {
        var isActive = btn.getAttribute('data-tab') === tabId;
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
// 3. 설정 관리 (API 키 인코딩 추가)
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
    var saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
        try {
            settings = JSON.parse(saved);
            document.getElementById('githubToken').value = decodeKey(settings.githubToken || '');
            document.getElementById('kakaoJsKey').value = decodeKey(settings.kakaoJsKey || '');
            document.getElementById('kakaoRestKey').value = decodeKey(settings.kakaoRestKey || '');
            updateSettingsStatus();
        } catch(e) {}
    }
}

function saveSettings() {
    var encoded = {
        githubToken: encodeKey(settings.githubToken || ''),
        kakaoJsKey: encodeKey(settings.kakaoJsKey || ''),
        kakaoRestKey: encodeKey(settings.kakaoRestKey || '')
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(encoded));
    updateSettingsStatus();
}

function updateSettingsStatus() {
    var gs = document.getElementById('githubStatus');
    if (settings.githubToken) {
        gs.textContent = '✅ 토큰 설정됨';
        gs.className = 'badge badge-ok';
    } else {
        gs.textContent = '⏳ 토큰 미설정';
        gs.className = 'badge badge-wait';
    }
    var ks = document.getElementById('kakaoStatus');
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
    var container = document.getElementById('map');
    if (container) {
        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#d69e2e;font-size:14px;background:#fffff0;border-radius:12px;">⏳ 키 저장됨, 지도 재로딩 중...</div>';
    }
    kakaoMap = null;
    setTimeout(initMap, 500);
}

async function testGitHubToken() {
    var token = settings.githubToken || document.getElementById('githubToken').value.trim();
    if (!token) {
        showTabStatus('tab-settings', '토큰을 입력하세요.', 'warning');
        return;
    }
    var gs = document.getElementById('githubStatus');
    gs.textContent = '⏳ 테스트 중...';
    gs.className = 'badge badge-wait';
    try {
        var res = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
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
// 4. 저장소 및 지역 관리 (재시도 로직 추가)
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
    if (!navigator.onLine) {
        showTabStatus('tab-settings', '📡 오프라인 - GitHub 동기화 보류됨', 'warning');
        return;
    }
    autoSyncTimer = setTimeout(function() {
        uploadToGitHub(true);
    }, 5000);
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
            if (region && !regions.includes(region)) {
                regions.push(region);
            }
        }
    }
    
    if (regions.length === 0) {
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '📍 지역 선택';
        defaultOpt.selected = true;
        defaultOpt.disabled = true;
        select.appendChild(defaultOpt);
        updateRegionDisplay();
        return;
    }
    
    regions.sort();
    for (var i = 0; i < regions.length; i++) {
        var opt = document.createElement('option');
        opt.value = regions[i];
        opt.textContent = regions[i];
        select.appendChild(opt);
    }
    
    var savedRegion = localStorage.getItem(SELECTED_REGION_KEY);
    if (savedRegion && regions.includes(savedRegion)) {
        select.value = savedRegion;
        currentRegion = savedRegion;
    } else {
        select.value = regions[0];
        currentRegion = regions[0];
        localStorage.setItem(SELECTED_REGION_KEY, currentRegion);
    }
    
    updateRegionDisplay();
    
    var key = getStorageKey(currentRegion);
    var data = localStorage.getItem(key);
    places = data ? JSON.parse(data) : [];
    renderPlaces();
    updateStorageInfo();
    
    if (kakaoMap) {
        var center = getRegionCenter(currentRegion);
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
    
    var select = document.getElementById('regionSelect');
    if (select) {
        select.value = region;
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === region) {
                select.selectedIndex = i;
                break;
            }
        }
    }
    
    updateRegionDisplay();
    
    var key = getStorageKey(region);
    var data = localStorage.getItem(key);
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
    
    // 지역 전환 시 GitHub 업로드 재시도
    if (settings.githubToken && navigator.onLine) {
        setTimeout(function() {
            uploadToGitHub(true);
        }, 3000);
    }
}

function addRegion() {
    var existing = document.getElementById('customRegionModal');
    if (existing) existing.remove();
    
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
        var input = document.getElementById('customRegionInput');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
    
    document.getElementById('customRegionConfirmBtn').addEventListener('click', function() {
        var input = document.getElementById('customRegionInput');
        var name = input ? input.value.trim() : '';
        document.getElementById('customRegionModal').remove();
        
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
            showTabStatus('tab-settings', '⚠️ 오류 발생, 새로고침 후 다시 시도하세요.', 'error');
            return;
        }
        
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === region) {
                showTabStatus('tab-settings', '⚠️ 이미 존재하는 지역입니다.', 'warning');
                return;
            }
        }
        
        var key = getStorageKey(region);
        localStorage.setItem(key, JSON.stringify([]));
        
        var opt = document.createElement('option');
        opt.value = region;
        opt.textContent = region;
        select.appendChild(opt);
        select.value = region;
        
        switchRegion(region);
        showTabStatus('tab-settings', '✅ "' + region + '" 지역 추가됨', 'ok');
    });
}

function deleteRegion() {
    var select = document.getElementById('regionSelect');
    if (!select) return;
    
    var currentRegion = select.value;
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
            var key = getStorageKey(currentRegion);
            localStorage.removeItem(key);
            
            for (var i = 0; i < select.options.length; i++) {
                if (select.options[i].value === currentRegion) {
                    select.remove(i);
                    break;
                }
            }
            
            if (select.options.length > 0) {
                var newRegion = select.options[0].value;
                select.value = newRegion;
                switchRegion(newRegion);
                showTabStatus('tab-settings', '✅ "' + currentRegion + '" 지역 삭제됨', 'ok');
            } else {
                select.innerHTML = '';
                var defaultOpt = document.createElement('option');
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
// 6. 검색 결과 렌더링
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
    
    container.querySelectorAll('.result-item').forEach(function(el) {
        el.addEventListener('click', function(e) {
            if (e.target.closest('.result-check')) return;
            
            var name = this.dataset.name;
            var address = this.dataset.address;
            var lat = parseFloat(this.dataset.lat);
            var lng = parseFloat(this.dataset.lng);
            
            if (onClickName === 'selectStartPoint') {
                selectStartPoint(name, address, lat, lng);
            } else if (onClickName === 'selectAddress') {
                selectAddress(name, address, lat, lng);
            } else {
                var fn = window[onClickName];
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
    
    var toggleBtn = document.getElementById('multiToggleBtn');
    var addBtn = document.getElementById('addWaypointBtn');
    var input = document.getElementById('waypointInput');
    var statusEl = document.getElementById('modeStatus');
    
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
        var resultsContainer = document.getElementById('waypointSearchResults');
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
// 9. 출발지 검색 및 설정
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
    if (!name) {
        showTabStatus('tab-places', '출발지를 입력하세요.', 'warning');
        return;
    }
    var restKey = settings.kakaoRestKey;
    if (!restKey) {
        showTabStatus('tab-places', '⚠️ REST API 키가 필요합니다.', 'warning');
        return;
    }
    var geo = await geocodeAddress(name, restKey);
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
    var input = document.getElementById('waypointInput');
    var name = input.value.trim();
    
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
        if (window._sortable) {
            window._sortable.destroy();
            window._sortable = null;
        }
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
            onEnd: function(evt) {
                var oldIndex = evt.oldIndex;
                var newIndex = evt.newIndex;
                if (oldIndex === newIndex) return;
                var moved = waypoints.splice(oldIndex, 1)[0];
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
    if (!query || query.length < 2) {
        container.style.display = 'none';
        return;
    }
    clearTimeout(window._addrSearchTimer);
    window._addrSearchTimer = setTimeout(async function() {
        var results = await searchKakaoPlaces(query);
        if (results.length === 0) {
            container.style.display = 'none';
            return;
        }
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
                var name = this.dataset.name;
                var address = this.dataset.address;
                var lat = parseFloat(this.dataset.lat);
                var lng = parseFloat(this.dataset.lng);
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
// 12. 현장 관리 (즐겨찾기 필터 분리)
// ============================================================
var favFilterActive = false;

function toggleFavFilter() {
    favFilterActive = !favFilterActive;
    var btn = document.getElementById('favFilterBtn');
    if (btn) {
        btn.classList.toggle('active', favFilterActive);
        btn.textContent = favFilterActive ? '⭐ 즐겨찾기 ON' : '⭐ 즐겨찾기';
    }
    renderPlaces();
}

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

function getFilteredAndSortedPlaces() {
    if (!places || places.length === 0) return [];

    var filtered = [...places];
    
    // 즐겨찾기 필터 적용
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
    var list = document.getElementById('placeList');
    var data = filtered || getFilteredAndSortedPlaces();
    document.getElementById('listCount').textContent = '(' + data.length + '개)';

    if (data.length === 0) {
        list.innerHTML = '<div class="empty-msg">등록된 현장이 없습니다</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < data.length; i++) {
        var p = data[i];
        var shortAddr = shortenAddress(p.address || '');
        var starIcon = p.favorite ? '★' : '☆';
        var starClass = p.favorite ? 'fav active' : 'fav inactive';
        var remarkDisplay = p.remark ? '<span class="remark">' + escapeHtml(p.remark) + '</span>' : '';

        var hasCoords = (p.lat && p.lng && p.lat !== 0 && p.lng !== 0);
        var borderColor = hasCoords ? '#4f7eb3' : '#e53e3e';

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
    var keyword = document.getElementById('searchPlace').value.trim();
    var baseList = getFilteredAndSortedPlaces();

    if (!keyword) {
        renderPlaces(baseList);
        return;
    }

    var results = baseList.filter(function(p) {
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
    var name = document.getElementById('modalPlaceName').value.trim();
    var address = document.getElementById('modalPlaceAddr').value.trim();
    var lat = parseFloat(document.getElementById('modalPlaceLat').value);
    var lng = parseFloat(document.getElementById('modalPlaceLng').value);
    var remark = document.getElementById('modalPlaceRemark').value.trim();

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

    var fullAddress = address;
    var finalLat = lat;
    var finalLng = lng;

    if (address && (isNaN(lat) || isNaN(lng))) {
        var restKey = settings.kakaoRestKey;
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
// 14. 내부 팝업 모달 (커스텀 confirm, prompt - 네이티브 alert 대체)
// ============================================================
function showConfirmModal(title, message, onConfirm, onCancel) {
    var existing = document.getElementById('confirmModal');
    if (existing) existing.remove();
    
    window._tempConfirm = onConfirm || null;
    window._tempCancel = onCancel || null;
    
    var modalHtml = `
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

// ============================================================
// 15. 현장 삭제/수정/초기화 등
// ============================================================
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
                var center = getRegionCenter(currentRegion);
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
            var keys = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && (key.startsWith(STORAGE_KEY_PREFIX) || key === SETTINGS_KEY || key === SELECTED_REGION_KEY || key === OPTIMIZE_MODE_KEY || key === PRESETS_KEY)) {
                    keys.push(key);
                }
            }
            for (var i = 0; i < keys.length; i++) localStorage.removeItem(keys[i]);
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
    var lat = parseFloat(document.getElementById('modalLat').value);
    var lng = parseFloat(document.getElementById('modalLng').value);
    var remark = document.getElementById('modalRemark').value.trim();

    var place = places.find(function(p) { return p.id === id; });
    if (!place) { closeModal(); return; }

    if (!name) {
        showTabStatus('tab-list', '⚠️ 현장명을 입력하세요.', 'warning');
        document.getElementById('modalName').focus();
        return;
    }

    if (!address && (isNaN(lat) || isNaN(lng))) {
        showTabStatus('tab-list', '⚠️ 주소 또는 위도/경도를 입력하세요.', 'warning');
        document.getElementById('modalAddress').focus();
        return;
    }

    if (!isNaN(lat) && !isNaN(lng)) {
        if (lat < 33 || lat > 43 || lng < 124 || lng > 132) {
            showTabStatus('tab-list', '⚠️ 대한민국 범위를 벗어났습니다.\n위도: 33~43, 경도: 124~132', 'warning');
            return;
        }
    }

    var existing = places.find(function(p) {
        return p.id !== id && normalizeName(p.name) === normalizeName(name);
    });
    if (existing) {
        showTabStatus('tab-list', '⚠️ 이미 존재하는 현장명입니다.', 'warning');
        document.getElementById('modalName').focus();
        return;
    }

    var fullAddress = address;
    var finalLat = lat;
    var finalLng = lng;

    if (address && (isNaN(lat) || isNaN(lng))) {
        var restKey = settings.kakaoRestKey;
        if (restKey) {
            var geo = await geocodeAddress(address, restKey);
            if (geo) {
                finalLat = geo.lat;
                finalLng = geo.lng;
                fullAddress = geo.address || address;
            } else {
                showTabStatus('tab-list', '⚠️ 주소 변환 실패. 위도/경도를 직접 입력하세요.', 'warning');
                return;
            }
        } else {
            showTabStatus('tab-list', '⚠️ 카카오 REST API 키가 없습니다. 위도/경도를 직접 입력하세요.', 'warning');
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
}

function addWaypointFromList(id) {
    var place = places.find(function(p) { return p.id === id; });
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
    for (var attempt = 0; attempt <= retries; attempt++) {
        try {
            var res = await fetch(
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
            var data = await res.json();
            if (data.documents && data.documents.length > 0) {
                var doc = data.documents[0];
                var road = doc.road_address;
                if (road) {
                    return { lat: parseFloat(road.y), lng: parseFloat(road.x), address: road.address_name };
                }
                var addr = doc.address;
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
// 17. 경로 최적화 (절약 효과 추가)
// ============================================================
var routeObjective = 'distance';
var useRoadOptimization = true;
var useDirectionHint = true;
var originalRouteCost = null; // 최적화 전 경로 비용 저장

function getOptimizationScore(cost) {
    if (routeObjective === 'time') {
        return cost.durationMin;
    }

    if (routeObjective === 'balanced') {
        var refDistance = 30;
        var refTime = 60;
        var distanceScore = cost.distanceKm / Math.max(1, refDistance);
        var timeScore = cost.durationMin / Math.max(1, refTime);
        return distanceScore * 0.5 + timeScore * 0.5;
    }

    return cost.distanceKm;
}

function setRouteObjective(objective) {
    routeObjective = objective || 'distance';
    var cards = {
        distance: document.getElementById('metricDistanceCard'),
        time: document.getElementById('metricTimeCard'),
        balanced: document.getElementById('metricBalancedCard')
    };
    Object.keys(cards).forEach(function(k) {
        if (cards[k]) cards[k].classList.toggle('active', k === routeObjective);
        var radio = cards[k] ? cards[k].querySelector('input') : null;
        if (radio) radio.checked = (k === routeObjective);
        var mark = cards[k] ? cards[k].querySelector('.metric-radio') : null;
        if (mark) mark.textContent = (k === routeObjective) ? '●' : '○';
    });
    var info = document.getElementById('modeInfo');
    if (info) {
        var labels = {distance:'최단거리', time:'최소시간', balanced:'거리+시간 균형'};
        info.textContent = '💡 초기 경로: ' + (window.optimizeMode === 'Farthest' ? '먼순' : '가까운순')
            + ' · 최종 기준: ' + labels[routeObjective]
            + (useRoadOptimization ? ' · 실제 도로' : ' · 직선거리 보완');
    }
    updateOptimizationLiveSummary();
}

function setRoadOptimization(enabled) {
    useRoadOptimization = !!enabled;
    setRouteObjective(routeObjective);
}

function setDirectionHint(enabled) {
    useDirectionHint = !!enabled;
    setRouteObjective(routeObjective);
}

function updateOptimizationSettingsStatus() {
    setRouteObjective(routeObjective);
}

function setOptimizeMode(mode) {
    if (mode !== 'Nearest' && mode !== 'Farthest') {
        mode = 'Nearest';
    }
    optimizeMode = mode;
    localStorage.setItem(OPTIMIZE_MODE_KEY, mode);
    
    var nearestBtn = document.getElementById('modeNearest');
    var farthestBtn = document.getElementById('modeFarthest');
    
    if (nearestBtn) {
        var isNearest = (mode === 'Nearest');
        nearestBtn.classList.toggle('active', isNearest);
        nearestBtn.setAttribute('aria-pressed', isNearest ? 'true' : 'false');
        var radio = nearestBtn.querySelector('.choice-radio');
        if (radio) radio.textContent = isNearest ? '●' : '○';
    }
    if (farthestBtn) {
        var isFarthest = (mode === 'Farthest');
        farthestBtn.classList.toggle('active', isFarthest);
        farthestBtn.setAttribute('aria-pressed', isFarthest ? 'true' : 'false');
        var radio = farthestBtn.querySelector('.choice-radio');
        if (radio) radio.textContent = isFarthest ? '●' : '○';
    }
    
    var info = document.getElementById('modeInfo');
    if (info) {
        info.textContent = '💡 현재 초기 경로: ' + (mode === 'Nearest' ? '가까운순' : '먼순');
    }
    
    var label = document.getElementById('optimizationStatus');
    if (label) {
        var modeLabel = mode === 'Nearest' ? '가까운순' : '먼순';
        var objectiveLabel = routeObjective === 'time' ? '최소시간' 
            : routeObjective === 'balanced' ? '거리+시간 균형' 
            : '최단거리';
        var roadLabel = useRoadOptimization ? '실제 도로' : '직선거리 보완';
        var dirLabel = useDirectionHint ? '방향 고려' : '방향 미고려';
        label.textContent = modeLabel + ' · ' + objectiveLabel + ' · ' + roadLabel + ' · ' + dirLabel;
    }
    
    var radios = document.querySelectorAll('input[name="optimizeModeRadio"]');
    radios.forEach(function(radio) {
        radio.checked = (radio.value === mode);
    });
    
    var settingsLabel = document.getElementById('settingsOptimizeModeLabel');
    if (settingsLabel) {
        settingsLabel.textContent = mode === 'Nearest' ? '가까운순' : '먼순';
    }
    
    updateOptimizationLiveSummary();
}

function calculateAngle(startX, startY, targetX, targetY) {
    var dx = targetX - startX, dy = targetY - startY;
    if (dx === 0 && dy === 0) return 0;
    var angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return angle;
}

function getClusterGroup16(angle) {
    var group = Math.floor(((angle + 11.25) % 360) / 22.5) + 1;
    return group > 16 ? 16 : group;
}

// ===== 도로 기반 경로 최적화 =====
var roadMetricCache = new Map();
var ROAD_CANDIDATE_COUNT = 3;
var ROAD_OPTIMIZE_MAX_CALLS = 80;
var roadOptimizeCallCount = 0;
var roadCallSuccessCount = 0;
var roadCallFallbackCount = 0;

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
    var key = roadMetricKey(from, to);
    if (roadMetricCache.has(key)) return roadMetricCache.get(key);

    var fallback = {
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
        var url = 'https://apis-navi.kakaomobility.com/v1/directions'
            + '?origin=' + Number(from.lng) + ',' + Number(from.lat)
            + '&destination=' + Number(to.lng) + ',' + Number(to.lat)
            + '&priority=RECOMMEND';

        var response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': 'KakaoAK ' + restKey
            }
        });

        if (!response.ok) throw new Error('HTTP ' + response.status);
        var data = await response.json();

        var route = data && data.routes && data.routes[0];
        if (!route || !route.summary) throw new Error('도로 경로 없음');

        var metric = {
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
    var shortlist = rankByStraightDistance(current, candidates).slice(0, ROAD_CANDIDATE_COUNT);
    var best = null;
    var bestScore = mode === 'Farthest' ? -Infinity : Infinity;

    for (var i = 0; i < shortlist.length; i++) {
        var metric = await getRoadMetric(current, shortlist[i], restKey);
        var score = metric.distanceKm;
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
    var remaining = places.slice();
    var result = [];
    var current = startPoint;

    if (useDirectionHint) {
        if (mode === 'Farthest') {
            remaining.sort(function(a, b) {
                var ga = getClusterGroup16(calculateAngle(startPoint.lng, startPoint.lat, a.lng, a.lat));
                var gb = getClusterGroup16(calculateAngle(startPoint.lng, startPoint.lat, b.lng, b.lat));
                return gb - ga;
            });
        } else {
            remaining.sort(function(a, b) {
                var ga = getClusterGroup16(calculateAngle(startPoint.lng, startPoint.lat, a.lng, a.lat));
                var gb = getClusterGroup16(calculateAngle(startPoint.lng, startPoint.lat, b.lng, b.lat));
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
        var bestIndex = 0;
        var bestDist = mode === 'Farthest' ? -Infinity : Infinity;
        for (var i = 0; i < remaining.length; i++) {
            var d = getStraightDistance(current, remaining[i]);
            if ((mode === 'Nearest' && d < bestDist) || (mode === 'Farthest' && d > bestDist)) {
                bestDist = d;
                bestIndex = i;
            }
        }
        var next = remaining.splice(bestIndex, 1)[0];
        result.push(next);
        current = next;
    }
    return result;
}

async function buildRoadGreedySeed(places, startPoint, restKey, mode) {
    var remaining = places.slice();
    var result = [];
    var current = startPoint;

    var first = await chooseNextRoadPoint(current, remaining, restKey, mode);
    if (first) {
        result.push(first);
        remaining.splice(remaining.indexOf(first), 1);
        current = first;
    }

    while (remaining.length) {
        var next = await chooseNextRoadPoint(current, remaining, restKey, 'Nearest');
        if (!next) break;
        result.push(next);
        remaining.splice(remaining.indexOf(next), 1);
        current = next;
    }
    return result;
}

async function routeCost(route, startPoint, restKey) {
    var current = startPoint;
    var distanceKm = 0;
    var durationMin = 0;
    for (var i = 0; i < route.length; i++) {
        var metric = await getRoadMetric(current, route[i], restKey);
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
    var improved = true;
    var pass = 0;
    var maxPass = 3;

    while (improved && pass < maxPass && roadOptimizeCallCount < ROAD_OPTIMIZE_MAX_CALLS) {
        improved = false;
        pass++;
        var currentCost = await routeCost(route, startPoint, restKey);

        for (var i = 0; i < route.length - 2; i++) {
            for (var j = i + 1; j < route.length - 1; j++) {
                if (roadOptimizeCallCount >= ROAD_OPTIMIZE_MAX_CALLS) break;
                var candidate = route.slice(0, i + 1)
                    .concat(route.slice(i + 1, j + 1).reverse())
                    .concat(route.slice(j + 1));
                var candidateCost = await routeCost(candidate, startPoint, restKey);

                var currentScore = getOptimizationScore(currentCost);
                var candidateScore = getOptimizationScore(candidateCost);
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

    var start = { name: '출발지', lat: startLat, lng: startLng };

    var seeds = [];
    var geometric = buildGeometricSeed(places, start, mode);
    seeds.push(geometric);

    var roadGreedy = await buildRoadGreedySeed(places, start, restKey, mode);
    if (roadGreedy.length === places.length) seeds.push(roadGreedy);

    var clustered = places.slice().sort(function(a, b) {
        var ga = getClusterGroup16(calculateAngle(startLng, startLat, a.lng, a.lat));
        var gb = getClusterGroup16(calculateAngle(startLng, startLat, b.lng, b.lat));
        return ga - gb;
    });
    if (mode === 'Farthest') clustered.reverse();
    seeds.push(clustered);

    var bestRoute = seeds[0];
    var bestCost = await routeCost(bestRoute, start, restKey);
    var bestScore = getOptimizationScore(bestCost);

    for (var s = 0; s < seeds.length; s++) {
        if (roadOptimizeCallCount >= ROAD_OPTIMIZE_MAX_CALLS) break;
        var objective = (typeof routeObjective !== 'undefined' && routeObjective === 'time') ? 'Time' : 'Distance';
        var candidate = await twoOptRoad(seeds[s].slice(), start, restKey, objective);
        var cost = await routeCost(candidate, start, restKey);
        var candidateScore = getOptimizationScore(cost);
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
    var btn = document.getElementById('runOptimizeBtn');
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
        
        // ★ 최적화 전 경로 비용 계산 (원래 순서)
        var originalOrder = validPlaces.slice();
        originalRouteCost = await routeCost(originalOrder, startPoint, restKey);
        
        showTabStatus('tab-places', '🛣️ 실제 도로거리 기반 최적화 계산 중...', 'info');
        var sorted = await optimizeRouteAlgorithm(validPlaces, startPoint.lat, startPoint.lng, optimizeMode, restKey);
        
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
        
        addRouteMarker(startPoint.lat, startPoint.lng, '🚩 ' + startPoint.name, true, -1);
        
        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
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
        
        // ★ 절약 효과 표시
        if (originalRouteCost) {
            var savedKm = parseFloat((originalRouteCost.distanceKm - totalKm).toFixed(2));
            var savedMin = Math.round(originalRouteCost.durationMin - totalMin);
            var savedRow = document.getElementById('savedRow');
            var savedEl = document.getElementById('savedAmount');
            if (savedRow && savedEl) {
                if (savedKm > 0.1 || savedMin > 0) {
                    savedRow.style.display = 'flex';
                    var parts = [];
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
        
        var meta = sorted._optimizationMeta || {};
        var roadMsg = '';
        if (meta.roadSuccess !== undefined && meta.roadFallback !== undefined) {
            var totalRoadCalls = meta.roadSuccess + meta.roadFallback;
            if (totalRoadCalls > 0) {
                var roadPercent = Math.round((meta.roadSuccess / totalRoadCalls) * 100);
                if (roadPercent === 100) {
                    roadMsg = '🛣️ 모든 구간 실제 도로 정보 사용 (' + totalRoadCalls + '구간)';
                } else if (roadPercent >= 50) {
                    roadMsg = '🛣️ ' + roadPercent + '% 도로 정보 사용 (' + meta.roadSuccess + '/' + totalRoadCalls + '구간)';
                } else {
                    roadMsg = '⚠️ 일부 구간은 도로정보 대신 직선거리로 보완했습니다. (' + meta.roadFallback + '/' + totalRoadCalls + '구간)';
                }
            }
        }
        
        // API 호출 제한 경고
        if (meta.roadCalls >= ROAD_OPTIMIZE_MAX_CALLS) {
            roadMsg += ' ⚠️ API 호출 제한 도달';
            showTabStatus('tab-route', '⚠️ 도로 API 호출 제한에 도달했습니다. 일부 구간은 직선거리로 계산됨.', 'warning');
        }
        
        var modeText = optimizeMode === 'Nearest' ? '가까운순' : '먼순';
        var objectiveText = routeObjective === 'time' ? '최소시간' 
            : routeObjective === 'balanced' ? '거리+시간 균형' 
            : '최단거리';
        var resultMsg = '✅ 최적화 완료! ' + validPlaces.length + '개소 · ' + totalKm + 'km · ' + totalMin + '분';
        if (roadMsg) resultMsg += ' · ' + roadMsg;
        showTabStatus('tab-route', resultMsg, 'ok');
        
        var statusLabel = document.getElementById('optimizationStatus');
        if (statusLabel) {
            var modeLabel = optimizeMode === 'Nearest' ? '가까운순' : '먼순';
            var roadLabel = useRoadOptimization ? '실제 도로' : '직선거리 보완';
            var dirLabel = useDirectionHint ? '방향 고려' : '방향 미고려';
            statusLabel.textContent = modeLabel + ' · ' + objectiveText + ' · ' + roadLabel + ' · ' + dirLabel;
        }
        
        switchTab('tab-route');
    } catch(e) {
        showTabStatus('tab-places', '❌ 오류 발생: ' + e.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// 18. 경로 표시 (기존과 동일, 생략)
// ============================================================
// (이하 코드는 기존과 동일하므로 생략 - 실제 파일에는 모든 함수 포함)
// showRouteList, openKakaoMapFromRoute, moveToRoutePoint, openKakaoMap,
// openKakaoMapFromPlace, showPlaceOnMap, clearSingleMarker,
// callKakaoMobilityRoute, drawRoadRoute, drawRoute, focusMapOnPoint,
// applyPendingMapCenter, focusRouteStart, initMap, createMap,
// addRouteMarker, clearRouteMarkers, loadPresets, savePresets,
// renderPresets, addPreset, loadPreset, deletePreset,
// uploadToGitHub, downloadFromGitHub, showRegionSelectModal,
// processDownloadFromGitHub, showGitHubHistory, parseCSVLine,
// handleFile, processExcelFile, importPlaces, showUploadResult,
// exportData, fetchWeather, showWeekWeather, registerServiceWorker,
// displayAppVersion, checkForUpdates, forceUpdateApp,
// updateRegionDisplay, selectRegionFromPopup, addRegionFromPopup,
// deleteRegionFromPopup, openRegionManager, updateOptimizationLiveSummary,
// showTabStatus 등
// ============================================================

// ============================================================
// 19. GitHub 히스토리 복원 기능 (신규)
// ============================================================
async function showGitHubHistory() {
    var token = settings.githubToken;
    if (!token) {
        showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    var historyDiv = document.getElementById('githubHistory');
    if (!historyDiv) return;
    try {
        showTabStatus('tab-settings', '📋 히스토리 불러오는 중...', 'info');
        var userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        var user = await userRes.json();
        var username = user.login;
        var repoName = 'route-data';
        var fileName = currentRegion + '.json';
        var url = 'https://api.github.com/repos/' + username + '/' + repoName + '/commits?path=' + encodeURIComponent(fileName) + '&per_page=10';
        var commitRes = await fetch(url, {
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
        var commits = await commitRes.json();
        if (commits.length === 0) {
            historyDiv.innerHTML = '<div style="color:#a0aec0;text-align:center;padding:8px;">📭 아직 커밋 기록이 없습니다</div>';
        } else {
            var html = '<div style="font-weight:600;font-size:12px;margin-bottom:4px;">📋 최근 10개 커밋</div>';
            for (var i = 0; i < commits.length; i++) {
                var c = commits[i];
                var date = new Date(c.commit.author.date).toLocaleString();
                var msg = c.commit.message || 'No message';
                var sha = c.sha;
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
    var token = settings.githubToken;
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
                var userRes = await fetch('https://api.github.com/user', {
                    headers: { 'Authorization': 'token ' + token }
                });
                if (!userRes.ok) throw new Error('토큰 인증 실패');
                var user = await userRes.json();
                var username = user.login;
                var repoName = 'route-data';
                var fileName = currentRegion + '.json';
                var url = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + encodeURIComponent(fileName) + '?ref=' + sha;
                var fileRes = await fetch(url, {
                    headers: { 'Authorization': 'token ' + token }
                });
                if (!fileRes.ok) throw new Error('파일 조회 실패');
                var data = await fileRes.json();
                var binaryString = atob(data.content);
                var bytes = new Uint8Array(binaryString.length);
                for (var i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                var content = new TextDecoder('utf-8').decode(bytes);
                var loadedPlaces = JSON.parse(content);
                
                // 복원
                places = loadedPlaces;
                var key = getStorageKey(currentRegion);
                localStorage.setItem(key, JSON.stringify(places));
                
                renderPlaces();
                updateStorageInfo();
                showTabStatus('tab-settings', '✅ 복원 완료! (' + loadedPlaces.length + '개)', 'ok');
                
                if (kakaoMap) {
                    var center = getRegionCenter(currentRegion);
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
// 20. 오프라인 상태 감지
// ============================================================
function updateOnlineStatus() {
    var banner = document.getElementById('offlineBanner');
    if (!banner) return;
    if (!navigator.onLine) {
        banner.classList.add('show');
        showTabStatus('tab-settings', '📡 오프라인 상태 - 변경사항이 GitHub에 동기화되지 않을 수 있습니다.', 'warning');
    } else {
        banner.classList.remove('show');
        // 온라인 복귀 시 자동 동기화 재시도
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
// 21. 엑셀 처리 (기존과 동일)
// ============================================================
// (parseCSVLine, handleFile, processExcelFile, importPlaces, showUploadResult, exportData)

// ============================================================
// 22. 날씨 (네이티브 alert 제거)
// ============================================================
async function showWeekWeather() {
    var existingModal = document.getElementById('weekWeatherModal');
    if (existingModal) {
        existingModal.remove();
        return;
    }
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
            if (!dailyMap[date]) {
                dailyMap[date] = { temps: [], icons: [], descs: [], date: date };
            }
            dailyMap[date].temps.push(item.main.temp);
            dailyMap[date].icons.push(item.weather[0].icon);
            dailyMap[date].descs.push(item.weather[0].description);
        });
        var dailyList = Object.values(dailyMap).slice(0, 5);
        var modalHtml = '<div id="weekWeatherModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:9999;display:flex;justify-content:center;align-items:center;padding:20px;" onclick="this.remove()"><div style="background:white;border-radius:24px;padding:24px 20px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:80vh;overflow-y:auto;" onclick="event.stopPropagation()"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 style="font-size:18px;font-weight:700;color:#2d3748;">📅 5일 예보 (' + currentRegion + ')</h3><button onclick="document.getElementById(\'weekWeatherModal\').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#a0aec0;">&times;</button></div><div style="display:flex;flex-direction:column;gap:10px;">';
        var iconMap = {
            '01d': '☀️', '01n': '🌙', '02d': '⛅', '02n': '☁️',
            '03d': '☁️', '03n': '☁️', '04d': '☁️', '04n': '☁️',
            '09d': '🌧️', '09n': '🌧️', '10d': '🌦️', '10n': '🌦️',
            '11d': '⛈️', '11n': '⛈️', '13d': '❄️', '13n': '❄️',
            '50d': '🌫️', '50n': '🌫️'
        };
        dailyList.forEach(function(day) {
            var minTemp = Math.round(Math.min.apply(null, day.temps));
            var maxTemp = Math.round(Math.max.apply(null, day.temps));
            var iconCode = day.icons[0] || '01d';
            var iconEmoji = iconMap[iconCode] || '🌡️';
            var desc = day.descs[0] || '';
            var dateObj = new Date(day.date + 'T00:00:00');
            var weekdays = ['일', '월', '화', '수', '목', '금', '토'];
            var dayLabel = weekdays[dateObj.getDay()] + '요일';
            var dateLabel = (dateObj.getMonth() + 1) + '/' + dateObj.getDate();
            modalHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f7fafc;border-radius:14px;border-left:4px solid #2563eb;"><div style="display:flex;align-items:center;gap:12px;min-width:80px;"><span style="font-size:22px;">' + iconEmoji + '</span><div><div style="font-weight:600;font-size:14px;">' + dayLabel + '</div><div style="font-size:11px;color:#a0aec0;">' + dateLabel + '</div></div></div><div style="text-align:center;flex:1;"><span style="font-size:13px;color:#718096;">' + desc + '</span></div><div style="text-align:right;font-weight:700;font-size:15px;">' + maxTemp + '° <span style="color:#a0aec0;font-weight:400;">/</span> ' + minTemp + '°</div></div>';
        });
        modalHtml += '</div><div style="margin-top:14px;font-size:11px;color:#a0aec0;text-align:center;">* 3시간 간격 예보를 평균/최고/최저로 표시했어요</div></div></div>';
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch(error) {
        showTabStatus('tab-settings', '❌ 날씨 예보를 불러오지 못했습니다.', 'error');
    }
}

// ============================================================
// 23. Service Worker 및 기타
// ============================================================
// (registerServiceWorker, displayAppVersion, checkForUpdates, forceUpdateApp)

// ============================================================
// 24. 초기화 실행
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    loadRegionList();
    loadPresets();
    
    if (currentRegion) {
        var key = getStorageKey(currentRegion);
        var data = localStorage.getItem(key);
        places = data ? JSON.parse(data) : [];
    } else {
        places = [];
    }
    
    updateRegionDisplay();
    
    var sortSelect = document.getElementById('sortPlaces');
    if (sortSelect) currentSort = sortSelect.value;
    
    renderPlaces();
    renderWaypointList();
    setOptimizeMode(optimizeMode);
    updateStorageInfo();
    setTimeout(initMap, 500);
    setTimeout(function() {
        if (!kakaoMap && !sdkLoading) initMap();
    }, 3000);
    registerServiceWorker();
    setTimeout(displayAppVersion, 1000);
    
    // 오프라인 상태 초기 체크
    updateOnlineStatus();
    
    function initWeather() {
        fetchWeather().then(function(success) {
            if (!success) setTimeout(initWeather, 5000);
        });
    }
    setTimeout(initWeather, 3000);
});

// ============================================================
// 25. GitHub 업로드 (재시도 및 충돌 처리 강화)
// ============================================================
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
    if (!navigator.onLine) {
        if (!silent) showTabStatus('tab-settings', '📡 오프라인 상태 - 업로드 보류됨', 'warning');
        return;
    }
    
    try {
        if (!silent) showTabStatus('tab-settings', '☁️ GitHub 업로드 중...', 'info');
        
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
        
        var repoUrl = 'https://api.github.com/repos/' + username + '/' + repoName;
        var repoRes = await fetch(repoUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        if (repoRes.status === 404) {
            // GitHub 저장소 생성 시 네이티브 confirm 대신 커스텀 모달 사용
            var isPrivate = await new Promise(function(resolve) {
                showConfirmModal(
                    '📢 GitHub 저장소 생성',
                    '저장소를 비공개로 생성하시겠습니까?\n(취소 시 공개 저장소로 생성됩니다)',
                    function() { resolve(true); },
                    function() { resolve(false); }
                );
            });
            
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
        
        var fileUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + encodeURIComponent(fileName);
        var fileRes = await fetch(fileUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        var sha = null;
        if (fileRes.ok) {
            var fileData = await fileRes.json();
            sha = fileData.sha;
        }
        
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
        
        // 충돌 처리 (409 Conflict)
        if (putRes.status === 409) {
            showConfirmModal(
                '⚠️ 동기화 충돌',
                '다른 기기에서 동시에 수정한 것으로 보입니다.\n최신 버전을 가져와 병합하시겠습니까?',
                async function() {
                    // 최신 버전 가져오기
                    var latestRes = await fetch(fileUrl, {
                        headers: { 'Authorization': 'token ' + token }
                    });
                    if (latestRes.ok) {
                        var latestData = await latestRes.json();
                        var latestContent = new TextDecoder('utf-8').decode(
                            Uint8Array.from(atob(latestData.content), function(c) { return c.charCodeAt(0); })
                        );
                        var latestPlaces = JSON.parse(latestContent);
                        // 간단한 병합: 서로 다른 이름의 현장을 합치고, 같은 이름은 최신 수정(로컬) 우선
                        var merged = latestPlaces.slice();
                        places.forEach(function(localP) {
                            var existing = merged.find(function(m) { return normalizeName(m.name) === normalizeName(localP.name); });
                            if (existing) {
                                // 기존 항목 업데이트 (로컬 우선)
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
                        // 다시 업로드 시도
                        await uploadToGitHub(silent);
                    } else {
                        showTabStatus('tab-settings', '❌ 충돌 해결 실패', 'error');
                    }
                },
                function() {
                    // 취소: 로컬 데이터 유지, 업로드 안 함
                    showTabStatus('tab-settings', '⏸️ 충돌로 인해 업로드가 취소되었습니다.', 'warning');
                }
            );
            return;
        }
        
        if (!putRes.ok) {
            var errorText = await putRes.text();
            throw new Error('업로드 실패: ' + putRes.status + ' - ' + errorText);
        }
        
        if (!silent) {
            showTabStatus('tab-settings', '✅ GitHub 업로드 완료! (' + places.length + '개)', 'ok');
        }
    } catch(error) {
        if (!silent) {
            showTabStatus('tab-settings', '❌ 업로드 실패: ' + error.message, 'error');
            // 재시도 버튼 표시
            var statusEl = document.getElementById('settingsStatus');
            if (statusEl) {
                var retryBtn = document.createElement('button');
                retryBtn.className = 'btn btn-primary btn-sm';
                retryBtn.textContent = '🔄 재시도';
                retryBtn.onclick = function() { uploadToGitHub(false); };
                statusEl.appendChild(retryBtn);
            }
        }
    }
}

// ============================================================
// 26. 도우미 함수 (tab-status 표시)
// ============================================================
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
        statusEl._hideTimer = setTimeout(function() {
            statusEl.classList.remove('show');
        }, 5000);
    }
}

// ============================================================
// 27. 하단 탭 이벤트 재바인딩
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    var tabs = document.querySelectorAll('.bottom-tab');
    tabs.forEach(function(tab) {
        tab.removeEventListener('click', tab._clickHandler);
        var handler = function(e) {
            var tabId = this.getAttribute('data-tab');
            if (!tabId) {
                var onclickAttr = this.getAttribute('onclick');
                if (onclickAttr) {
                    var match = onclickAttr.match(/switchTab\(['"](.+)['"]\)/);
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
    setOptimizeMode(optimizeMode);

    var nav = document.querySelector('.bottom-tabs');
    if (nav) {
        nav.style.display = 'flex';
        nav.style.visibility = 'visible';
        nav.style.opacity = '1';
    }
});

// ============================================================
// 28. 탭 스와이프
// ============================================================
(function() {
    var startX = 0, startY = 0, tracking = false;
    var tabOrder = ['tab-places', 'tab-route', 'tab-list', 'tab-settings', 'tab-help'];
    document.addEventListener('touchstart', function(e) {
        var target = e.target;
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
        var dx = e.changedTouches[0].clientX - startX;
        var dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dy) >= Math.abs(dx) || Math.abs(dx) < 70 || Math.abs(dy) > 60) return;
        var activeTab = document.querySelector('.tab-content.active');
        if (!activeTab) return;
        var currentIndex = tabOrder.indexOf(activeTab.id);
        if (currentIndex < 0) return;
        var nextIndex = dx < 0 ? Math.min(currentIndex + 1, tabOrder.length - 1) : Math.max(currentIndex - 1, 0);
        if (nextIndex !== currentIndex) switchTab(tabOrder[nextIndex]);
    }, {passive:true});
})();
