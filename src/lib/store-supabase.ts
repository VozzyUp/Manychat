import { db } from "./supabase";
import type { Store } from "./store";
import type { Channel, Contact, Flow, FlowRun, MessageRecord } from "./types";

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export class SupabaseStore implements Store {
  async getChannelByExternal(type: Channel["type"], externalId: string) {
    return check(
      await db().from("channels").select("*").eq("type", type).eq("external_id", externalId).maybeSingle(),
    ) as Channel | null;
  }
  async getChannel(id: string) {
    return check(await db().from("channels").select("*").eq("id", id).maybeSingle()) as Channel | null;
  }
  async upsertContact(channelId: string, externalId: string, name?: string) {
    const existing = check(
      await db().from("contacts").select("*").eq("channel_id", channelId).eq("external_id", externalId).maybeSingle(),
    ) as Contact | null;
    if (existing) {
      if (name && !existing.name) {
        await db().from("contacts").update({ name }).eq("id", existing.id);
        existing.name = name;
      }
      return { contact: existing, isNew: false };
    }
    const res = await db()
      .from("contacts")
      .insert({ channel_id: channelId, external_id: externalId, name: name ?? null })
      .select("*")
      .single();
    if (res.error?.code === "23505") {
      // Dois eventos simultâneos do mesmo contato: o outro criou primeiro.
      const again = check(
        await db().from("contacts").select("*").eq("channel_id", channelId).eq("external_id", externalId).single(),
      ) as Contact;
      return { contact: again, isNew: false };
    }
    return { contact: check(res) as Contact, isNew: true };
  }
  async getContact(id: string) {
    return check(await db().from("contacts").select("*").eq("id", id).maybeSingle()) as Contact | null;
  }
  async updateContact(id: string, patch: Partial<Contact>) {
    check(await db().from("contacts").update(patch).eq("id", id));
  }
  async listActiveFlows() {
    return check(await db().from("flows").select("*").eq("active", true)) as Flow[];
  }
  async getFlow(id: string) {
    return check(await db().from("flows").select("*").eq("id", id).maybeSingle()) as Flow | null;
  }
  async insertMessage(msg: MessageRecord) {
    const res = await db().from("messages").insert(msg);
    if (res.error?.code === "23505") return false;
    check(res);
    return true;
  }
  async createRun(run: Omit<FlowRun, "id">) {
    return check(await db().from("flow_runs").insert(run).select("*").single()) as FlowRun;
  }
  async updateRun(id: string, patch: Partial<FlowRun>) {
    check(await db().from("flow_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
  }
  async getWaitingInputRun(contactId: string) {
    return check(
      await db()
        .from("flow_runs")
        .select("*")
        .eq("contact_id", contactId)
        .eq("status", "waiting_input")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ) as FlowRun | null;
  }
  async listDueRuns(nowIso: string, limit: number) {
    return check(
      await db()
        .from("flow_runs")
        .select("*")
        .eq("status", "waiting_delay")
        .lte("resume_at", nowIso)
        .order("resume_at")
        .limit(limit),
    ) as FlowRun[];
  }
  async claimRun(id: string) {
    const rows = check(
      await db()
        .from("flow_runs")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "waiting_delay")
        .select("id"),
    ) as { id: string }[];
    return rows.length === 1;
  }
  async cancelWaitingRuns(contactId: string) {
    check(
      await db()
        .from("flow_runs")
        .update({ status: "cancelled" })
        .eq("contact_id", contactId)
        .in("status", ["waiting_input", "waiting_delay"]),
    );
  }
}
