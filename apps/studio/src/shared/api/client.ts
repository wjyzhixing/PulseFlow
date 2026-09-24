import { getToken } from '../../features/auth/auth-store';

interface ApiFailure { ok: false; error: { code: string; message: string }; diagnostics?: unknown[] }
interface ApiSuccess<T> { ok: true; data: T }

export async function request<T>(path: string, body: object | FormData, authenticated = true, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
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
  let payload: ApiSuccess<T> | ApiFailure;
  try { payload = await response.json() as ApiSuccess<T> | ApiFailure; }
  catch { throw new Error('服务响应无效，请稍后重试'); }
  if (!response.ok || !payload.ok) throw new Error(payload.ok ? '请求失败，请稍后重试' : payload.error.message);
  return payload.data;
}
