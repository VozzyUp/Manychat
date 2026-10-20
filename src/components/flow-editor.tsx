"use client";

import { useState, useTransition } from "react";
import { deleteFlow, saveFlow } from "@/app/actions";
import { channelTypes, type Flow, type Step, type Trigger } from "@/lib/types";

const stepTypes: { type: Step["type"]; label: string }[] = [
  { type: "text", label: "Mensagem" },
  { type: "buttons", label: "Mensagem com botões" },
  { type: "delay", label: "Aguardar" },
  { type: "wait_reply", label: "Esperar resposta" },
  { type: "add_tag", label: "Adicionar tag" },
  { type: "remove_tag", label: "Remover tag" },
  { type: "set_field", label: "Definir campo" },
  { type: "condition", label: "Condição (tem tag?)" },
  { type: "goto", label: "Ir para passo" },
  { type: "end", label: "Fim" },
];

const channelLabel = { instagram: "Instagram", messenger: "Messenger", whatsapp: "WhatsApp" };

function newStep(type: Step["type"], id: string, firstId: string): Step {
  switch (type) {
    case "text": return { id, type, text: "Nova mensagem" };
    case "buttons": return { id, type, text: "Escolha uma opção", buttons: [{ title: "Opção 1", next: firstId }] };
    case "delay": return { id, type, seconds: 60 };
    case "wait_reply": return { id, type, save_to: "resposta" };
    case "add_tag": case "remove_tag": return { id, type, tag: "lead" };
    case "set_field": return { id, type, key: "campo", value: "" };
    case "condition": return { id, type, tag: "lead", then: firstId, else: firstId };
    case "goto": return { id, type, step: firstId };
    case "end": return { id, type };
  }
}

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function FlowEditor({ initial }: { initial: Flow }) {
  const [flow, setFlow] = useState<Flow>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [showJson, setShowJson] = useState(false);

  const set = (patch: Partial<Flow>) => setFlow((f) => ({ ...f, ...patch }));
  const setStep = (i: number, s: Step) => set({ steps: flow.steps.map((x, j) => (j === i ? s : x)) });
  const ids = flow.steps.map((s) => s.id);

  const addStep = (type: Step["type"]) => {
    let n = flow.steps.length + 1;
    while (ids.includes(`passo${n}`)) n++;
    set({ steps: [...flow.steps, newStep(type, `passo${n}`, ids[0] ?? `passo${n}`)] });
  };
  const move = (i: number, d: number) => {
    const steps = [...flow.steps];
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    set({ steps });
  };

  const save = () =>
    start(async () => {
      const res = await saveFlow(JSON.stringify(flow));
      setMessage(res.error ? { ok: false, text: res.error } : { ok: true, text: "Salvo" });
    });

  const StepSelect = ({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void; }) => (
    <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">(próximo da lista)</option>
      {ids.map((id) => <option key={id} value={id}>{id}</option>)}
    </select>
  );
  const RequiredStepSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {ids.map((id) => <option key={id} value={id}>{id}</option>)}
    </select>
  );

  const t = flow.trigger;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-sm text-base font-semibold" value={flow.name} onChange={(e) => set({ name: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={flow.active} onChange={(e) => set({ active: e.target.checked })} /> Ativo
        </label>
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost" onClick={() => setShowJson((v) => !v)}>{showJson ? "Editor" : "JSON"}</button>
          <button className="btn" onClick={save} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
      {message && (
        <pre className={`whitespace-pre-wrap rounded-lg p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</pre>
      )}

      {showJson ? (
        <textarea
          className="input h-[60vh] font-mono text-xs"
          defaultValue={JSON.stringify(flow, null, 2)}
          onBlur={(e) => {
            try { setFlow(JSON.parse(e.target.value)); setMessage(null); }
            catch { setMessage({ ok: false, text: "JSON inválido" }); }
          }}
        />
      ) : (
        <>
          <section className="card space-y-3">
            <h2 className="font-medium">Gatilho</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="label">Quando</label>
                <select
                  className="input"
                  value={t.type}
                  onChange={(e) => {
                    const type = e.target.value as Trigger["type"];
                    const next: Trigger =
                      type === "keyword" ? { type, keywords: ["oi"], match: "contains" }
                      : type === "comment" ? { type, keywords: [], post_ids: [] }
                      : { type };
                    set({ trigger: next });
                  }}
                >
                  <option value="keyword">Mensagem com palavra-chave</option>
                  <option value="comment">Comentário em post</option>
                  <option value="welcome">Primeira mensagem do contato</option>
                  <option value="default">Nenhum outro fluxo respondeu</option>
                </select>
              </div>
              <div>
                <label className="label">Prioridade (maior ganha)</label>
                <input type="number" className="input" value={flow.priority} onChange={(e) => set({ priority: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label">Canais (nenhum = todos)</label>
                <div className="flex flex-wrap gap-3 pt-2 text-sm">
                  {channelTypes.map((c) => (
                    <label key={c} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={flow.channel_types.includes(c)}
                        onChange={(e) => set({ channel_types: e.target.checked ? [...flow.channel_types, c] : flow.channel_types.filter((x) => x !== c) })}
                      />
                      {channelLabel[c]}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {t.type === "keyword" && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="label">Palavras-chave (separe por vírgula)</label>
                  <input className="input" defaultValue={t.keywords.join(", ")} onBlur={(e) => set({ trigger: { ...t, keywords: splitList(e.target.value) } })} />
                </div>
                <div>
                  <label className="label">Tipo de busca</label>
                  <select className="input" value={t.match} onChange={(e) => set({ trigger: { ...t, match: e.target.value as "exact" | "contains" } })}>
                    <option value="contains">Contém</option>
                    <option value="exact">Mensagem exata</option>
                  </select>
                </div>
              </div>
            )}
            {t.type === "comment" && (
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="label">Palavras-chave (vazio = qualquer)</label>
                  <input className="input" defaultValue={t.keywords.join(", ")} onBlur={(e) => set({ trigger: { ...t, keywords: splitList(e.target.value) } })} />
                </div>
                <div>
                  <label className="label">IDs dos posts (vazio = todos)</label>
                  <input className="input" defaultValue={t.post_ids.join(", ")} onBlur={(e) => set({ trigger: { ...t, post_ids: splitList(e.target.value) } })} />
                </div>
                <div>
                  <label className="label">Resposta pública no comentário</label>
                  <input className="input" value={t.public_reply ?? ""} onChange={(e) => set({ trigger: { ...t, public_reply: e.target.value || undefined } })} placeholder="Te mandei no direct!" />
                </div>
                <p className="text-xs text-zinc-500 md:col-span-3">
                  A Meta só permite 1 mensagem privada por comentário. Para continuar a conversa, use &quot;Mensagem com botões&quot; como primeiro passo: quando o contato clica, o fluxo segue normalmente.
                </p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-medium">Passos</h2>
            {flow.steps.map((s, i) => (
              <div key={i} className="card space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge">{i + 1}</span>
                  <input className="input w-36 font-mono text-xs" value={s.id} onChange={(e) => setStep(i, { ...s, id: e.target.value })} title="ID do passo" />
                  <span className="text-sm font-medium">{stepTypes.find((x) => x.type === s.type)?.label}</span>
                  <div className="ml-auto flex gap-1">
                    <button className="btn-ghost px-2 py-1" onClick={() => move(i, -1)} aria-label="Subir">↑</button>
                    <button className="btn-ghost px-2 py-1" onClick={() => move(i, 1)} aria-label="Descer">↓</button>
                    <button className="btn-danger px-2 py-1" onClick={() => set({ steps: flow.steps.filter((_, j) => j !== i) })} aria-label="Remover">✕</button>
                  </div>
                </div>

                {(s.type === "text" || s.type === "buttons") && (
                  <textarea className="input" rows={3} value={s.text} onChange={(e) => setStep(i, { ...s, text: e.target.value })} />
                )}
                {s.type === "buttons" && (
                  <div className="space-y-2">
                    {s.buttons.map((b, bi) => (
                      <div key={bi} className="flex gap-2">
                        <input className="input" maxLength={20} value={b.title} onChange={(e) => setStep(i, { ...s, buttons: s.buttons.map((x, k) => (k === bi ? { ...x, title: e.target.value } : x)) })} />
                        <RequiredStepSelect value={b.next} onChange={(v) => setStep(i, { ...s, buttons: s.buttons.map((x, k) => (k === bi ? { ...x, next: v } : x)) })} />
                        <button className="btn-danger px-2" onClick={() => setStep(i, { ...s, buttons: s.buttons.filter((_, k) => k !== bi) })}>✕</button>
                      </div>
                    ))}
                    {s.buttons.length < 10 && (
                      <button className="btn-ghost" onClick={() => setStep(i, { ...s, buttons: [...s.buttons, { title: `Opção ${s.buttons.length + 1}`, next: ids[0] }] })}>+ Botão</button>
                    )}
                    <p className="text-xs text-zinc-500">Até 20 caracteres por botão. Com mais de 3 botões vira lista/respostas rápidas.</p>
                  </div>
                )}
                {s.type === "delay" && (
                  <div className="flex items-center gap-2 text-sm">
                    <input type="number" min={1} className="input w-32" value={Math.round(s.seconds / 60)} onChange={(e) => setStep(i, { ...s, seconds: Math.max(1, Number(e.target.value) || 1) * 60 })} />
                    minutos
                  </div>
                )}
                {s.type === "wait_reply" && (
                  <div>
                    <label className="label">Salvar resposta no campo</label>
                    <input className="input" value={s.save_to} onChange={(e) => setStep(i, { ...s, save_to: e.target.value })} />
                  </div>
                )}
                {(s.type === "add_tag" || s.type === "remove_tag" || s.type === "condition") && (
                  <div>
                    <label className="label">Tag</label>
                    <input className="input" value={s.tag} onChange={(e) => setStep(i, { ...s, tag: e.target.value })} />
                  </div>
                )}
                {s.type === "set_field" && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <input className="input" placeholder="campo" value={s.key} onChange={(e) => setStep(i, { ...s, key: e.target.value })} />
                    <input className="input" placeholder="valor" value={s.value} onChange={(e) => setStep(i, { ...s, value: e.target.value })} />
                  </div>
                )}
                {s.type === "condition" && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <div><label className="label">Se tem a tag, vai para</label><RequiredStepSelect value={s.then} onChange={(v) => setStep(i, { ...s, then: v })} /></div>
                    <div><label className="label">Senão, vai para</label><RequiredStepSelect value={s.else} onChange={(v) => setStep(i, { ...s, else: v })} /></div>
                  </div>
                )}
                {s.type === "goto" && <RequiredStepSelect value={s.step} onChange={(v) => setStep(i, { ...s, step: v })} />}
                {"next" in s || ["text", "delay", "wait_reply", "add_tag", "remove_tag", "set_field"].includes(s.type) ? (
                  <div className="max-w-xs">
                    <label className="label">Depois, ir para</label>
                    <StepSelect value={"next" in s ? s.next : undefined} onChange={(v) => setStep(i, { ...s, next: v } as Step)} />
                  </div>
                ) : null}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {stepTypes.map((st) => (
                <button key={st.type} className="btn-ghost" onClick={() => addStep(st.type)}>+ {st.label}</button>
              ))}
            </div>
            <p className="text-xs text-zinc-500">Variáveis: {"{{first_name}}"}, {"{{name}}"} e qualquer campo salvo, como {"{{email}}"}.</p>
          </section>
        </>
      )}

      <form action={deleteFlow.bind(null, flow.id)} onSubmit={(e) => { if (!confirm("Apagar este fluxo?")) e.preventDefault(); }}>
        <button className="btn-danger">Apagar fluxo</button>
      </form>
    </div>
  );
}
