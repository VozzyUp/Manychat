import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createSupabaseServerClient } from './supabase/server';

export type SessionUser = { id: string; email: string | null; needsSecondFactor: boolean };

/** The verified user of this request (JWT checked), or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const needsSecondFactor = aal.data?.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2';
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    needsSecondFactor,
  };
});

/** For pages behind login: redirects to /login, or to the 2FA step when the session needs it. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  const query = next ? `?next=${encodeURIComponent(next)}` : '';
  if (!user) redirect(`/login${query}`);
  if (user.needsSecondFactor) redirect(`/login/2fa${query}`);
  return user;
}

/** Only accept same-site relative redirects after login (no open redirects). */
export function safeNext(value: unknown, fallback = '/tenants'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
    return fallback;
  return value;
}
