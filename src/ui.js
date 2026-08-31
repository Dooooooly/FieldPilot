import { CONFIG } from './config.js';

const CONTAINER_ID = 'fieldpilot-core-toast-container';
const STYLE_ID = 'fieldpilot-core-toast-style';

const TYPE_LABELS = {
    success: '성공',
    error: '오류',
    warning: '알림',
    info: '안내'
};

function ensureStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
        '#' + CONTAINER_ID + '{position:fixed;right:16px;bottom:max(16px,env(safe-area-inset-bottom));z-index:2147483000;display:flex;flex-direction:column;gap:8px;max-width:min(420px,calc(100vw - 32px));pointer-events:none}',
        '.fieldpilot-core-toast{display:flex;align-items:flex-start;gap:10px;padding:12px 12px 12px 14px;border-radius:10px;color:#fff;background:#2d3748;box-shadow:0 10px 28px rgba(0,0,0,.24);font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:auto;animation:fieldpilot-core-toast-in .18s ease-out}',
        '.fieldpilot-core-toast[data-type="success"]{background:#276749}.fieldpilot-core-toast[data-type="error"]{background:#9b2c2c}.fieldpilot-core-toast[data-type="warning"]{background:#975a16}.fieldpilot-core-toast[data-type="info"]{background:#2b6cb0}',
        '.fieldpilot-core-toast__message{flex:1;white-space:pre-wrap;word-break:break-word}.fieldpilot-core-toast__close{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;font-size:18px;line-height:1;padding:0 0 0 4px;opacity:.85}.fieldpilot-core-toast__close:hover{opacity:1}',
        '@keyframes fieldpilot-core-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}'
    ].join('');
    document.head.appendChild(style);
}

function getContainer() {
    if (typeof document === 'undefined') return null;
    ensureStyles();

    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = CONTAINER_ID;
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-relevant', 'additions');
        document.body.appendChild(container);
    }

    return container;
}

function trimVisibleToasts(container) {
    const limit = Number(CONFIG.ui.maxVisibleToasts) || 4;
    while (container.children.length >= limit) {
        container.removeChild(container.firstElementChild);
    }
}

/**
 * Show an accessible, non-blocking in-app notification.
 *
 * @returns {{ close: Function, element: HTMLElement|null }} a dismiss handle.
 */
export function toast(message, options = {}) {
    const container = getContainer();
    if (!container) {
        return { close: function() {}, element: null };
    }

    trimVisibleToasts(container);

    const type = TYPE_LABELS[options.type] ? options.type : 'info';
    const element = document.createElement('div');
    element.className = 'fieldpilot-core-toast';
    element.dataset.type = type;
    element.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const text = document.createElement('div');
    text.className = 'fieldpilot-core-toast__message';
    text.textContent = String(message == null ? '' : message);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'fieldpilot-core-toast__close';
    closeButton.setAttribute('aria-label', '알림 닫기');
    closeButton.textContent = '×';

    let closed = false;
    let timer = null;
    const close = function() {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        element.remove();
    };

    closeButton.addEventListener('click', close);
    element.append(text, closeButton);
    container.appendChild(element);

    const duration = options.duration === undefined
        ? CONFIG.ui.toastDurationMs
        : Number(options.duration);
    if (Number.isFinite(duration) && duration > 0) {
        timer = setTimeout(close, duration);
    }

    return { close, element };
}

export function clearToasts() {
    const container = typeof document === 'undefined'
        ? null
        : document.getElementById(CONTAINER_ID);
    if (container) container.replaceChildren();
}

export const ui = {
    toast,
    notify: toast,
    clearToasts
};
