// ============================================================
// 경로 최적화 PWA - VBA 완벽 포팅 (보안 및 성능 개선)
// ============================================================

// --- 저장소 키 ---
const STORAGE_KEY_PREFIX = 'places_';
const SELECTED_REGION_KEY = 'selectedRegion';
const SETTINGS_KEY = 'app_settings';
const OPTIMIZE_MODE_KEY = 'optimizeMode';

// --- 지역별 중심 좌표 ---
const REGION_CENTERS = {
    '서울': { lat: 37.5665, lng: 126.9780 },
    '부산': { lat: 35.1796, lng: 129.0756 },
    '제주': { lat: 33.4996, lng: 126.5312 },
    '용산': { lat: 37.5326, lng: 126.9900 },
    '강남': { lat: 37.5172, lng: 127.0473 },
    '서초': { lat: 37.4837, lng: 127.0326 },
    '종로': { lat: 37.5727, lng: 126.9791 },
    '중구': { lat: 37.5599, lng: 126.9978 },
    '마포': { lat: 37.5663, lng: 126.9011 },
    '영등포': { lat: 37.5264, lng: 126.8964 },
    '동작': { lat: 37.5124, lng: 126.9393 },
    '관악': { lat: 37.4782, lng: 126.9514 },
    '금천': { lat: 37.4569, lng: 126.8953 },
    '구로': { lat: 37.4951, lng: 126.8883 },
    '양천': { lat: 37.5170, lng: 126.8660 },
    '강서': { lat: 37.5509, lng: 126.8495 },
    '노원': { lat: 37.6542, lng: 127.0568 },
    '도봉': { lat: 37.6688, lng: 127.0471 },
    '성북': { lat: 37.5894, lng: 127.0167 },
    '동대문': { lat: 37.5744, lng: 127.0396 },
    '성동': { lat: 37.5632, lng: 127.0369 },
    '광진': { lat: 37.5385, lng: 127.0822 },
    '송파': { lat: 37.5146, lng: 127.1066 },
    '강동': { lat: 37.5302, lng: 127.1235 },
    '수원': { lat: 37.2636, lng: 127.0286 },
    '인천': { lat: 37.4563, lng: 126.7052 },
    '대전': { lat: 36.3504, lng: 127.3845 },
    '대구': { lat: 35.8714, lng: 128.6014 },
    '광주': { lat: 35.1595, lng: 126.8526 },
    '울산': { lat: 35.5384, lng: 129.3114 },
    '세종': { lat: 36.4801, lng: 127.2890 }
};

// --- 상태 ---
let currentRegion = localStorage.getItem(SELECTED_REGION_KEY) || '서울';
let places = [];
let waypoints = [];
let routeResult = null;
let kakaoMap = null;
let kakaoPolyline = null;
let startPoint = null;
let settings = {};
let optimizeMode = localStorage.getItem(OPTIMIZE_MODE_KEY) || 'Nearest';

// --- 검색 상태 ---
let startSearchTimeout = null;
let waypointSearchTimeout = null;
let addrSearchTimeout = null;
const searchIndexState = {
    selected: -1,
    waypoint: -1,
    addr: -1
};

// --- 마커/인포윈도우 ---
let placeMarkers = [];
let placeInfoWindows = [];
let routeMarkers = [];
let routeInfoWindows = [];
let singlePlaceMarker = null;
let singlePlaceInfoWindow = null;
let autoSyncTimer = null;
let sdkLoading = false;
let isShowingRouteMarkers = false;

// ============================================================
// 0. 보안 유틸리티
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

// ============================================================
// 1. 탭 전환
// ============================================================

function switchTab(tabId) {
    var contents = document.querySelectorAll('.tab-content');
    for (var i = 0; i < contents.length; i++) {
        contents[i].classList.remove('active');
    }
    
    var tabs = document.querySelectorAll('.bottom-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }
    
    var targetContent = document.getElementById(tabId);
    if (targetContent) {
        targetContent.classList.add('active');
    }
    
    var targetTab = document.querySelector('.bottom-tab[data-tab="' + tabId + '"]');
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    if (tabId === 'tab-route') {
        setTimeout(function() {
            if (kakaoMap) {
                kakaoMap.relayout();
                kakaoMap.setDraggable(true);
                kakaoMap.setZoomable(true);
            } else {
                initMap();
            }
        }, 100);
    }
    
    if (tabId === 'tab-list') {
        renderPlaces();
    }
}

// ============================================================
// 2. 지역 중심 좌표 가져오기
// ============================================================

function getRegionCenter(region) {
    if (REGION_CENTERS[region]) {
        return REGION_CENTERS[region];
    }
    for (var key in REGION_CENTERS) {
        if (region.includes(key) || key.includes(region)) {
            return REGION_CENTERS[key];
        }
    }
    showTabStatus('tab-settings', 'ℹ️ "' + region + '" 지역의 중심 좌표가 없어 서울 기준으로 표시됩니다.', 'info');
    return { lat: 37.5665, lng: 126.9780 };
}

// ============================================================
// 3. 탭별 상태 표시
// ============================================================

function showTabStatus(tabId, msg, type) {
    var statusEl = document.getElementById(tabId + 'Status');
    if (!statusEl) {
        var tabContent = document.getElementById(tabId);
        if (tabContent) {
            var newStatus = document.createElement('div');
            newStatus.id = tabId + 'Status';
            newStatus.className = 'tab-status';
            tabContent.appendChild(newStatus);
            statusEl = newStatus;
        }
    }
    if (statusEl) {
        statusEl.textContent = msg;
        statusEl.className = 'tab-status show ' + (type || 'info');
        if (type === 'ok' || type === 'success' || type === 'info') {
            clearTimeout(statusEl._hideTimer);
            statusEl._hideTimer = setTimeout(function() {
                statusEl.classList.remove('show');
            }, 5000);
        }
    }
}

// ============================================================
// 4. 설정 관리
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
        } catch (e) {}
    }
}

