// ============================================================
// 경로 최적화 PWA - 메인 앱
// VBA 로직을 JavaScript로 포팅
// ============================================================

// --- 설정 ---
const STORAGE_KEY_PREFIX = 'places_';
const SELECTED_REGION_KEY = 'selectedRegion';
const KAKAO_JS_KEY = '46f550c3a5a9bfc0ceff4bce9ecf71f8'; // 카카오 JavaScript 키 입력

// --- 상태 ---
let currentRegion = localStorage.getItem(SELECTED_REGION_KEY) || 'seoul';
let places = [];
let routeResult = null;
let kakaoMap = null;
let kakaoMarkers = [];
let kakaoPolyline = null;

// ============================================================
// 1. 저장소 관리 (localStorage)
// ============================================================

function getStorageKey(region) {
    return STORAGE_KEY_PREFIX + region;
}

function loadPlaces(region) {
    const key = getStorageKey(region);
    const data = localStorage.getItem(key);
    places = data ? JSON.parse(data) : [];
    renderPlaces();
}

function savePlaces() {
    const key = getStorageKey(currentRegion);
    localStorage.setItem(key, JSON.stringify(places));
    renderPlaces();
}

function switchRegion(region) {
    currentRegion = region;
    localStorage.setItem(SELECTED_REGION_KEY, region);
    loadPlaces(region);
    document.getElementById('regionSelect').value = region;
}

// --- 지역 추가 ---
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

// ============================================================
// 2. 장소 CRUD
// ============================================================

function addPlace() {
    const name = document.getElementById('placeName').value.trim();
    const address = document.getElementById('placeAddress').value.trim();
    
    if (!name && !address) {
        alert('장소명 또는 주소를 입력하세요.');
        return;
    }
    
    const newPlace = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: name || '무명',
        address: address || '',
        lat: 0,
        lng: 0,
        order: places.length + 1,
        cluster: 0
    };
    
    places.push(newPlace);
    savePlaces();
    
    document.getElementById('placeName').value = '';
    document.getElementById('placeAddress').value = '';
    document.getElementById('placeName').focus();
}

function editPlace(id) {
    const place = places.find(p => p.id === id);
    if (!place) return;
    
    document.getElementById('modalTitle').textContent = '장소 편집';
    document.getElementById('modalName').value = place.name;
    document.getElementById('modalAddress').value = place.address;
    document.getElementById('modalId').value = id;
    document.getElementById('modal').classList.add('active');
}

function deletePlace(id) {
    if (!confirm('이 장소를 삭제하시겠습니까?')) return;
    places = places.filter(p => p.id !== id);
    savePlaces();
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

function renderPlaces() {
    const container = document.getElementById('placeList');
    
    if (places.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:#a0aec0;">
                <div style="font-size:48px;">📭</div>
                <div>장소가 없습니다. 추가해주세요!</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = places.map((p, i) => `
        <div class="place-item">
            <div class="place-info">
                <div class="place-name">${i + 1}. ${p.name}</div>
                <div class="place-address">${p.address || '(주소 없음)'}</div>
                ${p.lat && p.lng ? `<div style="font-size:11px; color:#a0aec0;">📍 ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div>` : ''}
            </div>
            <div class="place-actions">
                <button onclick="editPlace('${p.id}')" title="편집">✏️</button>
                <button onclick="deletePlace('${p.id}')" title="삭제">🗑️</button>
            </div>
        </div>
    `).join('');
}

// ============================================================
// 3. 지오코딩 (카카오 API)
// ============================================================

async function geocodeAddress(address) {
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
    
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `KakaoAK ${KAKAO_JS_KEY}`
            }
        });
        
        if (!response.ok) throw new Error('API 호출 실패');
        const data = await response.json();
        
        if (data.documents && data.documents.length > 0) {
            const doc = data.documents[0];
            // 도로명 주소 우선
            const road = doc.road_address;
            if (road) {
                return {
                    lat: parseFloat(road.y),
                    lng: parseFloat(road.x),
                    address: road.address_name
                };
            }
            // 지번 주소
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
// 4. 경로 최적화 엔진 (16방향 클러스터링)
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
    // 16방향 (22.5도 간격)
    const directions = [
        [78.75, 101.25, 1],   // 북
        [56.25, 78.75, 2],    // 북동
        [33.75, 56.25, 3],    // 동북
        [11.25, 33.75, 4],    // 동
        [348.75, 11.25, 5],   // 동남 (0도 기준)
        [326.25, 348.75, 6],  // 남동
        [303.75, 326.25, 7],  // 남
        [281.25, 303.75, 8],  // 남서
        [258.75, 281.25, 9],  // 서남
        [236.25, 258.75, 10], // 서
        [213.75, 236.25, 11], // 서북
        [191.25, 213.75, 12], // 북서
        [168.75, 191.25, 13], // 북북서
        [146.25, 168.75, 14], // 북서북
        [123.75, 146.25, 15], // 북북동
        [101.25, 123.75, 16]  // 북동북
    ];
    
    for (const [min, max, group] of directions) {
        if (min <= max) {
            if (angle >= min && angle < max) return group;
        } else {
            // 348.75 ~ 11.25 (0도 경계)
            if (angle >= min || angle < max) return group;
        }
    }
    return 5; // 기본값
}

