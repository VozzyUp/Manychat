import type { TenantDb } from '@nurion/db';
import type { Logger } from '@nurion/shared';
import { MEDIA_BUCKET } from '../channel/media';
import { extractPages, ExtractionError } from '../rag/extract';
import { TranscriptionError, type Transcriber } from './transcribe';

/** Longest PDF text kept with a message (what the agent may read from it later is capped further). */
export const MAX_EXTRACTED_CHARS = 20_000;

/**
 * §4.6: audio becomes text (Whisper) and a PDF received on WhatsApp has its text extracted, so the
 * agent can read both. Runs inside the inbound job, after the file is stored and before the turn is
 * scheduled. Safe to repeat: it only works on what is still missing, so a retried job or a repeated
 * webhook picks up where it stopped.
 *
 * A provider outage is retried by the job; on the last attempt (or for files that can never work)
 * the message goes on without the text and the media row says why.
 */
export async function enrichInboundMedia(
  deps: { transcriber?: Transcriber; logger: Logger },
  tdb: TenantDb,
  input: { messageId: string; isLastAttempt: boolean },
): Promise<{ transcribed: boolean; extracted: boolean }> {
  const result = { transcribed: false, extracted: false };
  const { data: message, error } = await tdb
    .from('messages')
    .select(
      'id, conversation_id, type, transcription, media:message_media(id, storage_path, mime, filename, status, extracted_text)',
    )
    .eq('id', input.messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!message) return result;
  const log = deps.logger.child({
    tenant_id: tdb.tenantId,
    conversation_id: message.conversation_id,
  });

  const markMedia = async (
    id: string,
    patch: { error?: string | null; extracted_text?: string },
  ) => {
    const { error: updateError } = await tdb.from('message_media').update(patch).eq('id', id);
    if (updateError) throw new Error(updateError.message);
  };

  for (const media of message.media) {
    if (media.status !== 'stored' || !media.storage_path) continue;
    const mime = (media.mime ?? '').toLowerCase();

    if (message.type === 'audio' && !message.transcription && deps.transcriber) {
      const started = Date.now();
      const download = await tdb.storage.from(MEDIA_BUCKET).download(media.storage_path);
      if (download.error) throw new Error(`download failed: ${download.error.message}`);
      try {
        const data = new Uint8Array(await download.data.arrayBuffer());
        const transcription = await deps.transcriber.transcribe({
          data,
          filename: media.filename ?? `audio.${mime.split('/')[1]?.split(';')[0] ?? 'ogg'}`,
          mime: mime || 'audio/ogg',
        });
        const recorded = await tdb.from('ai_runs').insert({
          tenant_id: tdb.tenantId,
          conversation_id: message.conversation_id,
          message_id: message.id,
          agent_key: 'media.transcription',
          model: deps.transcriber.model,
          latency_ms: Date.now() - started,
          turns: 1,
          outcome: 'answered',
        });
        if (recorded.error) throw new Error(`record ai_run: ${recorded.error.message}`);
        if (transcription.text) {
          const saved = await tdb
            .from('messages')
            .update({ transcription: transcription.text })
            .eq('id', message.id);
          if (saved.error) throw new Error(saved.error.message);
          await markMedia(media.id, { error: null });
          result.transcribed = true;
        } else {
          await markMedia(media.id, { error: 'Nenhuma fala reconhecida no áudio.' });
        }
      } catch (err) {
        if (!(err instanceof TranscriptionError)) throw err;
        if (err.retryable && !input.isLastAttempt) throw err;
        log.error({ err }, 'audio transcription failed; the message goes on without text');
        await markMedia(media.id, { error: `Transcrição falhou: ${err.message}`.slice(0, 300) });
      }
    }

    if (
      message.type === 'document' &&
      mime === 'application/pdf' &&
      media.extracted_text === null
    ) {
      const download = await tdb.storage.from(MEDIA_BUCKET).download(media.storage_path);
      if (download.error) throw new Error(`download failed: ${download.error.message}`);
      try {
        const pages = await extractPages(
          new Uint8Array(await download.data.arrayBuffer()),
          mime,
          media.filename ?? 'documento.pdf',
        );
        const text = pages
          .map((p) => p.text.trim())
          .filter(Boolean)
          .join('\n\n')
          .slice(0, MAX_EXTRACTED_CHARS);
        await markMedia(media.id, { extracted_text: text, error: null });
        result.extracted = true;
      } catch (err) {
        if (!(err instanceof ExtractionError)) throw err;
        log.warn({ code: err.code }, 'received PDF has no readable text');
        // '' marks "tried, nothing to read": it is not retried and the agent is told.
        await markMedia(media.id, { extracted_text: '', error: err.message.slice(0, 300) });
      }
    }
  }
  return result;
}
