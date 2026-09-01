const EDITOR_STYLE_ID = 'fieldpilot-photo-editor-style';

function ensureEditorStyle() {
    if (document.getElementById(EDITOR_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = EDITOR_STYLE_ID;
    style.textContent = `
        .fp-photo-editor-backdrop{position:fixed;inset:0;z-index:1000000;background:rgba(15,23,42,.88);display:flex;align-items:center;justify-content:center;padding:12px}
        .fp-photo-editor{width:min(920px,100%);max-height:96vh;overflow:auto;background:#fff;color:#1a202c;border-radius:16px;padding:14px;box-shadow:0 24px 80px rgba(0,0,0,.45)}
        .fp-photo-editor__head,.fp-photo-editor__actions,.fp-photo-editor__tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .fp-photo-editor__head{justify-content:space-between;margin-bottom:10px}.fp-photo-editor__tools{margin-bottom:10px}
        .fp-photo-editor button,.fp-photo-editor input{min-height:38px;border:1px solid #cbd5e0;border-radius:9px;padding:7px 10px;background:#fff;color:#2d3748}
        .fp-photo-editor button{cursor:pointer;font-weight:700}.fp-photo-editor button[data-active="true"]{background:#2b6cb0;color:#fff;border-color:#2b6cb0}
        .fp-photo-editor__canvas-wrap{background:#0f172a;border-radius:12px;overflow:auto;display:flex;justify-content:center;align-items:center;min-height:240px;max-height:62vh}
        .fp-photo-editor canvas{display:block;max-width:100%;max-height:60vh;touch-action:none;cursor:crosshair}
        .fp-photo-editor__hint{font-size:12px;color:#718096;margin:8px 0}.fp-photo-editor__actions{justify-content:flex-end;margin-top:10px}
        .fp-photo-editor__save{background:#3182ce!important;color:#fff!important;border-color:#3182ce!important}
        body.dark-mode .fp-photo-editor{background:#2d3748;color:#e2e8f0}.dark-mode .fp-photo-editor button,.dark-mode .fp-photo-editor input{background:#1a202c;color:#e2e8f0;border-color:#4a5568}
    `;
    document.head.appendChild(style);
}

async function loadBitmap(file) {
    if ('createImageBitmap' in globalThis) return createImageBitmap(file);
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
        });
        return image;
    } finally {
        URL.revokeObjectURL(url);
    }
}

function canvasBlob(canvas, type = 'image/jpeg', quality = 0.9) {
    return new Promise((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('사진 처리에 실패했습니다.')),
        type,
        quality
    ));
}

export async function createPhotoThumbnail(file, options = {}) {
    if (!file || !String(file.type || '').startsWith('image/')) return null;
    const bitmap = await loadBitmap(file);
    const max = Number(options.maxDimension || 320);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await canvasBlob(canvas, 'image/jpeg', Number(options.quality || 0.76));
    return new File([blob], 'thumbnail.jpg', { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
}

function canvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)),
        y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height))
    };
}

function drawArrow(ctx, from, to) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const head = Math.max(18, Math.min(55, Math.hypot(to.x - from.x, to.y - from.y) * .18));
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = '#ef4444';
    ctx.lineWidth = Math.max(5, Math.round(Math.min(ctx.canvas.width, ctx.canvas.height) / 170));
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

