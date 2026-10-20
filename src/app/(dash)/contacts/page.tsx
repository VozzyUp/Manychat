import Link from "next/link";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  const { q, tag } = await searchParams;
  let query = db()
    .from("contacts")
    .select("id,name,external_id,tags,last_inbound_at,channels(type,name)")
    .order("last_inbound_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  if (tag) query = query.contains("tags", [tag]);
  const { data } = await query;
  const contacts = (data ?? []) as unknown as {
    id: string; name: string | null; external_id: string; tags: string[]; last_inbound_at: string | null;
    channels: { type: string; name: string } | null;
  }[];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Contatos</h1>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nome" className="input max-w-xs" />
        <input name="tag" defaultValue={tag} placeholder="Filtrar por tag" className="input max-w-xs" />
        <button className="btn-ghost">Filtrar</button>
      </form>
      {contacts.length === 0 && <p className="text-sm text-zinc-500">Nenhum contato.</p>}
      <ul className="space-y-2">
        {contacts.map((c) => (
          <li key={c.id}>
            <Link href={`/contacts/${c.id}`} className="card flex items-center justify-between gap-3 hover:border-indigo-300">
              <div className="min-w-0">
                <div className="truncate font-medium">{c.name ?? c.external_id}</div>
                <div className="text-xs text-zinc-500">
                  {c.channels?.name} · {c.last_inbound_at ? new Date(c.last_inbound_at).toLocaleString("pt-BR") : "nunca mandou DM"}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {c.tags.map((t) => <span key={t} className="badge">{t}</span>)}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
