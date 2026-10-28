// Small JSON GET with timeout and retry/backoff on 429 and transient failures.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} from ${new URL(url).host}${new URL(url).pathname}`);
    this.status = status;
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * @param {string} url
 * @param {{fetchImpl?: typeof fetch, retries?: number, baseDelayMs?: number, timeoutMs?: number, sleepImpl?: (ms:number)=>Promise<void>}} [opts]
 */
export async function getJson(url, opts = {}) {
  const { fetchImpl = fetch, retries = 4, baseDelayMs = 500, timeoutMs = 15000, sleepImpl = sleep } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let waitMs = baseDelayMs * 2 ** attempt;
    try {
      const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return await res.json();
      lastErr = new HttpError(res.status, url);
      if (!RETRYABLE.has(res.status)) throw lastErr;
      const retryAfter = Number(res.headers?.get?.('retry-after'));
      if (retryAfter > 0) waitMs = Math.max(waitMs, Math.min(retryAfter, 30) * 1000);
    } catch (err) {
      if (err instanceof HttpError && !RETRYABLE.has(err.status)) throw err;
      lastErr = err;
    }
    if (attempt < retries) await sleepImpl(waitMs);
  }
  throw lastErr;
}
