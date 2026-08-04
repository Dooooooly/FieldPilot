// ============================================================
// 경로 최적화 PWA - VBA 완벽 포팅
// ============================================================

// --- 저장소 키 ---
const STORAGE_KEY_PREFIX = 'places_';
const SELECTED_REGION_KEY = 'selectedRegion';
const SETTINGS_KEY = 'app_settings';

// --- 상태 ---
let currentRegion = localStorage.getItem(SELECTED_REGION_KEY) || 'seoul';
let places = [];
let routeResult = null;
let kakaoMap = null;
let kakaoMarkers = [];
let kakaoPolyline = null;
let startPoint = null;  // ← 중복 선언 제거! (한 번만)
let settings = {};

// ============================================================
// 1. 설정 관리
// ============================================================

function loadSettings() {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
        try {
            settings = JSON.parse(saved);
            document.getElementById('githubToken').value = settings.githubToken || '';
            document.getElementById('kakaoJsKey').value = settings.kakaoJsKey || '';
            document.getElementById('kakaoRestKey').value = settings.kakaoRestKey || '';
            updateSettingsStatus();
        } catch (e) {
            console.error('설정 로드 오류:', e);
        }
    }
}

function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    updateSettingsStatus();
}

function saveGitHubToken() {
    const token = document.getElementById('githubToken').value.trim();
    settings.githubToken = token;
    saveSettings();
    alert('✅ GitHub 토큰이 저장되었습니다.');
    testGitHubToken();
}

function saveKakaoKeys() {
    settings.kakaoJsKey = document.getElementById('kakaoJsKey').value.trim();
    settings.kakaoRestKey = document.getElementById('kakaoRestKey').value.trim();
    saveSettings();
    alert('✅ 카카오 API 키가 저장되었습니다.');
}

function updateSettingsStatus() {
    const githubStatus = document.getElementById('githubStatus');
    if (settings.githubToken) {
        githubStatus.className = 'status status-ok';
        githubStatus.textContent = '✅ 토큰이 설정됨';
    } else {
        githubStatus.className = 'status status-wait';
        githubStatus.textContent = '⏳ 토큰이 설정되지 않았습니다';
    }
    
    const kakaoStatus = document.getElementById('kakaoStatus');
    if (settings.kakaoJsKey && settings.kakaoRestKey) {
        kakaoStatus.className = 'status status-ok';
        kakaoStatus.textContent = '✅ JavaScript 키, REST API 키 설정됨';
    } else if (settings.kakaoJsKey || settings.kakaoRestKey) {
        kakaoStatus.className = 'status status-wait';
        kakaoStatus.textContent = '⚠️ 일부 키만 설정됨';
    } else {
        kakaoStatus.className = 'status status-wait';
        kakaoStatus.textContent = '⏳ API 키가 설정되지 않았습니다';
    }
}

async function testGitHubToken() {
    const token = settings.githubToken || document.getElementById('githubToken').value.trim();
    if (!token) {
        alert('GitHub 토큰을 먼저 입력해주세요.');
        return;
    }
    
    const status = document.getElementById('githubStatus');
    status.className = 'status status-wait';
    status.textContent = '⏳ 테스트 중...';
    
    try {
        const response = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });
        
        if (response.ok) {
            const user = await response.json();
            status.className = 'status status-ok';
            status.textContent = `✅ 연결 성공! (${user.login})`;
            settings.githubToken = token;
            saveSettings();
        } else {
            status.className = 'status status-fail';
            status.textContent = `❌ 연결 실패 (${response.status})`;
        }
    } catch (error) {
        status.className = 'status status-fail';
        status.textContent = '❌ 네트워크 오류';
    }
}

// ============================================================
// 2. 저장소 관리
// ============================================================

function getStorageKey(region) {
    return STORAGE_KEY_PREFIX + region;
}

function loadPlaces(region) {
    const key = getStorageKey(region);
    const data = localStorage.getItem(key);
    places = data ? JSON.parse(data) : [];
    renderPlaces();
    renderList();
    updateStorageInfo();
}

function savePlaces() {
    const key = getStorageKey(currentRegion);
    localStorage.setItem(key, JSON.stringify(places));
    renderPlaces();
    renderList();
    updateStorageInfo();
    autoSyncToGitHub();
}

function switchRegion(region) {
    currentRegion = region;
    localStorage.setItem(SELECTED_REGION_KEY, region);
    loadPlaces(region);
    document.getElementById('regionSelect').value = region;
}

