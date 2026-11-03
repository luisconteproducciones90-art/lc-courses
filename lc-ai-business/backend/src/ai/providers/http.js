'use strict';
class AIProviderError extends Error {
  constructor(message, status) { super(message); this.name = 'AIProviderError'; this.status = status; }
}
async function postJson(url, headers, body, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AIProviderError(`HTTP ${res.status}`, res.status); // no se propaga el cuerpo (puede contener datos)
    return data;
  } catch (e) {
    if (e instanceof AIProviderError) throw e;
    throw new AIProviderError(e.name === 'AbortError' ? 'timeout' : 'network');
  } finally { clearTimeout(timer); }
}
module.exports = { postJson, AIProviderError };
