import { headers } from "next/headers";
import { db } from "@/lib/supabase";
import type { Channel } from "@/lib/types";
import { deleteChannel, saveChannel, toggleChannel } from "../../actions";

export const dynamic = "force-dynamic";

const help = {
  instagram: "ID da conta profissional do Instagram + token de acesso do Instagram (Instagram API com login do Instagram).",
  messenger: "ID da página do Facebook + token de acesso da página.",
  whatsapp: "Phone number ID (não é o número!) + token permanente de usuário do sistema.",
};

export default async function ChannelsPage() {
  const { data } = await db().from("channels").select("id,type,name,external_id,active").order("created_at");
  const channels = (data ?? []) as Omit<Channel, "access_token">[];
  const h = await headers();
  const webhookUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/api/webhooks/meta`;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Canais</h1>
      <div className="card space-y-1 text-sm">
        <div className="label">URL do webhook (cole no painel da Meta)</div>
        <code className="block break-all rounded bg-zinc-100 p-2 text-xs">{webhookUrl}</code>
        <p className="text-xs text-zinc-500">Token de verificação: o valor de META_VERIFY_TOKEN.</p>
      </div>

      <ul className="space-y-2">
        {channels.map((c) => (
          <li key={c.id} className="card flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.name} <span className="badge">{c.type}</span></div>
              <div className="break-all font-mono text-xs text-zinc-500">{c.external_id}</div>
            </div>
            <form action={toggleChannel.bind(null, c.id, !c.active)}>
              <button className="btn-ghost">{c.active ? "Pausar" : "Ativar"}</button>
            </form>
            <form action={deleteChannel.bind(null, c.id)}>
              <button className="btn-danger">Remover</button>
            </form>
          </li>
        ))}
      </ul>

      <form action={saveChannel} className="card space-y-3">
        <h2 className="font-medium">Conectar canal</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="type">Tipo</label>
            <select id="type" name="type" className="input">
              <option value="instagram">Instagram</option>
              <option value="messenger">Messenger</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="name">Nome</label>
            <input id="name" name="name" className="input" placeholder="Minha loja" required />
          </div>
          <div>
            <label className="label" htmlFor="external_id">ID da conta / página / phone number ID</label>
            <input id="external_id" name="external_id" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="access_token">Token de acesso</label>
            <input id="access_token" name="access_token" type="password" className="input" required />
          </div>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-500">
          {Object.entries(help).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}
        </ul>
        <p className="text-xs text-zinc-500">Salvar de novo com o mesmo tipo e ID atualiza o token.</p>
        <button className="btn">Salvar canal</button>
      </form>
    </div>
  );
}
