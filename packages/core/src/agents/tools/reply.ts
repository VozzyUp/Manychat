import { z } from 'zod';
import { checkCitations, withSources } from '../citations';
import { defineTool } from '../types';

/** Final answer of every agent (ADR-0006). The citation check happens here, in code. */
export const replyTool = defineTool({
  name: 'reply',
  description:
    'Envia a resposta final ao contato no WhatsApp. Chame quando já tiver tudo de que precisa, sozinha (sem outras ferramentas na mesma chamada). Em respostas informativas, cite em chunk_ids os trechos de search_knowledge que usou.',
  input: z.object({
    kind: z
      .enum(['informative', 'operational', 'clarification'])
      .describe(
        'informative: informa algo com base nos documentos; operational: confirma dados de ferramentas; clarification: pergunta algo ao contato',
      ),
    text: z.string().trim().min(1).max(1500).describe('Texto para o WhatsApp, sem linha de fonte'),
    chunk_ids: z
      .array(z.string())
      .max(10)
      .default([])
      .describe('chunk_id dos trechos usados, como vieram de search_knowledge'),
  }),
  run: async (args, ctx) => {
    const check = checkCitations({
      kind: args.kind,
      chunkIds: args.chunk_ids,
      retrieved: ctx.retrieved,
      requireCitation: ctx.agent.requireCitation,
    });
    if (!check.ok) {
      ctx.logger.warn(
        { tenant_id: ctx.tenantId, conversation_id: ctx.conversationId, reason: check.reason },
        'reply discarded: citation check failed',
      );
      return {
        content: { accepted: false, reason: check.reason },
        terminal: { type: 'handoff', reason: 'no_citation' },
      };
    }
    return {
      content: { accepted: true },
      terminal: {
        type: 'reply',
        text: withSources(args.text, check.citations),
        citations: check.citations,
      },
    };
  },
  summarize: (args, result) =>
    `reply ${args.kind}: ${result.terminal?.type === 'reply' ? 'sent' : 'discarded'}, ${args.chunk_ids.length} chunk(s)`,
});
