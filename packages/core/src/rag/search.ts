import type { ServiceDb } from '@nurion/db';
import type { Logger } from '@nurion/shared';
import { z } from 'zod';
import { costUsd, type Pricing } from '../agents/pricing';
import type { ChunkRef } from '../agents/types';
import type { EmbeddingsProvider } from './embeddings';

/** Below this cosine similarity nothing is returned and the agent must hand off (ADR-0005). */
export const DEFAULT_MIN_SIMILARITY = 0.3;
export const SEARCH_LIMIT = 6;

export class KnowledgeUnavailableError extends Error {
  constructor() {
    super('knowledge base is not configured (embeddings)');
    this.name = 'KnowledgeUnavailableError';
  }
}

export type KnowledgeSearchInput = {
  tenantId: string;
  conversationId: string | null;
  query: string;
  /** Collections the agent may read (`knowledgeScopes`). Empty means nothing. */
  collections: string[];
  /** Overrides the tenant/global floor (evals, "Testar a base" calibration). */
  minSimilarity?: number;
};

export type KnowledgeSearch = (input: KnowledgeSearchInput) => Promise<ChunkRef[]>;

const rowSchema = z.object({
  chunk_id: z.string(),
  document_version_id: z.string(),
  version: z.number(),
  title: z.string(),
  code: z.string().nullable(),
  section_path: z.string().nullable(),
  page: z.number().nullable(),
  content: z.string(),
  similarity: z.number(),
});

const tenantFloor = z.object({ rag: z.object({ min_similarity: z.number().min(0).max(1) }) });

/**
 * `search_knowledge` for agents: embeds the question, runs the hybrid SQL search with the tenant
 * and the agent's collections, and returns the passages (with their ids). Every call records an
 * `ai_runs` row for the query embedding.
 */
export function createKnowledgeSearch(deps: {
  db: ServiceDb;
  embeddings?: EmbeddingsProvider;
  pricing: Pricing;
  logger: Logger;
  minSimilarity?: number;
}): KnowledgeSearch | undefined {
  const { embeddings } = deps;
  if (!embeddings) return undefined;

  return async (input) => {
    const tdb = deps.db.withTenant(input.tenantId);
    const query = input.query.trim().slice(0, 500);
    if (!query || !input.collections.length) return [];

    const started = Date.now();
    const { vectors, tokens } = await embeddings.embed([query]);
    const usage = { inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const recorded = await tdb.from('ai_runs').insert({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      agent_key: 'search.embedding',
      model: embeddings.model,
      input_tokens: tokens,
      cost_usd: costUsd(deps.pricing, embeddings.model, usage),
      latency_ms: Date.now() - started,
      turns: 1,
      outcome: 'answered',
    });
    if (recorded.error) throw new Error(`record ai_run: ${recorded.error.message}`);

    const tenant = await deps.db.system.getTenant(input.tenantId);
    const floor =
      input.minSimilarity ??
      tenantFloor.safeParse(tenant?.settings).data?.rag.min_similarity ??
      deps.minSimilarity ??
      DEFAULT_MIN_SIMILARITY;

    const { data, error } = await tdb.rpc('search_knowledge', {
      p_tenant_id: input.tenantId,
      p_query: query,
      p_embedding: `[${vectors[0]!.join(',')}]`,
      p_embedding_model: embeddings.model,
      p_collections: input.collections,
      p_limit: SEARCH_LIMIT,
      p_min_similarity: floor,
    });
    if (error) throw new Error(`search_knowledge: ${error.message}`);

    return z
      .array(rowSchema)
      .parse(data)
      .map((r) => ({
        chunkId: r.chunk_id,
        documentVersionId: r.document_version_id,
        title: r.title,
        code: r.code ?? undefined,
        section: r.section_path ?? undefined,
        version: String(r.version),
        page: r.page ?? undefined,
        similarity: r.similarity,
        text: r.content,
      }));
  };
}