function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    updateSettingsStatus();
}

function saveGitHubToken() {
    settings.githubToken = document.getElementById('githubToken').value.trim();
    saveSettings();
    showTabStatus('tab-settings', '✅ GitHub 토큰 저장됨', 'ok');
    testGitHubToken();
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

async function testGitHubToken() {
    var token = settings.githubToken || document.getElementById('githubToken').value.trim();
    if (!token) { showTabStatus('tab-settings', '토큰을 입력하세요.', 'warning'); return; }
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
// 5. 저장소 관리
// ============================================================

function getStorageKey(region) {
    return STORAGE_KEY_PREFIX + region;
}

function loadPlaces(region) {
    var key = getStorageKey(region);
    var data = localStorage.getItem(key);
    places = data ? JSON.parse(data) : [];
    renderPlaces();
    updateStorageInfo();
}

function savePlaces() {
    var key = getStorageKey(currentRegion);
    localStorage.setItem(key, JSON.stringify(places));
    renderPlaces();
    updateStorageInfo();
    scheduleAutoSync();
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
        regions = ['서울', '부산', '제주'];
        for (var i = 0; i < regions.length; i++) {
            var key = getStorageKey(regions[i]);
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, JSON.stringify([]));
            }
        }
    }
    
    for (var i = 0; i < regions.length; i++) {
        var opt = document.createElement('option');
        opt.value = regions[i];
        opt.textContent = regions[i];
        select.appendChild(opt);
    }
    
    if (currentRegion && regions.includes(currentRegion)) {
        select.value = currentRegion;
    } else {
        select.value = regions[0];
        currentRegion = regions[0];
        localStorage.setItem(SELECTED_REGION_KEY, currentRegion);
    }
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
    
    document.getElementById('startInfo').textContent = '⏳ 출발지를 검색하고 설정하세요';
    document.getElementById('startInfo').style.color = '#718096';
    document.getElementById('placeCount').textContent = '0개소';
    document.getElementById('totalDistance').textContent = '0.00 km';
    document.getElementById('totalTime').textContent = '0 분';
    document.getElementById('optimizeMode').textContent = '-';
    document.getElementById('routeList').innerHTML = '';
    showTabStatus('tab-settings', '📍 ' + region + ' 지역으로 전환', 'info');
}

function addRegion() {
    var name = prompt('새 지역명을 입력하세요:', '');
    if (name && name.trim()) {
        var region = name.trim().replace(/[\/\\:*?"<>|]/g, '');
        if (!region) {
            showTabStatus('tab-settings', '⚠️ 사용할 수 없는 지역명입니다. (특수문자 제외)', 'warning');
            return;
        }
        var select = document.getElementById('regionSelect');
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
        showTabStatus('tab-settings', '✅ "' + region + '" 지역이 추가되었습니다.', 'ok');
    }
}

function updateStorageInfo() {
    var size = 0;
    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key) size += localStorage.getItem(key).length * 2;
    }
    document.getElementById('storageInfo').textContent = '저장소: ' + (size / 1024).toFixed(1) + ' KB';
}

// ============================================================
// 6. GitHub 자동 동기화
// ============================================================

function scheduleAutoSync() {
    clearTimeout(autoSyncTimer);
    if (!settings.githubToken) return;
    autoSyncTimer = setTimeout(function() {
        uploadToGitHub(true);
    }, 5000);
}

// ============================================================
// 7. GitHub 업로드
// ============================================================

function utf8ToBase64(str) {
    try {
        var bytes = new TextEncoder().encode(str);
        var binString = String.fromCodePoint.apply(null, bytes);
        return btoa(binString);
    } catch (e) {
        return btoa(unescape(encodeURIComponent(str)));
    }
}