export async function editPhoto(file, context = {}) {
    if (!file || !String(file.type || '').startsWith('image/')) return file;
    ensureEditorStyle();
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    let work = document.createElement('canvas');
    work.width = Math.max(1, Math.round(bitmap.width * scale));
    work.height = Math.max(1, Math.round(bitmap.height * scale));
    work.getContext('2d').drawImage(bitmap, 0, 0, work.width, work.height);
    bitmap.close?.();

    const backdrop = document.createElement('div');
    backdrop.className = 'fp-photo-editor-backdrop';
    backdrop.innerHTML = `
      <div class="fp-photo-editor" role="dialog" aria-modal="true" aria-label="사진 편집">
        <div class="fp-photo-editor__head"><strong>✏️ 사진 편집 · ${String(context.siteName || file.name || '').replace(/[<>]/g, '')}</strong><button data-action="cancel" aria-label="닫기">×</button></div>
        <div class="fp-photo-editor__tools">
          <button data-action="rotate">↻ 90° 회전</button><button data-mode="crop">✂️ 자르기</button><button data-action="apply-crop" disabled>선택 영역 적용</button>
          <button data-mode="arrow">➜ 화살표</button><input data-text-input maxlength="60" placeholder="메모 문자"><button data-mode="text">T 문자 배치</button><button data-action="reset">↶ 원본 복원</button>
        </div>
        <div class="fp-photo-editor__canvas-wrap"><canvas></canvas></div>
        <div class="fp-photo-editor__hint">자르기·화살표는 사진 위에서 드래그하고, 문자는 입력 후 사진에서 위치를 누르세요.</div>
        <div class="fp-photo-editor__actions"><button data-action="original">편집 없이 사용</button><button data-action="cancel">취소</button><button class="fp-photo-editor__save" data-action="save">저장 후 업로드</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    const preview = backdrop.querySelector('canvas');
    const hint = backdrop.querySelector('.fp-photo-editor__hint');
    const cropApply = backdrop.querySelector('[data-action="apply-crop"]');
    let mode = '';
    let start = null;
    let selection = null;

    function render(temporaryEnd) {
        preview.width = work.width; preview.height = work.height;
        const ctx = preview.getContext('2d');
        ctx.drawImage(work, 0, 0);
        const end = temporaryEnd || (selection && selection.end);
        const begin = start || (selection && selection.start);
        if (begin && end && (mode === 'crop' || mode === 'arrow')) {
            ctx.save();
            if (mode === 'arrow') drawArrow(ctx, begin, end);
            else {
                ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = Math.max(3, work.width / 350);
                ctx.setLineDash([12, 8]); ctx.strokeRect(begin.x, begin.y, end.x - begin.x, end.y - begin.y);
                ctx.fillStyle = 'rgba(15,23,42,.28)';
            }
            ctx.restore();
        }
    }
    function setMode(next) {
        mode = mode === next ? '' : next; start = null; selection = null; cropApply.disabled = true;
        backdrop.querySelectorAll('[data-mode]').forEach(button => button.dataset.active = String(button.dataset.mode === mode));
        hint.textContent = mode === 'crop' ? '자를 영역을 드래그하세요.' : mode === 'arrow' ? '화살표 시작점에서 끝점까지 드래그하세요.' : mode === 'text' ? '문자를 넣을 위치를 사진에서 누르세요.' : '회전·자르기·화살표·문자 메모를 적용할 수 있습니다.';
        render();
    }
    async function reset() {
        const original = await loadBitmap(file);
        const originalScale = Math.min(1, 1920 / Math.max(original.width, original.height));
        work = document.createElement('canvas');
        work.width = Math.max(1, Math.round(original.width * originalScale));
        work.height = Math.max(1, Math.round(original.height * originalScale));
        work.getContext('2d').drawImage(original, 0, 0, work.width, work.height);
        original.close?.(); setMode(''); render();
    }
    render();

    preview.addEventListener('pointerdown', event => {
        if (!mode) return;
        if (mode === 'text') {
            const value = backdrop.querySelector('[data-text-input]').value.trim();
            if (!value) { hint.textContent = '먼저 문자 메모를 입력하세요.'; return; }
            const point = canvasPoint(preview, event); const ctx = work.getContext('2d');
            const size = Math.max(24, Math.round(Math.min(work.width, work.height) / 18));
            ctx.save(); ctx.font = `700 ${size}px sans-serif`; ctx.lineWidth = Math.max(4, size / 8); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.fillStyle = '#fff';
            ctx.strokeText(value, point.x, point.y); ctx.fillText(value, point.x, point.y); ctx.restore(); render(); return;
        }
        start = canvasPoint(preview, event); selection = null; preview.setPointerCapture?.(event.pointerId);
    });
    preview.addEventListener('pointermove', event => { if (start) render(canvasPoint(preview, event)); });
    preview.addEventListener('pointerup', event => {
        if (!start) return;
        const end = canvasPoint(preview, event);
        if (mode === 'arrow') { drawArrow(work.getContext('2d'), start, end); start = null; render(); }
        else { selection = { start, end }; start = null; cropApply.disabled = Math.abs(end.x - selection.start.x) < 20 || Math.abs(end.y - selection.start.y) < 20; render(); }
    });

    return new Promise(resolve => {
        function finish(value) { backdrop.remove(); resolve(value); }
        backdrop.addEventListener('click', async event => {
            const button = event.target.closest('button'); if (!button) return;
            const action = button.dataset.action; const requestedMode = button.dataset.mode;
            if (requestedMode) { setMode(requestedMode); return; }
            if (action === 'cancel') finish(null);
            if (action === 'original') finish(file);
            if (action === 'reset') await reset();
            if (action === 'rotate') {
                const rotated = document.createElement('canvas'); rotated.width = work.height; rotated.height = work.width;
                const ctx = rotated.getContext('2d'); ctx.translate(rotated.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(work, 0, 0); work = rotated; setMode(''); render();
            }
            if (action === 'apply-crop' && selection) {
                const x = Math.round(Math.min(selection.start.x, selection.end.x)); const y = Math.round(Math.min(selection.start.y, selection.end.y));
                const width = Math.round(Math.abs(selection.end.x - selection.start.x)); const height = Math.round(Math.abs(selection.end.y - selection.start.y));
                if (width > 10 && height > 10) { const cropped = document.createElement('canvas'); cropped.width = width; cropped.height = height; cropped.getContext('2d').drawImage(work, x, y, width, height, 0, 0, width, height); work = cropped; setMode(''); render(); }
            }
            if (action === 'save') {
                const blob = await canvasBlob(work, 'image/jpeg', .9);
                finish(new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '_edited.jpg', { type: 'image/jpeg', lastModified: file.lastModified || Date.now() }));
            }
        });
        backdrop.addEventListener('click', event => { if (event.target === backdrop) finish(null); });
    });
}

