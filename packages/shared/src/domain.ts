import { z } from 'zod';

/** Product modules. A tenant only uses the modules enabled in `tenant_modules`. */
export const MODULES = ['log', 'labs', 'consult', 'adm'] as const;
export const moduleKeySchema = z.enum(MODULES);
export type ModuleKey = z.infer<typeof moduleKeySchema>;

/** Tenant roles, ordered from least to most powerful (matches the `app_role` enum in Postgres). */
export const ROLES = ['viewer', 'operator', 'quality', 'manager', 'admin', 'owner'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** True when `role` is at least `min` in the role order. */
export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(min);
}

export const CONTACT_KINDS = ['driver', 'patient', 'staff', 'unknown'] as const;
export const contactKindSchema = z.enum(CONTACT_KINDS);
export type ContactKind = z.infer<typeof contactKindSchema>;

/** Document collections (§4.5). Agents declare which ones they may search. */
export const COLLECTIONS = [
  'pop',
  'manual',
  'norma',
  'contrato',
  'politica',
  'faq',
  'preparo_exame',
  'outro',
] as const;
export const collectionSchema = z.enum(COLLECTIONS);
export type Collection = z.infer<typeof collectionSchema>;

export const DOCUMENT_STATUSES = ['rascunho', 'em_revisao', 'aprovado', 'obsoleto'] as const;
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const AI_OUTCOMES = ['answered', 'handoff', 'error'] as const;
export type AiOutcome = (typeof AI_OUTCOMES)[number];