async function uploadToGitHub(silent) {
    silent = silent || false;
    var token = settings.githubToken;
    if (!token) {
        if (!silent) showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    
    var btn = document.querySelector('.btn-success[onclick*="uploadToGitHub"]');
    if (btn) btn.disabled = true;
    
    try {
        if (!silent) showTabStatus('tab-settings', '☁️ GitHub 업로드 중...', 'info');
        
        var userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
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
                    private: isPrivate,
                    auto_init: true
                })
            });
            if (!createRes.ok) throw new Error('저장소 생성 실패');
            if (!silent) showTabStatus('tab-settings', '✅ 저장소 생성됨: ' + repoName + (isPrivate ? ' (비공개)' : ' (공개)'), 'ok');
            await new Promise(resolve => setTimeout(resolve, 3000));
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
        if (!putRes.ok) throw new Error('업로드 실패');
        if (!silent) {
            showTabStatus('tab-settings', '✅ GitHub 업로드 완료! (' + places.length + '개)', 'ok');
        }
    } catch (error) {
        console.error('GitHub 업로드 오류:', error);
        if (!silent) {
            showTabStatus('tab-settings', '❌ 업로드 실패: ' + error.message, 'error');
        }
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// 8. GitHub 다운로드
// ============================================================

async function downloadFromGitHub() {
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
        var fileName = currentRegion + '.json';
        var fileUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + encodeURIComponent(fileName);
        var fileRes = await fetch(fileUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        if (fileRes.status === 404) {
            showTabStatus('tab-settings', '📭 GitHub에 저장된 데이터가 없습니다.', 'warning');
            return;
        }
        if (!fileRes.ok) throw new Error('다운로드 실패');
        var data = await fileRes.json();
        var content = decodeURIComponent(escape(atob(data.content)));
        var loadedPlaces = JSON.parse(content);
        if (!confirm('현재 ' + places.length + '개 데이터를 ' + loadedPlaces.length + '개로 덮어쓰시겠습니까?')) {
            return;
        }
        places = loadedPlaces;
        savePlaces();
        showTabStatus('tab-settings', '✅ GitHub 다운로드 완료! (' + loadedPlaces.length + '개)', 'ok');
    } catch (error) {
        console.error('GitHub 다운로드 오류:', error);
        showTabStatus('tab-settings', '❌ 다운로드 실패: ' + error.message, 'error');
    }
}

// ============================================================
// 9. GitHub 히스토리
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
                historyDiv.style.display = 'block';
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
                var date = new Date(c.commit.author.date);
                var dateStr = date.toLocaleString();
                var msg = c.commit.message || 'No message';
                html += '<div style="padding:3px 6px;border-bottom:1px solid #e2e8f0;font-size:11px;display:flex;justify-content:space-between;">';
                html += '<span>' + escapeHtml(msg) + '</span>';
                html += '<span style="color:#a0aec0;">' + dateStr + '</span>';
                html += '</div>';
            }
            historyDiv.innerHTML = html;
        }
        historyDiv.style.display = 'block';
        showTabStatus('tab-settings', '✅ 히스토리 로드 완료', 'ok');
    } catch (error) {
        console.error('히스토리 오류:', error);
        historyDiv.innerHTML = '<div style="color:#e53e3e;text-align:center;padding:8px;">❌ 히스토리 로드 실패</div>';
        historyDiv.style.display = 'block';
        showTabStatus('tab-settings', '❌ 히스토리 로드 실패', 'error');
    }
}

// ============================================================
// 10. 최적화 방식
// ============================================================

function setOptimizeMode(mode) {
    optimizeMode = mode;
    localStorage.setItem(OPTIMIZE_MODE_KEY, mode);
    document.getElementById('modeNearest').className = 'btn btn-sm' + (mode === 'Nearest' ? ' btn-primary' : ' btn-outline');
    document.getElementById('modeFarthest').className = 'btn btn-sm' + (mode === 'Farthest' ? ' btn-primary' : ' btn-outline');
    document.getElementById('modeInfo').textContent = '현재: ' + (mode === 'Nearest' ? '가까운순' : '먼순');
}

// ============================================================
// 11. 카카오맵 장소 검색
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
        if (res.status === 401) {
            showTabStatus('tab-settings', '⚠️ 카카오 REST API 키가 유효하지 않습니다.', 'error');
            return [];
        }
        if (res.status === 429) {
            showTabStatus('tab-settings', '⚠️ API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.', 'warning');
            return [];
        }
        if (!res.ok) {
            showTabStatus('tab-settings', '⚠️ 검색 실패 (' + res.status + ')', 'warning');
            return [];
        }
        var data = await res.json();
        return data.documents || [];
    } catch (e) {
        console.error('검색 오류:', e);
        return [];
    }
}

function renderSearchResults(container, results, onClickName) {
    if (!results || results.length === 0) {
        container.style.display = 'none';
        return;
    }
    var html = '';
    for (var i = 0; i < results.length; i++) {
        var item = results[i];
        var sourceLabel = item._source || '카카오맵';
        html += '<div class="result-item" data-name="' + escapeHtml(item.place_name) + '" data-address="' + escapeHtml(item.address_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '" data-index="' + i + '">';
        html += '<div>' + escapeHtml(item.place_name) + ' <span class="source">' + sourceLabel + '</span></div>';
        html += '<div class="addr">' + escapeHtml(item.address_name) + '</div>';
        html += '</div>';
    }
    container.innerHTML = html;
    container.style.display = 'block';
    
    container.querySelectorAll('.result-item').forEach(function(el) {
        el.addEventListener('click', function() {
            var name = this.dataset.name;
            var address = this.dataset.address;
            var lat = parseFloat(this.dataset.lat);
            var lng = parseFloat(this.dataset.lng);
            var fn = window[onClickName];
            if (typeof fn === 'function') {
                fn(name, address, lat, lng);
            }
        });
    });
}

// ============================================================
// 12. 검색 핸들러
// ============================================================

function makeSearchHandler(containerId, minLen, onClickName, timeoutIdRef) {
    return function(query) {
        var container = document.getElementById(containerId);
        if (!query || query.length < minLen) {
            container.style.display = 'none';
            return;
        }
        clearTimeout(timeoutIdRef);
        timeoutIdRef = setTimeout(async function() {
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
                        _source: '개소리스트'
                    });
                }
            }
            placeResults = placeResults.slice(0, 5);
            var kakaoResults = await searchKakaoPlaces(query);
            var allResults = [];
            var seenNames = {};
            for (var i = 0; i < placeResults.length; i++) {
                var item = placeResults[i];
                var key = item.place_name + '|' + item.address_name;
                if (!seenNames[key]) {
                    seenNames[key] = true;
                    allResults.push(item);
                }
            }
            for (var i = 0; i < kakaoResults.length; i++) {
                var item = kakaoResults[i];
                var key = item.place_name + '|' + item.address_name;
                if (!seenNames[key]) {
                    seenNames[key] = true;
                    allResults.push(item);
                }
            }
            renderSearchResults(container, allResults, onClickName);
        }, 300);
        return timeoutIdRef;
    };
}

