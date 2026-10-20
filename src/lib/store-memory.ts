import type { Store } from "./store";
import type { Channel, Contact, Flow, FlowRun, MessageRecord } from "./types";

export class MemoryStore implements Store {
  channels: Channel[] = [];
  contacts: Contact[] = [];
  flows: Flow[] = [];
  messages: (MessageRecord & { id: string })[] = [];
  runs: FlowRun[] = [];
  private seq = 0;
  private nextId = () => `id${++this.seq}`;

  async getChannelByExternal(type: Channel["type"], externalId: string) {
    return this.channels.find((c) => c.type === type && c.external_id === externalId) ?? null;
  }
  async getChannel(id: string) {
    return this.channels.find((c) => c.id === id) ?? null;
  }
  async upsertContact(channelId: string, externalId: string, name?: string) {
    const found = this.contacts.find((c) => c.channel_id === channelId && c.external_id === externalId);
    if (found) {
      if (name && !found.name) found.name = name;
      return { contact: { ...found }, isNew: false };
    }
    const contact: Contact = {
      id: this.nextId(),
      channel_id: channelId,
      external_id: externalId,
      name: name ?? null,
      tags: [],
      fields: {},
      last_inbound_at: null,
    };
    this.contacts.push(contact);
    return { contact: { ...contact }, isNew: true };
  }
  async getContact(id: string) {
    const c = this.contacts.find((x) => x.id === id);
    return c ? { ...c } : null;
  }
  async updateContact(id: string, patch: Partial<Contact>) {
    const c = this.contacts.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  }
  async listActiveFlows() {
    return this.flows.filter((f) => f.active);
  }
  async getFlow(id: string) {
    return this.flows.find((f) => f.id === id) ?? null;
  }
  async insertMessage(msg: MessageRecord) {
    if (msg.external_id && this.messages.some((m) => m.external_id === msg.external_id)) return false;
    this.messages.push({ ...msg, id: this.nextId() });
    return true;
  }
  async createRun(run: Omit<FlowRun, "id">) {
    const r = { ...run, id: this.nextId() };
    this.runs.push(r);
    return r;
  }
  async updateRun(id: string, patch: Partial<FlowRun>) {
    const r = this.runs.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  }
  async getWaitingInputRun(contactId: string) {
    return [...this.runs].reverse().find((r) => r.contact_id === contactId && r.status === "waiting_input") ?? null;
  }
  async listDueRuns(nowIso: string, limit: number) {
    return this.runs
      .filter((r) => r.status === "waiting_delay" && r.resume_at && r.resume_at <= nowIso)
      .slice(0, limit);
  }
  async claimRun(id: string) {
    const r = this.runs.find((x) => x.id === id);
    if (!r || r.status !== "waiting_delay") return false;
    r.status = "active";
    return true;
  }
  async cancelWaitingRuns(contactId: string) {
    for (const r of this.runs) {
      if (r.contact_id === contactId && (r.status === "waiting_input" || r.status === "waiting_delay")) {
        r.status = "cancelled";
      }
    }
  }
}
