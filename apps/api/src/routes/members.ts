import { AppError, roleSchema } from '@nurion/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps';
import { requireTenant, tenantOf } from '../http/auth';
import { unwrap, unwrapMaybe } from '../http/db-errors';
import { messages } from '../messages';

const inviteBody = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  role: roleSchema,
  full_name: z.string().trim().min(2).max(120).optional(),
});
const roleBody = z.object({ role: roleSchema });
const idParams = z.object({ id: z.uuid() });

/** S20 — members of the active tenant. RLS decides who may change what (ADR-0001). */
export function memberRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post('/v1/members', { preHandler: requireTenant(deps, 'admin') }, async (request, reply) => {
    const body = inviteBody.parse(request.body);
    const { id: tenantId, role: myRole, auth } = tenantOf(request);
    if (body.role === 'owner' && myRole !== 'owner') {
      throw new AppError('forbidden', messages.ownerOnly);
    }

    let userId = await deps.serviceDb.system.findUserIdByEmail(body.email);
    let invited = false;
    if (!userId) {
      userId = await deps.serviceDb.system.inviteUser(body.email, {
        redirectTo: `${deps.webUrl}/auth/confirm`,
        fullName: body.full_name,
      });
      invited = true;
    }

    const existing = unwrapMaybe(
      await auth.db
        .from('tenant_members')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .maybeSingle(),
    );
    if (existing) throw new AppError('conflict', messages.alreadyMember);

    const member = unwrap(
      await auth.db
        .from('tenant_members')
        .insert({ tenant_id: tenantId, user_id: userId, role: body.role })
        .select('id, user_id, role')
        .single(),
    );
    return reply.status(201).send({ ...member, invited });
  });

  app.patch('/v1/members/:id', { preHandler: requireTenant(deps, 'admin') }, async (request) => {
    const { id } = idParams.parse(request.params);
    const { role } = roleBody.parse(request.body);
    const { id: tenantId, role: myRole, auth } = tenantOf(request);
    if (role === 'owner' && myRole !== 'owner') throw new AppError('forbidden', messages.ownerOnly);
    const rows = unwrap(
      await auth.db
        .from('tenant_members')
        .update({ role })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('id, user_id, role'),
    );
    if (!rows.length) throw new AppError('not_found', messages.notFound);
    return rows[0];
  });

  app.delete(
    '/v1/members/:id',
    { preHandler: requireTenant(deps, 'admin') },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { id: tenantId, auth } = tenantOf(request);
      const rows = unwrap(
        await auth.db
          .from('tenant_members')
          .delete()
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select('id'),
      );
      if (!rows.length) throw new AppError('not_found', messages.notFound);
      return reply.status(204).send();
    },
  );
}
