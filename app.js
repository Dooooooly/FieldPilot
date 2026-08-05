// ============================================================
// 경로 최적화 PWA - VBA 완벽 포팅
// ============================================================

// --- 저장소 키 ---
const STORAGE_KEY_PREFIX = 'places_';
const SELECTED_REGION_KEY = 'selectedRegion';
const SETTINGS_KEY = 'app_settings';
const OPTIMIZE_MODE_KEY = 'optimizeMode';

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
let searchTimeout = null;
let selectedSearchIndex = -1;
let waypointSearchIndex = -1;
let addrSearchIndex = -1;
let placeMarkers = [];
let routeMarkers = [];
let autoSyncTimer = null;

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
        }, 300);
    }
    
    if (tabId === 'tab-list') {
        renderPlaces();
    }
}

// ============================================================
// 2. 저장된 지역 목록 불러오기
// ============================================================

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
    showStatus('✅ GitHub 토큰 저장됨', 'ok');
    testGitHubToken();
}

function saveKakaoKeys() {
    settings.kakaoJsKey = document.getElementById('kakaoJsKey').value.trim();
    settings.kakaoRestKey = document.getElementById('kakaoRestKey').value.trim();
    saveSettings();
    showStatus('✅ 카카오 API 키 저장됨', 'ok');
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
    if (!token) { showStatus('토큰을 입력하세요.', 'warning'); return; }
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
// 4. 저장소 관리
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
    if (kakaoMap) {
        setTimeout(showPlaceMarkers, 500);
    }
}

function savePlaces() {
    var key = getStorageKey(currentRegion);
    localStorage.setItem(key, JSON.stringify(places));
    renderPlaces();
    updateStorageInfo();
    if (kakaoMap) {
        showPlaceMarkers();
    }
    // 자동 GitHub 동기화 (5초 후)
    scheduleAutoSync();
}

function switchRegion(region) {
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
    
    if (kakaoMap) {
        setTimeout(showPlaceMarkers, 500);
    }
    
    document.getElementById('startInfo').textContent = '⏳ 출발지를 검색하고 설정하세요';
    document.getElementById('startInfo').style.color = '#718096';
    document.getElementById('placeCount').textContent = '0개소';
    document.getElementById('totalDistance').textContent = '0.00 km';
    document.getElementById('totalTime').textContent = '0 분';
    document.getElementById('optimizeMode').textContent = '-';
    document.getElementById('routeList').innerHTML = '';
    showStatus('📍 ' + region + ' 지역으로 전환', 'info');
}

function addRegion() {
    var name = prompt('새 지역명을 입력하세요:', '');
    if (name && name.trim()) {
        var region = name.trim();
        
        var select = document.getElementById('regionSelect');
        var exists = false;
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === region) {
                exists = true;
                break;
            }
        }
        
        if (exists) {
            showStatus('⚠️ 이미 존재하는 지역입니다.', 'warning');
            return;
        }
        
        var key = getStorageKey(region);
        localStorage.setItem(key, JSON.stringify([]));
        
        var opt = document.createElement('option');
        opt.value = region;
        opt.textContent = region;
        select.appendChild(opt);
        select.value = region;
        
        switchRegion(region);
        showStatus('✅ "' + region + '" 지역이 추가되었습니다.', 'ok');
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
// 5. GitHub 자동 동기화
// ============================================================

function scheduleAutoSync() {
    clearTimeout(autoSyncTimer);
    if (!settings.githubToken) return;
    autoSyncTimer = setTimeout(function() {
        uploadToGitHub(true);
    }, 5000);
}

// ============================================================
// 6. GitHub 업로드
// ============================================================

