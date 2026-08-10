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
    '서울': { lat: 37.5665, lng: 126.9780 },
    '부산': { lat: 35.1796, lng: 129.0756 },
    '제주': { lat: 33.4996, lng: 126.5312 },
    '강남': { lat: 37.5172, lng: 127.0473 },
    '서초': { lat: 37.4837, lng: 127.0326 },
    '종로': { lat: 37.5727, lng: 126.9791 },
    '마포': { lat: 37.5663, lng: 126.9011 },
    '수원': { lat: 37.2636, lng: 127.0286 },
    '인천': { lat: 37.4563, lng: 126.7052 },
    '대전': { lat: 36.3504, lng: 127.3845 },
    '대구': { lat: 35.8714, lng: 128.6014 },
    '광주': { lat: 35.1595, lng: 126.8526 },
    '울산': { lat: 35.5384, lng: 129.3114 },
    '세종': { lat: 36.4801, lng: 127.2890 }
};

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
            if (kakaoMap) { kakaoMap.relayout(); } 
            else { initMap(); }
        }, 100);
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
    clearTimeout(autoSyncTimer);
    currentRegion = region;
    localStorage.setItem(SELECTED_REGION_KEY, region);
    var key = getStorageKey(region);
    var data = localStorage.getItem(key);
    places = data ? JSON.parse(data) : [];
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
    document.getElementById('startInfo').textContent = '⏳ 출발지를 검색하거나 현재 위치로 설정하세요';
    document.getElementById('startInfo').style.color = '#718096';
    document.getElementById('placeCount').textContent = '0개소';
    document.getElementById('totalDistance').textContent = '0.00 km';
    document.getElementById('totalTime').textContent = '0 분';
    document.getElementById('optimizeMode').textContent = '-';
    document.getElementById('routeList').innerHTML = '';
    if (kakaoMap) {
        var center = getRegionCenter(region);
        kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
        kakaoMap.setLevel(5);
    }
    var activeTab = document.querySelector('.tab-content.active');
    if (activeTab) showTabStatus(activeTab.id, '📍 ' + region + ' 지역으로 전환됨', 'info');
    fetchWeather();
}

