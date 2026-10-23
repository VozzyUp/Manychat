import type { TenantDb } from '@nurion/db';
import { MEDIA_BUCKET } from '../channel/media';

export class MediaAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaAccessError';
  }
}

/**
 * Loads a stored image of the conversation. The media must belong to a message of this very
 * conversation (an agent never reads another contact's files, even with a guessed id).
 */
export async function loadConversationImage(
  tdb: TenantDb,
  input: { mediaId: string; conversationId: string | null },
): Promise<{ data: Uint8Array; mime: string }> {
  if (!input.conversationId) throw new MediaAccessError('Não há imagem nesta conversa.');
  const { data: media, error } = await tdb
    .from('message_media')
    .select('storage_path, mime, status, message:messages!inner(conversation_id, type)')
    .eq('id', input.mediaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!media || media.message.conversation_id !== input.conversationId) {
    throw new MediaAccessError('Imagem não encontrada nesta conversa.');
  }
  if (media.message.type !== 'image' && media.message.type !== 'sticker') {
    throw new MediaAccessError('Este arquivo não é uma imagem.');
  }
  if (media.status !== 'stored' || !media.storage_path) {
    throw new MediaAccessError(
      'A imagem ainda não foi baixada ou falhou. Peça que o contato envie de novo.',
    );
  }
  const download = await tdb.storage.from(MEDIA_BUCKET).download(media.storage_path);
  if (download.error) throw new Error(`download failed: ${download.error.message}`);
  return {
    data: new Uint8Array(await download.data.arrayBuffer()),
    mime: media.mime ?? 'image/jpeg',
  };
}
