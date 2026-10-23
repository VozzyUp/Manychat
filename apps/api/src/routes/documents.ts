import { createHash, randomUUID } from 'node:crypto';
import { AppError, collectionSchema, roleAtLeast } from '@nurion/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../deps';
import { requireTenant, tenantOf } from '../http/auth';
import { unwrap, unwrapMaybe } from '../http/db-errors';
import { messages } from '../messages';

const MAX_BYTES = 20 * 1024 * 1024;

const FILE_TYPES = {
  pdf: {
    mime: 'application/pdf',
    magic: (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
  txt: { mime: 'text/plain', magic: isUtf8Text },
  md: { mime: 'text/markdown', magic: isUtf8Text },
} as const;

function isUtf8Text(b: Buffer): boolean {
  if (b.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}

/** The type is decided by extension and then confirmed by the file's own bytes. */
function fileKind(filename: string, data: Buffer): keyof typeof FILE_TYPES | null {
  const ext = filename.toLowerCase().split('.').pop() as keyof typeof FILE_TYPES | undefined;
  if (!ext || !(ext in FILE_TYPES)) return null;
  return FILE_TYPES[ext].magic(data) ? ext : null;
}

const date = z.iso.date();
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalDate = z.preprocess(emptyToUndefined, date.optional());

const metadataFields = z.object({
  title: z.string().trim().min(1).max(200),
  collection: collectionSchema,
  code: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(40).optional()),
  owner_user_id: z.preprocess(emptyToUndefined, z.uuid().optional()),
  tags: z
    .preprocess(
      (v) =>
        typeof v === 'string'
          ? v
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : v,
      z.array(z.string().max(40)).max(20),
    )
    .default([]),
  effective_date: optionalDate,
  review_date: optionalDate,
});
const versionFields = z.object({ effective_date: optionalDate, review_date: optionalDate });

const idParams = z.object({ id: z.uuid() });

type Upload = {
  fields: Record<string, string>;
  filename: string;
  data: Buffer;
  kind: keyof typeof FILE_TYPES;
};

/** Reads text fields (sent before the file) and the file of a multipart request. */
async function readUpload(request: FastifyRequest): Promise<Upload> {
  const fields: Record<string, string> = {};
  for await (const part of request.parts({ limits: { fileSize: MAX_BYTES, files: 1 } })) {
    if (part.type === 'field') {
      if (typeof part.value === 'string') fields[part.fieldname] = part.value;
      continue;
    }
    const data = await part.toBuffer().catch(() => {
      throw new AppError('payload_too_large', messages.documentSize);
    });
    if (part.file.truncated) throw new AppError('payload_too_large', messages.documentSize);
    const kind = fileKind(part.filename, data);
    if (!kind) throw new AppError('validation_error', messages.documentType);
    return { fields, filename: part.filename.slice(0, 255), data, kind };
  }
  throw new AppError('validation_error', messages.documentMissing);
}

const safeName = (filename: string) =>
  filename
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(-80) || 'arquivo';

const TRANSITIONS: Record<string, { from: string[]; needs: 'operator' | 'quality' }> = {
  em_revisao: { from: ['rascunho'], needs: 'operator' },
  rascunho: { from: ['em_revisao'], needs: 'quality' },
  aprovado: { from: ['em_revisao'], needs: 'quality' },
  obsoleto: { from: ['rascunho', 'aprovado'], needs: 'quality' },
};

const VERSION_COLUMNS =
  'id, document_id, version, status, filename, mime, size, effective_date, review_date, summary, ingest_status, ingest_error, chunk_count, approved_at, activated_at, created_at';

/** §4.5 — documents, versions and the approval workflow. Only approved + ingested versions feed the AI. */
export function documentRoutes(app: FastifyInstance, deps: AppDeps) {
  /** Stores the file and inserts the draft version; undoes the upload if the insert fails. */
  async function addVersion(
    request: FastifyRequest,
    documentId: string,
    upload: Upload,
    dates: { effective_date?: string; review_date?: string },
  ) {
    const { id: tenantId, auth } = tenantOf(request);
    const last = unwrapMaybe(
      await auth.db
        .from('document_versions')
        .select('version, sha256')
        .eq('tenant_id', tenantId)
        .eq('document_id', documentId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    const sha256 = createHash('sha256').update(upload.data).digest('hex');
    if (last?.sha256 === sha256) throw new AppError('conflict', messages.documentIdentical);

    const version = (last?.version ?? 0) + 1;
    const path = `${tenantId}/${documentId}/v${version}-${randomUUID().slice(0, 8)}-${safeName(upload.filename)}`;
    const storage = deps.serviceDb.withTenant(tenantId).storage.from('documents');
    const uploaded = await storage.upload(path, upload.data, {
      contentType: FILE_TYPES[upload.kind].mime,
      upsert: false,
    });
    if (uploaded.error) throw new AppError('internal_error', uploaded.error.message);

    const inserted = await auth.db
      .from('document_versions')
      .insert({
        tenant_id: tenantId,
        document_id: documentId,
        version,
        storage_path: path,
        filename: upload.filename,
        mime: FILE_TYPES[upload.kind].mime,
        size: upload.data.length,
        sha256,
        effective_date: dates.effective_date ?? null,
        review_date: dates.review_date ?? null,
        created_by: auth.userId,
      })
      .select(VERSION_COLUMNS)
      .single();
    if (inserted.error) {
      await storage.remove([path]);
      if (inserted.error.code === '23505') throw new AppError('conflict', messages.duplicate);
      unwrap(inserted);
    }
    return inserted.data!;
  }

  app.post(
    '/v1/documents',
    { preHandler: requireTenant(deps, 'operator') },
    async (request, reply) => {
      const { id: tenantId, auth } = tenantOf(request);
      const upload = await readUpload(request);
      const meta = metadataFields.parse(upload.fields);

      const created = await auth.db
        .from('documents')
        .insert({
          tenant_id: tenantId,
          collection: meta.collection,
          code: meta.code ?? null,
          title: meta.title,
          owner_user_id: meta.owner_user_id ?? null,
          tags: meta.tags,
          created_by: auth.userId,
        })
        .select('id, collection, code, title, owner_user_id, tags, current_version_id, created_at')
        .single();
      if (created.error?.code === '23505')
        throw new AppError('conflict', messages.documentCodeExists);
      const document = unwrap(created);

      try {
        const version = await addVersion(request, document.id, upload, meta);
        return reply.status(201).send({ ...document, version });
      } catch (err) {
        // An empty document would be left behind: undo it (users cannot delete; the service role can).
        await deps.serviceDb.withTenant(tenantId).from('documents').delete().eq('id', document.id);
        throw err;
      }
    },
  );

  app.post(
    '/v1/documents/:id/versions',
    { preHandler: requireTenant(deps, 'operator') },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { id: tenantId, auth } = tenantOf(request);
      const document = unwrapMaybe(
        await auth.db
          .from('documents')
          .select('id')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .maybeSingle(),
      );
      if (!document) throw new AppError('not_found', messages.notFound);
      const upload = await readUpload(request);
      const dates = versionFields.parse(upload.fields);
      return reply.status(201).send(await addVersion(request, id, upload, dates));
    },
  );

  app.patch(
    '/v1/documents/:id',
    { preHandler: requireTenant(deps, 'operator') },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = metadataFields
        .omit({ effective_date: true, review_date: true })
        .partial()
        .extend({
          code: z.string().trim().min(1).max(40).nullable().optional(),
          owner_user_id: z.uuid().nullable().optional(),
        })
        .parse(request.body);
      const { id: tenantId, auth } = tenantOf(request);
      const result = await auth.db
        .from('documents')
        .update(body)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('id, collection, code, title, owner_user_id, tags, current_version_id');
      if (result.error?.code === '23505')
        throw new AppError('conflict', messages.documentCodeExists);
      const rows = unwrap(result);
      if (!rows.length) throw new AppError('not_found', messages.notFound);
      return rows[0];
    },
  );

  app.patch(
    '/v1/document-versions/:id',
    { preHandler: requireTenant(deps, 'operator') },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = z
        .object({
          effective_date: z.union([date, z.null()]).optional(),
          review_date: z.union([date, z.null()]).optional(),
          summary: z.string().trim().max(600).nullable().optional(),
        })
        .parse(request.body);
      const { id: tenantId, auth } = tenantOf(request);
      const result = await auth.db
        .from('document_versions')
        .update(body)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select(VERSION_COLUMNS);
      if (result.error?.code === '23514')
        throw new AppError('validation_error', messages.invalidDates);
      const rows = unwrap(result);
      if (!rows.length) throw new AppError('not_found', messages.notFound);
      return rows[0];
    },
  );

  /** rascunho → em_revisao → aprovado → obsoleto (§4.5). Approving starts the ingestion. */
  app.post(
    '/v1/document-versions/:id/transition',
    { preHandler: requireTenant(deps, 'operator') },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const { to } = z
        .object({ to: z.enum(['em_revisao', 'rascunho', 'aprovado', 'obsoleto']) })
        .parse(request.body);
      const { id: tenantId, role, auth } = tenantOf(request);

      const version = unwrapMaybe(
        await auth.db
          .from('document_versions')
          .select('id, document_id, status')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .maybeSingle(),
      );
      if (!version) throw new AppError('not_found', messages.notFound);
      const rule = TRANSITIONS[to]!;
      if (!rule.from.includes(version.status))
        throw new AppError('conflict', messages.documentTransition);
      if (!roleAtLeast(role, rule.needs)) throw new AppError('forbidden', messages.documentApprove);

      const now = new Date().toISOString();
      const patch =
        to === 'aprovado'
          ? {
              status: to,
              approved_by: auth.userId,
              approved_at: now,
              ingest_status: 'pending' as const,
              ingest_error: null,
            }
          : { status: to };
      const updated = unwrap(
        await auth.db
          .from('document_versions')
          .update(patch)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select(VERSION_COLUMNS),
      );
      if (!updated.length) throw new AppError('forbidden', messages.forbidden);

      if (to === 'obsoleto') {
        // If it was the version feeding the AI, the document has no current version anymore.
        await auth.db
          .from('documents')
          .update({ current_version_id: null })
          .eq('id', version.document_id)
          .eq('tenant_id', tenantId)
          .eq('current_version_id', id);
      }
      if (to === 'aprovado') {
        await deps.enqueueIngest({ tenantId, versionId: id }, `ingest-${id}-${Date.now()}`);
      }
      return updated[0];
    },
  );

  /** Reprocesses an approved version whose ingestion failed (or never started). */
  app.post(
    '/v1/document-versions/:id/reingest',
    { preHandler: requireTenant(deps, 'admin') },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const { id: tenantId, auth } = tenantOf(request);
      const rows = unwrap(
        await auth.db
          .from('document_versions')
          .update({ ingest_status: 'pending', ingest_error: null })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .eq('status', 'aprovado')
          .in('ingest_status', ['failed', 'pending'])
          .select(VERSION_COLUMNS),
      );
      if (!rows.length) throw new AppError('conflict', messages.documentReingest);
      await deps.enqueueIngest({ tenantId, versionId: id }, `ingest-${id}-${Date.now()}`);
      return rows[0];
    },
  );
}
