const PLUGIN_ID = 'com.github.alun.user-status-dashboard';

function getCsrfToken(): string {
    const match = document.cookie.match(/MMCSRF=([^\s;]+)/);
    return match ? match[1] : '';
}

function baseHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'X-Requested-With': 'XMLHttpRequest',
    };
    const csrf = getCsrfToken();
    if (csrf) {
        headers['X-CSRF-Token'] = csrf;
    }
    return headers;
}

export function pluginApiUrl(path: string): string {
    return `/plugins/${PLUGIN_ID}/api/v1${path}`;
}

export function doGet(url: string): Promise<Response> {
    return fetch(url, {headers: baseHeaders()});
}

export function doPost(url: string, body: unknown): Promise<Response> {
    return fetch(url, {
        method: 'POST',
        headers: {
            ...baseHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

export function doPut(url: string, body: unknown): Promise<Response> {
    return fetch(url, {
        method: 'PUT',
        headers: {
            ...baseHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

export function doDelete(url: string): Promise<Response> {
    return fetch(url, {
        method: 'DELETE',
        headers: baseHeaders(),
    });
}