function addRegion() {
    var name = prompt('새 지역명을 입력하세요:', '');
    if (name && name.trim()) {
        var region = name.trim().replace(/[\/\\:*?"<>|]/g, '');
        if (!region) { showTabStatus('tab-settings', '⚠️ 사용할 수 없는 지역명입니다.', 'warning'); return; }
        var select = document.getElementById('regionSelect');
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === region) { showTabStatus('tab-settings', '⚠️ 이미 존재하는 지역입니다.', 'warning'); return; }
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
    }
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
// 6. 검색 및 출발지/경유지 관리
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
    } catch(e) { return []; }
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

function toggleMultiSelect() {
    multiSelectMode = document.getElementById('multiSelectMode').checked;
    if (!multiSelectMode) {
        selectedWaypoints = [];
        document.getElementById('waypointSearchResults').style.display = 'none';
    }
}

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
    container.querySelectorAll('.result-item').forEach(function(el) {
        var cb = el.querySelector('.result-check');
        if (cb) {
            cb.checked = selectedWaypoints.some(function(w) { return w.name === el.dataset.name; });
        }
    });
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

function searchStartPoint(query) {
    var container = document.getElementById('startSearchResults');
    if (!query || query.length === 0) {
        var recent = getRecentStartPoints();
        if (recent.length === 0) { container.style.display = 'none'; return; }
        var html = '';
        for (var i = 0; i < recent.length; i++) {
            var item = recent[i];
            html += '<div class="result-item" onclick="selectStartPoint(\'' + escapeHtml(item.name) + '\', \'' + escapeHtml(item.address) + '\', ' + item.lat + ', ' + item.lng + ')">';
            html += '<div>🕐 ' + escapeHtml(item.name) + ' <span style="font-size:10px;color:#a0aec0;">최근</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address) + '</div></div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        return;
    }
    if (query.length < 2) { container.style.display = 'none'; return; }
    clearTimeout(window._startSearchTimer);
    window._startSearchTimer = setTimeout(async function() {
        var placeResults = [];
        var lowerQuery = query.toLowerCase();
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (p.name.toLowerCase().includes(lowerQuery) || (p.address && p.address.toLowerCase().includes(lowerQuery))) {
                placeResults.push({ place_name: p.name, address_name: p.address || '(주소 없음)', y: p.lat || 0, x: p.lng || 0, _source: '현장리스트' });
            }
        }
        placeResults = placeResults.slice(0, 5);
        var kakaoResults = await searchKakaoPlaces(query);
        kakaoResults = kakaoResults.slice(0, 5);
        var allResults = [];
        var seenNames = {};
        placeResults.concat(kakaoResults).forEach(function(item) {
            var key = item.place_name + '|' + item.address_name;
            if (!seenNames[key]) { seenNames[key] = true; allResults.push(item); }
        });
        renderSearchResults(container, allResults, 'selectStartPoint', false);
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
        clearRouteMarkers();
        clearSingleMarker();
        isShowingRouteMarkers = false;
        addRouteMarker(startPoint.lat, startPoint.lng, '🚩 ' + name, true);
        kakaoMap.setCenter(new kakao.maps.LatLng(startPoint.lat, startPoint.lng));
        kakaoMap.setLevel(5);
    }
    showTabStatus('tab-places', '✅ 출발지 "' + name + '" 설정 완료', 'ok');
}

function setCurrentLocation() {
    if (!navigator.geolocation) {
        showTabStatus('tab-places', '⚠️ 이 브라우저는 GPS를 지원하지 않습니다.', 'warning');
        return;
    }
    showTabStatus('tab-places', '📍 GPS 위치 가져오는 중...', 'info');
    navigator.geolocation.getCurrentPosition(
        function(position) {
            var lat = position.coords.latitude;
            var lng = position.coords.longitude;
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
                        if (doc.road_address) address = doc.road_address.address_name;
                        else if (doc.address) address = doc.address.address_name;
                    }
                    selectStartPoint('현재 위치', address, lat, lng);
                    showTabStatus('tab-places', '✅ 현재 위치로 출발지 설정됨', 'ok');
                })
                .catch(function() {
                    selectStartPoint('현재 위치', 'GPS 좌표', lat, lng);
                    showTabStatus('tab-places', '✅ 현재 위치로 출발지 설정됨', 'ok');
                });
            } else {
                selectStartPoint('현재 위치', 'GPS 좌표', lat, lng);
                showTabStatus('tab-places', '✅ 현재 위치로 출발지 설정됨', 'ok');
            }
        },
        function(error) {
            var msg = 'GPS 위치를 가져올 수 없습니다.';
            if (error.code === 1) msg = '⚠️ GPS 권한을 허용해주세요.';
            else if (error.code === 2) msg = '⚠️ GPS 신호를 잡을 수 없습니다.';
            else if (error.code === 3) msg = '⚠️ GPS 요청 시간이 초과되었습니다.';
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
            showTabStatus('tab-places', '선택된 경유지가 없습니다.', 'warning');
            return;
        }
        var added = 0;
        var errors = 0;
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
                errors++;
            }
        }
        renderWaypointList();
        selectedWaypoints = [];
        document.getElementById('waypointSearchResults').style.display = 'none';
        document.getElementById('multiSelectMode').checked = false;
        multiSelectMode = false;
        // 버튼 텍스트 복원
        var addBtn = document.querySelector('#tab-places .btn-success');
        if (addBtn) addBtn.textContent = '추가';
        
        var msg = '✅ ' + added + '개 경유지 추가됨';
        if (errors > 0) msg += ' (' + errors + '개 중복 제외)';
        showTabStatus('tab-places', msg, 'ok');
        return;
    }
    
    // ===== 일반 추가 모드 =====
    if (!name) {
        showTabStatus('tab-places', '경유지를 입력하세요.', 'warning');
        return;
    }
    if (waypoints.length >= 15) {
        showTabStatus('tab-places', '⚠️ 최대 15개까지 가능', 'warning');
        return;
    }
    if (waypoints.some(function(ex) { return ex.name === name; })) {
        showTabStatus('tab-places', '⚠️ "' + name + '"은(는) 이미 경유지에 있습니다.', 'warning');
        return;
    }
    waypoints.push({ name: name, lat: 0, lng: 0 });
    renderWaypointList();
    input.value = '';
    input.focus();
    document.getElementById('waypointSearchResults').style.display = 'none';
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
            onEnd: function(evt) {
                var oldIndex = evt.oldIndex, newIndex = evt.newIndex;
                if (oldIndex === newIndex) return;
                var moved = waypoints.splice(oldIndex, 1)[0];
                waypoints.splice(newIndex, 0, moved);
                renderWaypointList();
                showTabStatus('tab-places', '🔄 경유지 순서 변경됨', 'info');
                if (startPoint && waypoints.length > 0) setTimeout(runOptimize, 300);
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
    if (sortSelect) currentSort = sortSelect.value;
    renderPlaces();
}

