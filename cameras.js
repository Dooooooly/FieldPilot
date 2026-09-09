let cameraInventory = [], cameraLoadSequence = 0;
function autoSyncCameras() { return renderCameraTab(); }
function closeDynamicModals() { document.querySelectorAll('.dynamic-modal').forEach(el => el.remove()); }
function latestRepairInfo(camera) {
    const history = Array.isArray(camera.history) ? camera.history : [];
    const intake = [...history].reverse().find(item => item.event === '수리입고');
    const completed = [...history].reverse().find(item => item.event === '수리완료' && (!intake || item.date >= intake.date));
    if (!intake && !completed) return '';
    const date = value => value ? new Date(value).toLocaleDateString('ko-KR') : '-';
    return '이전 설치현장: ' + escapeHtml(intake?.removedFrom?.siteName || '확인 불가') + ' (제거일: ' + date(intake?.date) + ')' + (completed ? ' / 수리완료일: ' + date(completed.date) : ' / 수리중');
}
async function renderCameraTab() {
    const sequence = ++cameraLoadSequence, list = document.getElementById('cameraList');
    if (!list) return;
    list.innerHTML = '<div class="camera-empty">재고를 불러오는 중…</div>';
    try {
        const rows = await serverGet('/api/cameras');
        if (sequence !== cameraLoadSequence) return;
        cameraInventory = rows.map(row => ({ ...row, equipmentType: row.equipmentType || '카메라' }));
        const select = document.getElementById('cameraProject'), previous = select.value;
        select.innerHTML = '<option value="">전체 사업</option>' + [...new Set(rows.map(row => row.project))].sort().map(project => '<option value="' + escapeHtml(project) + '">' + escapeHtml(project) + '</option>').join('');
        if ([...select.options].some(option => option.value === previous)) select.value = previous;
        filterCameraList();
    } catch (error) { if (sequence === cameraLoadSequence) list.innerHTML = '<div class="camera-empty is-error">목록 조회 실패: ' + escapeHtml(error.message) + '</div>'; }
}
function filterCameraList() {
    const type = document.getElementById('cameraType').value, project = document.getElementById('cameraProject').value, status = document.getElementById('cameraStatus').value;
    const rows = cameraInventory.filter(row => (!type || row.equipmentType === type) && (!project || row.project === project) && (!status || row.status === status));
    document.getElementById('cameraSummary').textContent = '전체 ' + cameraInventory.length + '개 · 재고 ' + cameraInventory.filter(row => row.status === '재고').length + ' · 설치 ' + cameraInventory.filter(row => row.status === '설치됨').length + ' · 수리 ' + cameraInventory.filter(row => row.status === '수리중').length;
    const list = document.getElementById('cameraList');
    list.innerHTML = rows.map(row => {
        const info = latestRepairInfo(row), statusClass = row.status === '설치됨' ? 'installed' : (row.status === '수리중' ? 'repairing' : '');
        return '<button type="button" class="camera-item" data-asset="' + escapeHtml(row.assetNumber) + '"><div class="camera-item-head"><strong>' + escapeHtml(row.assetNumber) + '</strong><span><span class="equipment-type-badge">' + escapeHtml(row.equipmentType) + '</span> <span class="camera-badge ' + statusClass + '">' + escapeHtml(row.status) + '</span></span></div><div class="camera-model">' + escapeHtml(row.model) + '</div><div class="camera-project">' + escapeHtml(row.project) + '</div>' + (row.currentSite ? '<div class="camera-site">📍 ' + escapeHtml(row.currentSite.region + ' · ' + row.currentSite.siteName) + '</div>' : '') + ((row.status === '수리중' || (row.status === '재고' && info)) ? '<div class="camera-repair-info">🔧 ' + info + '</div>' : '') + '</button>';
    }).join('') || '<div class="camera-empty">조건에 맞는 카메라가 없습니다.</div>';
    list.querySelectorAll('[data-asset]').forEach(button => button.addEventListener('click', () => openCameraDetails(button.dataset.asset)));
}
function cameraModal(title, content, id = 'cameraModal', parentId = '') {
    const parent = parentId ? document.getElementById(parentId) : null;
    document.querySelectorAll('.dynamic-modal').forEach(el => { if (el !== parent) el.remove(); });
    if (parent) parent.style.display = 'none';
    const overlay = document.createElement('div'); overlay.id = id; overlay.className = 'modal-overlay active dynamic-modal';
    overlay.innerHTML = '<div class="modal camera-modal"><div class="camera-modal-head"><h3 id="cameraModalTitle">' + escapeHtml(title) + '</h3><button type="button" class="btn btn-outline btn-sm camera-close">✕</button></div>' + content + '<div class="camera-feedback" role="status"></div></div>';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'cameraModalTitle');
    overlay._close = () => { overlay.remove(); if (parent?.isConnected) parent.style.display = 'flex'; };
    overlay.onclick = event => { if (event.target === overlay) overlay._close(); }; overlay.querySelector('.camera-close').onclick = overlay._close;
    document.body.appendChild(overlay); return overlay;
}
function openCameraBatch() {
    const today = new Date().toLocaleDateString('en-CA');
    const modal = cameraModal('📦 재고 등록', '<form><label>장비 종류<select name="equipmentType" class="input-field" required><option value="카메라">카메라</option><option value="LED안내판">LED안내판</option><option value="비상벨">비상벨</option></select></label><label>등록 유형<select name="sourceType" class="input-field camera-source-type"><option value="new">신규 입고</option><option value="removed">기존 현장 철거품</option></select></label><div class="camera-new-fields"><label>사업명<input name="project" class="input-field" required maxlength="200"></label><label>모델<input name="model" class="input-field" required maxlength="200"></label><label>수량<input name="qty" class="input-field" type="number" min="1" max="999" value="1" required></label></div><div class="camera-removed-fields" hidden><input type="hidden" name="region" value="' + escapeHtml(currentRegion || '') + '"><div class="camera-repair-info">철거품은 한 개씩 등록되며 현장과 철거일만 이력에 저장합니다.</div><label>철거한 현장 검색<input type="search" class="input-field removed-site-search" placeholder="현장명을 입력하세요" autocomplete="off"></label><label>검색 결과<select name="siteId" class="input-field removed-site-results" size="6"><option value="">현장명을 검색하세요</option></select></label><label>철거일<input name="removedAt" class="input-field" type="date" value="' + today + '"></label><label>입고 상태<select name="status" class="input-field"><option value="재고">정상 회수 · 재고</option><option value="수리중">고장 철거 · 수리중</option></select></label></div><div class="camera-modal-actions"><button class="btn btn-primary" type="submit">재고 등록</button></div></form>');
    const source = modal.querySelector('.camera-source-type'), newFields = modal.querySelector('.camera-new-fields'), removedFields = modal.querySelector('.camera-removed-fields');
    const siteSearch = modal.querySelector('.removed-site-search'), siteResults = modal.querySelector('.removed-site-results');
    siteSearch.oninput = () => {
        const query = siteSearch.value.trim().toLowerCase();
        const matches = query ? places.filter(place => place.id != null && String(place.name || '').toLowerCase().includes(query)).slice(0, 50) : [];
        siteResults.innerHTML = matches.length ? matches.map(place => '<option value="' + escapeHtml(String(place.id)) + '">' + escapeHtml(place.name) + '</option>').join('') : '<option value="">' + (query ? '검색 결과가 없습니다' : '현장명을 검색하세요') + '</option>';
    };
    source.onchange = () => {
        const removed = source.value === 'removed'; newFields.hidden = removed; removedFields.hidden = !removed;
        newFields.querySelectorAll('input').forEach(input => input.required = !removed);
        removedFields.querySelector('[name=siteId]').required = removed;
        removedFields.querySelector('[name=removedAt]').required = removed;
    };
    modal.querySelector('form').onsubmit = async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; const values = Object.fromEntries(new FormData(event.target)); values.qty = Number(values.qty); try { await serverPost('/api/cameras/batch', values); modal.remove(); await renderCameraTab(); } catch (error) { modal.querySelector('.camera-feedback').textContent = error.message; button.disabled = false; } };
}
function openCameraDetails(assetNumber) {
    const camera = cameraInventory.find(row => row.assetNumber === assetNumber); if (!camera) return;
    const info = latestRepairInfo(camera); let body = '<div class="camera-detail-summary"><strong>' + escapeHtml(camera.equipmentType + ' · ' + camera.model) + '</strong><span>' + escapeHtml(camera.project) + '</span></div>';
    if (info) body += '<div class="camera-repair-info">🔧 ' + info + '</div>';
    if (camera.status === '설치됨') body += '<div class="camera-site">📍 ' + escapeHtml(camera.currentSite?.region + ' · ' + camera.currentSite?.siteName) + '</div><div class="camera-modal-actions"><button data-status="재고" class="btn btn-outline">정상 회수</button><button data-status="수리중" class="btn btn-warning">수리 입고</button></div>';
    else if (camera.status === '수리중') body += '<p>수리가 끝났다면 재고로 전환한 뒤 다시 설치할 수 있습니다.</p><div class="camera-modal-actions"><button data-status="재고" class="btn btn-primary">수리 완료 · 재고 등록</button></div>';
    else body += '<p>설치 지역: <strong>' + escapeHtml(currentRegion || '지역을 먼저 선택하세요') + '</strong></p><input class="input-field camera-search" placeholder="현장명 검색"><select class="input-field camera-sites" size="6"></select><div class="camera-modal-actions"><button data-status="설치됨" class="btn btn-primary">선택 현장에 설치</button></div>';
    const modal = cameraModal(assetNumber, body);
    if (camera.status === '재고') { const populate = () => { const query = modal.querySelector('.camera-search').value.trim().toLowerCase(); modal.querySelector('.camera-sites').innerHTML = '<option value="">현장을 선택하세요</option>' + places.filter(place => place.id != null && String(place.name || '').toLowerCase().includes(query)).map(place => '<option value="' + escapeHtml(String(place.id)) + '">' + escapeHtml(place.name) + '</option>').join(''); }; populate(); modal.querySelector('.camera-search').oninput = populate; }
    modal.querySelectorAll('[data-status]').forEach(button => button.onclick = async () => { const status = button.dataset.status, siteId = modal.querySelector('.camera-sites')?.value; if (status === '설치됨' && (!currentRegion || !siteId)) { modal.querySelector('.camera-feedback').textContent = '지역과 현장을 선택하세요.'; return; } button.disabled = true; try { await serverPost('/api/cameras/' + encodeURIComponent(assetNumber) + '/status', status === '설치됨' ? { status, region: currentRegion, siteId } : { status }); modal.remove(); await renderCameraTab(); } catch (error) { modal.querySelector('.camera-feedback').textContent = error.message; button.disabled = false; } });
}
async function openCameraReplaceForWork(workId, isAdd) {
    const work = currentWork || loadWorkFromLocalStorage(), record = work?.workHistory?.find(row => String(row.id) === String(workId));
    const place = places.find(row => String(row.id) === String(record?.siteId)) || places.find(row => row.name === record?.placeName);
    if (!record || !place || !currentRegion) { showTabStatus('tab-work', '⚠️ 처리 현장을 먼저 선택하세요.', 'warning'); return; }
    let rows; try { rows = (await serverGet('/api/cameras')).map(row => ({ ...row, equipmentType: row.equipmentType || '카메라' })); } catch (error) { showTabStatus('tab-work', '⚠️ 장비 조회 실패: ' + error.message, 'warning'); return; }
    const installed = rows.filter(row => row.status === '설치됨' && row.currentSite?.region === currentRegion && String(row.currentSite?.siteId) === String(place.id)), stock = rows.filter(row => row.status === '재고');
    const modal = cameraModal('🔄 장비 교체 · ' + place.name, '<label>제거할 장비<select class="input-field replace-old"><option value="">선택하세요</option>' + installed.map(row => '<option value="' + escapeHtml(row.assetNumber) + '">' + escapeHtml(row.equipmentType + ' · ' + row.assetNumber + ' · ' + row.model) + '</option>').join('') + '</select></label><label>제거 후 상태<select class="input-field replace-status"><option value="수리중">수리중</option><option value="재고">재고</option></select></label><label>새로 설치할 같은 종류의 재고<select class="input-field replace-new"><option value="">제거 장비를 먼저 선택하세요</option></select></label><div class="replace-history"></div><div class="camera-modal-actions"><button class="btn btn-primary replace-confirm">교체 확정</button></div>', 'cameraReplaceModal', isAdd ? 'workAddModal' : 'workEditModal');
    const oldSelect = modal.querySelector('.replace-old'), replacementSelect = modal.querySelector('.replace-new');
    oldSelect.onchange = () => { const old = installed.find(row => row.assetNumber === oldSelect.value); const matches = old ? stock.filter(row => row.equipmentType === old.equipmentType) : []; replacementSelect.innerHTML = '<option value="">' + (old ? '재고를 선택하세요' : '제거 장비를 먼저 선택하세요') + '</option>' + matches.map(row => '<option value="' + escapeHtml(row.assetNumber) + '">' + escapeHtml(row.assetNumber + ' · ' + row.model + (latestRepairInfo(row) ? ' · 수리품' : '')) + '</option>').join(''); modal.querySelector('.replace-history').innerHTML = ''; };
    replacementSelect.onchange = () => { const selected = stock.find(row => row.assetNumber === replacementSelect.value); modal.querySelector('.replace-history').innerHTML = selected && latestRepairInfo(selected) ? '<div class="camera-repair-info">🔧 ' + latestRepairInfo(selected) + '</div>' : ''; };
    modal.querySelector('.replace-confirm').onclick = async event => { const oldAsset = oldSelect.value, newAsset = replacementSelect.value, removedStatus = modal.querySelector('.replace-status').value; if (!oldAsset || !newAsset) { modal.querySelector('.camera-feedback').textContent = '제거할 장비와 새 장비를 선택하세요.'; return; } event.currentTarget.disabled = true; try { await serverPost('/api/cameras/replace', { region: currentRegion, siteId: String(place.id), removedAssetNumber: oldAsset, replacementAssetNumber: newAsset, removedStatus }); const content = document.getElementById(isAdd ? 'workAddContent' : 'workEditContent'), memo = '장비 교체: (제거) ' + oldAsset + ' → (신규) ' + newAsset; if (content) content.value = (content.value.trim() ? content.value.trim() + '\n' : '') + memo; const input = document.getElementById(isAdd ? 'workAddCamera' : 'workEditCamera'); if (input) input.value = newAsset; modal._close(); showTabStatus('tab-work', '✅ 장비 교체 완료 · 처리내용에 메모를 추가했습니다. 기록을 저장하세요.', 'ok'); } catch (error) { modal.querySelector('.camera-feedback').textContent = error.message; event.currentTarget.disabled = false; } };
}
