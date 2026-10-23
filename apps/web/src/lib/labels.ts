import type { ContactKind, ModuleKey, Role } from '@nurion/shared';

/** Panel labels in pt-BR. */
export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Responsável (owner)',
  admin: 'Administrador',
  manager: 'Gestor',
  quality: 'Qualidade',
  operator: 'Operador',
  viewer: 'Leitor',
};

export const MODULE_LABELS: Record<ModuleKey, string> = {
  log: 'Nurion Log',
  labs: 'Nurion Labs',
  consult: 'Nurion Consult',
  adm: 'Nurion ADM Health',
};

export const MODULE_DESCRIPTIONS: Record<ModuleKey, string> = {
  log: 'Entregas de carga sensível com evidências e alertas de temperatura.',
  labs: 'Preparo de exames, pedidos médicos, agendamentos e amostras.',
  consult: 'Copiloto regulatório, não conformidades, auditorias e treinamentos.',
  adm: 'Solicitações internas, contratos e painel executivo.',
};

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  driver: 'Motorista',
  patient: 'Paciente',
  staff: 'Equipe',
  unknown: 'Não identificado',
};

export const HANDOFF_REASON_LABELS: Record<string, string> = {
  no_knowledge: 'Sem base nos documentos',
  no_citation: 'Resposta sem fonte',
  user_request: 'Pedido do contato',
  urgency: 'Urgência',
  ai_error: 'Erro da IA',
  max_turns: 'Limite de tentativas',
  unidentified: 'Contato não identificado',
  manual: 'Aberto pela equipe',
  other: 'Outro motivo',
};

export const MESSAGE_STATUS_LABELS: Record<string, string> = {
  received: 'Recebida',
  queued: 'Na fila',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falhou',
};

export const AUTHOR_LABELS: Record<string, string> = {
  contact: 'Contato',
  ai: 'IA',
  human: 'Atendente',
  system: 'Sistema',
};

/** What a message without text shows in the conversation. */
export const MESSAGE_TYPE_LABELS: Record<string, string> = {
  audio: 'Áudio',
  image: 'Imagem',
  document: 'Documento',
  video: 'Vídeo',
  sticker: 'Figurinha',
  location: 'Localização',
  interactive: 'Resposta de botão',
  button: 'Botão',
  template: 'Template',
  reaction: 'Reação',
  contacts: 'Contato compartilhado',
  unsupported: 'Tipo de mensagem não suportado',
};

/** Why an outbound message failed (messages.error.code). */
export const SEND_ERROR_LABELS: Record<string, string> = {
  outside_window: 'Fora da janela de 24 h do WhatsApp: só é possível enviar um template aprovado.',
  invalid_token: 'O token do número foi recusado pela Meta. Troque o token em Configurações.',
  rate_limited: 'Limite de envio da Meta atingido.',
  recipient: 'O WhatsApp não conseguiu entregar para este número.',
  template: 'Template recusado pela Meta.',
  number_disabled: 'O número de WhatsApp está desativado.',
  contact_unavailable: 'O contato foi anonimizado.',
  invalid_payload: 'Mensagem inválida.',
};

export const CONSENT_TYPE_LABELS: Record<string, string> = {
  privacy_notice: 'Aviso de privacidade',
  data_processing: 'Tratamento de dados',
  marketing: 'Comunicações',
};
