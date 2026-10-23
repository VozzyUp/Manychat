import { AppError } from '@nurion/shared';
import { GraphApiError, WhatsAppClient } from '@nurion/whatsapp';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps';
import { requireTenant, tenantOf } from '../http/auth';
import { unwrap } from '../http/db-errors';
import { messages } from '../messages';

const COLUMNS =
  'id, waba_id, name, language, category, body, variables_count, status, rejected_reason, last_synced_at';

/** Number of {{n}} variables in a template body. */
export function countVariables(body: string): number {
  const numbers = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return numbers.length ? Math.max(...numbers) : 0;
}

const createBody = z.object({
  waba_id: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/),
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,512}$/, 'Nome: letras minúsculas, números e _'),
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(_[A-Z]{2})?$/)
    .default('pt_BR'),
  category: z.enum(['utility', 'marketing', 'authentication']),
  body: z.string().trim().min(1).max(1024),
});
const patchBody = createBody.pick({ category: true, body: true }).partial();
const idParams = z.object({ id: z.uuid() });

const STATUS: Record<string, string> = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PENDING: 'pending',
  IN_APPEAL: 'pending',
  PAUSED: 'paused',
  DISABLED: 'disabled',
};

/** S22 — templates (required outside the 24 h window). Meta is the source of the approval status. */
export function whatsappTemplateRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post(
    '/v1/whatsapp-templates',
    { preHandler: requireTenant(deps, 'admin') },
    async (request, reply) => {
      const body = createBody.parse(request.body);
      const { id: tenantId, auth } = tenantOf(request);
      const row = unwrap(
        await auth.db
          .from('whatsapp_templates')
          .insert({ tenant_id: tenantId, ...body, variables_count: countVariables(body.body) })
          .select(COLUMNS)
          .single(),
      );
      return reply.status(201).send(row);
    },
  );

  app.patch(
    '/v1/whatsapp-templates/:id',
    { preHandler: requireTenant(deps, 'admin') },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = patchBody.parse(request.body);
      const { id: tenantId, auth } = tenantOf(request);
      return unwrap(
        await auth.db
          .from('whatsapp_templates')
          .update({ ...body, ...(body.body ? { variables_count: countVariables(body.body) } : {}) })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select(COLUMNS)
          .single(),
      );
    },
  );

  app.delete(
    '/v1/whatsapp-templates/:id',
    { preHandler: requireTenant(deps, 'admin') },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { id: tenantId, auth } = tenantOf(request);
      const rows = unwrap(
        await auth.db
          .from('whatsapp_templates')
          .delete()
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select('id'),
      );
      if (!rows.length) throw new AppError('not_found', messages.notFound);
      return reply.status(204).send();
    },
  );

  /** Pulls every template (and its approval status) from Meta for each WABA of the tenant. */
  app.post(
    '/v1/whatsapp-templates/sync',
    { preHandler: requireTenant(deps, 'admin') },
    async (request) => {
      const { id: tenantId, auth } = tenantOf(request);
      if (!deps.secrets) throw new AppError('internal_error', messages.vaultMissing);
      const numbers = unwrap(
        await deps.serviceDb
          .withTenant(tenantId)
          .from('whatsapp_numbers')
          .select('phone_number_id, waba_id, access_token_enc')
          .eq('status', 'active'),
      );
      const byWaba = new Map(numbers.map((n) => [n.waba_id, n]));
      let synced = 0;
      for (const [wabaId, number] of byWaba) {
        const client = new WhatsAppClient({
          phoneNumberId: number.phone_number_id,
          accessToken: deps.secrets.decrypt(number.access_token_enc),
          ...deps.whatsapp.graph,
        });
        let templates;
        try {
          templates = await client.listTemplates(wabaId);
        } catch (error) {
          if (error instanceof GraphApiError)
            throw new AppError('unprocessable', `${messages.metaRejected} (${error.message})`);
          throw error;
        }
        const rows = templates.map((t) => {
          const bodyText =
            (t.components as { type?: string; text?: string }[]).find((c) => c.type === 'BODY')
              ?.text ?? '';
          return {
            tenant_id: tenantId,
            waba_id: wabaId,
            name: t.name,
            language: t.language,
            category: t.category.toLowerCase(),
            body: bodyText,
            variables_count: countVariables(bodyText),
            components: t.components as never,
            status: STATUS[t.status] ?? 'pending',
            meta_template_id: t.id,
            last_synced_at: new Date().toISOString(),
          };
        });
        if (rows.length) {
          unwrap(
            await auth.db
              .from('whatsapp_templates')
              .upsert(rows, { onConflict: 'tenant_id,waba_id,name,language' })
              .select('id'),
          );
        }
        synced += rows.length;
      }
      return { synced, wabas: byWaba.size };
    },
  );
}
