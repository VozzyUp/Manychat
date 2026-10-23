import type { Json } from '@nurion/db';
import { AppError, brandingSchema, resolveBranding } from '@nurion/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps';
import { requireTenant, tenantOf } from '../http/auth';
import { unwrap } from '../http/db-errors';
import { messages } from '../messages';

const timezones = new Set(Intl.supportedValuesOf('timeZone'));

const patchTenantBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  branding: z
    .object({
      name: brandingSchema.shape.name.nullable(),
      primary: brandingSchema.shape.primary.nullable(),
    })
    .partial()
    .optional(),
  settings: z
    .object({
      timezone: z
        .string()
        .refine((tz) => timezones.has(tz), messages.invalidTimezone)
        .optional(),
      business_hours: z.string().trim().max(300).nullable().optional(),
      rules: z.string().trim().max(4000).nullable().optional(),
    })
    .optional(),
});

const LOGO_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/png': {
    ext: 'png',
    magic: (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': {
    ext: 'webp',
    magic: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  },
};
export const LOGO_MAX_BYTES = 1024 * 1024;

/** Merges a partial patch into a JSON object; `null` removes the key. */
function mergeJson(
  current: unknown,
  patch: Record<string, unknown> | undefined,
): { [key: string]: Json | undefined } {
  const base: Record<string, unknown> =
    current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === undefined) continue;
    if (value === null) delete base[key];
    else base[key] = value;
  }
  return base as { [key: string]: Json | undefined };
}

/** S19 — general settings and white-label of the active tenant. */
export function tenantRoutes(app: FastifyInstance, deps: AppDeps) {
  const loadTenant = async (request: Parameters<typeof tenantOf>[0]) => {
    const { id, auth } = tenantOf(request);
    return unwrap(
      await auth.db
        .from('tenants')
        .select('id, name, slug, branding, settings, partner:partners(name, branding)')
        .eq('id', id)
        .single(),
    );
  };

  const present = (tenant: Awaited<ReturnType<typeof loadTenant>>) => ({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    settings: tenant.settings,
    branding: tenant.branding,
    resolved_branding: resolveBranding({
      tenant: tenant.branding,
      partner: tenant.partner?.branding,
      partnerName: tenant.partner?.name,
    }),
  });

  app.get('/v1/tenant', { preHandler: requireTenant(deps) }, async (request) =>
    present(await loadTenant(request)),
  );

  app.patch('/v1/tenant', { preHandler: requireTenant(deps, 'admin') }, async (request) => {
    const body = patchTenantBody.parse(request.body);
    const { id, auth } = tenantOf(request);
    const current = await loadTenant(request);
    const update = {
      ...(body.name ? { name: body.name } : {}),
      branding: mergeJson(current.branding, body.branding),
      settings: mergeJson(current.settings, body.settings),
    };
    const result = await auth.db.from('tenants').update(update).eq('id', id).select('id');
    if (!unwrap(result).length) throw new AppError('forbidden', messages.forbidden);
    return present(await loadTenant(request));
  });

  app.post('/v1/tenant/logo', { preHandler: requireTenant(deps, 'admin') }, async (request) => {
    const { id, auth } = tenantOf(request);
    const file = await request.file({ limits: { fileSize: LOGO_MAX_BYTES, files: 1 } });
    if (!file) throw new AppError('validation_error', messages.logoMissing);
    const type = LOGO_TYPES[file.mimetype];
    if (!type) throw new AppError('validation_error', messages.logoType);
    const buffer = await file.toBuffer().catch(() => {
      throw new AppError('payload_too_large', messages.logoSize);
    });
    if (file.file.truncated) throw new AppError('payload_too_large', messages.logoSize);
    if (!type.magic(buffer)) throw new AppError('validation_error', messages.logoType);

    const storage = deps.serviceDb.withTenant(id).storage.from('branding');
    const path = `${id}/logo-${Date.now()}.${type.ext}`;
    const upload = await storage.upload(path, buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (upload.error) throw new AppError('internal_error', upload.error.message);
    const logoUrl = storage.getPublicUrl(path).data.publicUrl;

    const current = await loadTenant(request);
    const result = await auth.db
      .from('tenants')
      .update({ branding: mergeJson(current.branding, { logo_url: logoUrl }) })
      .eq('id', id)
      .select('id');
    if (!unwrap(result).length) throw new AppError('forbidden', messages.forbidden);
    return present(await loadTenant(request));
  });

  app.delete('/v1/tenant/logo', { preHandler: requireTenant(deps, 'admin') }, async (request) => {
    const { id, auth } = tenantOf(request);
    const current = await loadTenant(request);
    unwrap(
      await auth.db
        .from('tenants')
        .update({ branding: mergeJson(current.branding, { logo_url: null }) })
        .eq('id', id)
        .select('id'),
    );
    return present(await loadTenant(request));
  });
}
