import type { TenantDb } from '@nurion/db';
import { extensionFor } from '@nurion/whatsapp';
import { whatsappClientFor, type ChannelContext } from './context';

export const MEDIA_BUCKET = 'media';

/** Storage path from the scope: <tenant>/<yyyy>/<mm>/<wamid>.<ext> (wamid made path-safe). */
export function mediaPath(tenantId: string, wamid: string, sentAt: Date, ext: string): string {
  const yyyy = String(sentAt.getUTCFullYear());
  const mm = String(sentAt.getUTCMonth() + 1).padStart(2, '0');
  return `${tenantId}/${yyyy}/${mm}/${wamid.replace(/[^A-Za-z0-9._-]/g, '_')}.${ext}`;
}

/**
 * Downloads an inbound media file from Meta (its URL lives only minutes, so this runs right after the
 * webhook) and stores it in the tenant's folder. On failure the row is marked failed and the error is
 * rethrown, so the job retries; the message itself is already saved.
 */
export async function storeInboundMedia(
  ctx: ChannelContext,
  tdb: TenantDb,
  input: {
    mediaRowId: string;
    mediaId: string;
    wamid: string;
    sentAt: Date;
    number: { phone_number_id: string; access_token_enc: string };
    filename?: string;
  },
): Promise<{ path: string; size: number; mime: string }> {
  try {
    const client = whatsappClientFor(ctx, input.number);
    const meta = await client.getMedia(input.mediaId);
    const data = await client.downloadMedia(meta.url);
    const mime = meta.mimeType.split(';')[0]!.trim();
    const path = mediaPath(
      tdb.tenantId,
      input.wamid,
      input.sentAt,
      extensionFor(meta.mimeType, input.filename),
    );

    const upload = await tdb.storage
      .from(MEDIA_BUCKET)
      .upload(path, data, { contentType: mime, upsert: true });
    if (upload.error) throw new Error(`storage upload failed: ${upload.error.message}`);

    const update = await tdb
      .from('message_media')
      .update({
        storage_path: path,
        size: data.length,
        mime,
        sha256: meta.sha256 ?? null,
        status: 'stored',
        error: null,
      })
      .eq('id', input.mediaRowId);
    if (update.error) throw new Error(update.error.message);
    return { path, size: data.length, mime };
  } catch (error) {
    await tdb
      .from('message_media')
      .update({ status: 'failed', error: (error as Error).message.slice(0, 500) })
      .eq('id', input.mediaRowId);
    throw error;
  }
}
