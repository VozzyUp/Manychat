import { z } from 'zod';

export type Transcription = {
  text: string;
  durationSeconds: number | null;
  language: string | null;
};

export type Transcriber = {
  /** Whisper model id as configured (never hard-coded). */
  model: string;
  transcribe(input: { data: Uint8Array; filename: string; mime: string }): Promise<Transcription>;
};

export class TranscriptionError extends Error {
  constructor(
    message: string,
    /** True for provider outages and rate limits: the job may retry. */
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

const responseSchema = z.object({
  text: z.string(),
  duration: z.number().optional(),
  language: z.string().optional(),
});

/** The provider rejects bigger files; WhatsApp voice notes are far below this. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Whisper through Groq's OpenAI-compatible endpoint (`whisper-large-v3-turbo` by default in the env
 * example). Portuguese is forced: voice notes are short and the guess is wrong more often than not.
 */
export function createGroqTranscriber(options: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  language?: string;
}): Transcriber {
  const baseUrl = (options.baseUrl ?? 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const doFetch = options.fetch ?? fetch;

  return {
    model: options.model,
    async transcribe({ data, filename, mime }) {
      if (data.length > MAX_AUDIO_BYTES) {
        throw new TranscriptionError('audio file is too large', false);
      }
      const form = new FormData();
      form.set('model', options.model);
      form.set('language', options.language ?? 'pt');
      form.set('response_format', 'verbose_json');
      form.set('temperature', '0');
      form.set('file', new Blob([new Uint8Array(data)], { type: mime }), filename);

      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/audio/transcriptions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${options.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        throw new TranscriptionError(`transcription request failed: ${String(err)}`, true);
      }
      if (res.status === 429 || res.status >= 500) {
        throw new TranscriptionError(`transcription provider returned ${res.status}`, true);
      }
      if (!res.ok)
        throw new TranscriptionError(`transcription provider returned ${res.status}`, false);
      const parsed = responseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) {
        throw new TranscriptionError('transcription response has an unexpected shape', false);
      }
      return {
        text: parsed.data.text.trim(),
        durationSeconds: parsed.data.duration ?? null,
        language: parsed.data.language ?? null,
      };
    },
  };
}
