import { getToken } from '../../features/auth/auth-store';

interface ApiFailure { ok: false; error: { code: string; message: string }; diagnostics?: unknown[] }
interface ApiSuccess<T> { ok: true; data: T }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function parseResponse<T>(response: Response): Promise<ApiSuccess<T> | ApiFailure> {
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error('服务响应无效，请稍后重试'); }

  if (!isRecord(payload)) throw new Error('服务响应无效，请稍后重试');
  if (payload.ok === true && Object.hasOwn(payload, 'data')) return payload as unknown as ApiSuccess<T>;
  if (payload.ok === false && isRecord(payload.error) && typeof payload.error.code === 'string' && typeof payload.error.message === 'string') {
    return payload as unknown as ApiFailure;
  }
  throw new Error('服务响应无效，请稍后重试');
}

export async function request<T>(path: string, body: object | FormData, authenticated = true, method: 'POST' | 'PUT' | 'DELETE' = 'POST'): Promise<T> {
  const headers: Record<string, string> = {};
  if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (authenticated) {
    const token = getToken();
    if (!token) throw new Error('会话已过期，请重新登录');
    headers.Authorization = `Bearer ${token}`;
  }
  let response: Response;
  try {
    response = await fetch(path, { method, headers, body: body instanceof FormData ? body : JSON.stringify(body) });
  } catch {
    throw new Error('网络连接失败，请稍后重试');
  }
  if (response.status === 204) return undefined as T;
  const payload = await parseResponse<T>(response);
  if (!response.ok || !payload.ok) throw new Error(payload.ok ? '请求失败，请稍后重试' : payload.error.message);
  return payload.data;
}

export async function read<T>(path: string, authenticated = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (authenticated) {
    const token = getToken();
    if (!token) throw new Error('会话已过期，请重新登录');
    headers.Authorization = `Bearer ${token}`;
  }
  let response: Response;
  try { response = await fetch(path, { method: 'GET', headers }); }
  catch { throw new Error('网络连接失败，请稍后重试'); }
  const payload = await parseResponse<T>(response);
  if (!response.ok || !payload.ok) throw new Error(payload.ok ? '请求失败，请稍后重试' : payload.error.message);
  return payload.data;
}
