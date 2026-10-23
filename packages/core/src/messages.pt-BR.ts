import type { ModuleKey } from '@nurion/shared';

/** Texts the core sends on WhatsApp (pt-BR). Modules keep their own messages files. */
export const coreMessages = {
  askModule: {
    body: 'Olá! Sobre qual assunto você quer falar?',
    button: 'Escolher',
  },
  moduleRows: {
    log: { title: 'Entregas e cargas', description: 'Rotas, temperatura, ocorrências' },
    labs: { title: 'Laboratório', description: 'Amostras e atendimento a pacientes' },
    consult: { title: 'Normas e qualidade', description: 'POPs, não conformidades, auditorias' },
    adm: { title: 'Solicitações internas', description: 'Financeiro, RH, TI, contratos' },
  } satisfies Record<ModuleKey, { title: string; description: string }>,
  unidentified:
    'Olá! Não encontrei seu cadastro neste número. Vou passar sua mensagem para a nossa equipe, que responde assim que possível.',
  noModule:
    'Olá! Este número ainda não tem atendimento automático para o seu caso. Vou passar sua mensagem para a nossa equipe.',
} as const;