async function uploadToGitHub(silent) {
    silent = silent || false;
    var token = settings.githubToken;
    if (!token) {
        if (!silent) showStatus('⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    
    try {
        if (!silent) showStatus('☁️ GitHub 업로드 중...', 'info');
        
        var userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        var user = await userRes.json();
        var username = user.login;
        
        var repoName = 'route-data';
        var fileName = currentRegion + '.json';
        var content = JSON.stringify(places, null, 2);
        var b64Content = btoa(unescape(encodeURIComponent(content)));
        
        // 저장소 확인
        var repoUrl = 'https://api.github.com/repos/' + username + '/' + repoName;
        var repoRes = await fetch(repoUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        if (repoRes.status === 404) {
            var createRes = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: {
                    'Authorization': 'token ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: repoName,
                    description: '경로 최적화 데이터 저장소',
                    private: false,
                    auto_init: true
                })
            });
            if (!createRes.ok) throw new Error('저장소 생성 실패');
            if (!silent) showStatus('✅ 저장소 생성됨: ' + repoName, 'ok');
        }
        
        // 파일 업로드
        var fileUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + fileName;
        var fileRes = await fetch(fileUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        var sha = '';
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
            showStatus('✅ GitHub 업로드 완료! (' + places.length + '개)', 'ok');
        }
        
    } catch (error) {
        console.error('GitHub 업로드 오류:', error);
        if (!silent) {
            showStatus('❌ 업로드 실패: ' + error.message, 'error');
        }
    }
}

// ============================================================
// 7. GitHub 다운로드
// ============================================================

