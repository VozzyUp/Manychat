import { AppError } from '@nurion/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps';
import { requireTenant, tenantOf } from '../http/auth';
import { unwrap } from '../http/db-errors';
import { messages } from '../messages';

const body = z.object({ name: z.string().trim().min(1).max(80) });
const idParams = z.object({ id: z.uuid() });

/** S23 — departments (setores) of the active tenant. */
export function departmentRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post(
    '/v1/departments',
    { preHandler: requireTenant(deps, 'admin') },
    async (request, reply) => {
      const { name } = body.parse(request.body);
      const { id: tenantId, auth } = tenantOf(request);
      const row = unwrap(
        await auth.db
          .from('departments')
          .insert({ tenant_id: tenantId, name })
          .select('id, name')
          .single(),
      );
      return reply.status(201).send(row);
    },
  );

  app.patch(
    '/v1/departments/:id',
    { preHandler: requireTenant(deps, 'admin') },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const { name } = body.parse(request.body);
      const { id: tenantId, auth } = tenantOf(request);
      const rows = unwrap(
        await auth.db
          .from('departments')
          .update({ name })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select('id, name'),
      );
      if (!rows.length) throw new AppError('not_found', messages.notFound);
      return rows[0];
    },
  );

  app.delete(
    '/v1/departments/:id',
    { preHandler: requireTenant(deps, 'admin') },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { id: tenantId, auth } = tenantOf(request);
      const rows = unwrap(
        await auth.db
          .from('departments')
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
