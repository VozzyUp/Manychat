import 'server-only';
import { serverEnv } from './env';
import { createSupabaseServerClient } from './supabase/server';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

/**
 * Calls apps/api with the user's access token (writes go through the API, ADR-0002).
 * Never throws for HTTP errors: returns the API's user-facing message instead.
 */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; tenantId?: string; form?: FormData } = {},
): Promise<ApiResult<T>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, status: 401, message: 'Sua sessão expirou. Entre novamente.' };

  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (init.tenantId) headers['x-tenant-id'] = init.tenantId;
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.body);
  }

  let res: Response;
  try {
    res = await fetch(`${serverEnv().API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 503, message: 'Serviço indisponível. Tente de novo em instantes.' };
  }
  if (res.status === 204) return { ok: true, data: undefined as T };
  const json = (await res.json().catch(() => null)) as {
    error?: { message?: string; details?: { message?: string }[] };
  } | null;
  if (!res.ok) {
    const detail = json?.error?.details?.[0]?.message;
    return {
      ok: false,
      status: res.status,
      message: detail ?? json?.error?.message ?? 'Não foi possível concluir. Tente de novo.',
    };
  }
  return { ok: true, data: json as T };
}