var searchStartPoint = makeSearchHandler('startSearchResults', 2, 'selectStartPoint', startSearchTimeout);
var searchAddressForPlace = makeSearchHandler('addrSearchResults', 2, 'selectAddress', addrSearchTimeout);

var searchWaypoint = function(query) {
    var container = document.getElementById('waypointSearchResults');
    if (!query || query.length < 1) {
        container.style.display = 'none';
        return;
    }
    clearTimeout(waypointSearchTimeout);
    waypointSearchTimeout = setTimeout(async function() {
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
                    _source: '개소리스트'
                });
            }
        }
        placeResults = placeResults.slice(0, 5);
        var kakaoResults = await searchKakaoPlaces(query, 5);
        var allResults = [];
        var seenNames = {};
        for (var i = 0; i < placeResults.length; i++) {
            var item = placeResults[i];
            var key = item.place_name + '|' + item.address_name;
            if (!seenNames[key]) {
                seenNames[key] = true;
                allResults.push(item);
            }
        }
        for (var i = 0; i < kakaoResults.length; i++) {
            var item = kakaoResults[i];
            var key = item.place_name + '|' + item.address_name;
            if (!seenNames[key]) {
                seenNames[key] = true;
                allResults.push(item);
            }
        }
        if (allResults.length === 0) {
            container.style.display = 'none';
            return;
        }
        var html = '';
        for (var i = 0; i < allResults.length; i++) {
            var item = allResults[i];
            var sourceLabel = item._source || '카카오맵';
            html += '<div class="result-item" data-name="' + escapeHtml(item.place_name) + '" data-address="' + escapeHtml(item.address_name) + '" data-lat="' + item.y + '" data-lng="' + item.x + '" data-index="' + i + '">';
            html += '<div>' + escapeHtml(item.place_name) + ' <span class="source">' + sourceLabel + '</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address_name) + '</div>';
            html += '</div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        container.querySelectorAll('.result-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var name = this.dataset.name;
                var address = this.dataset.address;
                var lat = parseFloat(this.dataset.lat);
                var lng = parseFloat(this.dataset.lng);
                selectWaypointFromSearch(name, address, lat, lng);
            });
        });
    }, 300);
    return waypointSearchTimeout;
};

// ============================================================
// 13. setStartPoint - 수동 입력
// ============================================================

async function setStartPoint() {
    var name = document.getElementById('startPoint').value.trim();
    if (!name) {
        showTabStatus('tab-places', '출발지를 입력하세요.', 'warning');
        return;
    }
    var restKey = settings.kakaoRestKey;
    if (!restKey) {
        showTabStatus('tab-places', '⚠️ REST API 키가 필요합니다. 설정 탭에서 입력하세요.', 'warning');
        return;
    }
    var geo = await geocodeAddress(name, restKey);
    if (!geo) {
        showTabStatus('tab-places', '❌ "' + name + '" 위치를 찾을 수 없습니다. 검색 목록에서 선택해주세요.', 'error');
        return;
    }
    selectStartPoint(name, geo.address, geo.lat, geo.lng);
}

// ============================================================
// 14. 검색 결과 선택
// ============================================================

