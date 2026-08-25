const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'shramsetu.token';

/* ------------------------------ token store ------------------------------ */

/**
 * The session token, held in `sessionStorage` — deliberately not localStorage.
 *
 * sessionStorage is scoped to the tab and is discarded when that tab closes, so
 * every fresh visit starts signed out and a shared or public machine does not
 * hand the next person an open session. Reloading, or navigating within the
 * tab, keeps you signed in: a refresh is not a new visit, and logging someone
 * out for pressing F5 teaches them to distrust the app.
 *
 * The token is the panel key and is re-checked server-side on every
 * panel-scoped request, so a tampered copy grants nothing — it only changes
 * which screen fails.
 */
export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    // Clear the old localStorage key too, so anyone carrying a session from a
    // previous build is signed out once rather than left with a stale token
    // that nothing reads.
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private-mode browsers throw on storage access; nothing to do */
    }
  },
};

/** Listeners notified when the server rejects our token (expiry, deactivation). */
const unauthorizedHandlers = new Set();
export const onUnauthorized = (fn) => {
  unauthorizedHandlers.add(fn);
  return () => unauthorizedHandlers.delete(fn);
};

/* -------------------------------- errors --------------------------------- */

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** Field-keyed map for rendering inline form errors. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

/* ------------------------------- transport ------------------------------- */

async function request(method, path, { body, params, signal, auth = true } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }

  const token = auth ? tokenStore.get() : null;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      /**
       * Never answer from the browser's HTTP cache.
       *
       * Bookings, job offers and balances change while the page is open, and a
       * cached 200 is indistinguishable from a fresh one to the code reading
       * it — you simply get yesterday's number with no indication anything is
       * wrong. `no-store` also keeps responses off disk, which matters when the
       * response body is somebody's address and phone number.
       */
      cache: 'no-store',
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the server. Check that the API is running.');
  }

  // 204 and other empty bodies are legitimate.
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    if (res.status === 401 && auth) {
      tokenStore.clear();
      unauthorizedHandlers.forEach((fn) => fn());
    }
    throw new ApiError(res.status, json?.error?.message || res.statusText, json?.error?.details);
  }

  // Unwrap the { success, data, meta } envelope; attach meta where present so
  // paginated callers can read it off the returned array.
  const data = json.data ?? json;
  if (json.meta && data && typeof data === 'object') {
    Object.defineProperty(data, 'meta', { value: json.meta, enumerable: false });
  }
  return data;
}

export const http = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts),
};