function optimizeRoute(places, startLat, startLng, firstTargetMode = 'Nearest') {
    if (places.length === 0) return [];
    
    const count = places.length;
    const rows = places.map((p, i) => i);
    const groups = rows.map(i => {
        const angle = calculateAngle(startLng, startLat, places[i].lng, places[i].lat);
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
    
    // 그룹 방문
    function visitGroup(startIdx) {
        const targetGroup = groups[startIdx];
        const groupItems = [];
        for (let i = 0; i < count; i++) {
            if (!visited[i] && groups[i] === targetGroup) {
                groupItems.push(i);
            }
        }
        if (groupItems.length === 0) return;
        
        // 그룹 내 정렬 (출발지 기준 가까운 순)
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
    
    // 남은 그룹 방문
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
// 5. 카카오 경로 API 호출
// ============================================================

async function callKakaoRoute(origin, destination, waypoints) {
    const url = 'https://apis-navi.kakaomobility.com/v1/waypoints/directions';
    
    const payload = {
        origin: {
            name: origin.name || '출발지',
            x: origin.x,
            y: origin.y
        },
        destination: {
            name: destination.name || '도착지',
            x: destination.x,
            y: destination.y
        },
        priority: 'RECOMMEND'
    };
    
    if (waypoints && waypoints.length > 0) {
        payload.waypoints = waypoints.map(w => ({
            name: w.name || '경유지',
            x: w.x,
            y: w.y
        }));
    }
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `KakaoAK ${KAKAO_JS_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error(`API 호출 실패: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Route API error:', error);
        return null;
    }
}

function parseRouteResult(data) {
    if (!data || !data.routes || data.routes.length === 0) return [];
    
    const route = data.routes[0];
    const sections = route.sections || [];
    const results = [];
    
    for (const section of sections) {
        const dist = section.distance ? section.distance / 1000 : 0;
        const dur = section.duration ? section.duration / 60 : 0;
        results.push({ km: dist, min: dur });
    }
    
    return results;
}

// ============================================================
// 6. 메인 최적화 실행
// ============================================================

async function optimizeRoute() {
    if (places.length === 0) {
        alert('장소를 먼저 추가해주세요.');
        return;
    }
    
    // 좌표가 없는 장소는 지오코딩
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    loading.classList.add('active');
    loadingText.textContent = '주소 변환 중...';
    
    let hasError = false;
    for (const place of places) {
        if (!place.lat || !place.lng) {
            if (place.address) {
                const result = await geocodeAddress(place.address);
                if (result) {
                    place.lat = result.lat;
                    place.lng = result.lng;
                    place.address = result.address || place.address;
                } else {
                    alert(`주소 변환 실패: ${place.name} (${place.address})`);
                    hasError = true;
                }
            }
        }
    }
    
    if (hasError) {
        loading.classList.remove('active');
        return;
    }
    
    // 유효한 좌표가 있는 장소만
    const validPlaces = places.filter(p => p.lat && p.lng);
    if (validPlaces.length === 0) {
        alert('좌표가 있는 장소가 없습니다.');
        loading.classList.remove('active');
        return;
    }
    
    // 출발지 (첫 번째 장소 사용, 또는 사용자 입력)
    const startPlace = validPlaces[0];
    const startLat = startPlace.lat;
    const startLng = startPlace.lng;
    
    // 최적화 방식 선택
    const mode = confirm('출발지에서 가까운 곳부터 시작하시겠습니까?\n(취소: 먼 곳부터 시작)') ? 'Nearest' : 'Farthest';
    
    loadingText.textContent = '경로 최적화 중...';
    
    // 경로 최적화 실행
    const sorted = optimizeRoute(validPlaces, startLat, startLng, mode);
    
    // 경로 API 호출
    if (sorted.length > 1) {
        loadingText.textContent = '카카오 경로 API 호출 중...';
        
        const origin = { name: '출발지', x: startLng, y: startLat };
        const dest = { name: sorted[sorted.length - 1].name, x: sorted[sorted.length - 1].lng, y: sorted[sorted.length - 1].lat };
        const waypoints = sorted.slice(0, -1).map(p => ({
            name: p.name,
            x: p.lng,
            y: p.lat
        }));
        
        const routeData = await callKakaoRoute(origin, dest, waypoints);
        const sections = parseRouteResult(routeData);
        
        // 결과 저장
        routeResult = {
            places: sorted,
            sections: sections,
            totalKm: sections.reduce((sum, s) => sum + s.km, 0),
            totalMin: sections.reduce((sum, s) => sum + s.min, 0),
            mode: mode
        };
    } else {
        routeResult = {
            places: sorted,
            sections: [],
            totalKm: 0,
            totalMin: 0,
            mode: mode
        };
    }
    
    loading.classList.remove('active');
    
    // 결과 표시
    displayRouteResult();
    showRouteOnMap();
    alert('✅ 경로 최적화 완료!');
}

// ============================================================
// 7. 결과 표시
// ============================================================

function displayRouteResult() {
    if (!routeResult) return;
    
    const container = document.getElementById('routeList');
    const { places: sorted, sections, totalKm, totalMin } = routeResult;
    
    // 요약
    document.getElementById('totalPlaces').textContent = sorted.length;
    document.getElementById('totalKm').textContent = totalKm.toFixed(2);
    document.getElementById('totalMin').textContent = Math.round(totalMin);
    
    if (sorted.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#a0aec0;">결과가 없습니다.</div>';
        return;
    }
    
    let html = '<div style="font-weight:600; margin-bottom:12px;">📋 최적 경로</div>';
    
    for (let i = 0; i < sorted.length; i++) {
        const p = sorted[i];
        const sec = i < sections.length ? sections[i] : null;
        html += `
            <div class="place-item">
                <div class="place-info">
                    <div class="place-name">${i + 1}. ${p.name}</div>
                    <div class="place-address">${p.address || ''}</div>
                    ${sec ? `<div style="font-size:12px; color:#48BB78;">→ ${sec.km.toFixed(2)}km / ${sec.min.toFixed(1)}분</div>` : ''}
                </div>
                <div style="font-size:20px;">${i === 0 ? '🚩' : '📍'}</div>
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    // 지도 탭으로 전환
    switchTab('map');
}

// ============================================================
// 8. 지도 표시 (카카오 지도)
// ============================================================

function initMap() {
    if (typeof kakao === 'undefined') {
        console.error('카카오 지도 API가 로드되지 않았습니다.');
        return;
    }
    
    kakao.maps.load(() => {
        const container = document.getElementById('map');
        const options = {
            center: new kakao.maps.LatLng(37.5665, 126.9780),
            level: 7
        };
        kakaoMap = new kakao.maps.Map(container, options);
    });
}

function showRouteOnMap() {
    if (!kakaoMap) {
        initMap();
        setTimeout(showRouteOnMap, 500);
        return;
    }
    
    // 기존 마커/폴리라인 제거
    for (const m of kakaoMarkers) {
        m.setMap(null);
    }
    kakaoMarkers = [];
    if (kakaoPolyline) {
        kakaoPolyline.setMap(null);
        kakaoPolyline = null;
    }
    
    const places = routeResult ? routeResult.places : [];
    if (places.length === 0) return;
    
    const bounds = new kakao.maps.LatLngBounds();
    const path = [];
    
    for (let i = 0; i < places.length; i++) {
        const p = places[i];
        const latlng = new kakao.maps.LatLng(p.lat, p.lng);
        bounds.extend(latlng);
        path.push(latlng);
        
        // 마커
        const marker = new kakao.maps.Marker({
            position: latlng,
            map: kakaoMap
        });
        kakaoMarkers.push(marker);
        
        // 인포윈도우
        const content = `
            <div style="padding:6px 10px; font-size:13px; max-width:150px;">
                <div style="font-weight:bold;">${i + 1}. ${p.name}</div>
                <div style="font-size:11px; color:#666;">${p.address || ''}</div>
            </div>
        `;
        const infowindow = new kakao.maps.InfoWindow({
            content: content
        });
        infowindow.open(kakaoMap, marker);
        kakaoMarkers.push(infowindow);
    }
    
    // 폴리라인
    if (path.length > 1) {
        kakaoPolyline = new kakao.maps.Polyline({
            path: path,
            strokeWeight: 4,
            strokeColor: '#4A90D9',
            strokeOpacity: 0.7,
            strokeStyle: 'solid'
        });
        kakaoPolyline.setMap(kakaoMap);
    }
    
    // 지도 범위 설정
    kakaoMap.setBounds(bounds);
}

// ============================================================
// 9. 엑셀 업로드 (드래그 & 드롭 + SheetJS)
// ============================================================

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) processExcelFile(file);
}

// 드래그 앤 드롭
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processExcelFile(file);
});

async function processExcelFile(file) {
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        
        // VBA와 동일한 컬럼 매핑 (개소명, 도로명주소)
        let added = 0;
        for (const row of json) {
            const name = row['개소명'] || row['name'] || row['Name'] || '';
            const address = row['도로명주소'] || row['address'] || row['Address'] || '';
            
            if (name || address) {
                const newPlace = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    name: String(name).trim() || '무명',
                    address: String(address).trim() || '',
                    lat: 0,
                    lng: 0,
                    order: places.length + 1,
                    cluster: 0
                };
                places.push(newPlace);
                added++;
            }
        }
        
        savePlaces();
        alert(`✅ ${added}개 장소를 추가했습니다.`);
    } catch (error) {
        alert('엑셀 파일 처리 오류: ' + error.message);
        console.error(error);
    }
}

// ============================================================
// 10. GitHub 연동
// ============================================================

async function uploadToGitHub() {
    const token = document.getElementById('githubToken').value.trim();
    if (!token) {
        alert('GitHub Token을 입력해주세요.');
        return;
    }
    
    // 사용자명 조회
    try {
        const userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        const user = await userRes.json();
        const username = user.login;
        
        const repoName = 'route-data';
        const content = JSON.stringify(places, null, 2);
        const b64Content = btoa(unescape(encodeURIComponent(content)));
        
        // 파일 업로드
        const url = `https://api.github.com/repos/${username}/${repoName}/contents/data.json`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Update route data',
                content: b64Content
            })
        });
        
        if (!response.ok) throw new Error(`업로드 실패: ${response.status}`);
        
        alert(`✅ GitHub 업로드 성공!\nhttps://${username}.github.io/${repoName}/`);
    } catch (error) {
        alert('GitHub 업로드 오류: ' + error.message);
        console.error(error);
    }
}

