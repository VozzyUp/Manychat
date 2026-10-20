import type { Channel, ChannelType, Contact, Flow, FlowRun, MessageRecord } from "./types";

/** Acesso a dados usado pelo motor. Supabase em produção, memória nos testes. */
export interface Store {
  getChannelByExternal(type: ChannelType, externalId: string): Promise<Channel | null>;
  getChannel(id: string): Promise<Channel | null>;
  upsertContact(channelId: string, externalId: string, name?: string): Promise<{ contact: Contact; isNew: boolean }>;
  getContact(id: string): Promise<Contact | null>;
  updateContact(id: string, patch: Partial<Pick<Contact, "name" | "tags" | "fields" | "last_inbound_at">>): Promise<void>;
  listActiveFlows(): Promise<Flow[]>;
  getFlow(id: string): Promise<Flow | null>;
  /** Retorna false se external_id já existe (evento repetido). */
  insertMessage(msg: MessageRecord): Promise<boolean>;
  createRun(run: Omit<FlowRun, "id">): Promise<FlowRun>;
  updateRun(id: string, patch: Partial<Omit<FlowRun, "id">>): Promise<void>;
  getWaitingInputRun(contactId: string): Promise<FlowRun | null>;
  listDueRuns(nowIso: string, limit: number): Promise<FlowRun[]>;
  /** Marca uma execução em espera como ativa. False se outra instância já pegou. */
  claimRun(id: string): Promise<boolean>;
  cancelWaitingRuns(contactId: string): Promise<void>;
}
