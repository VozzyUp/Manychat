import { after, type NextRequest } from "next/server";
import { handleInbound } from "@/lib/engine";
import { graphSender } from "@/lib/meta/send";
import { parseWebhook } from "@/lib/meta/parse";
import { appSecrets, verifySignature } from "@/lib/meta/signature";
import { SupabaseStore } from "@/lib/store-supabase";

export const runtime = "nodejs";

/** Verificação do webhook no painel da Meta. */
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.META_VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secrets = appSecrets();
  if (secrets.length === 0) return new Response("META_APP_SECRETS não configurado", { status: 500 });
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), secrets)) {
    return new Response("Assinatura inválida", { status: 401 });
  }
  let events;
  try {
    events = parseWebhook(JSON.parse(raw));
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  // Responde 200 já (a Meta exige resposta rápida) e processa em seguida.
  after(async () => {
    const deps = { store: new SupabaseStore(), sender: graphSender };
    for (const ev of events) {
      try {
        await handleInbound(deps, ev);
      } catch (e) {
        console.error("Falha ao processar evento", ev.eventId, e);
      }
    }
  });
  return new Response("EVENT_RECEIVED", { status: 200 });
}
