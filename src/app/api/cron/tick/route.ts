import type { NextRequest } from "next/server";
import { resumeDueRuns } from "@/lib/engine";
import { graphSender } from "@/lib/meta/send";
import { SupabaseStore } from "@/lib/store-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Retoma fluxos pausados por "Aguardar". Rode a cada minuto. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const resumed = await resumeDueRuns({ store: new SupabaseStore(), sender: graphSender });
  return Response.json({ resumed });
}
