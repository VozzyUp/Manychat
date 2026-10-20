import { notFound } from "next/navigation";
import { FlowEditor } from "@/components/flow-editor";
import { db } from "@/lib/supabase";
import type { Flow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await db().from("flows").select("id,name,active,priority,channel_types,trigger,steps").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <FlowEditor initial={data as Flow} />;
}
