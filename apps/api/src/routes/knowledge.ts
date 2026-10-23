import { AppError, COLLECTIONS } from '@nurion/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps';
import { requireTenant, tenantOf } from '../http/auth';
import { unwrap } from '../http/db-errors';
import { messages } from '../messages';

const testBody = z.object({
  question: z.string().trim().min(3).max(500),
  collections: z.array(z.enum(COLLECTIONS)).max(COLLECTIONS.length).optional(),
});

const gapParams = z.object({ id: z.uuid() });

/** §4.5 — "Testar a base" (S11) and the unanswered questions (S12). */
export function knowledgeRoutes(app: FastifyInstance, deps: AppDeps) {
  /**
   * Asks the base a question the way an agent would: same search, same citation rule, no WhatsApp.
   * Costs real model calls (audited in ai_runs), so it needs at least the manager role.
   */
  app.post(
    '/v1/knowledge/test',
    { preHandler: requireTenant(deps, 'manager') },
    async (request) => {
      if (!deps.knowledgeTest) throw new AppError('unavailable', messages.knowledgeUnavailable);
      const body = testBody.parse(request.body);
      const { id: tenantId } = tenantOf(request);
      const result = await deps.knowledgeTest({
        tenantId,
        question: body.question,
        collections: body.collections,
      });
      return {
        outcome: result.outcome,
        answer: result.answer ?? null,
        handoff_reason: result.handoffReason ?? null,
        sources: result.sources.map((s) => ({
          chunk_id: s.chunkId,
          title: s.title,
          code: s.code ?? null,
          section: s.section ?? null,
          page: s.page ?? null,
          version: s.version ?? null,
          similarity: s.similarity ?? null,
          text: s.text ?? '',
          cited: s.cited,
        })),
        cost_usd: result.costUsd,
        turns: result.turns,
      };
    },
  );

  /** Marks (or reopens) an unanswered question once the documentation was completed. */
  app.patch(
    '/v1/knowledge-gaps/:id',
    { preHandler: requireTenant(deps, 'quality') },
    async (request) => {
      const { id } = gapParams.parse(request.params);
      const { status } = z.object({ status: z.enum(['open', 'resolved']) }).parse(request.body);
      const { id: tenantId, auth } = tenantOf(request);
      const rows = unwrap(
        await auth.db
          .from('knowledge_gaps')
          .update(
            status === 'resolved'
              ? { status, resolved_by: auth.userId, resolved_at: new Date().toISOString() }
              : { status, resolved_by: null, resolved_at: null },
          )
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select('id, status, resolved_at'),
      );
      if (!rows.length) throw new AppError('not_found', messages.gapMissing);
      return rows[0];
    },
  );
}
