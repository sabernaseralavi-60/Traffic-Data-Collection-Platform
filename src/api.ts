export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code: string, readonly issues?: { path: string; message: string }[]) {
    super(message);
  }
}

/** Thin fetch wrapper: same-origin cookie session, CSRF header on writes, typed errors, 401 broadcast. */
export async function api<T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-TL-CSRF': '1' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Network unavailable', 'network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) window.dispatchEvent(new Event('tl:unauthenticated'));
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.code || 'error', data.issues);
  }
  return data as T;
}

/** Message for a toast/banner: the server's own text, plus the first validation issue when there is one. */
export const errorText = (e: unknown) =>
  e instanceof ApiError ? (e.issues?.length ? `${e.message}: ${e.issues[0].path ? e.issues[0].path + ' - ' : ''}${e.issues[0].message}` : e.message) : 'Unexpected error';

export function download(path: string) {
  const a = document.createElement('a');
  a.href = `/api/v1${path}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
