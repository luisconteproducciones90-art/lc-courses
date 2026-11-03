// Cliente de API. Las credenciales viajan en cookies HttpOnly; aquí solo se maneja el token CSRF (no secreto de sesión).
export class ApiError extends Error {
  constructor(status, body) { super(body?.error?.message || 'Error de red'); this.status = status; this.code = body?.error?.code; this.details = body?.error?.details; }
}
const cookie = (n) => document.cookie.split('; ').find((c) => c.startsWith(n + '='))?.split('=')[1] || '';
let refreshing = null;

async function raw(method, path, body) {
  const headers = {};
  let payload;
  if (method !== 'GET') {
    if (!cookie('lc_csrf')) await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    headers['x-csrf-token'] = cookie('lc_csrf');
  }
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export async function api(method, path, body) {
  try {
    return await raw(method, path, body);
  } catch (e) {
    const isAuth = path.startsWith('/api/auth/') || path.startsWith('/api/demo/');
    if (e.status === 401 && !isAuth) {
      refreshing = refreshing || raw('POST', '/api/auth/refresh').finally(() => { refreshing = null; });
      try { await refreshing; } catch { window.dispatchEvent(new Event('auth:lost')); throw e; }
      return raw(method, path, body);
    }
    throw e;
  }
}
export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b ?? {});
export const put = (p, b) => api('PUT', p, b);
export const patch = (p, b) => api('PATCH', p, b);
export const del = (p) => api('DELETE', p);
