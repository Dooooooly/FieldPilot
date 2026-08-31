import { CONFIG, isBrowserOnline } from './config.js';
import { isRetryableApiError } from './api.js';
import {
    dueQueuedRequests,
    enqueueRequest,
    postponeQueuedRequest,
    removeQueuedRequest
} from './storage.js';

export async function resizeImage(file, options = {}) {
    if (!file || !String(file.type || '').startsWith('image/')) return file;
    const maxDimension = Number(options.maxDimension || CONFIG.photo.maxDimension);
    const quality = Number(options.quality || CONFIG.photo.jpegQuality);
    if (file.size && file.size > CONFIG.photo.maxInputBytes) {
        throw new Error('사진은 15MB 이하만 업로드할 수 있습니다.');
    }
    if (!('createImageBitmap' in globalThis)) return file;

    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= maxDimension && file.type === CONFIG.photo.outputMimeType) {
        bitmap.close?.();
        return file;
    }

    const scale = Math.min(1, maxDimension / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise(function(resolve, reject) {
        canvas.toBlob(function(value) {
            if (value) resolve(value);
            else reject(new Error('사진 크기 조정에 실패했습니다.'));
        }, CONFIG.photo.outputMimeType, quality);
    });
    return new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', {
        type: CONFIG.photo.outputMimeType,
        lastModified: Date.now()
    });
}

export async function queueWhenOffline(request) {
    const queued = await enqueueRequest(request);
    try {
        const registration = await navigator.serviceWorker?.ready;
        if (registration?.sync) await registration.sync.register(CONFIG.offline.backgroundSyncTag);
    } catch (_) {
        // online 이벤트와 다음 앱 시작 시에도 대기열을 재시도한다.
    }
    return queued;
}

export async function flushQueue(apiClient) {
    if (!isBrowserOnline()) return { sent: 0, pending: 0 };
    const requests = await dueQueuedRequests();
    let sent = 0;

    for (const queued of requests) {
        try {
            if (queued.form?.photo) {
                const form = new FormData();
                Object.entries(queued.form.fields || {}).forEach(([key, value]) => form.append(key, value));
                form.append('photo', queued.form.photo, queued.form.fileName || 'photo.jpg');
                await apiClient.postForm(queued.path, form);
            } else {
                await apiClient.request(queued.path, { method: queued.method, json: queued.json });
            }
            await removeQueuedRequest(queued.id);
            sent += 1;
        } catch (error) {
            if (isRetryableApiError(error)) {
                await postponeQueuedRequest(queued.id, error);
                break; // preserve write order for dependent updates
            }
            await postponeQueuedRequest(queued.id, error);
        }
    }

    return { sent, pending: (await dueQueuedRequests()).length };
}
