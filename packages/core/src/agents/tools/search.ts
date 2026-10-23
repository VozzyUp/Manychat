import { z } from 'zod';
import { KnowledgeUnavailableError } from '../../rag/search';
import { defineTool } from '../types';

/** The only source of citable passages (ADR-0006): `reply` may cite just what this returned. */
export const searchKnowledgeTool = defineTool({
  name: 'search_knowledge',
  description:
    'Busca nos documentos aprovados da empresa (POPs, manuais, normas). Chame SEMPRE antes de responder qualquer pergunta sobre procedimentos, regras, prazos ou preparo, com a pergunta em linguagem natural. Se não vier nenhum trecho, não responda: chame handoff_to_human com motivo no_knowledge.',
  input: z.object({
    query: z.string().trim().min(3).max(300).describe('A pergunta ou o assunto a procurar'),
  }),
  run: async (args, ctx) => {
    let hits;
    try {
      hits = await ctx.search(args.query);
    } catch (err) {
      if (err instanceof KnowledgeUnavailableError) {
        return {
          content: {
            results: [],
            error:
              'A base de conhecimento está indisponível. Chame handoff_to_human com motivo no_knowledge.',
          },
        };
      }
      throw err;
    }
    if (!hits.length) {
      return {
        content: {
          results: [],
          note: 'Nenhum trecho relevante encontrado. Não responda de memória: chame handoff_to_human com motivo no_knowledge.',
        },
      };
    }
    return {
      content: {
        results: hits.map((h) => ({
          chunk_id: h.chunkId,
          documento: h.title,
          codigo: h.code ?? null,
          secao: h.section ?? null,
          pagina: h.page ?? null,
          versao: h.version ?? null,
          texto: h.text ?? '',
        })),
      },
      chunks: hits,
    };
  },
  summarize: (args, result) =>
    `search ${args.query.length} chars: ${result.chunks?.length ?? 0} trecho(s)`,
});
