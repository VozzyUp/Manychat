import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";
import type { Contact } from "@/lib/types";
import { sendMessage, updateTags } from "../../../actions";

export const dynamic = "force-dynamic";

interface Msg { id: string; direction: "in" | "out"; kind: string; text: string | null; status: string; error: string | null; created_at: string }

const kindLabel: Record<string, string> = {
  comment: "comentário",
  postback: "clicou",
  private_reply: "resposta privada",
  public_reply: "resposta pública",
};

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: contact } = await db().from("contacts").select("*, channels(type,name)").eq("id", id).maybeSingle();
  if (!contact) notFound();
  const c = contact as Contact & { channels: { type: string; name: string } | null };
  const { data } = await db().from("messages").select("*").eq("contact_id", id).order("created_at").limit(500);
  const messages = (data ?? []) as Msg[];
  const windowOpen = !!c.last_inbound_at && Date.now() - Date.parse(c.last_inbound_at) < 24 * 3600 * 1000;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className="card flex flex-col md:col-span-2">
        <h1 className="mb-3 font-semibold">{c.name ?? c.external_id}</h1>
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {messages.map((m) => (
            <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.direction === "in" ? "self-start bg-zinc-100" : m.status === "failed" ? "self-end bg-red-50 text-red-800" : "self-end bg-indigo-600 text-white"}`}>
              {kindLabel[m.kind] && <div className="text-[10px] uppercase opacity-70">{kindLabel[m.kind]}</div>}
              <div className="whitespace-pre-wrap break-words">{m.text ?? "(mídia)"}</div>
              {m.error && <div className="mt-1 text-xs">Falhou: {m.error}</div>}
              <div className="mt-1 text-[10px] opacity-60">{new Date(m.created_at).toLocaleString("pt-BR")}</div>
            </div>
          ))}
          {messages.length === 0 && <p className="text-sm text-zinc-500">Sem mensagens.</p>}
        </div>
        <form action={sendMessage.bind(null, c.id)} className="mt-3 flex gap-2">
          <input name="text" className="input" placeholder={windowOpen ? "Escreva uma resposta" : "Janela de 24h fechada"} disabled={!windowOpen} />
          <button className="btn" disabled={!windowOpen}>Enviar</button>
        </form>
      </section>
      <aside className="card space-y-4 text-sm">
        <div>
          <div className="label">Canal</div>
          <div>{c.channels?.name} ({c.channels?.type})</div>
        </div>
        <div>
          <div className="label">ID na Meta</div>
          <div className="break-all font-mono text-xs">{c.external_id}</div>
        </div>
        <form action={updateTags.bind(null, c.id)} className="space-y-2">
          <label className="label" htmlFor="tags">Tags (separe por vírgula)</label>
          <input id="tags" name="tags" className="input" defaultValue={c.tags.join(", ")} />
          <button className="btn-ghost">Salvar tags</button>
        </form>
        <div>
          <div className="label">Campos</div>
          {Object.keys(c.fields).length === 0 && <div className="text-zinc-500">Nenhum</div>}
          <dl className="space-y-1">
            {Object.entries(c.fields).map(([k, v]) => (
              <div key={k}><dt className="text-xs text-zinc-500">{k}</dt><dd className="break-words">{v}</dd></div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