function getSortedPlaces() {
    var sorted = [...places];
    if (currentSort === 'name-asc') {
        sorted.sort(function(a, b) {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return a.name.localeCompare(b.name, 'ko');
        });
    } else if (currentSort === 'name-desc') {
        sorted.sort(function(a, b) {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return b.name.localeCompare(a.name, 'ko');
        });
    } else if (currentSort === 'favorite') {
        sorted.sort(function(a, b) {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return a.name.localeCompare(b.name, 'ko');
        });
    }
    return sorted;
}

function renderPlaces(filtered) {
    var list = document.getElementById('placeList');
    var data = filtered || getSortedPlaces();
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
        html += '<div class="place-item" onclick="openEditModal(\'' + p.id + '\')" title="클릭하여 편집">';
        html += '<div class="info"><span class="name">' + escapeHtml(p.name) + '</span>';
        html += '<span class="addr">' + escapeHtml(shortAddr) + '</span>';
        html += remarkDisplay;
        html += '</div><div class="actions" onclick="event.stopPropagation();">';
        html += '<button class="map" onclick="showPlaceOnMap(\'' + p.id + '\')" title="지도 보기">📍</button>';
        html += '<button class="add" onclick="addWaypointFromList(\'' + p.id + '\')" title="경유지 추가">➕</button>';
        html += '<button class="del" onclick="deletePlace(\'' + p.id + '\')" title="삭제">🗑️</button>';
        html += '<button class="' + starClass + '" onclick="toggleFavorite(\'' + p.id + '\')" title="즐겨찾기">' + starIcon + '</button>';
        html += '</div></div>';
    }
    list.innerHTML = html;
}

function searchPlaces() {
    var keyword = document.getElementById('searchPlace').value.trim();
    if (!keyword) { renderPlaces(); return; }
    var results = places.filter(function(p) {
        return p.name.includes(keyword) || (p.address && p.address.includes(keyword));
    });
    var sortedResults = [...results];
    if (currentSort === 'name-asc') {
        sortedResults.sort(function(a, b) {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return a.name.localeCompare(b.name, 'ko');
        });
    } else if (currentSort === 'name-desc') {
        sortedResults.sort(function(a, b) {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return b.name.localeCompare(a.name, 'ko');
        });
    } else if (currentSort === 'favorite') {
        sortedResults.sort(function(a, b) {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return a.name.localeCompare(b.name, 'ko');
        });
    }
    renderPlaces(sortedResults);
}

