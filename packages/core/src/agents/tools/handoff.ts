import { z } from 'zod';
import { defineTool } from '../types';

/** Passes the conversation to a person (§4.4, §4.7). The engine opens the handoff and tells the contact. */
export const handoffTool = defineTool({
  name: 'handoff_to_human',
  description:
    'Encaminha a conversa a uma pessoa da equipe. Chame quando não houver base suficiente nos documentos, quando o contato pedir um atendente, em caso de urgência ou risco, ou quando você não conseguir resolver com as ferramentas.',
  input: z.object({
    reason: z.enum(['no_knowledge', 'user_request', 'urgency', 'other']),
    summary: z
      .string()
      .trim()
      .min(1)
      .max(600)
      .describe('Resumo curto para a equipe: o que o contato quer e o que já foi tentado'),
  }),
  run: async (args) => ({
    content: { handoff: true },
    terminal: { type: 'handoff', reason: args.reason, summary: args.summary },
  }),
  summarize: (args) => `handoff ${args.reason}`,
});
