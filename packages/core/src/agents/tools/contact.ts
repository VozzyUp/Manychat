import { z } from 'zod';
import { defineTool } from '../types';

/** Data of the current contact. Minimal on purpose: no phone number, no raw profile. */
export const contactProfileTool = defineTool({
  name: 'get_contact_profile',
  description:
    'Retorna o nome e o tipo (motorista, paciente, equipe) do contato atual. Chame se precisar tratar a pessoa pelo nome.',
  input: z.object({}),
  run: async (_args, ctx) => {
    const { data, error } = await ctx.tdb
      .from('contacts')
      .select('name, profile_name, kind')
      .eq('id', ctx.contactId)
      .single();
    if (error) throw new Error(error.message);
    return { content: { name: data.name ?? data.profile_name ?? null, kind: data.kind } };
  },
  summarize: () => 'contact profile',
});
