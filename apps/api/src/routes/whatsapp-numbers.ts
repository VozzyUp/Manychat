import type { TablesUpdate } from '@nurion/db';
import { AppError, moduleKeySchema } from '@nurion/shared';
import { GraphApiError, WhatsAppClient } from '@nurion/whatsapp';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps';
import { requireTenant, tenantOf, type AuthContext } from '../http/auth';
import { unwrap } from '../http/db-errors';
import { messages } from '../messages';

const COLUMNS =
  'id, phone_number_id, waba_id, display_number, token_last4, default_module, status, verified_name, verified_at, created_at';

const digits = z
  .string()
  .trim()
  .regex(/^\d{5,30}$/, 'Use só números');
const createBody = z.object({
  phone_number_id: digits,
  waba_id: digits,
  display_number: z.string().trim().min(5).max(30).optional(),
  access_token: z.string().trim().min(20),
  default_module: moduleKeySchema.nullable().optional(),
});
const patchBody = z.object({
  display_number: z.string().trim().min(5).max(30).optional(),
  access_token: z.string().trim().min(20).optional(),
  default_module: moduleKeySchema.nullable().optional(),
  status: z.enum(['active', 'disabled']).optional(),
});
const idParams = z.object({ id: z.uuid() });

/** S21 — WhatsApp numbers of the tenant. Tokens are checked with Meta, encrypted, and never returned. */
export function whatsappNumberRoutes(app: FastifyInstance, deps: AppDeps) {
  const vault = () => {
    if (!deps.secrets) throw new AppError('internal_error', messages.vaultMissing);
    return deps.secrets;
  };

  const checkWithMeta = async (phoneNumberId: string, accessToken: string) => {
    try {
      return await new WhatsAppClient({
        phoneNumberId,
        accessToken,
        ...deps.whatsapp.graph,
      }).getPhoneNumber();
    } catch (error) {
      if (error instanceof GraphApiError) {
        throw new AppError('unprocessable', `${messages.metaRejected} (${error.message})`);
      }
      throw error;
    }
  };

  const ensureModuleEnabled = async (
    auth: AuthContext,
    tenantId: string,
    module: string | null | undefined,
  ) => {
    if (!module) return;
    const rows = unwrap(
      await auth.db
        .from('tenant_modules')
        .select('module')
        .eq('tenant_id', tenantId)
        .eq('module', module)
        .eq('enabled', true),
    );
    if (!rows.length) throw new AppError('validation_error', messages.moduleNotEnabled);
  };

  app.post(
    '/v1/whatsapp-numbers',
    { preHandler: requireTenant(deps, 'admin') },
    async (request, reply) => {
      const body = createBody.parse(request.body);
      const { id: tenantId, auth } = tenantOf(request);
      await ensureModuleEnabled(auth, tenantId, body.default_module);
      const meta = await checkWithMeta(body.phone_number_id, body.access_token);
      const result = await auth.db
        .from('whatsapp_numbers')
        .insert({
          tenant_id: tenantId,
          phone_number_id: body.phone_number_id,
          waba_id: body.waba_id,
          display_number: body.display_number ?? meta.displayPhoneNumber,
          access_token_enc: vault().encrypt(body.access_token),
          token_last4: body.access_token.slice(-4),
          default_module: body.default_module ?? null,
          verified_name: meta.verifiedName ?? null,
          verified_at: new Date().toISOString(),
        })
        .select(COLUMNS)
        .single();
      if (result.error?.code === '23505') throw new AppError('conflict', messages.numberTaken);
      return reply.status(201).send(unwrap(result));
    },
  );

  app.patch(
    '/v1/whatsapp-numbers/:id',
    { preHandler: requireTenant(deps, 'admin') },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = patchBody.parse(request.body);
      const { id: tenantId, auth } = tenantOf(request);
      await ensureModuleEnabled(auth, tenantId, body.default_module);

      const current = unwrap(
        await auth.db
          .from('whatsapp_numbers')
          .select('phone_number_id')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .maybeSingle(),
      );
      const update: TablesUpdate<'whatsapp_numbers'> = {};
      if (body.display_number) update.display_number = body.display_number;
      if (body.default_module !== undefined) update.default_module = body.default_module;
      if (body.status) update.status = body.status;
      if (body.access_token) {
        const meta = await checkWithMeta(current.phone_number_id, body.access_token);
        update.access_token_enc = vault().encrypt(body.access_token);
        update.token_last4 = body.access_token.slice(-4);
        update.verified_name = meta.verifiedName ?? null;
        update.verified_at = new Date().toISOString();
      }
      return unwrap(
        await auth.db
          .from('whatsapp_numbers')
          .update(update)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select(COLUMNS)
          .single(),
      );
    },
  );

  app.post(
    '/v1/whatsapp-numbers/:id/check',
    { preHandler: requireTenant(deps, 'admin') },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const { id: tenantId, auth } = tenantOf(request);
      // The token is not readable by users: read it with the tenant-pinned service client.
      const row = unwrap(
        await deps.serviceDb
          .withTenant(tenantId)
          .from('whatsapp_numbers')
          .select('phone_number_id, access_token_enc')
          .eq('id', id)
          .maybeSingle(),
      );
      const meta = await checkWithMeta(row.phone_number_id, vault().decrypt(row.access_token_enc));
      return unwrap(
        await auth.db
          .from('whatsapp_numbers')
          .update({
            verified_name: meta.verifiedName ?? null,
            verified_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select(COLUMNS)
          .single(),
      );
    },
  );

  app.delete(
    '/v1/whatsapp-numbers/:id',
    { preHandler: requireTenant(deps, 'admin') },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { id: tenantId, auth } = tenantOf(request);
      const result = await auth.db
        .from('whatsapp_numbers')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('id');
      if (result.error?.code === '23503') throw new AppError('conflict', messages.numberHasHistory);
      if (!unwrap(result).length) throw new AppError('not_found', messages.notFound);
      return reply.status(204).send();
    },
  );
}
