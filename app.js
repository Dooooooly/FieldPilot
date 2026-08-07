// ============================================================
// 경로 최적화 PWA - VBA 완벽 포팅 (보안 및 성능 개선)
// ============================================================

// --- 저장소 키 ---
const STORAGE_KEY_PREFIX = 'places_';
const SELECTED_REGION_KEY = 'selectedRegion';
const SETTINGS_KEY = 'app_settings';
const OPTIMIZE_MODE_KEY = 'optimizeMode';

// --- 지역별 중심 좌표 (지도용) ---
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
let currentRegion = localStorage.getItem(SELECTED_REGION_KEY) || '';
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
        return;
    }
    
    if (tabId === 'tab-list') {
        renderPlaces();
        return;
    }
    
    if (tabId === 'tab-places' || tabId === 'tab-settings' || tabId === 'tab-help') {
        return;
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

// ⭐⭐ 핵심 수정: 기본 지역 완전 제거
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
    
    // ⭐ 저장된 지역이 없으면 드롭다운을 비워둠 (기본값 없음)
    if (regions.length === 0) {
        return;
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
        select.value = '';
        currentRegion = '';
        localStorage.removeItem(SELECTED_REGION_KEY);
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
    
    if (kakaoMap) {
        var center = getRegionCenter(region);
        kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
        kakaoMap.setLevel(5);
    }
    
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
// 8. GitHub 다운로드 (수정: 지역 입력 추가)
// ============================================================

async function downloadFromGitHub() {
    var token = settings.githubToken;
    if (!token) {
        showTabStatus('tab-settings', '⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    
    // ⭐⭐ currentRegion이 없으면 사용자에게 입력받기
    var region = currentRegion;
    if (!region) {
        region = prompt('다운로드할 지역명을 입력하세요:', '');
        if (!region || !region.trim()) {
            showTabStatus('tab-settings', '⚠️ 지역명이 필요합니다.', 'warning');
            return;
        }
        region = region.trim().replace(/[\/\\:*?"<>|]/g, '');
        if (!region) {
            showTabStatus('tab-settings', '⚠️ 사용할 수 없는 지역명입니다. (특수문자 제외)', 'warning');
            return;
        }
        // 드롭다운에 추가
        var select = document.getElementById('regionSelect');
        // 중복 체크
        var exists = false;
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === region) {
                exists = true;
                break;
            }
        }
        if (exists) {
            showTabStatus('tab-settings', '⚠️ 이미 존재하는 지역입니다.', 'warning');
            return;
        }
        // localStorage에 빈 배열 생성
        var key = getStorageKey(region);
        localStorage.setItem(key, JSON.stringify([]));
        var opt = document.createElement('option');
        opt.value = region;
        opt.textContent = region;
        select.appendChild(opt);
        select.value = region;
        currentRegion = region;
        localStorage.setItem(SELECTED_REGION_KEY, region);
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
            headers: { 'Authorization': 'token ' + token }
        });
        if (fileRes.status === 404) {
            showTabStatus('tab-settings', '📭 GitHub에 "' + region + '" 지역의 데이터가 없습니다.', 'warning');
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
            kakaoResults = kakaoResults.slice(0, 5);
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
        kakaoResults = kakaoResults.slice(0, 5);
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

function getRecentStartPoints() {
    try {
        var data = localStorage.getItem('recentStartPoints');
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

function saveRecentStartPoint(name, address, lat, lng) {
    var recent = getRecentStartPoints();
    recent = recent.filter(function(item) { return item.name !== name; });
    recent.unshift({ name: name, address: address, lat: lat, lng: lng });
    recent = recent.slice(0, 3);
    localStorage.setItem('recentStartPoints', JSON.stringify(recent));
}

async function searchStartPoint(query) {
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
            html += '<div class="result-item" onclick="selectStartPoint(\'' + escapeHtml(item.name) + '\', \'' + escapeHtml(item.address) + '\', ' + item.lat + ', ' + item.lng + ')" data-index="' + i + '">';
            html += '<div>🕐 ' + escapeHtml(item.name) + ' <span class="source" style="font-size:10px;color:#a0aec0;margin-left:4px;">최근</span></div>';
            html += '<div class="addr">' + escapeHtml(item.address) + '</div>';
            html += '</div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
        return;
    }
    
    if (query.length < 2) {
        container.style.display = 'none';
        return;
    }
    clearTimeout(startSearchTimeout);
    startSearchTimeout = setTimeout(async function() {
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
        kakaoResults = kakaoResults.slice(0, 5);
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
        renderSearchResults(container, allResults, 'selectStartPoint');
    }, 300);
}

function selectStartPoint(name, address, lat, lng) {
    document.getElementById('startPoint').value = name;
    document.getElementById('startSearchResults').style.display = 'none';
    searchIndexState.selected = -1;
    
    if (!lat || !lng || lat < 33 || lat > 39 || lng < 124 || lng > 132) {
        showTabStatus('tab-places', '⚠️ 유효하지 않은 좌표입니다. 다시 검색해주세요.', 'warning');
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
// 21. 지도에 개소 표시 (반투명 커스텀 오버레이)
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
    
    var content = `
        <div style="
            background: rgba(255, 255, 255, 0.92);
            padding: 8px 18px;
            border-radius: 24px;
            border: 2.5px solid rgba(43, 108, 176, 0.4);
            box-shadow: 0 8px 32px rgba(43, 108, 176, 0.2), 0 4px 16px rgba(0,0,0,0.08);
            font-size: 14px;
            font-weight: 700;
            color: #2d3748;
            white-space: nowrap;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
        ">
            📍 ${escapeHtml(place.name)}
        </div>
    `;
    
    var customOverlay = new kakao.maps.CustomOverlay({
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
// 23. 16방향 클러스터링 (VBA 완벽 포팅)
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
            addRouteMarker(p.lat, p.lng, (i + 1) + '. ' + p.name, false);
        }
        
        var routeData = await callKakaoMobilityRoute(allPoints, restKey);
        if (routeData) {
            drawRoadRoute(routeData);
        } else {
            drawRoute(allPoints);
            showTabStatus('tab-route', '⚠️ 도로 경로를 불러올 수 없어 직선으로 표시합니다.', 'warning');
        }
        
        var totalKm = 0;
        var totalMin = 0;
        if (routeData && routeData.routes && routeData.routes[0]) {
            var route = routeData.routes[0];
            totalKm = route.summary ? route.summary.distance / 1000 : 0;
            totalMin = route.summary ? route.summary.duration / 60 : 0;
        } else {
            for (var i = 0; i < allPoints.length - 1; i++) {
                var p1 = allPoints[i];
                var p2 = allPoints[i + 1];
                var dist = haversineKm(p1.lat, p1.lng, p2.lat, p2.lng);
                totalKm += dist;
                totalMin += dist * 1.5;
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

    html += `
        <div class="route-item route-start">
            <div class="idx">🚩</div>
            <div class="info">
                <div class="name">${escapeHtml(startPoint.name)}</div>
                <div class="addr">${escapeHtml(startPoint.address || '')}</div>
            </div>
        </div>
    `;

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
// 24-3. 카카오 모빌리티 길찾기 API 호출
// ============================================================

async function callKakaoMobilityRoute(points, restKey) {
    if (!restKey || points.length < 2) return null;
    try {
        var origin = points[0];
        var destination = points[points.length - 1];
        var waypoints = points.slice(1, -1);
        
        var url = 'https://apis-navi.kakaomobility.com/v1/waypoints/directions';
        var payload = {
            origin: {
                name: origin.name || '출발지',
                x: origin.lng,
                y: origin.lat
            },
            destination: {
                name: destination.name || '도착지',
                x: destination.lng,
                y: destination.lat
            },
            priority: 'RECOMMEND'
        };
        if (waypoints.length > 0) {
            payload.waypoints = waypoints.map(function(w) {
                return { name: w.name || '경유지', x: w.lng, y: w.lat };
            });
        }
        var response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'KakaoAK ' + restKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.warn('도로 경로 API 호출 실패:', e);
        return null;
    }
}

// ============================================================
// 24-4. 도로 경로 그리기 (반투명 파스텔 톤)
// ============================================================

function drawRoadRoute(routeData) {
    if (!kakaoMap || !routeData) return;
    
    try {
        var route = routeData.routes[0];
        if (!route || !route.sections) {
            console.warn('⚠️ 경로 데이터에 sections가 없습니다.');
            return;
        }
        
        if (kakaoPolyline) {
            kakaoPolyline.setMap(null);
            kakaoPolyline = null;
        }
        
        var pastelColors = [
            'rgba(255, 150, 150, 0.7)',
            'rgba(255, 200, 150, 0.7)',
            'rgba(255, 230, 150, 0.7)',
            'rgba(150, 220, 150, 0.7)',
            'rgba(150, 200, 255, 0.7)',
            'rgba(200, 150, 255, 0.7)',
            'rgba(255, 150, 200, 0.7)'
        ];
        
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
                var colorIndex = sectionIndex % pastelColors.length;
                var color = pastelColors[colorIndex];
                
                var polyline = new kakao.maps.Polyline({
                    map: kakaoMap,
                    path: sectionPath,
                    strokeWeight: 6,
                    strokeColor: color,
                    strokeOpacity: 0.85,
                    strokeStyle: 'solid'
                });
                
                if (sectionPath.length > 2) {
                    var lastIdx = sectionPath.length - 1;
                    var prevIdx = lastIdx - 1;
                    var angle = Math.atan2(
                        sectionPath[lastIdx].getLat() - sectionPath[prevIdx].getLat(),
                        sectionPath[lastIdx].getLng() - sectionPath[prevIdx].getLng()
                    ) * 180 / Math.PI;
                    
                    var arrowPos = sectionPath[lastIdx];
                    var arrowContent = `
                        <div style="
                            width: 0;
                            height: 0;
                            border-left: 8px solid transparent;
                            border-right: 8px solid transparent;
                            border-bottom: 14px solid ${color};
                            transform: rotate(${angle + 90}deg);
                            filter: drop-shadow(0 1px 3px rgba(0,0,0,0.2));
                        "></div>
                    `;
                    
                    new kakao.maps.CustomOverlay({
                        map: kakaoMap,
                        position: arrowPos,
                        content: arrowContent,
                        yAnchor: 0.5,
                        xAnchor: 0.5
                    });
                }
                
                if (!window._sectionPolylines) window._sectionPolylines = [];
                window._sectionPolylines.push(polyline);
                
                sectionIndex++;
            }
        }
        
        kakaoMap.setBounds(totalBounds);
        console.log('✅ 반투명 파스텔 경로 표시 완료 (' + sectionIndex + '개 구간)');
        
    } catch (e) {
        console.error('도로 경로 그리기 실패:', e);
    }
}

// ============================================================
// 25. 직선 경로 그리기 (무지개 색상)
// ============================================================

function drawRoute(path) {
    if (!kakaoMap || !path || path.length < 2) return;
    
    try {
        if (kakaoPolyline) {
            kakaoPolyline.setMap(null);
            kakaoPolyline = null;
        }
        
        var rainbowColors = [
            '#FF0000', '#FF7F00', '#FFFF00', '#00FF00',
            '#0000FF', '#4B0082', '#8B00FF', '#FF1493',
            '#00CED1', '#FF4500', '#32CD32', '#1E90FF',
            '#FF69B4', '#FFD700', '#00FF7F'
        ];
        
        var bounds = new kakao.maps.LatLngBounds();
        
        for (var i = 0; i < path.length - 1; i++) {
            var p1 = path[i];
            var p2 = path[i + 1];
            var latlng1 = new kakao.maps.LatLng(p1.lat, p1.lng);
            var latlng2 = new kakao.maps.LatLng(p2.lat, p2.lng);
            
            bounds.extend(latlng1);
            bounds.extend(latlng2);
            
            var colorIndex = i % rainbowColors.length;
            
            var polyline = new kakao.maps.Polyline({
                map: kakaoMap,
                path: [latlng1, latlng2],
                strokeWeight: 5,
                strokeColor: rainbowColors[colorIndex],
                strokeOpacity: 0.8,
                strokeStyle: 'solid'
            });
            
            if (!window._sectionPolylines) window._sectionPolylines = [];
            window._sectionPolylines.push(polyline);
        }
        
        kakaoMap.setBounds(bounds);
        console.log('✅ 무지개 직선 경로 표시 완료');
        
    } catch (e) {
        console.error('경로 그리기 실패:', e);
    }
}

// ============================================================
// 26. 지도 초기화
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
// 27. 지도 생성
// ============================================================

function createMap(container) {
    try {
        var region = currentRegion || '서울';
        var centerInfo = getRegionCenter(region);
        var centerLat = centerInfo.lat;
        var centerLng = centerInfo.lng;
        var zoomLevel = 5;
        var isStartValid = startPoint &&
                           typeof startPoint.lat === 'number' &&
                           typeof startPoint.lng === 'number' &&
                           startPoint.lat > 33 && startPoint.lat < 39 &&
                           startPoint.lng > 124 && startPoint.lng < 132 &&
                           !(startPoint.lat === 0 && startPoint.lng === 0);
        if (isStartValid && !singlePlaceMarker && !isShowingRouteMarkers) {
            centerLat = startPoint.lat;
            centerLng = startPoint.lng;
        }
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
        if ('ontouchstart' in window) {
            kakaoMap.setDraggable(true);
            kakaoMap.setZoomable(true);
        }
        var zoomControl = new kakao.maps.ZoomControl();
        kakaoMap.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);
        showTabStatus('tab-route', '🗺️ 지도 로드 완료', 'ok');
    } catch (e) {
        console.error('지도 생성 실패:', e);
        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;border-radius:12px;padding:20px;text-align:center;">❌ 지도 생성 실패<br><span style="font-size:12px;">' + e.message + '</span></div>';
        showTabStatus('tab-settings', '⚠️ 지도 생성 실패', 'error');
    }
}

// ============================================================
// 28. 마커 관리 (반투명 커스텀 오버레이)
// ============================================================

function addRouteMarker(lat, lng, title, isStart) {
    if (!kakaoMap) return;
    try {
        var pos = new kakao.maps.LatLng(lat, lng);
        
        var icon = isStart ? '🚩' : '📍';
        var bgColor = isStart ? 'rgba(43, 108, 176, 0.85)' : 'rgba(56, 161, 105, 0.85)';
        var shadowColor = isStart ? 'rgba(43, 108, 176, 0.3)' : 'rgba(56, 161, 105, 0.3)';
        var textColor = 'white';
        
        var content = `
            <div style="
                background: ${bgColor};
                padding: 6px 14px;
                border-radius: 20px;
                box-shadow: 0 4px 16px ${shadowColor}, 0 2px 8px rgba(0,0,0,0.1);
                font-size: 13px;
                font-weight: 700;
                color: ${textColor};
                white-space: nowrap;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                border: 1px solid rgba(255,255,255,0.2);
                letter-spacing: 0.3px;
            ">
                ${icon} ${escapeHtml(title)}
            </div>
        `;
        
        var customOverlay = new kakao.maps.CustomOverlay({
            map: kakaoMap,
            position: pos,
            content: content,
            yAnchor: 1.4,
            xAnchor: 0.5
        });
        
        routeMarkers.push(customOverlay);
        return customOverlay;
    } catch (e) {
        console.error('커스텀 오버레이 추가 실패:', e);
    }
}

// ============================================================
// 29. 경로 마커 제거
// ============================================================

function clearRouteMarkers() {
    for (var i = 0; i < routeMarkers.length; i++) {
        try { routeMarkers[i].setMap(null); } catch(e) {}
    }
    for (var i = 0; i < routeInfoWindows.length; i++) {
        try { routeInfoWindows[i].close(); } catch(e) {}
    }
    routeMarkers = [];
    routeInfoWindows = [];
    
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
    
    isShowingRouteMarkers = false;
}

// ============================================================
// 30. 개소 마커 표시 (반투명 커스텀 오버레이)
// ============================================================

function showPlaceMarkers() {
    if (!kakaoMap) return;
    
    for (var i = 0; i < placeMarkers.length; i++) {
        try { placeMarkers[i].setMap(null); } catch(e) {}
    }
    for (var i = 0; i < placeInfoWindows.length; i++) {
        try { placeInfoWindows[i].close(); } catch(e) {}
    }
    placeMarkers = [];
    placeInfoWindows = [];
    
    var placesWithCoords = places.filter(function(p) {
        return p.lat && p.lng && p.lat !== 0 && p.lng !== 0;
    });
    
    if (placesWithCoords.length === 0) {
        var center = getRegionCenter(currentRegion);
        kakaoMap.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
        kakaoMap.setLevel(5);
        return;
    }
    
    var bounds = new kakao.maps.LatLngBounds();
    
    for (var i = 0; i < placesWithCoords.length; i++) {
        var p = placesWithCoords[i];
        var pos = new kakao.maps.LatLng(p.lat, p.lng);
        bounds.extend(pos);
        
        var content = `
            <div style="
                background: rgba(255, 255, 255, 0.88);
                padding: 5px 12px;
                border-radius: 16px;
                border: 1.5px solid rgba(43, 108, 176, 0.25);
                box-shadow: 0 4px 16px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
                font-size: 12px;
                font-weight: 600;
                color: #2d3748;
                white-space: nowrap;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            "
            onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.12)'"
            onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'"
            onclick="showPlaceOnMap('${p.id}')">
                📍 ${escapeHtml(p.name)}
            </div>
        `;
        
        var customOverlay = new kakao.maps.CustomOverlay({
            map: kakaoMap,
            position: pos,
            content: content,
            yAnchor: 1.2,
            xAnchor: 0.5
        });
        
        placeMarkers.push(customOverlay);
    }
    
    kakaoMap.setBounds(bounds);
}

// ============================================================
// 31. 엑셀 파일 처리
// ============================================================

function parseCSVLine(line) {
    var result = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
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
                    for (var j = 0; j < header.length; j++) {
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
            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    var data = new Uint8Array(e.target.result);
                    var wb = XLSX.read(data, { type: 'array' });
                    var sheet = wb.Sheets[wb.SheetNames[0]];
                    var json = XLSX.utils.sheet_to_json(sheet);
                    importPlaces(json);
                } catch (error) {
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
    var added = 0, updated = 0, skipped = 0;
    var restKey = settings.kakaoRestKey;
    var rowsToGeocode = [];
    for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var name = String(row['개소명'] || row['name'] || row['Name'] || '').trim();
        var address = String(row['도로명주소'] || row['address'] || row['Address'] || '').trim();
        if (!name) continue;
        var normalized = normalizeName(name);
        var existing = places.find(function(p) { return normalizeName(p.name) === normalized; });
        if (existing) {
            if (existing.address !== address) {
                existing.address = address;
                if (address && restKey) {
                    rowsToGeocode.push({ name: name, address: address, existing: existing });
                }
                updated++;
            } else {
                skipped++;
            }
        } else {
            var newPlace = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                name: name,
                address: address,
                lat: 0,
                lng: 0
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
        for (var i = 0; i < rowsToGeocode.length; i++) {
            var item = rowsToGeocode[i];
            if (item.existing && item.geo) {
                item.existing.lat = item.geo.lat;
                item.existing.lng = item.geo.lng;
                item.existing.address = item.geo.address || item.existing.address;
            }
        }
    }
    if (added > 0 || updated > 0) { savePlaces(); }
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

// ============================================================
// 32. 엑셀 내보내기
// ============================================================

function exportData() {
    var data = [];
    if (places.length === 0) {
        data = [
            { '개소명': '예시_개소명_1', '도로명주소': '서울시 강남구 테헤란로 123', '비고': '', '위도': 0, '경도': 0 },
            { '개소명': '예시_개소명_2', '도로명주소': '서울시 서초구 서초대로 456', '비고': '', '위도': 0, '경도': 0 },
            { '개소명': '예시_개소명_3', '도로명주소': '서울시 종로구 종로 789', '비고': '', '위도': 0, '경도': 0 }
        ];
        showTabStatus('tab-list', '📄 예시 양식이 다운로드됩니다.', 'info');
    } else {
        data = places.map(function(p) {
            return {
                '개소명': p.name,
                '도로명주소': p.address || '',
                '비고': p.remark || '',
                '위도': p.lat || 0,
                '경도': p.lng || 0,
                '주소변환상태': (p.lat && p.lng && p.lat !== 0 && p.lng !== 0) ? '완료' : '미변환'
            };
        });
        showTabStatus('tab-list', '✅ 내보내기 완료 (' + data.length + '개)', 'ok');
    }
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, '개소리스트');
    var now = new Date();
    var timestamp = now.toISOString().slice(0,10) + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(now.getSeconds()).padStart(2,'0');
    XLSX.writeFile(wb, '개소리스트_' + currentRegion + '_' + timestamp + '.xlsx');
}

// ============================================================
// 33. 설정 내보내기/가져오기
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
        } catch (error) {
            showTabStatus('tab-settings', '❌ 설정 파일 오류: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ============================================================
// 34. 공유
// ============================================================

function shareRoute() {
    if (!routeResult) {
        showTabStatus('tab-places', '먼저 경로 최적화를 실행하세요.', 'warning');
        return;
    }
    var startPoint = routeResult.startPoint;
    var sorted = routeResult.places;
    var totalKm = routeResult.totalKm;
    var totalMin = routeResult.totalMin;
    var mode = routeResult.mode;
    var text = '🚗 최적 경로\n\n';
    text += '📊 ' + sorted.length + '개소\n';
    text += '📏 ' + totalKm + ' km\n';
    text += '⏱️ ' + totalMin + '분\n';
    text += '📐 ' + (mode === 'Nearest' ? '가까운순' : '먼순') + '\n\n';
    text += '🚩 ' + startPoint.name + '\n';
    for (var i = 0; i < sorted.length; i++) {
        text += '  ' + (i + 1) + '. ' + sorted[i].name + '\n';
    }
    if (navigator.share) {
        navigator.share({ title: '경로 최적화', text: text }).catch(function() {});
    } else {
        navigator.clipboard.writeText(text).then(function() {
            showTabStatus('tab-places', '✅ 클립보드 복사 완료', 'ok');
        }).catch(function() {
            showModal('📋 공유', text);
        });
    }
}

// ============================================================
// 35. 초기화
// ============================================================

function resetAll() {
    if (!confirm('⚠️ 모든 데이터를 초기화하시겠습니까?')) return;
    if (!confirm('정말로 삭제하시겠습니까?')) return;
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && (key.startsWith(STORAGE_KEY_PREFIX) || key === SETTINGS_KEY || key === SELECTED_REGION_KEY || key === OPTIMIZE_MODE_KEY)) {
            keys.push(key);
        }
    }
    for (var i = 0; i < keys.length; i++) {
        localStorage.removeItem(keys[i]);
    }
    places = [];
    waypoints = [];
    routeResult = null;
    startPoint = null;
    renderPlaces();
    renderWaypointList();
    clearRouteMarkers();
    clearSingleMarker();
    placeMarkers = [];
    placeInfoWindows = [];
    if (kakaoPolyline) {
        try { kakaoPolyline.setMap(null); } catch(e) {}
        kakaoPolyline = null;
    }
    document.getElementById('placeCount').textContent = '0개소';
    document.getElementById('totalDistance').textContent = '0.00 km';
    document.getElementById('totalTime').textContent = '0 분';
    document.getElementById('optimizeMode').textContent = '-';
    document.getElementById('routeList').innerHTML = '';
    document.getElementById('startInfo').textContent = '⏳ 출발지를 검색하고 설정하세요';
    document.getElementById('startInfo').style.color = '#718096';
    updateStorageInfo();
    showTabStatus('tab-settings', '✅ 초기화 완료', 'ok');
    loadRegionList();
}

// ============================================================
// 36. UI 헬퍼
// ============================================================

function showModal(title, body) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').textContent = body;
    document.getElementById('modal').classList.add('active');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// ============================================================
// 37. Service Worker 등록
// ============================================================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/route-optimizer-pwa/sw.js')
            .then(function(reg) {
                console.log('✅ Service Worker 등록 성공');
            })
            .catch(function(err) {
                console.log('❌ Service Worker 등록 실패:', err);
            });
    }
}

// ============================================================
// 38. 날씨 정보 가져오기
// ============================================================

async function fetchWeather() {
    var weatherEl = document.getElementById('weatherDisplay');
    if (!weatherEl) {
        console.warn('⚠️ 날씨 표시 요소 없음');
        return;
    }

    try {
        var apiKey = 'b84c1b9a09d8316b679320cceb3a1097';
        var center = getRegionCenter(currentRegion);
        var lat = center.lat;
        var lon = center.lng;
        var url = 'https://api.openweathermap.org/data/2.5/weather?lat=' + lat + '&lon=' + lon + '&appid=' + apiKey + '&units=metric&lang=kr';
        
        var response = await fetch(url);
        if (!response.ok) {
            throw new Error('날씨 API 호출 실패 (상태: ' + response.status + ')');
        }
        
        var data = await response.json();
        var temp = Math.round(data.main.temp);
        var desc = data.weather[0].description;
        var icon = data.weather[0].icon;

        var iconEmoji = {
            '01d': '☀️', '01n': '🌙', '02d': '⛅', '02n': '☁️',
            '03d': '☁️', '03n': '☁️', '04d': '☁️', '04n': '☁️',
            '09d': '🌧️', '09n': '🌧️', '10d': '🌦️', '10n': '🌦️',
            '11d': '⛈️', '11n': '⛈️', '13d': '❄️', '13n': '❄️',
            '50d': '🌫️', '50n': '🌫️'
        };

        weatherEl.innerHTML = '<span>' + (iconEmoji[icon] || '🌡️') + '</span><span class="temp">' + temp + '°C</span><span>' + desc + '</span>';
        console.log('✅ 날씨 표시 성공:', temp + '°C');

    } catch (error) {
        console.error('❌ 날씨 오류:', error);
        weatherEl.innerHTML = '<span>⏳</span><span class="temp">--°C</span><span>날씨</span>';
    }
}

// ============================================================
// 39. 초기화 실행
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    loadRegionList();
    
    // currentRegion이 없으면 빈 상태로 시작
    if (currentRegion) {
        var key = getStorageKey(currentRegion);
        var data = localStorage.getItem(key);
        places = data ? JSON.parse(data) : [];
    } else {
        places = [];
    }
    
    renderPlaces();
    renderWaypointList();
    setOptimizeMode(optimizeMode);
    updateStorageInfo();
    setTimeout(initMap, 500);
    
    setTimeout(function() {
        if (!kakaoMap && !sdkLoading) { initMap(); }
    }, 3000);
    setTimeout(function() {
        if (!kakaoMap && !sdkLoading) { initMap(); }
    }, 6000);
    
    registerServiceWorker();
    setTimeout(fetchWeather, 3000);
});