function addRegion() {
    const name = prompt('새 지역명을 입력하세요 (영문):', 'newregion');
    if (name && name.trim()) {
        const region = name.trim().toLowerCase();
        const opt = document.createElement('option');
        opt.value = region;
        opt.textContent = '📍 ' + region;
        document.getElementById('regionSelect').appendChild(opt);
        document.getElementById('regionSelect').value = region;
        switchRegion(region);
    }
}

function updateStorageInfo() {
    const total = localStorage.length;
    let size = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) size += localStorage.getItem(key).length * 2;
    }
    const sizeKB = (size / 1024).toFixed(1);
    const el = document.getElementById('storageInfo');
    if (el) el.textContent = `저장소 사용량: ${sizeKB} KB (항목 ${total}개)`;
}

// ============================================================
// 3. GitHub 동기화
// ============================================================

let syncTimeout = null;

function autoSyncToGitHub() {
    if (!settings.githubToken) return;
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        syncToGitHub(true);
    }, 3000);
}

async function syncToGitHub(silent = false) {
    const token = settings.githubToken;
    if (!token) {
        if (!silent) alert('⚠️ GitHub 토큰이 설정되지 않았습니다.');
        return;
    }
    
    const statusEl = document.getElementById('syncStatus');
    if (!silent) {
        statusEl.textContent = '⏳ 동기화 중...';
        statusEl.style.color = '#805ad5';
    }
    
    try {
        const userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        const user = await userRes.json();
        
        const fileName = `${currentRegion}.json`;
        const content = JSON.stringify(places, null, 2);
        const b64Content = btoa(unescape(encodeURIComponent(content)));
        
        const url = `https://api.github.com/repos/${user.login}/route-data/contents/${fileName}`;
        
        let sha = '';
        const getRes = await fetch(url, {
            headers: { 'Authorization': `token ${token}` }
        });
        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
        }
        
        const putData = {
            message: `Auto sync: ${currentRegion} (${new Date().toLocaleString()})`,
            content: b64Content
        };
        if (sha) putData.sha = sha;
        
        const putRes = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(putData)
        });
        
        if (!putRes.ok) throw new Error(`업로드 실패: ${putRes.status}`);
        
        if (!silent) {
            statusEl.textContent = '✅ 동기화 완료!';
            statusEl.style.color = '#38a169';
            setTimeout(() => {
                statusEl.textContent = '☁️ 동기화됨';
                statusEl.style.color = '#718096';
            }, 3000);
        } else {
            statusEl.textContent = '☁️ 동기화됨';
            statusEl.style.color = '#718096';
        }
        
    } catch (error) {
        console.error('GitHub 동기화 오류:', error);
        if (!silent) {
            statusEl.textContent = '❌ 동기화 실패';
            statusEl.style.color = '#e53e3e';
            alert('GitHub 동기화 실패: ' + error.message);
        }
    }
}

async function loadFromGitHub() {
    const token = settings.githubToken;
    if (!token) {
        alert('⚠️ GitHub 토큰이 설정되지 않았습니다.');
        return;
    }
    
    const statusEl = document.getElementById('syncStatus');
    statusEl.textContent = '⏳ 불러오는 중...';
    statusEl.style.color = '#805ad5';
    
    try {
        const userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        const user = await userRes.json();
        
        const fileName = `${currentRegion}.json`;
        const url = `https://api.github.com/repos/${user.login}/route-data/contents/${fileName}`;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `token ${token}` }
        });
        
        if (response.status === 404) {
            alert('GitHub에 저장된 데이터가 없습니다.');
            statusEl.textContent = '📭 데이터 없음';
            statusEl.style.color = '#718096';
            return;
        }
        
        if (!response.ok) throw new Error(`불러오기 실패: ${response.status}`);
        
        const data = await response.json();
        const content = decodeURIComponent(escape(atob(data.content)));
        const loaded = JSON.parse(content);
        
        if (loaded.length === 0) {
            alert('빈 데이터입니다.');
            return;
        }
        
        if (places.length > 0) {
            if (!confirm(`현재 ${places.length}개 데이터를 ${loaded.length}개로 덮어쓰시겠습니까?`)) {
                return;
            }
        }
        
        places = loaded;
        savePlaces();
        
        statusEl.textContent = '✅ 불러오기 완료!';
        statusEl.style.color = '#38a169';
        alert(`✅ ${places.length}개 데이터를 불러왔습니다.`);
        
        setTimeout(() => {
            statusEl.textContent = '☁️ 동기화됨';
            statusEl.style.color = '#718096';
        }, 3000);
        
    } catch (error) {
        console.error('GitHub 불러오기 오류:', error);
        statusEl.textContent = '❌ 불러오기 실패';
        statusEl.style.color = '#e53e3e';
        alert('GitHub 불러오기 실패: ' + error.message);
    }
}

