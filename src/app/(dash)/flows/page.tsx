import Link from "next/link";
import { db } from "@/lib/supabase";
import type { Flow } from "@/lib/types";
import { createFlow } from "../../actions";

export const dynamic = "force-dynamic";

const triggerLabel = (f: Flow) => {
  const t = f.trigger;
  if (t.type === "keyword") return `Palavra-chave: ${t.keywords.join(", ")}`;
  if (t.type === "comment") return `Comentário${t.keywords.length ? `: ${t.keywords.join(", ")}` : " (qualquer)"}`;
  if (t.type === "welcome") return "Boas-vindas (primeiro contato)";
  return "Resposta padrão";
};

export default async function FlowsPage() {
  const { data } = await db().from("flows").select("*").order("priority", { ascending: false }).order("created_at");
  const flows = (data ?? []) as Flow[];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Fluxos</h1>
        <form action={createFlow}>
          <button className="btn">Novo fluxo</button>
        </form>
      </div>
      {flows.length === 0 && <p className="text-sm text-zinc-500">Nenhum fluxo ainda.</p>}
      <ul className="space-y-2">
        {flows.map((f) => (
          <li key={f.id}>
            <Link href={`/flows/${f.id}`} className="card flex items-center justify-between gap-3 hover:border-indigo-300">
              <div className="min-w-0">
                <div className="truncate font-medium">{f.name}</div>
                <div className="truncate text-xs text-zinc-500">{triggerLabel(f)}</div>
              </div>
              <span className={`badge ${f.active ? "bg-green-100 text-green-800" : ""}`}>{f.active ? "Ativo" : "Pausado"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
