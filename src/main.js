import { CONFIG, configure, getServerBase, resolveServerUrl } from './config.js';
import { ApiClient, ApiError, createApiClient, isRetryableApiError } from './api.js';
import { storage } from './storage.js';
import { flushQueue, queueWhenOffline, resizeImage } from './offline.js';
import { ui } from './ui.js';
import { createPhotoThumbnail, editPhoto } from './photo-tools.js?v=2026.09.04.2';

const api = createApiClient();

async function initialize() {
    if (window.FIELD_SERVER_CONFIG_READY) {
        await window.FIELD_SERVER_CONFIG_READY;
    }
    try {
        await storage.migrateLegacyLocalStorage();
    } catch (error) {
        console.warn('[FieldPilotCore] IndexedDB migration deferred:', error);
    }

    try {
        await flushQueue(api);
    } catch (error) {
        console.warn('[FieldPilotCore] queued request flush deferred:', error);
    }
}

window.FieldPilotCore = {
    CONFIG,
    configure,
    api,
    ApiClient,
    ApiError,
    createApiClient,
    isRetryableApiError,
    getServerBase,
    resolveServerUrl,
    storage,
    resizeImage,
    createPhotoThumbnail,
    editPhoto,
    queueWhenOffline,
    flushQueue: function() { return flushQueue(api); },
    ui,
    ready: initialize()
};

// 기존 코드의 alert() 호출을 비차단 토스트로 점진 전환한다. confirm/prompt는
// 사용자의 명시적 선택이 필요한 기존 동작이라 그대로 둔다.
window.alert = function(message) {
    ui.toast(String(message == null ? '' : message), { type: 'info' });
};

// 남아 있는 구버전 호환 함수가 실수로 호출되더라도 브라우저에서 GitHub API로
// 토큰을 전송하지 않도록 차단한다. GitHub 작업은 app.js의 서버 프록시 함수만 쓴다.
const nativeFetch = window.fetch.bind(window);
window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    if (/^https:\/\/api\.github\.com(?:\/|$)/i.test(String(url || ''))) {
        return Promise.reject(new Error('GitHub는 노트북 서버 프록시를 통해서만 사용할 수 있습니다.'));
    }
    return nativeFetch(input, init);
};

window.addEventListener('online', function() {
    window.FieldPilotCore.flushQueue().catch(function(error) {
        console.warn('[FieldPilotCore] online queue flush failed:', error);
    });
});

if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', function(event) {
        if (event.data?.type === 'FIELD_PILOT_FLUSH_OFFLINE_QUEUE') {
            window.FieldPilotCore.flushQueue().catch(function(error) {
                console.warn('[FieldPilotCore] background sync flush failed:', error);
            });
        }
    });
}