async function downloadFromGitHub() {
    var token = settings.githubToken;
    if (!token) {
        showStatus('⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    
    try {
        showStatus('☁️ GitHub 다운로드 중...', 'info');
        
        var userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        var user = await userRes.json();
        var username = user.login;
        
        var repoName = 'route-data';
        var fileName = currentRegion + '.json';
        var fileUrl = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + fileName;
        
        var fileRes = await fetch(fileUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        if (fileRes.status === 404) {
            showStatus('📭 GitHub에 저장된 데이터가 없습니다.', 'warning');
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
        showStatus('✅ GitHub 다운로드 완료! (' + loadedPlaces.length + '개)', 'ok');
        
    } catch (error) {
        console.error('GitHub 다운로드 오류:', error);
        showStatus('❌ 다운로드 실패: ' + error.message, 'error');
    }
}

// ============================================================
// 8. GitHub 히스토리
// ============================================================

async function showGitHubHistory() {
    var token = settings.githubToken;
    if (!token) {
        showStatus('⚠️ GitHub 토큰이 없습니다.', 'warning');
        return;
    }
    
    var historyDiv = document.getElementById('githubHistory');
    
    try {
        showStatus('📋 히스토리 불러오는 중...', 'info');
        
        var userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'token ' + token }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        var user = await userRes.json();
        var username = user.login;
        
        var repoName = 'route-data';
        var fileName = currentRegion + '.json';
        var url = 'https://api.github.com/repos/' + username + '/' + repoName + '/commits?path=' + fileName + '&per_page=10';
        
        var commitRes = await fetch(url, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        if (!commitRes.ok) {
            if (commitRes.status === 404) {
                historyDiv.innerHTML = '<div style="color:#a0aec0;text-align:center;padding:8px;">📭 아직 커밋 기록이 없습니다</div>';
                historyDiv.style.display = 'block';
                showStatus('📭 히스토리가 없습니다.', 'warning');
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
                html += '<span>' + msg + '</span>';
                html += '<span style="color:#a0aec0;">' + dateStr + '</span>';
                html += '</div>';
            }
            historyDiv.innerHTML = html;
        }
        
        historyDiv.style.display = 'block';
        showStatus('✅ 히스토리 로드 완료', 'ok');
        
    } catch (error) {
        console.error('히스토리 오류:', error);
        historyDiv.innerHTML = '<div style="color:#e53e3e;text-align:center;padding:8px;">❌ 히스토리 로드 실패</div>';
        historyDiv.style.display = 'block';
        showStatus('❌ 히스토리 로드 실패', 'error');
    }
}

// ============================================================
// 9. 최적화 방식
// ============================================================

function setOptimizeMode(mode) {
    optimizeMode = mode;
    localStorage.setItem(OPTIMIZE_MODE_KEY, mode);
    document.getElementById('modeNearest').className = 'btn btn-sm' + (mode === 'Nearest' ? ' btn-primary' : ' btn-outline');
    document.getElementById('modeFarthest').className = 'btn btn-sm' + (mode === 'Farthest' ? ' btn-primary' : ' btn-outline');
    document.getElementById('modeInfo').textContent = '현재: ' + (mode === 'Nearest' ? '가까운순' : '먼순');
}

// ============================================================
// 10. 카카오맵 장소 검색
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
    } catch {
        return [];
    }
}

function renderSearchResults(container, results, onClick) {
    if (!results || results.length === 0) {
        container.style.display = 'none';
        return;
    }
    var html = '';
    for (var i = 0; i < results.length; i++) {
        var item = results[i];
        html += '<div class="result-item" onclick="' + onClick + '(\'' + item.place_name + '\', \'' + item.address_name + '\', ' + item.y + ', ' + item.x + ')" data-index="' + i + '">';
        html += '<div>' + item.place_name + '</div>';
        html += '<div class="addr">' + item.address_name + '</div>';
        html += '</div>';
    }
    container.innerHTML = html;
    container.style.display = 'block';
}

// ============================================================
// 11. 출발지 검색
// ============================================================

async function searchStartPoint(query) {
    var container = document.getElementById('startSearchResults');
    if (!query || query.length < 2) {
        container.style.display = 'none';
        return;
    }
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async function() {
        var results = await searchKakaoPlaces(query);
        renderSearchResults(container, results, 'selectStartPoint');
    }, 300);
}

function handleStartKeydown(event) {
    var results = document.querySelectorAll('#startSearchResults .result-item');
    if (results.length === 0) return;
    handleResultKeydown(event, results, 'startSearchResults', 'selectedSearchIndex');
}

function selectStartPoint(name, address, lat, lng) {
    document.getElementById('startPoint').value = name;
    document.getElementById('startSearchResults').style.display = 'none';
    selectedSearchIndex = -1;
    
    startPoint = {
        name: name,
        address: address,
        lat: parseFloat(lat),
        lng: parseFloat(lng)
    };
    
    var info = document.getElementById('startInfo');
    info.textContent = '✅ ' + name + ' (' + address + ')';
    info.style.color = '#22543d';
    
    if (kakaoMap) {
        clearRouteMarkers();
        addRouteMarker(startPoint.lat, startPoint.lng, '🚩 ' + name, true);
        kakaoMap.setCenter(new kakao.maps.LatLng(startPoint.lat, startPoint.lng));
        kakaoMap.setLevel(4);
    }
    showStatus('✅ 출발지 "' + name + '" 설정 완료', 'ok');
}

// ============================================================
// 12. 경유지 검색
// ============================================================

async function searchWaypoint(query) {
    var container = document.getElementById('waypointSearchResults');
    if (!query || query.length < 1) {
        container.style.display = 'none';
        return;
    }
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async function() {
        var results = await searchKakaoPlaces(query, 5);
        if (results.length === 0) {
            container.style.display = 'none';
            return;
        }
        var html = '';
        for (var i = 0; i < results.length; i++) {
            var item = results[i];
            html += '<div class="result-item" onclick="selectWaypointFromSearch(\'' + item.place_name + '\', \'' + item.address_name + '\', ' + item.y + ', ' + item.x + ')" data-index="' + i + '">';
            html += '<div>' + item.place_name + '</div>';
            html += '<div class="addr">' + item.address_name + '</div>';
            html += '</div>';
        }
        container.innerHTML = html;
        container.style.display = 'block';
    }, 300);
}