function selectStartPoint(name, address, lat, lng) {
    document.getElementById('startPoint').value = name;
    document.getElementById('startSearchResults').style.display = 'none';
    searchIndexState.selected = -1;
    
    if (!lat || !lng || lat < 33 || lat > 39 || lng < 124 || lng > 132) {
        showTabStatus('tab-places', '⚠️ 유효하지 않은 좌표입니다. 다시 검색해주세요.', 'warning');
        return;
    }
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

function selectWaypointFromSearch(name, address, lat, lng) {
    document.getElementById('waypointInput').value = name;
    document.getElementById('waypointSearchResults').style.display = 'none';
    searchIndexState.waypoint = -1;
    if (waypoints.length >= 15) {
        showTabStatus('tab-places', '⚠️ 최대 15개까지 가능', 'warning');
        return;
    }
    waypoints.push({ name: name, lat: lat, lng: lng, address: address });
    renderWaypointList();
    showTabStatus('tab-places', '✅ "' + name + '" 경유지 추가', 'ok');
}

function selectAddress(name, address, lat, lng) {
    document.getElementById('newPlaceAddr').value = address;
    document.getElementById('addrSearchResults').style.display = 'none';
    searchIndexState.addr = -1;
    var nameInput = document.getElementById('newPlaceName');
    if (!nameInput.value.trim()) {
        nameInput.value = name;
    }
}

// ============================================================
// 15. 키보드 네비게이션
// ============================================================

function handleResultKeydown(event, results, containerId, stateKey) {
    var index = searchIndexState[stateKey] || -1;
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
        document.getElementById(containerId).style.display = 'none';
        index = -1;
    }
    searchIndexState[stateKey] = index;
    for (var i = 0; i < results.length; i++) {
        results[i].style.background = i === index ? '#bee3f8' : '';
    }
}

function handleStartKeydown(event) {
    var results = document.querySelectorAll('#startSearchResults .result-item');
    if (results.length === 0) return;
    handleResultKeydown(event, results, 'startSearchResults', 'selected');
}

function handleWaypointKeydown(event) {
    var results = document.querySelectorAll('#waypointSearchResults .result-item');
    if (results.length === 0) return;
    handleResultKeydown(event, results, 'waypointSearchResults', 'waypoint');
}

function handleAddrKeydown(event) {
    var results = document.querySelectorAll('#addrSearchResults .result-item');
    if (results.length === 0) return;
    handleResultKeydown(event, results, 'addrSearchResults', 'addr');
}

// ============================================================
// 16. 개소 관리
// ============================================================

function normalizeName(name) {
    return name.trim().toLowerCase();
}

async function createPlace(nameId, addrId) {
    var name = document.getElementById(nameId).value.trim();
    var address = document.getElementById(addrId).value.trim();
    if (!name) { showTabStatus('tab-list', '개소명을 입력하세요.', 'warning'); return; }
    
    var normalized = normalizeName(name);
    if (places.some(function(p) { return normalizeName(p.name) === normalized; })) {
        showTabStatus('tab-list', '⚠️ 이미 존재하는 개소명입니다.', 'warning');
        return;
    }
    
    var lat = 0, lng = 0, fullAddress = address;
    var restKey = settings.kakaoRestKey;
    if (address && restKey) {
        var geo = await geocodeAddress(address, restKey);
        if (geo) {
            lat = geo.lat;
            lng = geo.lng;
            fullAddress = geo.address || address;
        }
    }
    places.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: name,
        address: fullAddress,
        lat: lat,
        lng: lng
    });
    savePlaces();
    document.getElementById(nameId).value = '';
    document.getElementById(addrId).value = '';
    document.getElementById(nameId).focus();
    showTabStatus('tab-list', '✅ "' + name + '" 추가됨' + (lat ? ' (좌표 있음)' : ''), 'ok');
}

function addPlace() { createPlace('newPlaceName', 'newPlaceAddr'); }
function addToList() { createPlace('listName', 'listAddress'); }

function renderPlaces(filtered) {
    var list = document.getElementById('placeList');
    var data = filtered || places;
    document.getElementById('listCount').textContent = '(' + data.length + '개)';
    if (data.length === 0) {
        list.innerHTML = '<div class="empty-msg">등록된 개소가 없습니다</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < data.length; i++) {
        var p = data[i];
        var addressDisplay = p.address || '';
        if (window.innerWidth < 480 && addressDisplay.length > 20) {
            addressDisplay = addressDisplay.substring(0, 18) + '…';
        }
        html += '<div class="place-item">';
        html += '<div class="info">';
        html += '<span class="name">' + escapeHtml(p.name) + '</span>';
        if (addressDisplay) {
            html += '<span class="addr">' + escapeHtml(addressDisplay) + '</span>';
        }
        html += '</div>';
        html += '<div class="actions">';
        html += '<button class="map" onclick="showPlaceOnMap(\'' + p.id + '\')" aria-label="지도 보기" title="지도 보기">📍</button>';
        html += '<button class="edit" onclick="openEditModal(\'' + p.id + '\')" aria-label="편집" title="편집">✏️</button>';
        html += '<button class="add" onclick="addWaypointFromList(\'' + p.id + '\')" aria-label="경유지 추가" title="경유지 추가">➕</button>';
        html += '<button class="del" onclick="deletePlace(\'' + p.id + '\')" aria-label="삭제" title="삭제">🗑️</button>';
        html += '</div>';
        html += '</div>';
    }
    list.innerHTML = html;
}

function searchPlaces() {
    var keyword = document.getElementById('searchPlace').value.trim();
    if (!keyword) { renderPlaces(); return; }
    var results = places.filter(function(p) {
        return p.name.includes(keyword) || (p.address && p.address.includes(keyword));
    });
    renderPlaces(results);
}

// ============================================================
// 17. 개소 수정 (모달)
// ============================================================

function openEditModal(id) {
    var place = places.find(function(p) { return p.id === id; });
    if (!place) return;
    document.getElementById('modalTitle').textContent = '✏️ 개소 편집';
    document.getElementById('modalName').value = place.name;
    document.getElementById('modalAddress').value = place.address || '';
    document.getElementById('modalId').value = id;
    document.getElementById('modal').classList.add('active');
}

