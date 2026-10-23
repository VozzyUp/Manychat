import type { ChunkRef } from './types';

export type ReplyKind = 'informative' | 'operational' | 'clarification';

export type CitationCheck =
  | { ok: true; citations: ChunkRef[] }
  | { ok: false; reason: 'no_chunk_ids' | 'unknown_chunk' };

/**
 * ADR-0006, CLAUDE.md rule 3: an informative answer of an agent with `requireCitation` must cite at
 * least one chunk, and every cited chunk must have been returned by `search_knowledge` in THIS run.
 * Ids the model invents are never accepted — not even on replies that do not require a citation.
 * Do not loosen this to make a test pass.
 */
export function checkCitations(input: {
  kind: ReplyKind;
  chunkIds: string[];
  retrieved: ReadonlyMap<string, ChunkRef>;
  requireCitation: boolean;
}): CitationCheck {
  const unique = [...new Set(input.chunkIds)];
  const citations: ChunkRef[] = [];
  for (const id of unique) {
    const chunk = input.retrieved.get(id);
    if (!chunk) return { ok: false, reason: 'unknown_chunk' };
    citations.push(chunk);
  }
  if (input.requireCitation && input.kind === 'informative' && citations.length === 0) {
    return { ok: false, reason: 'no_chunk_ids' };
  }
  return { ok: true, citations };
}

/** `📄 Fonte: <título>, <seção> (v<versão>)`, one line per distinct source, built from the chunks. */
export function sourceLines(citations: ChunkRef[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const c of citations) {
    const line = `📄 Fonte: ${[c.title, c.section].filter(Boolean).join(', ')}${c.version ? ` (v${c.version})` : ''}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines.join('\n');
}

export function withSources(text: string, citations: ChunkRef[]): string {
  const lines = sourceLines(citations);
  return lines ? `${text.trim()}\n\n${lines}` : text.trim();
}
