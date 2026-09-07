// Camera inventory shares FieldPilot's authenticated server helpers and region state.
let cameraInventory = [];
let cameraLoadSequence = 0;
async function renderCameraTab() {
    const sequence = ++cameraLoadSequence;
    const list = document.getElementById('cameraList');
    list.textContent = '재고를 불러오는 중…';
    try {
        const rows = await serverGet('/api/cameras');
        if (sequence !== cameraLoadSequence) return;
        cameraInventory = rows;
        const select = document.getElementById('cameraProject');
        const previous = select.value;
        select.innerHTML = '<option value="">전체 사업</option>' + [...new Set(rows.map(row => row.project))].sort().map(project => '<option value="' + escapeHtml(project) + '">' + escapeHtml(project) + '</option>').join('');
        if ([...select.options].some(option => option.value === previous)) select.value = previous;
        filterCameraList();
    } catch (error) { if (sequence === cameraLoadSequence) list.textContent = '목록 조회 실패: ' + error.message; }
}
function filterCameraList() {
    const project = document.getElementById('cameraProject').value;
    const status = document.getElementById('cameraStatus').value;
    const rows = cameraInventory.filter(row => (!project || row.project === project) && (!status || row.status === status));
    document.getElementById('cameraSummary').textContent = '조회 가능 ' + cameraInventory.length + '대 · 재고 ' + cameraInventory.filter(row => row.status === '재고').length + '대 · 표시 ' + rows.length + '대';
    const list = document.getElementById('cameraList');
    list.innerHTML = rows.map(row => '<button type="button" class="camera-item" data-asset="' + escapeHtml(row.assetNumber) + '"><div class="flex-between"><strong>' + escapeHtml(row.assetNumber) + '</strong><span class="camera-badge ' + (row.status === '설치됨' ? 'installed' : '') + '">' + escapeHtml(row.status) + '</span></div><div>' + escapeHtml(row.model) + '</div><small>' + escapeHtml(row.project) + '</small>' + (row.currentSite ? '<div>📍 ' + escapeHtml(row.currentSite.region + ' · ' + row.currentSite.siteName) + '</div>' : '') + '</button>').join('') || '<p>조건에 맞는 카메라가 없습니다. 입고 등록으로 재고를 추가하세요.</p>';
    list.querySelectorAll('[data-asset]').forEach(button => button.addEventListener('click', () => openCameraDetails(button.dataset.asset)));
}
function cameraDialog(title, content) {
    document.getElementById('cameraDialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'cameraDialog';
    dialog.className = 'camera-dialog';
    dialog.setAttribute('aria-labelledby', 'cameraDialogTitle');
    dialog.innerHTML = '<div class="flex-between"><h3 id="cameraDialogTitle">' + escapeHtml(title) + '</h3><button type="button" class="btn btn-outline camera-close" aria-label="닫기">✕</button></div>' + content + '<p class="camera-feedback" role="status"></p>';
    dialog.querySelector('.camera-close').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove());
    document.body.appendChild(dialog);
    dialog.showModal();
    return dialog;
}
function openCameraBatch() {
    const dialog = cameraDialog('카메라 일괄 입고', '<form id="cameraBatchForm"><label>사업코드 (영문·숫자)<input name="projectCode" class="input-field" required pattern="[A-Za-z0-9]{1,20}" maxlength="20" placeholder="YS01"></label><label>사업명<input name="project" class="input-field" required maxlength="200" placeholder="용산구 CCTV 1차 구축"></label><label>모델<input name="model" class="input-field" required maxlength="200" placeholder="한화 XNO-6120R"></label><label>입고 수량<input name="qty" class="input-field" type="number" min="1" max="999" step="1" value="1" required></label><p>같은 사업코드는 순번을 이어서 발급합니다. 등록 전 사업명과 수량을 확인하세요.</p><button class="btn btn-primary" type="submit">입고 등록</button></form>');
    dialog.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        const button = event.target.querySelector('[type=submit]');
        if (button.disabled) return;
        button.disabled = true;
        const values = Object.fromEntries(new FormData(event.target));
        values.qty = Number(values.qty);
        try {
            await serverPost('/api/cameras/batch', values);
            dialog.close();
            await renderCameraTab();
        } catch (error) { dialog.querySelector('.camera-feedback').textContent = error.message; button.disabled = false; }
    };
}
function openCameraDetails(assetNumber) {
    const camera = cameraInventory.find(row => row.assetNumber === assetNumber);
    if (!camera) return;
    const region = currentRegion;
    const installed = camera.status === '설치됨';
    const dialog = cameraDialog(assetNumber, '<p>' + escapeHtml(camera.model + ' · ' + camera.project) + '</p>' + (installed
        ? '<p>설치 현장: ' + escapeHtml(camera.currentSite?.region + ' · ' + camera.currentSite?.siteName) + '</p><button type="button" class="btn btn-primary camera-save">회수 (재고로 전환)</button>'
        : '<p>설치할 지역: ' + escapeHtml(region || '지역을 먼저 선택하세요') + '</p><label>현장 검색<input class="input-field camera-search" placeholder="현장명 검색"></label><label>등록 현장 선택<select class="input-field camera-sites" size="6"></select></label><button type="button" class="btn btn-primary camera-save">선택한 현장에 설치</button>'));
    const choices = installed ? [] : places.filter(place => place.id != null).map(place => ({ id: String(place.id), name: String(place.name || '') }));
    const populate = () => {
        const query = dialog.querySelector('.camera-search').value.trim().toLowerCase();
        dialog.querySelector('.camera-sites').innerHTML = '<option value="" selected>현장을 선택하세요</option>' + choices.filter(place => place.name.toLowerCase().includes(query)).map(place => '<option value="' + escapeHtml(place.id) + '">' + escapeHtml(place.name) + '</option>').join('');
    };
    if (!installed) { populate(); dialog.querySelector('.camera-search').oninput = populate; }
    const button = dialog.querySelector('.camera-save');
    button.onclick = async () => {
        const siteId = installed ? null : dialog.querySelector('.camera-sites').value;
        if (!installed && (!region || !siteId)) { dialog.querySelector('.camera-feedback').textContent = '지역과 등록 현장을 선택하세요.'; return; }
        if (button.disabled) return;
        button.disabled = true;
        try {
            await serverPost('/api/cameras/' + encodeURIComponent(assetNumber) + '/status', installed ? { status: '재고' } : { status: '설치됨', region, siteId });
            dialog.close();
            await renderCameraTab();
        } catch (error) { dialog.querySelector('.camera-feedback').textContent = error.message; button.disabled = false; }
    };
}