async function saveModal() {
    var id = document.getElementById('modalId').value;
    var name = document.getElementById('modalName').value.trim();
    var address = document.getElementById('modalAddress').value.trim();
    var place = places.find(function(p) { return p.id === id; });
    if (!place) { closeModal(); return; }
    if (!name) {
        showTabStatus('tab-list', '개소명을 입력하세요.', 'warning');
        return;
    }
    var normalized = normalizeName(name);
    var existing = places.find(function(p) {
        return p.id !== id && normalizeName(p.name) === normalized;
    });
    if (existing) {
        showTabStatus('tab-list', '⚠️ 이미 존재하는 개소명입니다.', 'warning');
        return;
    }
    var lat = place.lat, lng = place.lng, fullAddress = address;
    if (address && address !== place.address) {
        var restKey = settings.kakaoRestKey;
        if (restKey) {
            var geo = await geocodeAddress(address, restKey);
            if (geo) {
                lat = geo.lat;
                lng = geo.lng;
                fullAddress = geo.address || address;
            }
        }
    }
    place.name = name;
    place.address = fullAddress;
    place.lat = lat;
    place.lng = lng;
    savePlaces();
    closeModal();
    showTabStatus('tab-list', '✅ "' + name + '" 수정 완료', 'ok');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// ============================================================
// 18. 개소 삭제
// ============================================================

function deletePlace(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    var target = places.find(function(p) { return p.id === id; });
    places = places.filter(function(p) { return p.id !== id; });
    if (target) {
        waypoints = waypoints.filter(function(w) { return w.name !== target.name; });
        renderWaypointList();
        if (singlePlaceMarker && singlePlaceMarker._placeId === id) {
            clearSingleMarker();
        }
    }
    savePlaces();
    showTabStatus('tab-list', '✅ 삭제 완료', 'ok');
}

// ============================================================
// 19. 경유지 추가 (개소탭에서)
// ============================================================

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
    waypoints.push({ name: place.name, lat: place.lat || 0, lng: place.lng || 0 });
    renderWaypointList();
    showTabStatus('tab-list', '✅ "' + place.name + '" 경유지 추가됨!', 'ok');
}

// ============================================================
// 20. 경유지 관리
// ============================================================

function addWaypoint() {
    var input = document.getElementById('waypointInput');
    var name = input.value.trim();
    if (!name) { showTabStatus('tab-places', '경유지를 입력하세요.', 'warning'); return; }
    if (waypoints.length >= 15) { showTabStatus('tab-places', '⚠️ 최대 15개까지 가능', 'warning'); return; }
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
    document.getElementById('wpCount').textContent = '(' + waypoints.length + '개)';
    if (waypoints.length === 0) {
        list.innerHTML = '<li class="empty-msg">경유지를 추가하세요</li>';
        return;
    }
    var html = '';
    for (var i = 0; i < waypoints.length; i++) {
        var wp = waypoints[i];
        html += '<li data-lat="' + (wp.lat || 0) + '" data-lng="' + (wp.lng || 0) + '" data-name="' + escapeHtml(wp.name) + '">';
        html += '<div style="display:flex;align-items:center;">';
        html += '<span class="idx">' + (i + 1) + '</span>';
        html += '<span>' + escapeHtml(wp.name) + '</span>';
        html += '</div>';
        html += '<span class="remove" onclick="removeWaypoint(' + i + ')">✕</span>';
        html += '</li>';
    }
    list.innerHTML = html;
    
    list.querySelectorAll('li[data-lat]').forEach(function(el) {
        el.addEventListener('mouseenter', function() {
            var lat = parseFloat(this.dataset.lat);
            var lng = parseFloat(this.dataset.lng);
            if (lat && lng && kakaoMap) {
                kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
                kakaoMap.setLevel(4);
            }
        });
        el.addEventListener('mouseleave', function() {
            // 원래 위치로 복원 (선택)
        });
    });
}

// ============================================================
// 21. 지도에 개소 표시 (개소탭 지도 버튼)
// ============================================================