async function loadFromGitHub() {
    const token = document.getElementById('githubToken').value.trim();
    if (!token) {
        alert('GitHub Token을 입력해주세요.');
        return;
    }
    
    try {
        const userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });
        if (!userRes.ok) throw new Error('토큰 인증 실패');
        const user = await userRes.json();
        const username = user.login;
        
        const url = `https://api.github.com/repos/${username}/route-data/contents/data.json`;
        const response = await fetch(url, {
            headers: { 'Authorization': `token ${token}` }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                alert('저장된 데이터가 없습니다.');
                return;
            }
            throw new Error(`로드 실패: ${response.status}`);
        }
        
        const data = await response.json();
        const content = decodeURIComponent(escape(atob(data.content)));
        const loaded = JSON.parse(content);
        
        if (confirm(`현재 ${places.length}개 장소를 ${loaded.length}개로 덮어쓰시겠습니까?`)) {
            places = loaded;
            savePlaces();
            alert(`✅ ${places.length}개 장소를 불러왔습니다.`);
        }
    } catch (error) {
        alert('GitHub 로드 오류: ' + error.message);
        console.error(error);
    }
}

// ============================================================
// 11. 공유
// ============================================================

function shareRoute() {
    if (!routeResult) {
        alert('먼저 경로 최적화를 실행해주세요.');
        return;
    }
    
    const { places: sorted, totalKm, totalMin } = routeResult;
    let text = '🚚 최적 이동 경로\n\n';
    text += `📊 방문지: ${sorted.length}개소\n`;
    text += `📏 총 거리: ${totalKm.toFixed(2)}km\n`;
    text += `⏱️ 총 시간: 약 ${Math.round(totalMin)}분\n\n`;
    text += '📍 경로:\n';
    sorted.forEach((p, i) => {
        text += `  ${i + 1}. ${p.name}`;
        if (i < sorted.length - 1) text += ' →';
        text += '\n';
    });
    
    // Web Share API
    if (navigator.share) {
        navigator.share({
            title: '경로 최적화 결과',
            text: text
        }).catch(() => {});
    } else {
        // 클립보드 복사
        navigator.clipboard.writeText(text).then(() => {
            alert('✅ 경로 정보가 클립보드에 복사되었습니다!');
        }).catch(() => {
            prompt('복사할 내용:', text);
        });
    }
}

