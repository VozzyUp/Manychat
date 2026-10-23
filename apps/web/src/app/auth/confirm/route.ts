import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const TYPES: EmailOtpType[] = [
  'invite',
  'recovery',
  'email',
  'magiclink',
  'signup',
  'email_change',
];

/**
 * Landing of the links in invite / password-reset e-mails (supabase/templates).
 * Verifies the one-time token on the server and starts the session (cookies).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  const fail = new URL('/login?erro=link', request.url);

  if (!tokenHash || !type || !TYPES.includes(type)) return NextResponse.redirect(fail);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(fail);

  const fallback = type === 'invite' || type === 'recovery' ? '/definir-senha' : '/tenants';
  return NextResponse.redirect(new URL(safeNext(params.get('next'), fallback), request.url));
}
