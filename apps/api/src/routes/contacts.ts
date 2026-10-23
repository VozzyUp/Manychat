import { AppError, contactKindSchema, phoneInputToWaId } from '@nurion/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps';
import { requireTenant, tenantOf } from '../http/auth';
import { unwrap, unwrapMaybe } from '../http/db-errors';
import { messages } from '../messages';

const COLUMNS = 'id, wa_id, name, profile_name, kind, anonymized_at, created_at';

const createBody = z.object({
  phone: z.string().trim().min(8).max(30),
  name: z.string().trim().min(1).max(120).optional(),
  kind: contactKindSchema.default('unknown'),
});
const patchBody = z.object({
  name: z.string().trim().min(1).max(120).nullable().optional(),
  kind: contactKindSchema.optional(),
});
const idParams = z.object({ id: z.uuid() });

/** S06/S07 — contacts (who talks to the tenant on WhatsApp) and LGPD anonymization (§10). */
export function contactRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post(
    '/v1/contacts',
    { preHandler: requireTenant(deps, 'operator') },
    async (request, reply) => {
      const body = createBody.parse(request.body);
      const { id: tenantId, auth } = tenantOf(request);
      const waId = phoneInputToWaId(body.phone);
      if (!waId) throw new AppError('validation_error', messages.invalidPhone);
      const result = await auth.db
        .from('contacts')
        .insert({ tenant_id: tenantId, wa_id: waId, name: body.name ?? null, kind: body.kind })
        .select(COLUMNS)
        .single();
      if (result.error?.code === '23505') throw new AppError('conflict', messages.contactExists);
      return reply.status(201).send(unwrap(result));
    },
  );

  app.patch(
    '/v1/contacts/:id',
    { preHandler: requireTenant(deps, 'operator') },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = patchBody.parse(request.body);
      const { id: tenantId, auth } = tenantOf(request);
      const current = unwrapMaybe(
        await auth.db
          .from('contacts')
          .select('anonymized_at')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .maybeSingle(),
      );
      if (!current) throw new AppError('not_found', messages.notFound);
      if (current.anonymized_at) throw new AppError('conflict', messages.contactAnonymized);
      return unwrap(
        await auth.db
          .from('contacts')
          .update(body)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select(COLUMNS)
          .single(),
      );
    },
  );

  /** Removes personal data on the data subject's request (contact, messages, media files, audit data). */
  app.post(
    '/v1/contacts/:id/anonymize',
    { preHandler: requireTenant(deps, 'admin') },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const { id: tenantId, auth } = tenantOf(request);
      const visible = unwrapMaybe(
        await auth.db
          .from('contacts')
          .select('id, anonymized_at')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .maybeSingle(),
      );
      if (!visible) throw new AppError('not_found', messages.notFound);
      if (visible.anonymized_at) throw new AppError('conflict', messages.contactAnonymized);

      const tdb = deps.serviceDb.withTenant(tenantId);
      // Files first: if storage fails, nothing has been anonymized yet and the request can be
      // retried (the database step deletes the rows that point at the files).
      const media = unwrap(
        await tdb
          .from('message_media')
          .select('storage_path, messages!inner(conversations!inner(contact_id))')
          .eq('messages.conversations.contact_id', id)
          .not('storage_path', 'is', null),
      );
      const before = media.flatMap((m) => (m.storage_path ? [m.storage_path] : []));
      if (before.length) {
        const removed = await tdb.storage.from('media').remove(before);
        if (removed.error) {
          request.log.error(
            { err: removed.error, tenant_id: tenantId },
            'media removal before anonymization failed',
          );
          throw new AppError('internal_error', messages.mediaRemovalFailed);
        }
      }

      const { data: paths, error } = await tdb.rpc('anonymize_contact', {
        p_tenant_id: tenantId,
        p_contact_id: id,
        p_actor: auth.userId,
      });
      if (error) throw new AppError('internal_error', error.message);
      // Media that arrived between the two steps.
      const late = (paths ?? []).filter((p) => p && !before.includes(p));
      if (late.length) {
        const removed = await tdb.storage.from('media').remove(late);
        if (removed.error)
          request.log.error(
            { err: removed.error, tenant_id: tenantId, paths: late },
            'media removal after anonymization failed: delete these objects by hand',
          );
      }
      return { anonymized: true, removed_files: before.length + late.length };
    },
  );

  /** Closes the human handoff of a conversation so the AI answers again (§4.7). */
  app.post(
    '/v1/conversations/:id/handoff/close',
    { preHandler: requireTenant(deps, 'operator') },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const { id: tenantId, auth } = tenantOf(request);
      const rows = unwrap(
        await auth.db
          .from('handoffs')
          .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
            closed_by_user_id: auth.userId,
          })
          .eq('conversation_id', id)
          .eq('tenant_id', tenantId)
          .eq('status', 'open')
          .select('id'),
      );
      if (!rows.length) throw new AppError('not_found', messages.noOpenHandoff);
      return { closed: rows.length };
    },
  );
}
