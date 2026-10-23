import { z } from 'zod';

/** The column is vector(1536) (ADR-0007): a provider must return exactly this many dimensions. */
export const EMBEDDING_DIMENSIONS = 1536;

export type EmbeddingsResult = { vectors: number[][]; tokens: number };

export type EmbeddingsProvider = {
  /** Stored with every chunk; search only uses chunks of the configured model. */
  model: string;
  embed(texts: string[]): Promise<EmbeddingsResult>;
};

export class EmbeddingsError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EmbeddingsError';
  }
}

const responseSchema = z.object({
  data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative() }).optional(),
});

const BATCH_SIZE = 64;

/**
 * OpenAI-compatible `/embeddings` endpoint (OpenAI `text-embedding-3-small` by default; any server
 * that speaks the same API works through `baseUrl`). The provider is chosen by env, never in code.
 */
export function createOpenAiEmbeddings(options: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  retries?: number;
}): EmbeddingsProvider {
  const baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const doFetch = options.fetch ?? fetch;

  async function batch(input: string[]): Promise<EmbeddingsResult> {
    let lastError: EmbeddingsError | undefined;
    for (let attempt = 0; attempt <= (options.retries ?? 2); attempt += 1) {
      if (attempt) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model,
            input,
            dimensions: EMBEDDING_DIMENSIONS,
            encoding_format: 'float',
          }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        lastError = new EmbeddingsError(`embeddings request failed: ${String(err)}`, true);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new EmbeddingsError(`embeddings provider returned ${res.status}`, true);
        continue;
      }
      if (!res.ok) {
        throw new EmbeddingsError(`embeddings provider returned ${res.status}`, false);
      }
      const parsed = responseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success || parsed.data.data.length !== input.length) {
        throw new EmbeddingsError('embeddings response has an unexpected shape', false);
      }
      const ordered = [...parsed.data.data].sort((a, b) => a.index - b.index);
      for (const item of ordered) {
        if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new EmbeddingsError(
            `embeddings model returned ${item.embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
            false,
          );
        }
      }
      return {
        vectors: ordered.map((d) => d.embedding),
        tokens: parsed.data.usage?.prompt_tokens ?? 0,
      };
    }
    throw lastError ?? new EmbeddingsError('embeddings request failed', true);
  }

  return {
    model: options.model,
    async embed(texts) {
      const vectors: number[][] = [];
      let tokens = 0;
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const result = await batch(texts.slice(i, i + BATCH_SIZE));
        vectors.push(...result.vectors);
        tokens += result.tokens;
      }
      return { vectors, tokens };
    },
  };
}
