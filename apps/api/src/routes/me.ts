import { loadPartnerMemberships, loadTenantMemberships } from '@nurion/db';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import { authOf, requireUser } from '../http/auth';
import { unwrapMaybe } from '../http/db-errors';

/** GET /v1/me — who am I, which tenants and partners can I use (S01, S02). */
export function meRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/v1/me', { preHandler: requireUser(deps) }, async (request) => {
    const auth = authOf(request);
    const [profile, tenants, partners] = await Promise.all([
      auth.db.from('profiles').select('full_name, email').eq('id', auth.userId).maybeSingle(),
      loadTenantMemberships(auth.db, auth.userId),
      loadPartnerMemberships(auth.db, auth.userId),
    ]);
    const me = unwrapMaybe(profile);
    return {
      user: { id: auth.userId, email: me?.email ?? auth.email, full_name: me?.full_name ?? null },
      tenants,
      partners,
    };
  });
}