function addPlace() {
    var name = document.getElementById('newPlaceName').value.trim();
    var address = document.getElementById('newPlaceAddr').value.trim();
    var remark = document.getElementById('newPlaceRemark').value.trim();
    if (!name) { showTabStatus('tab-list', '현장명을 입력하세요.', 'warning'); return; }
    if (places.some(function(p) { return normalizeName(p.name) === normalizeName(name); })) {
        showTabStatus('tab-list', '⚠️ 이미 존재하는 현장명입니다.', 'warning');
        return;
    }
    var lat = 0, lng = 0, fullAddress = address;
    var restKey = settings.kakaoRestKey;
    if (address && restKey) {
        geocodeAddress(address, restKey).then(function(geo) {
            if (geo) {
                lat = geo.lat; lng = geo.lng; fullAddress = geo.address || address;
            }
            savePlace(name, fullAddress, lat, lng, remark);
        });
    } else {
        savePlace(name, fullAddress, lat, lng, remark);
    }
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
            var lat = wp.lat || 0, lng = wp.lng || 0;
            if (!lat || !lng) {
                var found = places.find(function(p) { return p.name === wp.name; });
                if (found && found.lat && found.lng) { lat = found.lat; lng = found.lng; }
                else {
                    var geo = await geocodeAddress(wp.name, restKey, 1);
                    if (geo) { lat = geo.lat; lng = geo.lng; 
                        var place = places.find(function(p) { return p.name === wp.name; });
                        if (place) { place.lat = lat; place.lng = lng; }
                    } else { showTabStatus('tab-places', '❌ "' + wp.name + '" 변환 실패', 'error'); hasError = true; break; }
                }
            }
            wpCoords.push({ name: wp.name, lat: lat, lng: lng, address: wp.address || '' });
        }
        if (hasError) { savePlaces(); return; }
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
        clearRouteMarkers();
        clearSingleMarker();
        isShowingRouteMarkers = true;
        var allPoints = [{ name: startPoint.name, lat: startPoint.lat, lng: startPoint.lng }].concat(sorted);
        addRouteMarker(startPoint.lat, startPoint.lng, '🚩 ' + startPoint.name, true);
        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            addRouteMarker(p.lat, p.lng, (i + 1) + '. ' + p.name, false);
        }
        var routeData = await callKakaoMobilityRoute(allPoints, restKey);
        if (routeData) drawRoadRoute(routeData);
        else { drawRoute(allPoints); showTabStatus('tab-route', '⚠️ 도로 경로를 불러올 수 없어 직선으로 표시합니다.', 'warning'); }
        var totalKm = 0, totalMin = 0;
        if (routeData && routeData.routes && routeData.routes[0]) {
            var route = routeData.routes[0];
            totalKm = route.summary ? route.summary.distance / 1000 : 0;
            totalMin = route.summary ? route.summary.duration / 60 : 0;
        } else {
            for (var i = 0; i < allPoints.length - 1; i++) {
                var p1 = allPoints[i], p2 = allPoints[i + 1];
                var dist = haversineKm(p1.lat, p1.lng, p2.lat, p2.lng);
                totalKm += dist; totalMin += dist * 1.5;
            }
        }
        totalKm = parseFloat(totalKm.toFixed(2));
        totalMin = Math.round(totalMin);
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
        if (kakaoMap && startPoint && startPoint.lat && startPoint.lng) {
            kakaoMap.setCenter(new kakao.maps.LatLng(startPoint.lat, startPoint.lng));
            kakaoMap.setLevel(5);
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
    html += '<div class="route-item route-start" data-no-drag="true" data-lat="' + startPoint.lat + '" data-lng="' + startPoint.lng + '" data-name="' + escapeHtml(startPoint.name) + '" onclick="moveToRoutePoint(this)">';
    html += '<div class="idx" style="background:#4a5568;color:white;">🚩</div>';
    html += '<div class="info"><div class="name">' + escapeHtml(startPoint.name) + '</div><div class="addr">' + escapeHtml(startPoint.address || '') + '</div></div></div>';
    var colors = ['#FF6B6B','#FF9F43','#FECA57','#48DBFB','#0ABDE3','#10AC84','#EE5A24','#5F27CD','#1DD1A1','#F368E0','#00D2D3','#54A0FF','#FF9FF3','#F368E0'];
    for (var i = 0; i < sorted.length; i++) {
        var p = sorted[i];
        var prev = i === 0 ? startPoint : sorted[i - 1];
        var segDist = haversineKm(prev.lat, prev.lng, p.lat, p.lng);
        var segTime = Math.round(segDist / 40 * 60);
        var color = colors[i % colors.length];
        var addrDisplay = p.address ? '<div class="addr">' + escapeHtml(shortenAddress(p.address)) + '</div>' : '';
        var remarkDisplay = p.remark ? '<span class="remark">' + escapeHtml(p.remark) + '</span>' : '';
        html += '<div class="route-item sortable-item" data-index="' + i + '" data-lat="' + p.lat + '" data-lng="' + p.lng + '" data-name="' + escapeHtml(p.name) + '" onclick="moveToRoutePoint(this)" style="cursor:grab;border-left-color:' + color + ';">';
        html += '<div class="idx" style="background:' + color + ';color:white;">' + (i + 1) + '</div>';
        html += '<div class="info"><div class="name">' + escapeHtml(p.name) + ' ' + remarkDisplay + '</div>' + addrDisplay + '</div>';
        html += '<div class="dist" style="text-align:right;font-size:12px;font-weight:600;flex-shrink:0;min-width:70px;color:' + color + ';">';
        html += segDist.toFixed(1) + 'km<br><span style="font-size:10px;color:#718096;">' + segTime + '분</span></div>';
        html += '<span style="color:#a0aec0;font-size:12px;margin-left:4px;">⠿</span></div>';
    }
    html += '</div>';
    container.innerHTML = html;
    var sortableEl = document.getElementById('routeSortable');
    if (sortableEl && window.Sortable) {
        if (window._routeSortable) window._routeSortable.destroy();
        window._routeSortable = new Sortable(sortableEl, {
            handle: '.sortable-item',
            animation: 150,
            onEnd: function(evt) {
                var oldIndex = evt.oldIndex - 1, newIndex = evt.newIndex - 1;
                if (oldIndex === newIndex || oldIndex < 0 || newIndex < 0) return;
                var moved = routeResult.places.splice(oldIndex, 1)[0];
                routeResult.places.splice(newIndex, 0, moved);
                showRouteList();
                var allPoints = [{ name: startPoint.name, lat: startPoint.lat, lng: startPoint.lng }].concat(routeResult.places);
                clearRouteMarkers();
                addRouteMarker(startPoint.lat, startPoint.lng, '🚩 ' + startPoint.name, true);
                for (var i = 0; i < routeResult.places.length; i++) {
                    var p = routeResult.places[i];
                    addRouteMarker(p.lat, p.lng, (i + 1) + '. ' + p.name, false);
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
    if (!toName || !toLat || !toLng) { showTabStatus('tab-route', '⚠️ 목적지 정보가 없습니다.', 'warning'); return; }
    if (!fromName || !fromLat || !fromLng) { showTabStatus('tab-route', '⚠️ 출발지 정보가 없습니다.', 'warning'); return; }
    var url = 'https://map.kakao.com/link/from/' + encodeURIComponent(fromName) + ',' + fromLat + ',' + fromLng + '/to/' + encodeURIComponent(toName) + ',' + toLat + ',' + toLng;
    window.open(url, '_blank');
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
        var totalBounds = new kakao.maps.LatLngBounds();
        var sectionColors = ['#FF6B6B','#FF9F43','#FECA57','#48DBFB','#0ABDE3','#10AC84','#EE5A24','#5F27CD','#1DD1A1','#F368E0','#00D2D3','#54A0FF','#FF9FF3','#F368E0'];
        var sectionIndex = 0;
        for (var s = 0; s < route.sections.length; s++) {
            var section = route.sections[s];
            if (!section.roads) continue;
            var sectionPath = [];
            for (var r = 0; r < section.roads.length; r++) {
                var road = section.roads[r];
                if (road.vertexes) {
                    for (var v = 0; v < road.vertexes.length; v += 2) {
                        var lng = road.vertexes[v], lat = road.vertexes[v + 1];
                        if (lat && lng) { var point = new kakao.maps.LatLng(lat, lng); sectionPath.push(point); totalBounds.extend(point); }
                    }
                }
            }
            if (sectionPath.length > 1) {
                var color = sectionColors[sectionIndex % sectionColors.length];
                var polyline = new kakao.maps.Polyline({ map: kakaoMap, path: sectionPath, strokeWeight: 6, strokeColor: color, strokeOpacity: 0.85, strokeStyle: 'solid' });
                var glowPolyline = new kakao.maps.Polyline({ map: kakaoMap, path: sectionPath, strokeWeight: 12, strokeColor: color, strokeOpacity: 0.2, strokeStyle: 'solid' });
                if (!window._sectionPolylines) window._sectionPolylines = [];
                window._sectionPolylines.push(polyline);
                window._sectionPolylines.push(glowPolyline);
                sectionIndex++;
            }
        }
        kakaoMap.setBounds(totalBounds);
    } catch(e) { console.error('도로 경로 그리기 실패:', e); }
}

function drawRoute(path) {
    if (!kakaoMap || !path || path.length < 2) return;
    try {
        if (kakaoPolyline) { kakaoPolyline.setMap(null); kakaoPolyline = null; }
        var colors = ['#FF6B6B','#FF9F43','#FECA57','#48DBFB','#0ABDE3','#10AC84','#EE5A24','#5F27CD','#1DD1A1','#F368E0'];
        var bounds = new kakao.maps.LatLngBounds();
        var allPoints = [];
        for (var i = 0; i < path.length; i++) {
            var p = path[i];
            var latlng = new kakao.maps.LatLng(p.lat, p.lng);
            allPoints.push(latlng);
            bounds.extend(latlng);
        }
        for (var i = 0; i < allPoints.length - 1; i++) {
            var color = colors[i % colors.length];
            var polyline = new kakao.maps.Polyline({ map: kakaoMap, path: [allPoints[i], allPoints[i + 1]], strokeWeight: 6, strokeColor: color, strokeOpacity: 0.85, strokeStyle: 'solid' });
            if (!window._sectionPolylines) window._sectionPolylines = [];
            window._sectionPolylines.push(polyline);
        }
        kakaoMap.setBounds(bounds);
    } catch(e) { console.error('경로 그리기 실패:', e); }
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
        if ('ontouchstart' in window) { kakaoMap.setDraggable(true); kakaoMap.setZoomable(true); }
        var zoomControl = new kakao.maps.ZoomControl();
        kakaoMap.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);
        showTabStatus('tab-route', '🗺️ 지도 로드 완료', 'ok');
    } catch(e) {
        console.error('지도 생성 실패:', e);
        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;border-radius:12px;padding:20px;text-align:center;">❌ 지도 생성 실패</div>';
        showTabStatus('tab-settings', '⚠️ 지도 생성 실패', 'error');
    }
}

function addRouteMarker(lat, lng, title, isStart) {
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
            content = '<div style="background:white;padding:6px 14px;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.15);font-size:13px;font-weight:700;color:#1a202c;white-space:nowrap;border:2px solid #2d3748;">🚩 ' + escapeHtml(title) + '</div>';
        } else {
            var colors = ['#FF6B6B','#FF9F43','#FECA57','#48DBFB','#0ABDE3','#10AC84','#EE5A24','#5F27CD','#1DD1A1','#F368E0','#00D2D3','#54A0FF','#FF9FF3','#F368E0'];
            var idx = routeMarkers.length;
            var color = colors[idx % colors.length];
            content = '<div style="background:' + color + ';padding:6px 14px;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.15);font-size:13px;font-weight:700;color:white;white-space:nowrap;border:1px solid rgba(255,255,255,0.3);">📍 ' + escapeHtml(title) + '</div>';
        }
        var customOverlay = new kakao.maps.CustomOverlay({ map: kakaoMap, position: pos, content: content, yAnchor: 1.4, xAnchor: 0.5 });
        if (isStart) startMarker = customOverlay;
        routeMarkers.push(customOverlay);
        return customOverlay;
    } catch(e) { console.error('마커 추가 실패:', e); }
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
    try {
        if (!silent) showTabStatus('tab-settings', '☁️ GitHub 업로드 중...', 'info');
        var userRes = await fetch('https://api.github.com/user', { headers: { 'Authorization': 'token ' + token } });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        var user = await userRes.json();
        var username = user.login;
        var repoName = 'route-data';
        var fileName = currentRegion + '.json';
        var content = JSON.stringify(places, null, 2);
        var b64Content = utf8ToBase64(content);
        var repoUrl = 'https://api.github.com/repos/' + username + '/' + repoName;
        var repoRes = await fetch(repoUrl, { headers: { 'Authorization': 'token ' + token } });
        if (repoRes.status === 404) {
            var isPrivate = confirm('📢 GitHub 저장소를 비공개로 생성하시겠습니까?\n(취소 시 공개 저장소로 생성됩니다)');
            var createRes = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: repoName, description: '경로 최적화 데이터 저장소', private: isPrivate, auto_init: true })
            });
            if (!createRes.ok) throw new Error('저장소 생성 실패');
            if (!silent) showTabStatus('tab-settings', '✅ 저장소 생성됨: ' + repoName + (isPrivate ? ' (비공개)' : ' (공개)'), 'ok');
            await new Promise(resolve => setTimeout(resolve, 3000));
        } else if (!repoRes.ok) throw new Error('저장소 확인 실패: ' + repoRes.status);
        var fileUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + encodeURIComponent(fileName);
        var fileRes = await fetch(fileUrl, { headers: { 'Authorization': 'token ' + token } });
        var sha = null;
        if (fileRes.ok) { var fileData = await fileRes.json(); sha = fileData.sha; }
        var putData = { message: 'Auto sync: ' + currentRegion + ' (' + new Date().toLocaleString() + ')', content: b64Content };
        if (sha) putData.sha = sha;
        var putRes = await fetch(fileUrl, {
            method: 'PUT',
            headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify(putData)
        });
        if (!putRes.ok) throw new Error('업로드 실패');
        if (!silent) showTabStatus('tab-settings', '✅ GitHub 업로드 완료! (' + places.length + '개)', 'ok');
    } catch(error) {
        console.error('GitHub 업로드 오류:', error);
        if (!silent) showTabStatus('tab-settings', '❌ 업로드 실패: ' + error.message, 'error');
    }
}

