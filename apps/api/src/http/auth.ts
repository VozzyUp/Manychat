import type { DbClient } from '@nurion/db';
import { AppError, roleAtLeast, type Role } from '@nurion/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps';
import { messages } from '../messages';

export type AuthContext = {
  userId: string;
  email: string | null;
  aal: string | null;
  accessToken: string;
  /** Acts as the user: every query goes through RLS. */
  db: DbClient;
};

export type TenantContext = { id: string; role: Role };

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
    tenant: TenantContext | null;
  }
}

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

const bearer = (header: string | undefined) => {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  return match?.[1]?.trim() || null;
};

/** Verifies the Supabase access token and attaches `request.auth`. */
export function requireUser(deps: AppDeps): PreHandler {
  return async (request) => {
    const token = bearer(request.headers.authorization);
    const user = token ? await deps.verifyToken(token) : null;
    if (!token || !user) throw new AppError('unauthenticated', messages.unauthenticated);
    request.auth = {
      userId: user.userId,
      email: user.email,
      aal: user.aal,
      accessToken: token,
      db: deps.userDb(token),
    };
  };
}

const tenantHeader = z.uuid();

/**
 * Requires `x-tenant-id` of a tenant the user belongs to, with at least `minRole`.
 * The membership is read with the user's own client, so RLS (and 2FA) are part of the check.
 */
export function requireTenant(deps: AppDeps, minRole: Role = 'viewer'): PreHandler {
  const authenticate = requireUser(deps);
  return async (request, reply) => {
    if (!request.auth) await authenticate(request, reply);
    const auth = request.auth!;
    const parsed = tenantHeader.safeParse(request.headers['x-tenant-id']);
    if (!parsed.success) throw new AppError('validation_error', messages.noTenant);

    const { data, error } = await auth.db
      .from('tenant_members')
      .select('role, tenant:tenants!inner(status)')
      .eq('tenant_id', parsed.data)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (error) throw new AppError('internal_error', error.message);
    if (!data) throw new AppError('forbidden', messages.notMember);
    if (data.tenant.status !== 'active') throw new AppError('forbidden', messages.tenantSuspended);
    if (!roleAtLeast(data.role, minRole)) throw new AppError('forbidden', messages.forbidden);

    request.tenant = { id: parsed.data, role: data.role };
  };
}

/** Narrowing helpers for handlers that run after the pre-handlers above. */
export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new AppError('unauthenticated', messages.unauthenticated);
  return request.auth;
}

export function tenantOf(request: FastifyRequest): TenantContext & { auth: AuthContext } {
  if (!request.tenant) throw new AppError('validation_error', messages.noTenant);
  return { ...request.tenant, auth: authOf(request) };
}
