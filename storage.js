import { CONFIG } from './config.js';

let databasePromise = null;

function requestAsPromise(request) {
    return new Promise(function(resolve, reject) {
        request.onsuccess = function() { resolve(request.result); };
        request.onerror = function() { reject(request.error || new Error('IndexedDB 요청 실패')); };
    });
}

function transactionDone(transaction) {
    return new Promise(function(resolve, reject) {
        transaction.oncomplete = function() { resolve(); };
        transaction.onerror = function() { reject(transaction.error || new Error('IndexedDB 트랜잭션 실패')); };
        transaction.onabort = function() { reject(transaction.error || new Error('IndexedDB 트랜잭션이 취소되었습니다.')); };
    });
}

export function openStorage() {
    if (databasePromise) return databasePromise;
    if (!('indexedDB' in globalThis)) {
        return Promise.reject(new Error('이 브라우저는 IndexedDB를 지원하지 않습니다.'));
    }

    databasePromise = new Promise(function(resolve, reject) {
        const request = indexedDB.open(CONFIG.storage.databaseName, CONFIG.storage.databaseVersion);
        request.onupgradeneeded = function() {
            const db = request.result;
            if (!db.objectStoreNames.contains(CONFIG.storage.valueStore)) {
                db.createObjectStore(CONFIG.storage.valueStore, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(CONFIG.storage.queueStore)) {
                const queue = db.createObjectStore(CONFIG.storage.queueStore, { keyPath: 'id' });
                queue.createIndex('nextAttemptAt', 'nextAttemptAt', { unique: false });
            }
            if (!db.objectStoreNames.contains(CONFIG.storage.metaStore)) {
                db.createObjectStore(CONFIG.storage.metaStore, { keyPath: 'key' });
            }
        };
        request.onsuccess = function() { resolve(request.result); };
        request.onerror = function() { reject(request.error || new Error('IndexedDB를 열 수 없습니다.')); };
    });

    return databasePromise;
}

async function readRecord(storeName, key) {
    const db = await openStorage();
    const transaction = db.transaction(storeName, 'readonly');
    const done = transactionDone(transaction);
    const result = await requestAsPromise(transaction.objectStore(storeName).get(key));
    await done;
    return result || null;
}

async function putRecord(storeName, value) {
    const db = await openStorage();
    const transaction = db.transaction(storeName, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(storeName).put(value);
    await done;
    return value;
}

export async function getValue(key, fallback = null) {
    const record = await readRecord(CONFIG.storage.valueStore, String(key));
    return record ? record.value : fallback;
}

export async function setValue(key, value) {
    return putRecord(CONFIG.storage.valueStore, {
        key: String(key),
        value,
        updatedAt: Date.now()
    });
}

export async function removeValue(key) {
    const db = await openStorage();
    const transaction = db.transaction(CONFIG.storage.valueStore, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(CONFIG.storage.valueStore).delete(String(key));
    await done;
}

function legacyKeyIncluded(key) {
    if (CONFIG.legacyMigration.excludeKeys.includes(key)) return false;
    return CONFIG.legacyMigration.includeKeys.includes(key) ||
        CONFIG.legacyMigration.includePrefixes.some(prefix => key.startsWith(prefix));
}

/**
 * Copy (never remove) existing localStorage payloads into IndexedDB.  The
 * marker is written only after every selected key has been copied.
 */
export async function migrateLegacyLocalStorage() {
    if (typeof localStorage === 'undefined') return { migrated: 0, skipped: true };
    const marker = await readRecord(CONFIG.storage.metaStore, 'legacy-localstorage-v1');
    if (marker) return { migrated: marker.value?.count || 0, skipped: true };

    const entries = [];
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !legacyKeyIncluded(key)) continue;
        entries.push({ key, raw: localStorage.getItem(key) });
    }

    const db = await openStorage();
    const transaction = db.transaction(
        [CONFIG.storage.valueStore, CONFIG.storage.metaStore],
        'readwrite'
    );
    const done = transactionDone(transaction);
    const values = transaction.objectStore(CONFIG.storage.valueStore);
    entries.forEach(function(entry) {
        let value = entry.raw;
        try { value = JSON.parse(entry.raw); } catch (_) {}
        values.put({ key: entry.key, value, migratedFrom: 'localStorage', updatedAt: Date.now() });
    });
    transaction.objectStore(CONFIG.storage.metaStore).put({
        key: 'legacy-localstorage-v1',
        value: { count: entries.length, completedAt: new Date().toISOString() }
    });
    await done;
    return { migrated: entries.length, skipped: false };
}

function newQueueId() {
    return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

export async function enqueueRequest(request) {
    const db = await openStorage();
    const readTransaction = db.transaction(CONFIG.storage.queueStore, 'readonly');
    const readDone = transactionDone(readTransaction);
    const existing = await requestAsPromise(readTransaction.objectStore(CONFIG.storage.queueStore).getAll());
    await readDone;
    if (existing.length >= CONFIG.offline.maxQueuedRequests) {
        throw new Error('오프라인 대기열이 가득 찼습니다. 연결 후 동기화하세요.');
    }

    const record = {
        id: request.id || newQueueId(),
        method: String(request.method || 'POST').toUpperCase(),
        path: String(request.path || ''),
        json: request.json === undefined ? null : request.json,
        form: request.form || null,
        createdAt: request.createdAt || Date.now(),
        nextAttemptAt: Date.now(),
        attempts: 0,
        lastError: ''
    };
    const writeTransaction = db.transaction(CONFIG.storage.queueStore, 'readwrite');
    const writeDone = transactionDone(writeTransaction);
    writeTransaction.objectStore(CONFIG.storage.queueStore).put(record);
    await writeDone;
    return record;
}

export async function dueQueuedRequests(limit = CONFIG.offline.maxQueuedRequests) {
    const db = await openStorage();
    const transaction = db.transaction(CONFIG.storage.queueStore, 'readonly');
    const done = transactionDone(transaction);
    const items = await requestAsPromise(transaction.objectStore(CONFIG.storage.queueStore).getAll());
    await done;
    const now = Date.now();
    return items
        .filter(item => item.nextAttemptAt <= now)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, limit);
}

export async function removeQueuedRequest(id) {
    const db = await openStorage();
    const transaction = db.transaction(CONFIG.storage.queueStore, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(CONFIG.storage.queueStore).delete(id);
    await done;
}

export async function postponeQueuedRequest(id, error) {
    const record = await readRecord(CONFIG.storage.queueStore, id);
    if (!record) return null;
    const attempts = Number(record.attempts || 0) + 1;
    const delay = Math.min(
        CONFIG.offline.maxRetryDelayMs,
        CONFIG.offline.retryIntervalMs * Math.pow(2, Math.min(attempts - 1, 6))
    );
    record.attempts = attempts;
    record.nextAttemptAt = Date.now() + delay;
    record.lastError = String(error?.message || error || 'network_error');
    await putRecord(CONFIG.storage.queueStore, record);
    return record;
}

export const storage = {
    openStorage,
    getValue,
    setValue,
    removeValue,
    migrateLegacyLocalStorage,
    enqueueRequest,
    dueQueuedRequests,
    removeQueuedRequest,
    postponeQueuedRequest
};