async function downloadFromGitHub() {
    var token = settings.githubToken;
    if (!token) { showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning'); return; }
    var region = currentRegion;
    if (!region) {
        region = prompt('다운로드할 지역명을 입력하세요:', '');
        if (!region || !region.trim()) { showTabStatus('tab-settings', '⚠️ 지역명이 필요합니다.', 'warning'); return; }
        region = region.trim().replace(/[\/\\:*?"<>|]/g, '');
        if (!region) { showTabStatus('tab-settings', '⚠️ 사용할 수 없는 지역명입니다.', 'warning'); return; }
        var select = document.getElementById('regionSelect');
        var exists = false;
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === region) { exists = true; break; }
        }
        if (!exists) {
            var key = getStorageKey(region);
            localStorage.setItem(key, JSON.stringify([]));
            var opt = document.createElement('option');
            opt.value = region; opt.textContent = region;
            select.appendChild(opt);
            select.value = region;
            currentRegion = region;
            localStorage.setItem(SELECTED_REGION_KEY, region);
        } else {
            select.value = region;
            currentRegion = region;
            localStorage.setItem(SELECTED_REGION_KEY, region);
        }
    }
    try {
        showTabStatus('tab-settings', '☁️ GitHub 다운로드 중...', 'info');
        var userRes = await fetch('https://api.github.com/user', { headers: { 'Authorization': 'token ' + token } });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        var user = await userRes.json();
        var username = user.login;
        var repoName = 'route-data';
        var fileName = region + '.json';
        var fileUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + encodeURIComponent(fileName);
        var fileRes = await fetch(fileUrl, { headers: { 'Authorization': 'token ' + token }, cache: 'no-store' });
        if (fileRes.status === 404) {
            showTabStatus('tab-settings', '📭 GitHub에 "' + region + '" 지역의 데이터가 없습니다.', 'warning');
            return;
        }
        if (!fileRes.ok) throw new Error('다운로드 실패');
        var data = await fileRes.json();
        var binaryString = atob(data.content);
        var bytes = new Uint8Array(binaryString.length);
        for (var i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        var content = new TextDecoder('utf-8').decode(bytes);
        var loadedPlaces = JSON.parse(content);
        if (!confirm('현재 ' + places.length + '개 데이터를 ' + loadedPlaces.length + '개로 덮어쓰시겠습니까?')) return;
        places = loadedPlaces;
        savePlaces();
        showTabStatus('tab-settings', '✅ GitHub 다운로드 완료! (' + loadedPlaces.length + '개)', 'ok');
    } catch(error) {
        console.error('GitHub 다운로드 오류:', error);
        showTabStatus('tab-settings', '❌ 다운로드 실패: ' + error.message, 'error');
    }
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
    loadSettings();
    loadRegionList();
    loadPresets();
    if (currentRegion) {
        var key = getStorageKey(currentRegion);
        var data = localStorage.getItem(key);
        places = data ? JSON.parse(data) : [];
    } else { places = []; }
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
});