// ============================================================
// 12. 내보내기/가져오기
// ============================================================

function exportData() {
    const data = JSON.stringify(places, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `places_${currentRegion}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (confirm(`현재 ${places.length}개 장소를 ${data.length}개로 덮어쓰시겠습니까?`)) {
                    places = data;
                    savePlaces();
                    alert(`✅ ${places.length}개 장소를 불러왔습니다.`);
                }
            } catch (error) {
                alert('파일 파싱 오류: ' + error.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ============================================================
// 13. 초기화
// ============================================================

function clearAll() {
    if (!confirm('모든 장소를 삭제하시겠습니까?')) return;
    places = [];
    routeResult = null;
    savePlaces();
    document.getElementById('routeList').innerHTML = '';
    document.getElementById('totalPlaces').textContent = '0';
    document.getElementById('totalKm').textContent = '0';
    document.getElementById('totalMin').textContent = '0';
    
    // 지도 초기화
    if (kakaoMap) {
        for (const m of kakaoMarkers) {
            m.setMap(null);
        }
        kakaoMarkers = [];
        if (kakaoPolyline) {
            kakaoPolyline.setMap(null);
            kakaoPolyline = null;
        }
    }
}

// ============================================================
// 14. 탭 전환
// ============================================================

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    if (tab === 'map' && routeResult) {
        setTimeout(showRouteOnMap, 300);
    }
}

// ============================================================
// 15. 초기화
// ============================================================

// 지역 선택 이벤트
document.getElementById('regionSelect').addEventListener('change', (e) => {
    switchRegion(e.target.value);
});

// 엔터키로 장소 추가
document.getElementById('placeAddress').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPlace();
});
document.getElementById('placeName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('placeAddress').focus();
});

// 앱 초기화
loadPlaces(currentRegion);

// 카카오 지도 초기화 (API 로드 후)
if (typeof kakao !== 'undefined') {
    kakao.maps.load(() => {
        initMap();
    });
}

// PWA Service Worker 등록
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('Service Worker 등록됨'))
        .catch(err => console.log('SW 등록 실패:', err));
}

console.log('🚚 경로 최적화 PWA 로드 완료!');
console.log(`📍 현재 지역: ${currentRegion}, 장소: ${places.length}개`);