function handleWaypointKeydown(event) {
    var results = document.querySelectorAll('#waypointSearchResults .result-item');
    if (results.length === 0) return;
    handleResultKeydown(event, results, 'waypointSearchResults', 'waypointSearchIndex');
}

function selectWaypointFromSearch(name, address, lat, lng) {
    document.getElementById('waypointInput').value = name;
    document.getElementById('waypointSearchResults').style.display = 'none';
    waypointSearchIndex = -1;
    
    if (waypoints.length >= 15) {
        showStatus('⚠️ 최대 15개까지 가능', 'warning');
        return;
    }
    
    waypoints.push({
        name: name,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        address: address
    });
    renderWaypointList();
    showStatus('✅ "' + name + '" 경유지 추가', 'ok');
}

// ============================================================
// 13. 개소탭 주소 검색
// ============================================================

async function searchAddressForPlace(query) {
    var container = document.getElementById('addrSearchResults');
    if (!query || query.length < 2) {
        container.style.display = 'none';
        return;
    }
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async function() {
        var results = await searchKakaoPlaces(query);
        renderSearchResults(container, results, 'selectAddress');
    }, 300);
}

function handleAddrKeydown(event) {
    var results = document.querySelectorAll('#addrSearchResults .result-item');
    if (results.length === 0) return;
    handleResultKeydown(event, results, 'addrSearchResults', 'addrSearchIndex');
}

function selectAddress(name, address, lat, lng) {
    document.getElementById('newPlaceAddr').value = address;
    document.getElementById('addrSearchResults').style.display = 'none';
    addrSearchIndex = -1;
    var nameInput = document.getElementById('newPlaceName');
    if (!nameInput.value.trim()) {
        nameInput.value = name;
    }
}

// ============================================================
// 14. 키보드 네비게이션
// ============================================================

function handleResultKeydown(event, results, containerId, stateKey) {
    var index = window[stateKey] || -1;
    
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
    
    window[stateKey] = index;
    for (var i = 0; i < results.length; i++) {
        results[i].style.background = i === index ? '#bee3f8' : '';
    }
}

// ============================================================
// 15. 개소 관리
// ============================================================

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
        html += '<span class="name">' + p.name + '</span>';
        if (addressDisplay) {
            html += '<span class="addr">' + addressDisplay + '</span>';
        }
        html += '</div>';
        html += '<div class="actions">';
        html += '<button class="add" onclick="addWaypointFromList(\'' + p.id + '\')" title="경유지 추가">➕</button>';
        html += '<button class="del" onclick="deletePlace(\'' + p.id + '\')" title="삭제">🗑️</button>';
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

function addPlace() {
    var name = document.getElementById('newPlaceName').value.trim();
    var address = document.getElementById('newPlaceAddr').value.trim();
    if (!name) { showStatus('개소명을 입력하세요.', 'warning'); return; }
    if (places.find(function(p) { return p.name === name; })) {
        showStatus('⚠️ 이미 존재하는 개소명입니다.', 'warning');
        return;
    }
    places.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: name,
        address: address || '',
        lat: 0,
        lng: 0
    });
    savePlaces();
    document.getElementById('newPlaceName').value = '';
    document.getElementById('newPlaceAddr').value = '';
    document.getElementById('newPlaceName').focus();
    showStatus('✅ "' + name + '" 추가됨', 'ok');
}

function deletePlace(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    places = places.filter(function(p) { return p.id !== id; });
    savePlaces();
    showStatus('✅ 삭제 완료', 'ok');
}

function addWaypointFromList(id) {
    var place = places.find(function(p) { return p.id === id; });
    if (!place) return;
    if (waypoints.length >= 15) { showStatus('⚠️ 최대 15개까지 가능', 'warning'); return; }
    waypoints.push({ name: place.name, lat: place.lat || 0, lng: place.lng || 0 });
    renderWaypointList();
    showStatus('✅ "' + place.name + '" 경유지 추가', 'ok');
}

