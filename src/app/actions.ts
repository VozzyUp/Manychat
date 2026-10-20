"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { sendManualMessage } from "@/lib/engine";
import { graphSender } from "@/lib/meta/send";
import { SupabaseStore } from "@/lib/store-supabase";
import { db } from "@/lib/supabase";
import { channelTypes, flowSchema, type ChannelType } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function login(_: unknown, form: FormData): Promise<{ error: string } | void> {
  const given = Buffer.from(str(form, "password"));
  const want = Buffer.from(process.env.ADMIN_PASSWORD ?? "");
  if (want.length === 0 || given.length !== want.length || !timingSafeEqual(given, want)) {
    return { error: "Senha incorreta" };
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// Canais

export async function saveChannel(form: FormData) {
  const type = str(form, "type") as ChannelType;
  if (!channelTypes.includes(type)) throw new Error("Tipo inválido");
  const row = {
    type,
    name: str(form, "name"),
    external_id: str(form, "external_id"),
    access_token: str(form, "access_token"),
  };
  if (!row.name || !row.external_id || !row.access_token) throw new Error("Preencha todos os campos");
  const { error } = await db().from("channels").upsert(row, { onConflict: "type,external_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/channels");
}

export async function toggleChannel(id: string, active: boolean) {
  await db().from("channels").update({ active }).eq("id", id);
  revalidatePath("/channels");
}

export async function deleteChannel(id: string) {
  await db().from("channels").delete().eq("id", id);
  revalidatePath("/channels");
}

// Fluxos

export async function createFlow() {
  const { data, error } = await db()
    .from("flows")
    .insert({
      name: "Novo fluxo",
      active: false,
      trigger: { type: "keyword", keywords: ["oi"], match: "contains" },
      steps: [{ id: "inicio", type: "text", text: "Olá {{first_name}}!" }],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/flows/${data.id}`);
}

export async function saveFlow(json: string): Promise<{ error?: string }> {
  let parsed;
  try {
    parsed = flowSchema.safeParse(JSON.parse(json));
  } catch {
    return { error: "JSON inválido" };
  }
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join(".") || "fluxo"}: ${i.message}`).join("\n") };
  }
  const { id, ...rest } = parsed.data;
  const { error } = await db()
    .from("flows")
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/flows");
  return {};
}

export async function deleteFlow(id: string) {
  await db().from("flows").delete().eq("id", id);
  redirect("/flows");
}

// Contatos

export async function sendMessage(contactId: string, form: FormData): Promise<void> {
  const text = str(form, "text");
  if (!text) return;
  await sendManualMessage({ store: new SupabaseStore(), sender: graphSender }, contactId, text);
  revalidatePath(`/contacts/${contactId}`);
}

export async function updateTags(contactId: string, form: FormData) {
  const tags = [...new Set(str(form, "tags").split(",").map((t) => t.trim()).filter(Boolean))];
  await db().from("contacts").update({ tags }).eq("id", contactId);
  revalidatePath(`/contacts/${contactId}`);
}