function showPlaceOnMap(id) {
    var place = places.find(function(p) { return p.id === id; });
    if (!place) {
        showTabStatus('tab-list', '❌ 개소를 찾을 수 없습니다.', 'error');
        return;
    }
    if (!place.lat || !place.lng || place.lat === 0 || place.lng === 0) {
        showTabStatus('tab-list', '⚠️ "' + place.name + '"의 좌표가 없습니다. 주소를 확인하세요.', 'warning');
        return;
    }
    
    clearRouteMarkers();
    clearSingleMarker();
    isShowingRouteMarkers = false;
    
    if (!kakaoMap) {
        initMap();
        setTimeout(function() {
            showPlaceOnMap(id);
        }, 500);
        return;
    }
    
    var pos = new kakao.maps.LatLng(place.lat, place.lng);
    var marker = new kakao.maps.Marker({
        map: kakaoMap,
        position: pos,
        title: place.name,
        draggable: false
    });
    singlePlaceMarker = marker;
    singlePlaceMarker._placeId = id;
    
    var iw = new kakao.maps.InfoWindow({
        content: '<div style="padding:4px 10px;font-weight:bold;font-size:13px;">📍 ' + escapeHtml(place.name) + '</div>'
    });
    iw.open(kakaoMap, marker);
    singlePlaceInfoWindow = iw;
    
    kakaoMap.setCenter(pos);
    kakaoMap.setLevel(4);
    
    switchTab('tab-route');
    showTabStatus('tab-route', '📍 "' + place.name + '" 위치 표시 중', 'info');
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
// 22. 지오코딩
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
            if (res.status === 401) {
                showTabStatus('tab-settings', '⚠️ 카카오 REST API 키가 유효하지 않습니다.', 'error');
                return null;
            }
            if (res.status === 429) {
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    continue;
                }
                showTabStatus('tab-settings', '⚠️ API 호출 한도를 초과했습니다.', 'warning');
                return null;
            }
            if (!res.ok) {
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 500));
                    continue;
                }
                showTabStatus('tab-settings', '⚠️ 주소 변환 실패 (' + res.status + ')', 'warning');
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
        } catch (e) {
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500));
                continue;
            }
            console.error('지오코딩 오류:', e);
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
        if (onProgress) {
            onProgress(i + batch.length, rows.length);
        }
    }
    return results;
}

// ============================================================
// 23. 16방향 클러스터링
// ============================================================

function calculateAngle(startX, startY, targetX, targetY) {
    var dx = targetX - startX;
    var dy = targetY - startY;
    if (dx === 0 && dy === 0) return 0;
    if (dx === 0) return dy > 0 ? 90 : 270;
    var angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return angle;
}

