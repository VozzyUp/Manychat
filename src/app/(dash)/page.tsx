import Link from "next/link";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function count(table: string, filter?: (q: any) => any) { // eslint-disable-line
  let q = db().from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

export default async function Home() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [contacts, flows, inbound, failed] = await Promise.all([
    count("contacts"),
    count("flows", (q) => q.eq("active", true)),
    count("messages", (q) => q.eq("direction", "in").gte("created_at", since)),
    count("messages", (q) => q.eq("status", "failed").gte("created_at", since)),
  ]);
  const stats = [
    { label: "Contatos", value: contacts, href: "/contacts" },
    { label: "Fluxos ativos", value: flows, href: "/flows" },
    { label: "Mensagens recebidas (24h)", value: inbound, href: "/contacts" },
    { label: "Envios com falha (24h)", value: failed, href: "/contacts" },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Visão geral</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card hover:border-indigo-300">
            <div className="text-2xl font-semibold">{s.value}</div>
            <div className="text-xs text-zinc-500">{s.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