// ============================================================
// 4. 지오코딩
// ============================================================

async function geocodeAddress(address) {
    const restKey = settings.kakaoRestKey;
    if (!restKey) {
        alert('⚠️ 카카오 REST API 키가 설정되지 않았습니다.\n설정 탭에서 키를 입력해주세요.');
        return null;
    }
    
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `KakaoAK ${restKey}` }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                alert('⚠️ REST API 키가 올바르지 않습니다.');
            } else if (response.status === 403) {
                alert('⚠️ 카카오 개발자센터에 도메인이 등록되지 않았습니다.');
            }
            return null;
        }
        
        const data = await response.json();
        
        if (data.documents && data.documents.length > 0) {
            const doc = data.documents[0];
            const road = doc.road_address;
            if (road) {
                return {
                    lat: parseFloat(road.y),
                    lng: parseFloat(road.x),
                    address: road.address_name
                };
            }
            const addr = doc.address;
            return {
                lat: parseFloat(addr.y),
                lng: parseFloat(addr.x),
                address: addr.address_name
            };
        }
        return null;
    } catch (error) {
        console.error('Geocode error:', error);
        return null;
    }
}

// ============================================================
// 5. 장소 CRUD
// ============================================================

function renderPlaces() {
    const container = document.getElementById('placeList');
    if (!container) return;
    
    if (places.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📭</div>
                <div class="text">장소가 없습니다</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = places.map((p, i) => `
        <div class="place-item">
            <div class="idx">${i + 1}</div>
            <div class="info">
                <div class="name">${p.name}</div>
                <div class="address">${p.address || '(주소 없음)'}</div>
                ${p.lat && p.lng ? `<div class="coord">📍 ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div>` : ''}
            </div>
            <div class="actions">
                <button class="edit" onclick="editPlace('${p.id}')">✏️</button>
                <button onclick="deletePlace('${p.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function deletePlace(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    places = places.filter(p => p.id !== id);
    savePlaces();
}

function editPlace(id) {
    const place = places.find(p => p.id === id);
    if (!place) return;
    
    document.getElementById('modalTitle').textContent = '✏️ 장소 편집';
    document.getElementById('modalName').value = place.name;
    document.getElementById('modalAddress').value = place.address;
    document.getElementById('modalId').value = id;
    document.getElementById('modal').classList.add('active');
}

function saveModal() {
    const id = document.getElementById('modalId').value;
    const name = document.getElementById('modalName').value.trim();
    const address = document.getElementById('modalAddress').value.trim();
    
    const place = places.find(p => p.id === id);
    if (place) {
        place.name = name || place.name;
        place.address = address || place.address;
        savePlaces();
    }
    closeModal();
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// ============================================================
// 6. 개소리스트
// ============================================================

function addToList() {
    const name = document.getElementById('listName').value.trim();
    const address = document.getElementById('listAddress').value.trim();
    
    if (!name && !address) {
        alert('개소명 또는 주소를 입력하세요.');
        return;
    }
    
    const newPlace = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: name || '무명',
        address: address || '',
        lat: 0,
        lng: 0
    };
    
    places.push(newPlace);
    savePlaces();
    
    document.getElementById('listName').value = '';
    document.getElementById('listAddress').value = '';
    document.getElementById('listName').focus();
}

function renderList() {
    const container = document.getElementById('listContainer');
    if (!container) return;
    
    if (places.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📭</div>
                <div class="text">개소가 없습니다</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = places.map((p, i) => `
        <div class="place-item">
            <div class="idx">${i + 1}</div>
            <div class="info">
                <div class="name">${p.name}</div>
                <div class="address">${p.address || '(주소 없음)'}</div>
            </div>
            <div class="actions">
                <button onclick="deletePlace('${p.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

// ============================================================
// 7. 엑셀 내보내기/가져오기
// ============================================================

function exportExcel() {
    if (places.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
    }
    
    const data = places.map(p => ({
        '개소명': p.name,
        '도로명주소': p.address
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, '개소리스트');
    
    const fileName = `개소리스트_${currentRegion}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

async function importExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    const loadingSub = document.getElementById('loadingSub');
    loading.classList.add('active');
    loadingText.textContent = '📥 엑셀 파일 처리 중...';
    loadingSub.textContent = '데이터 분석 중';
    
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        
        let added = 0, updated = 0, skipped = 0, errors = 0;
        const report = [];
        
        for (const row of json) {
            const name = String(row['개소명'] || row['name'] || row['Name'] || '').trim();
            const address = String(row['도로명주소'] || row['address'] || row['Address'] || '').trim();
            
            if (!name && !address) {
                errors++;
                continue;
            }
            
            const existing = places.find(p => p.name === name);
            
            if (existing) {
                if (existing.address !== address) {
                    existing.address = address;
                    updated++;
                    report.push({ name: name, action: '🔄 업데이트', detail: `주소 변경` });
                } else {
                    skipped++;
                    report.push({ name: name, action: '⏭️ 건너뜀', detail: '변경 없음' });
                }
            } else {
                places.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    name: name || '무명',
                    address: address || '',
                    lat: 0,
                    lng: 0
                });
                added++;
                report.push({ name: name || '무명', action: '✅ 추가', detail: '신규 개소' });
            }
        }
        
        if (added > 0 || updated > 0) {
            savePlaces();
        }
        
        loading.classList.remove('active');
        
        // 리포트 표시
        let html = `
            <div class="report">
                <div class="title">📊 엑셀 업로드 완료!</div>
                <div class="item"><span class="badge badge-add">✅ 추가</span> ${added}개</div>
                <div class="item"><span class="badge badge-update">🔄 업데이트</span> ${updated}개</div>
                <div class="item"><span class="badge badge-skip">⏭️ 건너뜀</span> ${skipped}개</div>
                ${errors > 0 ? `<div class="item"><span class="badge badge-error">❌ 오류</span> ${errors}개</div>` : ''}
                <div style="font-size:11px;color:#718096;margin-top:4px;">총 처리: ${report.length}개</div>
            </div>
        `;
        
        const oldReport = document.querySelector('.report');
        if (oldReport) oldReport.remove();
        const container = document.getElementById('placeList');
        if (container && container.parentNode) {
            const div = document.createElement('div');
            div.innerHTML = html;
            container.parentNode.insertBefore(div.firstElementChild, container);
        }
        
    } catch (error) {
        loading.classList.remove('active');
        alert('파일 처리 오류: ' + error.message);
    }
    event.target.value = '';
}

// ============================================================
// 8. 16방향 클러스터링
// ============================================================

function calculateAngle(startX, startY, targetX, targetY) {
    const dx = targetX - startX;
    const dy = targetY - startY;
    if (dx === 0 && dy === 0) return 0;
    if (dx === 0) return dy > 0 ? 90 : 270;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return angle;
}

function getClusterGroup16(angle) {
    const directions = [
        [78.75, 101.25, 1], [56.25, 78.75, 2], [33.75, 56.25, 3],
        [11.25, 33.75, 4], [348.75, 11.25, 5], [326.25, 348.75, 6],
        [303.75, 326.25, 7], [281.25, 303.75, 8], [258.75, 281.25, 9],
        [236.25, 258.75, 10], [213.75, 236.25, 11], [191.25, 213.75, 12],
        [168.75, 191.25, 13], [146.25, 168.75, 14], [123.75, 146.25, 15],
        [101.25, 123.75, 16]
    ];
    for (const [min, max, group] of directions) {
        if (min <= max) {
            if (angle >= min && angle < max) return group;
        } else {
            if (angle >= min || angle < max) return group;
        }
    }
    return 5;
}

function optimizeRoute(places, startLat, startLng, firstTargetMode) {
    if (places.length === 0) return [];
    const count = places.length;
    const groups = places.map(p => {
        const angle = calculateAngle(startLng, startLat, p.lng, p.lat);
        return getClusterGroup16(angle);
    });
    const visited = new Array(count).fill(false);
    const sorted = [];
    let currX = startLng;
    let currY = startLat;
    let firstIdx = 0;
    let compVal = firstTargetMode === 'Nearest' ? Infinity : -Infinity;
    for (let i = 0; i < count; i++) {
        if (visited[i]) continue;
        const dist = Math.pow(startLng - places[i].lng, 2) + Math.pow(startLat - places[i].lat, 2);
        if (firstTargetMode === 'Nearest') {
            if (dist < compVal) { compVal = dist; firstIdx = i; }
        } else {
            if (dist > compVal) { compVal = dist; firstIdx = i; }
        }
    }
    function visitGroup(startIdx) {
        const targetGroup = groups[startIdx];
        const groupItems = [];
        for (let i = 0; i < count; i++) {
            if (!visited[i] && groups[i] === targetGroup) {
                groupItems.push(i);
            }
        }
        if (groupItems.length === 0) return;
        groupItems.sort((a, b) => {
            const distA = Math.pow(currX - places[a].lng, 2) + Math.pow(currY - places[a].lat, 2);
            const distB = Math.pow(currX - places[b].lng, 2) + Math.pow(currY - places[b].lat, 2);
            return distA - distB;
        });
        for (const idx of groupItems) {
            sorted.push(places[idx]);
            visited[idx] = true;
            currX = places[idx].lng;
            currY = places[idx].lat;
        }
    }
    visitGroup(firstIdx);
    while (true) {
        let nearestIdx = -1;
        let minDist = Infinity;
        for (let i = 0; i < count; i++) {
            if (visited[i]) continue;
            const dist = Math.pow(currX - places[i].lng, 2) + Math.pow(currY - places[i].lat, 2);
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
// 9. 카카오 경로 API
// ============================================================

async function callKakaoRoute(origin, waypoints, destination) {
    const restKey = settings.kakaoRestKey;
    if (!restKey) {
        alert('⚠️ 카카오 REST API 키가 설정되지 않았습니다.');
        return null;
    }
    const url = 'https://apis-navi.kakaomobility.com/v1/waypoints/directions';
    const payload = {
        origin: { name: origin.name, x: origin.x, y: origin.y },
        destination: { name: destination.name, x: destination.x, y: destination.y },
        priority: 'RECOMMEND'
    };
    if (waypoints && waypoints.length > 0) {
        payload.waypoints = waypoints.map(w => ({ name: w.name, x: w.x, y: w.y }));
    }
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `KakaoAK ${restKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.error('Route API error:', response.status);
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error('Route API error:', error);
        return null;
    }
}

function parseRouteResult(data) {
    if (!data || !data.routes || data.routes.length === 0) return [];
    const sections = data.routes[0].sections || [];
    return sections.map(s => ({
        km: s.distance ? s.distance / 1000 : 0,
        min: s.duration ? s.duration / 60 : 0
    }));
}

// ============================================================
// 10. 경로 최적화 실행 (수정됨)
// ============================================================

async function optimizeRoute() {
    // 1. 출발지 설정
    if (!startPoint) {
        const name = prompt('출발지명을 입력하세요:', '출발지');
        if (!name) return;
        const address = prompt('출발지 도로명주소를 입력하세요:');
        if (!address) return;
        const result = await geocodeAddress(address);
        if (result) {
            startPoint = { 
                name: name, 
                address: result.address, 
                lat: result.lat, 
                lng: result.lng 
            };
        } else {
            alert('출발지 주소 변환에 실패했습니다.');
            return;
        }
    }
    
    // 2. 경유지 확인
    if (places.length === 0) {
        alert('📍 경유지를 최소 1개 이상 추가해주세요!');
        return;
    }
    
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    const loadingSub = document.getElementById('loadingSub');
    loading.classList.add('active');
    loadingText.textContent = '📍 경유지 주소 변환 중...';
    loadingSub.textContent = places.length + '개 경유지 처리 중';
    
    // 3. 경유지 좌표 변환
    let hasError = false;
    for (let i = 0; i < places.length; i++) {
        const place = places[i];
        if (!place.lat || !place.lng) {
            if (place.address) {
                loadingSub.textContent = `${i + 1}/${places.length}: ${place.name}`;
                const result = await geocodeAddress(place.address);
                if (result) {
                    place.lat = result.lat;
                    place.lng = result.lng;
                    place.address = result.address || place.address;
                } else {
                    alert(`❌ 주소 변환 실패: ${place.name} (${place.address})`);
                    hasError = true;
                }
            } else {
                alert(`❌ 주소가 없는 경유지: ${place.name}`);
                hasError = true;
            }
        }
    }
    
    if (hasError) {
        loading.classList.remove('active');
        savePlaces();
        return;
    }
    savePlaces();
    
    // 4. 유효한 경유지 필터링
    const validPlaces = places.filter(p => p.lat && p.lng);
    if (validPlaces.length === 0) {
        alert('좌표가 있는 경유지가 없습니다.');
        loading.classList.remove('active');
        return;
    }
    
    // 5. 최적화 방식 선택
    const mode = confirm('첫 번째 목적지 선택 방식을 선택하세요.\n\n[확인] 출발지에서 가까운 곳부터 시작\n[취소] 출발지에서 먼 곳부터 시작')
        ? 'Nearest' : 'Farthest';
    
    loadingText.textContent = '⚡ 16방향 클러스터링 계산 중...';
    loadingSub.textContent = validPlaces.length + '개 경유지 최적화';
    
    // 6. 경로 최적화 실행
    const sorted = optimizeRouteAlgorithm(validPlaces, startPoint.lat, startPoint.lng, mode);
    
    // ⭐ 중요: sorted가 비어있는지 확인!
    if (!sorted || sorted.length === 0) {
        loading.classList.remove('active');
        alert('⚠️ 최적화된 경로가 없습니다. 경유지 데이터를 확인해주세요.');
        return;
    }
    
    // 7. 카카오 경로 API 호출
    loadingText.textContent = '🗺️ 카카오 경로 API 호출 중...';
    loadingSub.textContent = '경로 정보 가져오는 중';
    
    const origin = { 
        name: startPoint.name, 
        x: startPoint.lng, 
        y: startPoint.lat 
    };
    
    // ⭐ 마지막 경유지를 도착지로 설정
    const lastPlace = sorted[sorted.length - 1];
    const destination = { 
        name: lastPlace.name, 
        x: lastPlace.lng, 
        y: lastPlace.lat 
    };
    
    const waypoints = sorted.slice(0, -1).map(p => ({ 
        name: p.name, 
        x: p.lng, 
        y: p.lat 
    }));
    
    const routeData = await callKakaoRoute(origin, waypoints, destination);
    const sections = parseRouteResult(routeData);
    
    // 8. 결과 저장
    routeResult = {
        places: sorted,
        sections: sections,
        totalKm: sections.reduce((sum, s) => sum + s.km, 0),
        totalMin: sections.reduce((sum, s) => sum + s.min, 0),
        mode: mode,
        startPoint: startPoint
    };
    
    loading.classList.remove('active');
    displayRouteResult();
    showRouteOnMap();
    alert('✅ 경로 최적화 완료!');
}

// ============================================================
// 8. 16방향 클러스터링 (함수명 변경)
// ============================================================

function optimizeRouteAlgorithm(places, startLat, startLng, firstTargetMode) {
    if (!places || places.length === 0) return [];
    
    const count = places.length;
    const groups = places.map(p => {
        const angle = calculateAngle(startLng, startLat, p.lng, p.lat);
        return getClusterGroup16(angle);
    });
    
    const visited = new Array(count).fill(false);
    const sorted = [];
    let currX = startLng;
    let currY = startLat;
    
    // 첫 번째 목적지 선택
    let firstIdx = 0;
    let compVal = firstTargetMode === 'Nearest' ? Infinity : -Infinity;
    
    for (let i = 0; i < count; i++) {
        if (visited[i]) continue;
        const dist = Math.pow(startLng - places[i].lng, 2) + Math.pow(startLat - places[i].lat, 2);
        if (firstTargetMode === 'Nearest') {
            if (dist < compVal) { compVal = dist; firstIdx = i; }
        } else {
            if (dist > compVal) { compVal = dist; firstIdx = i; }
        }
    }
    
    function visitGroup(startIdx) {
        const targetGroup = groups[startIdx];
        const groupItems = [];
        for (let i = 0; i < count; i++) {
            if (!visited[i] && groups[i] === targetGroup) {
                groupItems.push(i);
            }
        }
        if (groupItems.length === 0) return;
        
        groupItems.sort((a, b) => {
            const distA = Math.pow(currX - places[a].lng, 2) + Math.pow(currY - places[a].lat, 2);
            const distB = Math.pow(currX - places[b].lng, 2) + Math.pow(currY - places[b].lat, 2);
            return distA - distB;
        });
        
        for (const idx of groupItems) {
            sorted.push(places[idx]);
            visited[idx] = true;
            currX = places[idx].lng;
            currY = places[idx].lat;
        }
    }
    
    visitGroup(firstIdx);
    
    while (true) {
        let nearestIdx = -1;
        let minDist = Infinity;
        for (let i = 0; i < count; i++) {
            if (visited[i]) continue;
            const dist = Math.pow(currX - places[i].lng, 2) + Math.pow(currY - places[i].lat, 2);
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
// 11. 결과 표시
// ============================================================

function displayRouteResult() {
    if (!routeResult) return;
    const container = document.getElementById('routeList');
    const { places: sorted, sections, totalKm, totalMin, startPoint } = routeResult;
    document.getElementById('totalPlaces').textContent = sorted.length;
    document.getElementById('totalKm').textContent = totalKm.toFixed(2);
    document.getElementById('totalMin').textContent = Math.round(totalMin);
    if (sorted.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#a0aec0;">결과가 없습니다.</div>';
        return;
    }
    let html = `
        <div style="font-weight:600; margin-bottom:10px; font-size:14px;">📋 최적 경로</div>
        <div class="route-item route-start">
            <div class="idx">🚩</div>
            <div class="info">
                <div class="name">${startPoint.name}</div>
                <div class="address">${startPoint.address}</div>
            </div>
        </div>
    `;
    for (let i = 0; i < sorted.length; i++) {
        const p = sorted[i];
        const sec = i < sections.length ? sections[i] : null;
        html += `
            <div class="route-item">
                <div class="idx">${i + 1}</div>
                <div class="info">
                    <div class="name">${p.name}</div>
                    <div class="address">${p.address || ''}</div>
                </div>
                ${sec ? `<div class="dist">${sec.km.toFixed(2)}km<br>${sec.min.toFixed(0)}분</div>` : ''}
            </div>
        `;
    }
    container.innerHTML = html;
    switchTab('map');
}

// ============================================================
// 12. 지도 표시
// ============================================================

function initMap() {
    const jsKey = settings.kakaoJsKey;
    if (!jsKey) {
        console.warn('카카오 JavaScript 키가 설정되지 않았습니다.');
        return;
    }
    if (typeof kakao === 'undefined') {
        console.error('카카오 지도 API가 로드되지 않았습니다.');
        return;
    }
    kakao.maps.load(() => {
        const container = document.getElementById('map');
        kakaoMap = new kakao.maps.Map(container, {
            center: new kakao.maps.LatLng(37.5665, 126.9780),
            level: 7
        });
    });
}

function showRouteOnMap() {
    if (!kakaoMap) {
        initMap();
        setTimeout(showRouteOnMap, 500);
        return;
    }
    for (const m of kakaoMarkers) {
        m.setMap(null);
    }
    kakaoMarkers = [];
    if (kakaoPolyline) {
        kakaoPolyline.setMap(null);
        kakaoPolyline = null;
    }
    if (!routeResult) return;
    const { places: sorted, startPoint } = routeResult;
    if (!startPoint) return;
    const bounds = new kakao.maps.LatLngBounds();
    const path = [];
    const startLatLng = new kakao.maps.LatLng(startPoint.lat, startPoint.lng);
    bounds.extend(startLatLng);
    path.push(startLatLng);
    const startMarker = new kakao.maps.Marker({
        position: startLatLng,
        map: kakaoMap,
        image: new kakao.maps.MarkerImage(
            'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',
            new kakao.maps.Size(24, 35)
        )
    });
    kakaoMarkers.push(startMarker);
    const startInfo = new kakao.maps.InfoWindow({
        content: `<div style="padding:6px 10px; font-weight:bold; color:#2b6cb0;">🚩 ${startPoint.name}</div>`
    });
    startInfo.open(kakaoMap, startMarker);
    kakaoMarkers.push(startInfo);
    for (let i = 0; i < sorted.length; i++) {
        const p = sorted[i];
        const latlng = new kakao.maps.LatLng(p.lat, p.lng);
        bounds.extend(latlng);
        path.push(latlng);
        const marker = new kakao.maps.Marker({
            position: latlng,
            map: kakaoMap
        });
        kakaoMarkers.push(marker);
        const content = `
            <div style="padding:6px 10px; font-size:13px; max-width:150px;">
                <div style="font-weight:bold;">📍 ${i + 1}. ${p.name}</div>
                <div style="font-size:11px; color:#666;">${p.address || ''}</div>
            </div>
        `;
        const infowindow = new kakao.maps.InfoWindow({ content });
        infowindow.open(kakaoMap, marker);
        kakaoMarkers.push(infowindow);
    }
    if (path.length > 1) {
        kakaoPolyline = new kakao.maps.Polyline({
            path: path,
            strokeWeight: 4,
            strokeColor: '#2b6cb0',
            strokeOpacity: 0.7,
            strokeStyle: 'solid'
        });
        kakaoPolyline.setMap(kakaoMap);
    }
    kakaoMap.setBounds(bounds);
}

// ============================================================
// 13. 공유
// ============================================================

function shareRoute() {
    if (!routeResult) {
        alert('먼저 경로 최적화를 실행해주세요.');
        return;
    }
    const { places: sorted, totalKm, totalMin, startPoint } = routeResult;
    let text = '🚚 최적 이동 경로\n\n';
    text += `🚩 출발: ${startPoint.name} (${startPoint.address})\n\n`;
    text += `📊 방문지: ${sorted.length}개소\n`;
    text += `📏 총 거리: ${totalKm.toFixed(2)}km\n`;
    text += `⏱️ 총 시간: 약 ${Math.round(totalMin)}분\n\n`;
    text += '📍 경로:\n';
    sorted.forEach((p, i) => {
        text += `  ${i + 1}. ${p.name}`;
        if (i < sorted.length - 1) text += ' →';
        text += '\n';
    });
    if (navigator.share) {
        navigator.share({ title: '경로 최적화 결과', text }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text).then(() => {
            alert('✅ 경로 정보가 클립보드에 복사되었습니다!');
        }).catch(() => {
            prompt('복사할 내용:', text);
        });
    }
}

// ============================================================
// 14. 초기화
// ============================================================

function clearAll() {
    if (!confirm('모든 경유지를 삭제하시겠습니까?')) return;
    places = [];
    routeResult = null;
    startPoint = null;
    savePlaces();
    document.getElementById('routeList').innerHTML = '';
    document.getElementById('totalPlaces').textContent = '0';
    document.getElementById('totalKm').textContent = '0';
    document.getElementById('totalMin').textContent = '0';
    if (kakaoMap) {
        for (const m of kakaoMarkers) m.setMap(null);
        kakaoMarkers = [];
        if (kakaoPolyline) { kakaoPolyline.setMap(null); kakaoPolyline = null; }
    }
}

function resetAll() {
    if (!confirm('⚠️ 모든 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다!')) return;
    if (!confirm('정말로 모든 지역의 모든 데이터를 삭제하시겠습니까?')) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
            keys.push(key);
        }
    }
    for (const key of keys) {
        localStorage.removeItem(key);
    }
    places = [];
    routeResult = null;
    startPoint = null;
    renderPlaces();
    renderList();
    document.getElementById('routeList').innerHTML = '';
    document.getElementById('totalPlaces').textContent = '0';
    document.getElementById('totalKm').textContent = '0';
    document.getElementById('totalMin').textContent = '0';
    if (kakaoMap) {
        for (const m of kakaoMarkers) m.setMap(null);
        kakaoMarkers = [];
        if (kakaoPolyline) { kakaoPolyline.setMap(null); kakaoPolyline = null; }
    }
    updateStorageInfo();
    alert('✅ 모든 데이터가 초기화되었습니다.');
}

// ============================================================
// 15. 설정 내보내기/가져오기
// ============================================================

function exportSettings() {
    const data = {
        githubToken: settings.githubToken || '',
        kakaoJsKey: settings.kakaoJsKey || '',
        kakaoRestKey: settings.kakaoRestKey || '',
        exportDate: new Date().toISOString(),
        version: '1.0.0'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `settings_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            settings.githubToken = data.githubToken || '';
            settings.kakaoJsKey = data.kakaoJsKey || '';
            settings.kakaoRestKey = data.kakaoRestKey || '';
            saveSettings();
            document.getElementById('githubToken').value = settings.githubToken;
            document.getElementById('kakaoJsKey').value = settings.kakaoJsKey;
            document.getElementById('kakaoRestKey').value = settings.kakaoRestKey;
            alert('✅ 설정이 복원되었습니다!');
        } catch (error) {
            alert('설정 파일 파싱 오류: ' + error.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ============================================================
// 16. 탭 전환 (추가됨!)
// ============================================================

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    const tabEl = document.querySelector(`.tab[data-tab="${tab}"]`);
    const contentEl = document.getElementById(`tab-${tab}`);
    
    if (tabEl) tabEl.classList.add('active');
    if (contentEl) contentEl.classList.add('active');
    
    if (tab === 'map' && routeResult) {
        setTimeout(showRouteOnMap, 300);
    }
    if (tab === 'settings') {
        loadSettings();
        updateStorageInfo();
    }
}

// ============================================================
// 17. 초기화 및 이벤트
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    // 지역 선택 이벤트
    const regionSelect = document.getElementById('regionSelect');
    if (regionSelect) {
        regionSelect.addEventListener('change', (e) => {
            switchRegion(e.target.value);
        });
    }
    
    // 엔터키 이벤트
    const listAddress = document.getElementById('listAddress');
    const listName = document.getElementById('listName');
    if (listAddress) {
        listAddress.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addToList();
        });
    }
    if (listName) {
        listName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const next = document.getElementById('listAddress');
                if (next) next.focus();
            }
        });
    }
    
    // 앱 초기화
    loadSettings();
    loadPlaces(currentRegion);
    
    // 카카오 지도 초기화
    if (typeof kakao !== 'undefined') {
        kakao.maps.load(initMap);
    }
    
    console.log('🚚 경로 최적화 PWA 로드 완료!');
    console.log(`📍 지역: ${currentRegion}, 경유지: ${places.length}개`);
    console.log(`🔐 GitHub: ${settings.githubToken ? '✅ 설정됨' : '❌ 미설정'}`);
});
