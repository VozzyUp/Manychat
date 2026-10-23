import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { checkCitations, sourceLines, withSources } from './citations';
import { buildHistory, toolsFor } from './engine';
import { addUsage, costUsd, emptyUsage, parsePricing } from './pricing';
import { defineTool, type AgentDefinition, type ChunkRef } from './types';

const chunk = (id: string, extra: Partial<ChunkRef> = {}): ChunkRef => ({
  chunkId: id,
  title: 'POP-012 Transporte de amostras',
  section: '4.2 Temperatura',
  version: '3',
  ...extra,
});
const retrieved = (...chunks: ChunkRef[]) => new Map(chunks.map((c) => [c.chunkId, c]));

describe('citation check (ADR-0006)', () => {
  it('accepts chunks that came from the search of this run', () => {
    const r = checkCitations({
      kind: 'informative',
      chunkIds: ['a'],
      retrieved: retrieved(chunk('a')),
      requireCitation: true,
    });
    expect(r).toMatchObject({ ok: true, citations: [{ chunkId: 'a' }] });
  });

  it('refuses an informative answer without chunk ids when the agent requires citation', () => {
    expect(
      checkCitations({
        kind: 'informative',
        chunkIds: [],
        retrieved: retrieved(chunk('a')),
        requireCitation: true,
      }),
    ).toEqual({ ok: false, reason: 'no_chunk_ids' });
  });

  it('refuses a chunk the search never returned, even if it looks valid', () => {
    expect(
      checkCitations({
        kind: 'informative',
        chunkIds: ['a', 'zzz'],
        retrieved: retrieved(chunk('a')),
        requireCitation: true,
      }),
    ).toEqual({ ok: false, reason: 'unknown_chunk' });
  });

  it('refuses invented ids on replies that do not need a citation too', () => {
    expect(
      checkCitations({
        kind: 'operational',
        chunkIds: ['zzz'],
        retrieved: retrieved(),
        requireCitation: true,
      }),
    ).toEqual({ ok: false, reason: 'unknown_chunk' });
  });

  it('lets operational and clarification replies go without a citation', () => {
    for (const kind of ['operational', 'clarification'] as const) {
      expect(
        checkCitations({ kind, chunkIds: [], retrieved: retrieved(), requireCitation: true }),
      ).toEqual({
        ok: true,
        citations: [],
      });
    }
  });

  it('does not require a citation from an agent that does not ask for it', () => {
    expect(
      checkCitations({
        kind: 'informative',
        chunkIds: [],
        retrieved: retrieved(),
        requireCitation: false,
      }).ok,
    ).toBe(true);
  });

  it('builds the source line from the chunk, once per source', () => {
    const c = chunk('a');
    expect(sourceLines([c, chunk('b')])).toBe(
      '📄 Fonte: POP-012 Transporte de amostras, 4.2 Temperatura (v3)',
    );
    expect(withSources(' Mantenha entre 2 e 8 °C. ', [c])).toBe(
      'Mantenha entre 2 e 8 °C.\n\n📄 Fonte: POP-012 Transporte de amostras, 4.2 Temperatura (v3)',
    );
    expect(sourceLines([chunk('c', { section: undefined, version: undefined })])).toBe(
      '📄 Fonte: POP-012 Transporte de amostras',
    );
    expect(withSources('Ok.', [])).toBe('Ok.');
  });
});

describe('cost', () => {
  const pricing = parsePricing('{"m":{"input":2,"output":10,"cache_read":0.2}}');
  it('prices tokens per million, with default cache-write price of 1.25x input', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheReadTokens: 500_000,
      cacheWriteTokens: 200_000,
    };
    // 2 + 1 + 0.1 + 0.5
    expect(costUsd(pricing, 'm', usage)).toBe(3.6);
  });
  it('is 0 for an unknown model or when pricing is not configured', () => {
    expect(costUsd(pricing, 'other', { ...emptyUsage(), inputTokens: 1000 })).toBe(0);
    expect(parsePricing(undefined)).toEqual({});
    expect(parsePricing('  ')).toEqual({});
  });
  it('rejects a malformed LLM_PRICING', () => {
    expect(() => parsePricing('{"m":{"input":"x"}}')).toThrow();
  });
  it('accumulates usage', () => {
    const total = emptyUsage();
    addUsage(total, { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 });
    addUsage(total, { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 });
    expect(total).toEqual({
      inputTokens: 2,
      outputTokens: 4,
      cacheReadTokens: 6,
      cacheWriteTokens: 8,
    });
  });
});

describe('history sent to the model', () => {
  it('maps directions to roles, merges neighbours and starts with the contact', () => {
    const history = buildHistory([
      { direction: 'out', type: 'text', text: 'Olá! (mensagem antiga)', transcription: null },
      { direction: 'in', type: 'text', text: 'Oi', transcription: null },
      { direction: 'in', type: 'audio', text: null, transcription: 'preciso de ajuda' },
      { direction: 'out', type: 'text', text: 'Claro.', transcription: null },
      { direction: 'in', type: 'image', text: null, transcription: null },
    ]);
    expect(history).toEqual([
      { role: 'user', content: 'Oi\npreciso de ajuda' },
      { role: 'assistant', content: 'Claro.' },
      { role: 'user', content: '[O contato enviou imagem]' },
    ]);
  });
});

describe('tools', () => {
  const noop = defineTool({
    name: 'reply',
    description: 'x',
    input: z.object({}),
    run: async () => ({ content: {} }),
    summarize: () => '',
  });
  it('refuses an agent that redefines a core tool', () => {
    const agent = {
      key: 'x.y',
      module: 'log',
      systemPrompt: () => '',
      tools: [noop],
      knowledgeScopes: [],
      requireCitation: true,
      maxTurns: 3,
    } as AgentDefinition;
    expect(() => toolsFor(agent)).toThrow(/duplicate tool reply/);
  });
  it('every agent gets reply, handoff_to_human, get_contact_profile and search_knowledge', () => {
    const agent = { ...({} as AgentDefinition), key: 'x.y', tools: [] };
    expect(toolsFor(agent).map((t) => t.name)).toEqual([
      'reply',
      'handoff_to_human',
      'get_contact_profile',
      'search_knowledge',
    ]);
  });
});