function getClusterGroup16(angle) {
    var dirs = [
        [78.75, 101.25, 1], [56.25, 78.75, 2], [33.75, 56.25, 3],
        [11.25, 33.75, 4], [348.75, 11.25, 5], [326.25, 348.75, 6],
        [303.75, 326.25, 7], [281.25, 303.75, 8], [258.75, 281.25, 9],
        [236.25, 258.75, 10], [213.75, 236.25, 11], [191.25, 213.75, 12],
        [168.75, 191.25, 13], [146.25, 168.75, 14], [123.75, 146.25, 15],
        [101.25, 123.75, 16]
    ];
    for (var i = 0; i < dirs.length; i++) {
        var min = dirs[i][0];
        var max = dirs[i][1];
        var group = dirs[i][2];
        if (min <= max) {
            if (angle >= min && angle < max) return group;
        } else {
            if (angle >= min || angle < max) return group;
        }
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
    var currX = startLng;
    var currY = startLat;
    
    var firstIdx = 0;
    var compVal = mode === 'Nearest' ? Infinity : -Infinity;
    for (var i = 0; i < count; i++) {
        if (visited[i]) continue;
        var dist = Math.pow(startLng - places[i].lng, 2) + Math.pow(startLat - places[i].lat, 2);
        if (mode === 'Nearest') {
            if (dist < compVal) { compVal = dist; firstIdx = i; }
        } else {
            if (dist > compVal) { compVal = dist; firstIdx = i; }
        }
    }
    
    function visitGroup(startIdx) {
        var targetGroup = groups[startIdx];
        var groupItems = [];
        for (var i = 0; i < count; i++) {
            if (!visited[i] && groups[i] === targetGroup) {
                groupItems.push(i);
            }
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
        var nearestIdx = -1;
        var minDist = Infinity;
        for (var i = 0; i < count; i++) {
            if (visited[i]) continue;
            var dist = Math.pow(currX - places[i].lng, 2) + Math.pow(currY - places[i].lat, 2);
            if (dist < minDist) {
                minDist = dist;
                nearestIdx = i;
            }
        }
        if (nearestIdx === -1) break;
        visitGroup(nearestIdx);
    }
    return sorted;
}

// ============================================================
// 24. 경로 최적화 실행
// ============================================================

async function runOptimize() {
    var btn = document.querySelector('.btn-primary[onclick*="runOptimize"]');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;
    
    try {
        if (!startPoint || !startPoint.lat) {
            showTabStatus('tab-places', '🚩 출발지를 검색하고 설정하세요!', 'warning');
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
            if (!lat || !lng) {
                var found = places.find(function(p) { return p.name === wp.name; });
                if (found && found.lat && found.lng) {
                    lat = found.lat;
                    lng = found.lng;
                } else {
                    var geo = await geocodeAddress(wp.name, restKey, 1);
                    if (geo) {
                        lat = geo.lat;
                        lng = geo.lng;
                        var place = places.find(function(p) { return p.name === wp.name; });
                        if (place) {
                            place.lat = lat;
                            place.lng = lng;
                        }
                    } else {
                        showTabStatus('tab-places', '❌ "' + wp.name + '" 변환 실패', 'error');
                        hasError = true;
                        break;
                    }
                }
            }
            wpCoords.push({ name: wp.name, lat: lat, lng: lng });
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
            addRouteMarker(p.lat, p.lng, (i + 1) + '. ' + p.name);
        }
        drawRoute(allPoints);
        
        var totalKm = 0;
        var totalMin = 0;
        for (var i = 0; i < allPoints.length - 1; i++) {
            var p1 = allPoints[i];
            var p2 = allPoints[i + 1];
            var dist = haversineKm(p1.lat, p1.lng, p2.lat, p2.lng);
            totalKm += dist;
            totalMin += dist * 1.5;
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
        
        // 경로 목록 표시 (클릭 이동 기능 포함)
        showRouteList();
        
        switchTab('tab-route');
        showTabStatus('tab-route', '✅ 최적화 완료! ' + validPlaces.length + '개소', 'ok');
    } catch (e) {
        console.error('최적화 오류:', e);
        showTabStatus('tab-places', '❌ 오류 발생: ' + e.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// 24-1. 경로 목록 표시 (클릭 이동 포함)
// ============================================================

function showRouteList() {
    if (!routeResult) return;
    
    var container = document.getElementById('routeList');
    var { places: sorted, startPoint, totalKm, totalMin } = routeResult;

    if (!sorted || sorted.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#a0aec0;">최적화된 경로가 없습니다.</div>';
        return;
    }

    var html = '<div style="font-weight:600;font-size:14px;margin-bottom:8px;">📋 최적 경로</div>';

    // 출발지
    html += `
        <div class="route-item route-start">
            <div class="idx">🚩</div>
            <div class="info">
                <div class="name">${escapeHtml(startPoint.name)}</div>
                <div class="addr">${escapeHtml(startPoint.address || '')}</div>
            </div>
        </div>
    `;

    // 경유지들 (클릭 가능)
    for (var i = 0; i < sorted.length; i++) {
        var p = sorted[i];
        var prevLat = i === 0 ? startPoint.lat : sorted[i-1].lat;
        var prevLng = i === 0 ? startPoint.lng : sorted[i-1].lng;
        var segDist = haversineKm(prevLat, prevLng, p.lat, p.lng);
        
        html += `
            <div class="route-item" 
                 data-lat="${p.lat}" 
                 data-lng="${p.lng}"
                 onclick="moveToRoutePoint(this)"
                 title="클릭하면 지도에서 해당 위치로 이동합니다">
                <div class="idx">${i + 1}</div>
                <div class="info">
                    <div class="name">${escapeHtml(p.name)}</div>
                    <div class="addr">${escapeHtml(p.address || '')}</div>
                </div>
                <div class="dist">${segDist.toFixed(1)}km</div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// ============================================================
// 24-2. 경로 항목 클릭 시 해당 위치로 지도 이동
// ============================================================

function moveToRoutePoint(el) {
    var lat = parseFloat(el.dataset.lat);
    var lng = parseFloat(el.dataset.lng);
    
    if (!lat || !lng || !kakaoMap) {
        showTabStatus('tab-route', '⚠️ 위치 정보가 없거나 지도가 준비되지 않았습니다.', 'warning');
        return;
    }

    kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
    kakaoMap.setLevel(4);

    var items = document.querySelectorAll('.route-item');
    for (var i = 0; i < items.length; i++) {
        items[i].style.background = '';
        items[i].style.borderLeftColor = '';
    }
    el.style.background = '#ebf8ff';
    el.style.borderLeftColor = '#2b6cb0';

    showTabStatus('tab-route', '📍 해당 위치로 이동했습니다.', 'info');
}

// ============================================================
// 25. 지도 초기화
// ============================================================

function initMap() {
    var container = document.getElementById('map');
    if (!container) {
        console.warn('❌ 지도 컨테이너 없음');
        return;
    }
    var jsKey = settings.kakaoJsKey;
    if (!jsKey) {
        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;border-radius:12px;padding:20px;text-align:center;">⚠️ 설정 탭에서<br>카카오 JavaScript 키를 입력하세요</div>';
        showTabStatus('tab-settings', '⚠️ 카카오 JavaScript 키가 필요합니다.', 'warning');
        return;
    }
    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#d69e2e;font-size:14px;background:#fffff0;border-radius:12px;">⏳ 카카오 지도 로딩 중...</div>';
    
    if (typeof kakao === 'undefined' || !kakao.maps) {
        if (sdkLoading) {
            console.log('⏳ SDK 이미 로딩 중, 중복 방지');
            return;
        }
        sdkLoading = true;
        var script = document.createElement('script');
        script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + jsKey + '&autoload=false&libraries=services';
        script.async = true;
        script.defer = true;
        script.onload = function() {
            sdkLoading = false;
            kakao.maps.load(function() {
                createMap(container);
            });
        };
        script.onerror = function() {
            sdkLoading = false;
            container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;border-radius:12px;padding:20px;text-align:center;">❌ SDK 로드 실패<br><span style="font-size:12px;">네트워크를 확인하세요</span></div>';
            showTabStatus('tab-settings', '❌ SDK 로드 실패', 'error');
        };
        document.head.appendChild(script);
        return;
    }
    kakao.maps.load(function() {
        createMap(container);
    });
}

// ============================================================
// 26. 지도 생성
// ============================================================

function createMap(container) {
    try {
        var region = currentRegion || '서울';
        var centerInfo = getRegionCenter(region);
        var centerLat = centerInfo.lat;
        var centerLng = centerInfo.lng;
        var zoomLevel = 5;
        var isStartValid = startPoint &&
                           typeof startPoint.lat ===