// ============================================================
// 16. 경유지 관리
// ============================================================

function addWaypoint() {
    var input = document.getElementById('waypointInput');
    var name = input.value.trim();
    if (!name) { showStatus('경유지를 입력하세요.', 'warning'); return; }
    if (waypoints.length >= 15) { showStatus('⚠️ 최대 15개까지 가능', 'warning'); return; }
    
    waypoints.push({ name: name, lat: 0, lng: 0 });
    renderWaypointList();
    input.value = '';
    input.focus();
    document.getElementById('waypointSearchResults').style.display = 'none';
    showStatus('✅ "' + name + '" 추가', 'ok');
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
        html += '<li>';
        html += '<div style="display:flex;align-items:center;">';
        html += '<span class="idx">' + (i + 1) + '</span>';
        html += '<span>' + wp.name + '</span>';
        html += '</div>';
        html += '<span class="remove" onclick="removeWaypoint(' + i + ')">✕</span>';
        html += '</li>';
    }
    list.innerHTML = html;
}

// ============================================================
// 17. 지오코딩
// ============================================================

async function geocodeAddress(address, restKey) {
    if (!address || !restKey) return null;
    try {
        var res = await fetch(
            'https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent(address),
            { headers: { 'Authorization': 'KakaoAK ' + restKey } }
        );
        if (!res.ok) return null;
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
    } catch {
        return null;
    }
}

// ============================================================
// 18. 16방향 클러스터링 (VBA 완벽 포팅)
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
// 19. 경로 최적화 실행
// ============================================================

async function runOptimize() {
    if (!startPoint || !startPoint.lat) {
        showStatus('🚩 출발지를 검색하고 설정하세요!', 'warning');
        document.getElementById('startPoint').focus();
        return;
    }
    if (waypoints.length === 0) {
        showStatus('📍 경유지를 추가하세요!', 'warning');
        return;
    }
    
    var restKey = settings.kakaoRestKey;
    if (!restKey) {
        showStatus('⚠️ REST API 키 필요 (설정 탭)', 'warning');
        return;
    }
    
    showStatus('📍 주소 변환 중...', 'info');
    
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
                var geo = await geocodeAddress(wp.name, restKey);
                if (geo) {
                    lat = geo.lat;
                    lng = geo.lng;
                    var place = places.find(function(p) { return p.name === wp.name; });
                    if (place) {
                        place.lat = lat;
                        place.lng = lng;
                    }
                } else {
                    showStatus('❌ "' + wp.name + '" 변환 실패', 'error');
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
        showStatus('좌표가 있는 경유지가 없습니다.', 'error');
        return;
    }
    
    showStatus('⚡ 16방향 클러스터링 (' + (optimizeMode === 'Nearest' ? '가까운순' : '먼순') + ')', 'info');
    
    var sorted = optimizeRouteAlgorithm(validPlaces, startPoint.lat, startPoint.lng, optimizeMode);
    if (!sorted || sorted.length === 0) {
        showStatus('⚠️ 최적화 실패', 'error');
        return;
    }
    
    clearRouteMarkers();
    var allPoints = [{ name: startPoint.name, lat: startPoint.lat, lng: startPoint.lng }].concat(sorted);
    addRouteMarker(startPoint.lat, startPoint.lng, '🚩 ' + startPoint.name, true);
    for (var i = 0; i < sorted.length; i++) {
        var p = sorted[i];
        addRouteMarker(p.lat, p.lng, (i + 1) + '. ' + p.name);
    }
    drawRoute(allPoints);
    
    var totalKm = (validPlaces.length * 2.5).toFixed(2);
    var totalMin = Math.round(validPlaces.length * 8);
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
    
    var html = '<div style="font-weight:600;font-size:13px;margin-bottom:6px;">📋 최적 경로</div>';
    html += '<div style="padding:6px 10px;background:#ebf8ff;border-radius:6px;margin-bottom:4px;font-size:13px;">🚩 ' + startPoint.name + '</div>';
    for (var i = 0; i < sorted.length; i++) {
        var p = sorted[i];
        html += '<div style="padding:6px 10px;background:#f7fafc;border-radius:6px;margin-bottom:3px;font-size:13px;display:flex;justify-content:space-between;">';
        html += '<span>📍 ' + (i + 1) + '. ' + p.name + '</span>';
        html += '<span style="color:#38a169;">' + ((i + 1) * 2.5) + 'km</span>';
        html += '</div>';
    }
    document.getElementById('routeList').innerHTML = html;
    
    switchTab('tab-route');
    showStatus('✅ 최적화 완료! ' + validPlaces.length + '개소', 'ok');
}

