import {
    CONFIG,
    getExistingAuthToken,
    getServerBase,
    resolveServerUrl
} from './config.js';

export class ApiError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'ApiError';
        this.code = options.code || 'api_error';
        this.status = options.status || 0;
        this.data = options.data;
        this.url = options.url || '';
        this.retriable = Boolean(options.retriable);
        this.cause = options.cause;
    }
}

function toHeaders(value) {
    return new Headers(value || {});
}

async function parseResponse(response) {
    if (response.status === 204) return null;

    const text = await response.clone().text();
    if (!text) return null;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try {
            return JSON.parse(text);
        } catch (_) {
            // Fall through to the raw body so server errors remain inspectable.
        }
    }

    try {
        return JSON.parse(text);
    } catch (_) {
        return text;
    }
}

function responseMessage(data, status) {
    if (data && typeof data === 'object') {
        return data.message || data.error || data.reason || ('서버 오류 ' + status);
    }
    return typeof data === 'string' && data.trim()
        ? data
        : ('서버 오류 ' + status);
}

export function isRetryableApiError(error) {
    if (!error) return false;
    if (error instanceof ApiError) {
        return error.retriable || error.status === 408 || error.status === 425 ||
            error.status === 429 || error.status >= 500;
    }
    // Browsers commonly surface network/CORS/offline failures as TypeError.
    return error instanceof TypeError;
}

/**
 * A small fetch wrapper shared by gradual module migrations.  Methods return
 * `{ response, data, url }`; `data` is parsed JSON when possible.
 */
export class ApiClient {
    constructor(options = {}) {
        this._baseUrl = options.baseUrl;
        this._getAuthToken = options.getAuthToken || getExistingAuthToken;
        this._fetch = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
        this._defaultTimeoutMs = Number(options.timeoutMs || CONFIG.api.timeoutMs);
    }

    setBaseUrl(baseUrl) {
        this._baseUrl = baseUrl;
    }

    getBaseUrl() {
        return typeof this._baseUrl === 'function'
            ? this._baseUrl()
            : (this._baseUrl === undefined ? getServerBase() : this._baseUrl);
    }

    resolveUrl(path) {
        return resolveServerUrl(path, this.getBaseUrl());
    }

    async request(path, options = {}) {
        if (!this._fetch) {
            throw new ApiError('이 환경에서는 fetch를 사용할 수 없습니다.', {
                code: 'fetch_unavailable'
            });
        }

        const method = String(options.method || 'GET').toUpperCase();
        const headers = toHeaders(options.headers);
        const auth = options.auth !== false;
        const timeoutMs = options.timeoutMs === undefined
            ? this._defaultTimeoutMs
            : Number(options.timeoutMs);
        const url = this.resolveUrl(path);

        if (!headers.has('Accept')) {
            headers.set('Accept', 'application/json');
        }

        if (auth && !headers.has('Authorization')) {
            const token = this._getAuthToken && this._getAuthToken();
            if (token) headers.set('Authorization', 'Bearer ' + token);
        }

        let body = options.body;
        if (options.json !== undefined) {
            if (options.formData) {
                throw new TypeError('json and formData cannot be used together.');
            }
            if (!headers.has('Content-Type')) {
                headers.set('Content-Type', 'application/json');
            }
            body = JSON.stringify(options.json);
        } else if (options.formData) {
            // Do not set Content-Type: the browser adds the multipart boundary.
            body = options.formData;
            headers.delete('Content-Type');
        }

        const controller = typeof AbortController === 'function'
            ? new AbortController()
            : null;
        let timer = null;
        if (controller && Number.isFinite(timeoutMs) && timeoutMs > 0) {
            timer = setTimeout(function() { controller.abort(); }, timeoutMs);
        }

        let response;
        try {
            response = await this._fetch(url, {
                method,
                headers,
                body,
                signal: options.signal || (controller && controller.signal),
                credentials: options.credentials || 'omit'
            });
        } catch (error) {
            const aborted = controller && controller.signal.aborted;
            throw new ApiError(
                aborted ? '서버 요청 시간이 초과되었습니다.' : '서버에 연결할 수 없습니다.',
                {
                    code: aborted ? 'timeout' : 'network_error',
                    url,
                    retriable: true,
                    cause: error
                }
            );
        } finally {
            if (timer) clearTimeout(timer);
        }

        const data = await parseResponse(response);
        if (!response.ok) {
            throw new ApiError(responseMessage(data, response.status), {
                code: 'http_error',
                status: response.status,
                data,
                url,
                retriable: response.status === 408 || response.status === 425 ||
                    response.status === 429 || response.status >= 500
            });
        }

        return { response, data, url };
    }

    get(path, options = {}) {
        return this.request(path, { ...options, method: 'GET' });
    }

    postJSON(path, json, options = {}) {
        return this.request(path, { ...options, method: 'POST', json });
    }

    postForm(path, formData, options = {}) {
        return this.request(path, { ...options, method: 'POST', formData });
    }
}

export function createApiClient(options) {
    return new ApiClient(options);
}
