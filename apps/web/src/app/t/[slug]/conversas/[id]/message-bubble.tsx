import { FileText, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import { formatDateTime } from '@/lib/format';
import {
  AUTHOR_LABELS,
  MESSAGE_STATUS_LABELS,
  MESSAGE_TYPE_LABELS,
  SEND_ERROR_LABELS,
} from '@/lib/labels';

export type MessageView = {
  id: string;
  direction: string;
  author: string;
  type: string;
  text: string | null;
  transcription: string | null;
  payload: unknown;
  status: string;
  error: unknown;
  created_at: string;
  sent_at: string | null;
  media: {
    id: string;
    mime: string | null;
    filename: string | null;
    status: string;
    extracted_text?: string | null;
    error?: string | null;
    url?: string;
  }[];
};

function location(payload: unknown): { latitude: number; longitude: number } | null {
  const loc = (payload as { location?: { latitude?: unknown; longitude?: unknown } } | null)
    ?.location;
  if (typeof loc?.latitude === 'number' && typeof loc.longitude === 'number') {
    return { latitude: loc.latitude, longitude: loc.longitude };
  }
  return null;
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

function Media({ media, type }: { media: MessageView['media'][number]; type: string }) {
  if (media.status === 'failed') {
    return <p className="text-sm text-danger">Não foi possível baixar o arquivo do WhatsApp.</p>;
  }
  if (!media.url) return <p className="text-sm text-muted">Arquivo sendo baixado…</p>;
  const mime = media.mime ?? '';
  if (type === 'image' || type === 'sticker' || mime.startsWith('image/')) {
    return (
      <a href={media.url} target="_blank" rel="noreferrer" className="block">
        {/* Signed URL from private storage, valid for a short time. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media.url}
          alt={type === 'sticker' ? 'Figurinha enviada' : 'Imagem enviada pelo contato'}
          className="max-h-64 max-w-full rounded-md border border-border object-contain"
        />
      </a>
    );
  }
  if (type === 'audio' || mime.startsWith('audio/')) {
    return (
      <audio controls preload="none" src={media.url} className="w-64 max-w-full">
        <a href={media.url}>Baixar áudio</a>
      </audio>
    );
  }
  if (type === 'video' || mime.startsWith('video/')) {
    return (
      <video controls preload="none" src={media.url} className="max-h-64 max-w-full rounded-md" />
    );
  }
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-sm font-medium text-accent-text hover:underline"
    >
      <FileText aria-hidden size={16} /> {media.filename ?? 'Abrir documento'}
    </a>
  );
}

/** One message in S05: contact on the left, AI/team/system on the right. */
export function MessageBubble({ message, timeZone }: { message: MessageView; timeZone: string }) {
  const inbound = message.direction === 'in';
  const loc = message.type === 'location' ? location(message.payload) : null;
  const failed = message.status === 'failed';
  const code = errorCode(message.error);
  const fallback = message.media.length || loc ? null : MESSAGE_TYPE_LABELS[message.type];
  return (
    <li className={cn('flex', inbound ? 'justify-start' : 'justify-end')}>
      <article
        aria-label={`Mensagem de ${AUTHOR_LABELS[message.author] ?? message.author}`}
        className={cn(
          'max-w-[85%] space-y-2 rounded-lg border px-3 py-2 sm:max-w-[70%]',
          inbound ? 'border-border bg-bg' : 'border-transparent bg-surface-strong',
          failed && 'border-danger/40',
        )}
      >
        <p className="text-xs font-semibold text-muted">
          {AUTHOR_LABELS[message.author] ?? message.author}
        </p>
        {message.media.map((m) => (
          <Media key={m.id} media={m} type={message.type} />
        ))}
        {loc ? (
          <a
            href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-accent-text hover:underline"
          >
            <MapPin aria-hidden size={16} /> Ver localização no mapa
          </a>
        ) : null}
        {message.text ? (
          <p className="whitespace-pre-wrap break-words text-sm text-text">{message.text}</p>
        ) : fallback && message.type !== 'text' ? (
          <p className="text-sm italic text-muted">{fallback}</p>
        ) : null}
        {message.media.map((m) =>
          m.extracted_text ? (
            <details key={`text-${m.id}`} className="text-sm text-text">
              <summary className="cursor-pointer font-medium">Texto lido do PDF</summary>
              <p className="mt-1 whitespace-pre-wrap break-words text-muted">
                {m.extracted_text.slice(0, 2000)}
                {m.extracted_text.length > 2000 ? '…' : ''}
              </p>
            </details>
          ) : null,
        )}
        {!message.transcription && message.type === 'audio'
          ? message.media.map((m) =>
              m.error ? (
                <p key={`err-${m.id}`} className="text-sm text-muted">
                  {m.error}
                </p>
              ) : null,
            )
          : null}
        {message.transcription ? (
          <p className="border-l-2 border-border pl-2 text-sm text-text">
            <span className="font-medium">Transcrição: </span>
            {message.transcription}
          </p>
        ) : null}
        {failed ? (
          <p className="text-sm text-danger" role="note">
            {(code && SEND_ERROR_LABELS[code]) ?? 'Não foi possível enviar esta mensagem.'}
          </p>
        ) : null}
        <p className="flex items-center justify-end gap-2 text-xs text-muted">
          <time dateTime={message.sent_at ?? message.created_at}>
            {formatDateTime(message.sent_at ?? message.created_at, timeZone)}
          </time>
          {!inbound ? (
            <Badge tone={failed ? 'danger' : 'neutral'}>
              {MESSAGE_STATUS_LABELS[message.status] ?? message.status}
            </Badge>
          ) : null}
        </p>
      </article>
    </li>
  );
}