// ============================================================
// 20. 지도 (SDK 동적 로드 + 용산구 기본 위치)
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
        showStatus('⚠️ 카카오 JavaScript 키가 필요합니다.', 'warning');
        return;
    }

    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#d69e2e;font-size:14px;background:#fffff0;border-radius:12px;">⏳ 카카오 지도 로딩 중...</div>';

    if (typeof kakao === 'undefined' || !kakao.maps) {
        console.log('⏳ SDK 동적 로드 시작...');
        var script = document.createElement('script');
        script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + jsKey + '&autoload=false&libraries=services';
        script.async = true;
        script.onload = function() {
            console.log('✅ SDK 스크립트 로드 성공');
            kakao.maps.load(function() {
                createMap(container);
            });
        };
        script.onerror = function() {
            console.error('❌ SDK 스크립트 로드 실패');
            container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;border-radius:12px;padding:20px;text-align:center;">❌ SDK 로드 실패<br><span style="font-size:12px;">네트워크를 확인하세요</span></div>';
            showStatus('❌ SDK 로드 실패', 'error');
        };
        document.head.appendChild(script);
        return;
    }

    console.log('✅ SDK 이미 로드됨, 지도 생성 시작');
    kakao.maps.load(function() {
        createMap(container);
    });
}

// ============================================================
// 21. 지도 생성 함수 (용산구 기본 위치 + 모바일 터치 지원)
// ============================================================

