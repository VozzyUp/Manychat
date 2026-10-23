/** User-facing API messages (pt-BR). Code stays in English; text shown in the panel lives here. */
export const messages = {
  unauthenticated: 'Sua sessão expirou. Entre novamente.',
  noTenant: 'Escolha uma empresa para continuar.',
  notMember: 'Você não tem acesso a esta empresa.',
  tenantSuspended: 'Esta empresa está suspensa. Fale com o suporte.',
  forbidden: 'Você não tem permissão para esta ação.',
  notFound: 'Registro não encontrado.',
  duplicate: 'Já existe um registro com esses dados.',
  inUse: 'Não é possível excluir: o registro está em uso.',
  lastOwner: 'A empresa precisa de pelo menos um responsável (owner).',
  alreadyMember: 'Essa pessoa já faz parte da empresa.',
  ownerOnly: 'Só um owner pode conceder o papel de owner.',
  invalidTimezone: 'Fuso horário inválido.',
  logoType: 'Envie o logo em PNG, JPG ou WEBP.',
  logoSize: 'O logo deve ter até 1 MB.',
  logoMissing: 'Nenhum arquivo enviado.',
} as const;
