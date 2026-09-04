/**
 * FieldPilot Core runtime configuration.
 *
 * This module intentionally contains limits and behaviour switches only.  API
 * keys, access tokens, and server secrets must stay out of the client bundle.
 */

export const CONFIG = {
    version: '1.0.0',

    storage: {
        databaseName: 'FieldPilotCore',
        databaseVersion: 1,
        valueStore: 'kv',
        queueStore: 'requestQueue',
        metaStore: 'meta'
    },

    legacyMigration: {
        // Data-bearing keys used by the existing non-module app.  These are
        // copied, never removed, so a failed or partial migration is safe.
        includePrefixes: [
            'places_',
            'stats_',
            'work_',
            'recentStartPoints_'
        ],
        includeKeys: [
            'selectedRegion',
            'optimizeMode',
            'routeApi',
            'route_presets',
            'workerName',
            'darkMode',
            'app_cache_name'
        ],
        // These values can contain credentials.  They deliberately remain in
        // their existing location until the authentication/GitHub migration is
        // completed by a server-backed feature.
        excludeKeys: [
            'app_settings',
            'fieldPilotAuth'
        ]
    },

    offline: {
        maxQueuedRequests: 200,
        retryIntervalMs: 30 * 1000,
        maxRetryDelayMs: 15 * 60 * 1000,
        maxAttemptsBeforeAttention: 8,
        backgroundSyncTag: 'fieldpilot-request-sync'
    },

    photo: {
        // 현장 증빙 사진은 원본 바이트를 그대로 서버에 저장한다.
        preserveOriginal: true,
        maxDimension: 2560,
        jpegQuality: 0.92,
        maxInputBytes: 50 * 1024 * 1024,
        outputMimeType: 'image/jpeg'
    },

    api: {
        timeoutMs: 30 * 1000
    },

    ui: {
        toastDurationMs: 4200,
        maxVisibleToasts: 4
    },

    route: {
        maxWaypoints: 15,
        advancedOptimizationThreshold: 15
    }
};

function isPlainObject(value) {
    return !!value && Object.prototype.toString.call(value) === '[object Object]';
}

function mergeInto(target, source) {
    if (!isPlainObject(source)) return target;

    Object.keys(source).forEach(function(key) {
        const incoming = source[key];
        if (isPlainObject(incoming) && isPlainObject(target[key])) {
            mergeInto(target[key], incoming);
        } else if (incoming !== undefined) {
            target[key] = incoming;
        }
    });

    return target;
}

/**
 * Apply non-secret runtime overrides.  This is useful for test environments
 * and deployment-specific limits.  It intentionally mutates the exported
 * CONFIG object so consumers holding a reference see the new values.
 */
export function configure(overrides) {
    if (!isPlainObject(overrides)) {
        throw new TypeError('FieldPilotCore.configure expects an object.');
    }

    return mergeInto(CONFIG, overrides);
}

export function normalizeServerBase(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

export function getServerBase() {
    if (typeof window === 'undefined') return '';
    return normalizeServerBase(window.FIELD_SERVER_URL);
}

/**
 * Resolve a relative API path against the current FieldPilot server URL.
 * Absolute HTTP(S) URLs are preserved for controlled integrations/tests.
 */
export function resolveServerUrl(path, baseUrl) {
    const rawPath = String(path || '').trim();
    if (!rawPath) {
        throw new Error('API path is required.');
    }

    if (/^https?:\/\//i.test(rawPath)) {
        return rawPath;
    }

    const base = normalizeServerBase(
        baseUrl === undefined ? getServerBase() : baseUrl
    );

    if (!base) {
        throw new Error('서버 주소(FIELD_SERVER_URL)가 설정되지 않았습니다.');
    }

    return base + (rawPath.startsWith('/') ? rawPath : '/' + rawPath);
}

/**
 * Reads the existing app's bearer token without making it part of any new
 * persistent store.  A caller can supply a stronger token provider to ApiClient.
 */
export function getExistingAuthToken() {
    if (typeof window === 'undefined') return '';

    try {
        if (typeof window.getAuthToken === 'function') {
            const token = window.getAuthToken();
            if (token) return String(token);
        }
    } catch (_) {
        // Fall through to the legacy storage record.
    }

    try {
        const raw = window.localStorage && window.localStorage.getItem('fieldPilotAuth');
        const auth = raw ? JSON.parse(raw) : null;
        return auth && auth.token ? String(auth.token) : '';
    } catch (_) {
        return '';
    }
}

export function isBrowserOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
}