function createMap(container) {
    try {
        console.log('🗺️ 지도 생성 중...');
        
        var centerLat = 37.5326;
        var centerLng = 126.9900;
        var zoomLevel = 14;
        
        if (startPoint && startPoint.lat) {
            centerLat = startPoint.lat;
            centerLng = startPoint.lng;
            zoomLevel = 13;
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
        
        console.log('🗺️ 지도 생성 성공!');
        showStatus('🗺️ 지도 로드 완료', 'ok');
        
        setTimeout(function() {
            showPlaceMarkers();
        }, 300);
        
    } catch (e) {
        console.error('❌ 지도 생성 실패:', e);
        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;font-size:14px;background:#fff5f5;border-radius:12px;padding:20px;text-align:center;">❌ 지도 생성 실패<br><span style="font-size:12px;">' + e.message + '</span></div>';
        showStatus('⚠️ 지도 생성 실패', 'error');
    }
}

// ============================================================
// 22. 개소 마커 표시
// ============================================================

function showPlaceMarkers() {
    if (!kakaoMap) return;
    
    for (var i = 0; i < placeMarkers.length; i++) {
        try { placeMarkers[i].setMap(null); } catch(e) {}
    }
    placeMarkers = [];
    
    var placesWithCoords = places.filter(function(p) {
        return p.lat && p.lng && p.lat !== 0 && p.lng !== 0;
    });
    
    if (placesWithCoords.length === 0) return;
    
    var bounds = new kakao.maps.LatLngBounds();
    
    for (var i = 0; i < placesWithCoords.length; i++) {
        var p = placesWithCoords[i];
        var pos = new kakao.maps.LatLng(p.lat, p.lng);
        bounds.extend(pos);
        
        var marker = new kakao.maps.Marker({
            map: kakaoMap,
            position: pos,
            title: p.name,
            draggable: false
        });
        
        var iw = new kakao.maps.InfoWindow({
            content: '<div style="padding:4px 10px;font-weight:bold;font-size:12px;">📍 ' + p.name + '</div>'
        });
        iw.open(kakaoMap, marker);
        
        placeMarkers.push(marker);
    }
    
    kakaoMap.setBounds(bounds);
}

// ============================================================
// 23. 경로 마커
// ============================================================

function addRouteMarker(lat, lng, title, isStart) {
    if (!kakaoMap) return;
    try {
        var pos = new kakao.maps.LatLng(lat, lng);
        var marker = new kakao.maps.Marker({
            map: kakaoMap,
            position: pos,
            title: title,
            draggable: false
        });
        
        var icon = isStart ? '🚩' : '📍';
        var iw = new kakao.maps.InfoWindow({
            content: '<div style="padding:4px 10px;font-weight:bold;font-size:13px;">' + icon + ' ' + title + '</div>'
        });
        iw.open(kakaoMap, marker);
        
        routeMarkers.push(marker);
        return marker;
    } catch (e) {
        console.error('마커 추가 실패:', e);
    }
}

function clearRouteMarkers() {
    for (var i = 0; i < routeMarkers.length; i++) {
        try { routeMarkers[i].setMap(null); } catch(e) {}
    }
    routeMarkers = [];
    if (kakaoPolyline) {
        try { kakaoPolyline.setMap(null); } catch(e) {}
        kakaoPolyline = null;
    }
}

function drawRoute(path) {
    if (!kakaoMap || !path || path.length < 2) return;
    try {
        if (kakaoPolyline) {
            kakaoPolyline.setMap(null);
            kakaoPolyline = null;
        }
        var linePath = path.map(function(p) {
            return new kakao.maps.LatLng(p.lat, p.lng);
        });
        kakaoPolyline = new kakao.maps.Polyline({
            map: kakaoMap,
            path: linePath,
            strokeWeight: 5,
            strokeColor: '#FF6B6B',
            strokeOpacity: 0.8,
            strokeStyle: 'solid'
        });
        var bounds = new kakao.maps.LatLngBounds();
        for (var i = 0; i < linePath.length; i++) {
            bounds.extend(linePath[i]);
        }
        kakaoMap.setBounds(bounds);
    } catch (e) {
        console.error('경로 그리기 실패:', e);
    }
}

// ============================================================
// 24. 엑셀 파일 처리
// ============================================================

function handleFile(event) {
    var file = event.target.files[0];
    if (!file) return;
    processExcelFile(file);
    event.target.value = '';
}

function processExcelFile(file) {
    var resultDiv = document.getElementById('uploadResult');
    resultDiv.style.display = 'block';
    var ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'csv') {
        var reader = new FileReader();
        reader.onload = function(e) {
            var text = e.target.result;
            var lines = text.split('\n').filter(function(l) { return l.trim(); });
            if (lines.length === 0) { showUploadResult('❌ 데이터 없음', 'error'); return; }
            var header = lines[0].split(',').map(function(h) { return h.trim(); });
            var rows = [];
            for (var i = 1; i < lines.length; i++) {
                var vals = lines[i].split(',').map(function(v) { return v.trim(); });
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
}

function importPlaces(data) {
    if (!data || data.length === 0) {
        showUploadResult('❌ 데이터 없음', 'error');
        return;
    }
    var added = 0, updated = 0, skipped = 0;
    for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var name = String(row['개소명'] || row['name'] || row['Name'] || '').trim();
        var address = String(row['도로명주소'] || row['address'] || row['Address'] || '').trim();
        if (!name) continue;
        var existing = places.find(function(p) { return p.name === name; });
        if (existing) {
            if (existing.address !== address) {
                existing.address = address;
                updated++;
            } else {
                skipped++;
            }
        } else {
            places.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                name: name,
                address: address || '',
                lat: 0,
                lng: 0
            });
            added++;
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
// 25. 데이터 내보내기
// ============================================================

function exportData() {
    if (places.length === 0) { showStatus('내보낼 데이터 없음', 'warning'); return; }
    var data = places.map(function(p) {
        return {
            '개소명': p.name,
            '도로명주소': p.address || '',
            '비고': p.remark || '',
            '위도': p.lat || 0,
            '경도': p.lng || 0
        };
    });
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, '개소리스트');
    XLSX.writeFile(wb, '개소리스트_' + currentRegion + '_' + new Date().toISOString().slice(0,10) + '.xlsx');
    showStatus('✅ 내보내기 완료', 'ok');
}

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
    showStatus('✅ 설정 내보내기 완료', 'ok');
}

function importSettings(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            settings.githubToken = data.githubToken || '';
            settings.kakaoJsKey = data.kakaoJsKey || '';
            settings.kakaoRestKey = data.kakaoRestKey || '';
            saveSettings();
            document.getElementById('githubToken').value = settings.githubToken;
            document.getElementById('kakaoJsKey').value = settings.kakaoJsKey;
            document.getElementById('kakaoRestKey').value = settings.kakaoRestKey;
            showStatus('✅ 설정 복원 완료', 'ok');
            initMap();
        } catch (error) {
            showStatus('❌ 설정 파일 오류: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ============================================================
// 26. 공유
// ============================================================

function shareRoute() {
    if (!routeResult) {
        showStatus('먼저 경로 최적화를 실행하세요.', 'warning');
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
            showStatus('✅ 클립보드 복사 완료', 'ok');
        }).catch(function() {
            showModal('📋 공유', text);
        });
    }
}

// ============================================================
// 27. 초기화
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
    for (var i = 0; i < placeMarkers.length; i++) {
        try { placeMarkers[i].setMap(null); } catch(e) {}
    }
    placeMarkers = [];
    document.getElementById('placeCount').textContent = '0개소';
    document.getElementById('totalDistance').textContent = '0.00 km';
    document.getElementById('totalTime').textContent = '0 분';
    document.getElementById('optimizeMode').textContent = '-';
    document.getElementById('routeList').innerHTML = '';
    document.getElementById('startInfo').textContent = '⏳ 출발지를 검색하고 설정하세요';
    document.getElementById('startInfo').style.color = '#718096';
    updateStorageInfo();
    showStatus('✅ 초기화 완료', 'ok');
    loadRegionList();
}

// ============================================================
// 28. UI 헬퍼
// ============================================================

function showStatus(msg, type) {
    var el = document.getElementById('status');
    el.textContent = msg;
    el.className = 'status-' + type;
}

function showModal(title, body) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').textContent = body;
    document.getElementById('modal').classList.add('active');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// ============================================================
// 29. 초기화 실행
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚗 앱 초기화 시작');
    
    loadSettings();
    loadRegionList();
    
    var key = getStorageKey(currentRegion);
    var data = localStorage.getItem(key);
    places = data ? JSON.parse(data) : [];
    renderPlaces();
    renderWaypointList();
    setOptimizeMode(optimizeMode);
    updateStorageInfo();
    
    setTimeout(function() {
        initMap();
    }, 500);
    
    setTimeout(function() {
        if (!kakaoMap) {
            console.log('⏳ 지도가 없음, 재시도...');
            initMap();
        }
    }, 3000);
    
    setTimeout(function() {
        if (!kakaoMap) {
            console.log('⏳ 마지막 재시도...');
            initMap();
        }
    }, 6000);
    
    console.log('🚗 경로 최적화 PWA 로드 완료');
    console.log('📍 ' + currentRegion + ', 개소 ' + places.length + '개');
});
