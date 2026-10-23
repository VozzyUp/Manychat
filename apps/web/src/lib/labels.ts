import type { ModuleKey, Role } from '@nurion/shared';

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
