export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
let csrfToken: string | null = null;

export function clearCsrfToken() { csrfToken = null; }

export async function apiDownload(path: string): Promise<{ blob: Blob; count: number }> {
  let response: Response;
  try { response = await fetch(`${base}${path}`, { credentials: 'include', headers: { Accept: 'text/csv' } }); }
  catch { throw new ApiError(0, '無法連線至 API 服務。'); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ApiError(response.status, body?.error?.message ?? `匯出失敗（${response.status}）。`);
  }
  return { blob: await response.blob(), count: Number(response.headers.get('X-Export-Count') ?? 0) };
}

export async function apiJson<T>(path: string, options: RequestInit = {}, useCsrf = false, retryCsrf = true): Promise<T> {
  try {
    if (useCsrf && !csrfToken) {
      csrfToken = (await apiJson<{ csrfToken: string }>('/api/auth/csrf')).csrfToken;
    }
    const response = await fetch(`${base}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(useCsrf ? { 'X-CSRF-Token': csrfToken! } : {}),
        ...options.headers,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
      if (useCsrf && retryCsrf && response.status === 403 && body?.error?.code === 'CSRF_INVALID') {
        clearCsrfToken();
        return apiJson<T>(path, options, true, false);
      }
      throw new ApiError(response.status, body?.error?.message ?? `請求失敗（${response.status}）。`);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, '無法連線至 API 服務。');
  }
}
