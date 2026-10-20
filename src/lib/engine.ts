import type { Sender } from "./meta/send";
import type { Store } from "./store";
import type { Channel, Contact, Flow, InboundEvent, OutboundMessage, Step } from "./types";

export interface Deps {
  store: Store;
  sender: Sender;
  now?: () => Date;
}

/** A Meta só deixa mandar mensagem livre até 24h depois da última mensagem do contato. */
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_STEPS_PER_RUN = 100;

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buttonPayload(flowId: string, stepId: string) {
  return `f:${flowId}:${stepId}`;
}

function parseButtonPayload(payload?: string): { flowId: string; stepId: string } | null {
  if (!payload?.startsWith("f:")) return null;
  const rest = payload.slice(2);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  return { flowId: rest.slice(0, sep), stepId: rest.slice(sep + 1) };
}

/** Escolhe o fluxo que responde a um evento. Maior prioridade ganha. */
export function matchFlow(flows: Flow[], ev: InboundEvent, isNewContact: boolean): Flow | null {
  const eligible = flows
    .filter((f) => f.active && (f.channel_types.length === 0 || f.channel_types.includes(ev.channelType)))
    .sort((a, b) => b.priority - a.priority);
  const text = normalize(ev.text ?? "");
  const hits = (keywords: string[], mode: "exact" | "contains") =>
    text !== "" &&
    keywords.some((k) => {
      const kw = normalize(k);
      return mode === "exact" ? text === kw : text.includes(kw);
    });

  if (ev.kind === "comment") {
    return (
      eligible.find(
        (f) =>
          f.trigger.type === "comment" &&
          (f.trigger.post_ids.length === 0 || (!!ev.postId && f.trigger.post_ids.includes(ev.postId))) &&
          (f.trigger.keywords.length === 0 || hits(f.trigger.keywords, "contains")),
      ) ?? null
    );
  }
  return (
    eligible.find((f) => f.trigger.type === "keyword" && hits(f.trigger.keywords, f.trigger.match)) ??
    (isNewContact ? eligible.find((f) => f.trigger.type === "welcome") : undefined) ??
    eligible.find((f) => f.trigger.type === "default") ??
    null
  );
}

/** Troca {{first_name}}, {{name}} e {{campo}} pelos dados do contato. */
export function render(text: string, contact: Contact): string {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    if (key === "name") return contact.name ?? "";
    if (key === "first_name") return (contact.name ?? "").split(" ")[0] ?? "";
    return contact.fields[key] ?? "";
  });
}

interface RunCtx {
  channel: Channel;
  contact: Contact;
  flow: Flow;
  runId?: string;
  /** Enquanto definido, a próxima mensagem vai como resposta privada a este comentário. */
  replyToComment?: string;
}

/** Processa um evento vindo do webhook. */
export async function handleInbound(deps: Deps, ev: InboundEvent): Promise<void> {
  const { store } = deps;
  const channel = await store.getChannelByExternal(ev.channelType, ev.accountId);
  if (!channel || !channel.active) return;

  const { contact, isNew } = await store.upsertContact(channel.id, ev.senderId, ev.senderName);
  const fresh = await store.insertMessage({
    contact_id: contact.id,
    direction: "in",
    kind: ev.kind,
    text: ev.text ?? null,
    payload: ev.payload ?? null,
    external_id: ev.eventId,
  });
  if (!fresh) return; // reenvio da Meta

  if (ev.kind !== "comment") {
    contact.last_inbound_at = ev.timestamp;
    await store.updateContact(contact.id, { last_inbound_at: ev.timestamp });
  }

  // 1. Clique em botão de um fluxo
  const button = parseButtonPayload(ev.payload);
  if (button) {
    const flow = await store.getFlow(button.flowId);
    if (flow && flow.steps.some((s) => s.id === button.stepId)) {
      await store.cancelWaitingRuns(contact.id);
      await execute(deps, { channel, contact, flow }, button.stepId);
    }
    return;
  }

  // 2. Resposta que um fluxo estava esperando
  if (ev.kind === "message") {
    const run = await store.getWaitingInputRun(contact.id);
    if (run) {
      const flow = await store.getFlow(run.flow_id);
      const step = flow?.steps.find((s) => s.id === run.step_id);
      if (!flow || !step || step.type !== "wait_reply") {
        await store.updateRun(run.id, { status: "cancelled" });
      } else {
        contact.fields = { ...contact.fields, [step.save_to]: ev.text ?? "" };
        await store.updateContact(contact.id, { fields: contact.fields });
        await store.updateRun(run.id, { status: "active" });
        const nextId = nextStepId(flow, step);
        const ctx = { channel, contact, flow, runId: run.id };
        if (nextId) await execute(deps, ctx, nextId);
        else await store.updateRun(run.id, { status: "done", step_id: null });
        return;
      }
    }
  }

  // 3. Gatilhos
  const flow = matchFlow(await store.listActiveFlows(), ev, isNew);
  if (!flow) return;
  const ctx: RunCtx = { channel, contact, flow };
  if (ev.kind === "comment" && ev.commentId) {
    ctx.replyToComment = ev.commentId;
    if (flow.trigger.type === "comment" && flow.trigger.public_reply) {
      const text = render(flow.trigger.public_reply, contact);
      let error: string | null = null;
      try {
        await deps.sender.replyToComment(channel, ev.commentId, text);
      } catch (e) {
        error = (e as Error).message;
      }
      await store.insertMessage({
        contact_id: contact.id,
        direction: "out",
        kind: "public_reply",
        text,
        status: error ? "failed" : "ok",
        error,
      });
    }
  }
  await execute(deps, ctx, flow.steps[0].id);
}

/** Retoma execuções cujo atraso já venceu. Chamado pelo cron. */
export async function resumeDueRuns(deps: Deps, limit = 50): Promise<number> {
  const { store } = deps;
  const now = (deps.now?.() ?? new Date()).toISOString();
  let count = 0;
  for (const run of await store.listDueRuns(now, limit)) {
    if (!(await store.claimRun(run.id))) continue;
    const flow = await store.getFlow(run.flow_id);
    const contact = await store.getContact(run.contact_id);
    const channel = contact ? await store.getChannel(contact.channel_id) : null;
    if (!flow || !contact || !channel || !run.step_id || !flow.steps.some((s) => s.id === run.step_id)) {
      await store.updateRun(run.id, { status: "cancelled" });
      continue;
    }
    await execute(deps, { channel, contact, flow, runId: run.id }, run.step_id);
    count++;
  }
  return count;
}

function nextStepId(flow: Flow, step: Step): string | null {
  if ("next" in step && step.next) return step.next;
  const i = flow.steps.findIndex((s) => s.id === step.id);
  return flow.steps[i + 1]?.id ?? null;
}

async function execute(deps: Deps, ctx: RunCtx, startId: string): Promise<void> {
  const { store } = deps;
  const { flow, contact } = ctx;
  const now = () => deps.now?.() ?? new Date();

  const finish = async (status: "done" | "failed") => {
    if (ctx.runId) await store.updateRun(ctx.runId, { status, step_id: null, resume_at: null });
  };
  const pause = async (status: "waiting_delay" | "waiting_input", stepId: string, resumeAt: string | null) => {
    if (ctx.runId) {
      await store.updateRun(ctx.runId, { status, step_id: stepId, resume_at: resumeAt });
    } else {
      const run = await store.createRun({
        flow_id: flow.id,
        contact_id: contact.id,
        status,
        step_id: stepId,
        resume_at: resumeAt,
      });
      ctx.runId = run.id;
    }
  };

  let stepId: string | null = startId;
  for (let guard = 0; stepId; guard++) {
    if (guard >= MAX_STEPS_PER_RUN) return finish("failed"); // provável loop no fluxo
    const step = flow.steps.find((s) => s.id === stepId);
    if (!step) break;

    switch (step.type) {
      case "text":
        if (!(await send(deps, ctx, { text: render(step.text, contact) }))) return finish("failed");
        stepId = nextStepId(flow, step);
        break;
      case "buttons": {
        const ok = await send(deps, ctx, {
          text: render(step.text, contact),
          buttons: step.buttons.map((b) => ({ title: b.title, payload: buttonPayload(flow.id, b.next) })),
        });
        // O fluxo continua quando o contato clicar num botão.
        return finish(ok ? "done" : "failed");
      }
      case "delay": {
        const after = nextStepId(flow, step);
        if (!after) return finish("done");
        return pause("waiting_delay", after, new Date(now().getTime() + step.seconds * 1000).toISOString());
      }
      case "wait_reply":
        return pause("waiting_input", step.id, null);
      case "add_tag":
      case "remove_tag": {
        const tag = step.tag.trim();
        const tags = new Set(contact.tags);
        if (step.type === "add_tag") tags.add(tag);
        else tags.delete(tag);
        contact.tags = [...tags];
        await store.updateContact(contact.id, { tags: contact.tags });
        stepId = nextStepId(flow, step);
        break;
      }
      case "set_field":
        contact.fields = { ...contact.fields, [step.key]: render(step.value, contact) };
        await store.updateContact(contact.id, { fields: contact.fields });
        stepId = nextStepId(flow, step);
        break;
      case "condition":
        stepId = contact.tags.includes(step.tag.trim()) ? step.then : step.else;
        break;
      case "goto":
        stepId = step.step;
        break;
      case "end":
        stepId = null;
        break;
    }
  }
  await finish("done");
}

async function send(deps: Deps, ctx: RunCtx, msg: OutboundMessage): Promise<boolean> {
  const { contact, channel } = ctx;
  const now = deps.now?.() ?? new Date();
  let error: string | null = null;
  let externalId: string | undefined;

  if (!ctx.replyToComment) {
    const last = contact.last_inbound_at ? Date.parse(contact.last_inbound_at) : NaN;
    if (Number.isNaN(last) || now.getTime() - last > WINDOW_MS) {
      error = "Fora da janela de 24h: o contato precisa mandar mensagem antes";
    }
  }
  if (!error) {
    const to = ctx.replyToComment ? { commentId: ctx.replyToComment } : { userId: contact.external_id };
    try {
      ({ externalId } = await deps.sender.send(channel, to, msg));
    } catch (e) {
      error = (e as Error).message;
    }
  }
  await deps.store.insertMessage({
    contact_id: contact.id,
    direction: "out",
    kind: ctx.replyToComment ? "private_reply" : "message",
    text: msg.text,
    payload: msg.buttons?.length ? JSON.stringify(msg.buttons.map((b) => b.title)) : null,
    external_id: externalId ?? null,
    status: error ? "failed" : "ok",
    error,
  });
  if (!error) ctx.replyToComment = undefined;
  return !error;
}

/** Mensagem enviada à mão pelo painel (inbox). */
export async function sendManualMessage(deps: Deps, contactId: string, text: string): Promise<string | null> {
  const contact = await deps.store.getContact(contactId);
  const channel = contact ? await deps.store.getChannel(contact.channel_id) : null;
  if (!contact || !channel) return "Contato não encontrado";
  const flow = { id: "manual", name: "manual", active: true, priority: 0, channel_types: [], trigger: { type: "default" }, steps: [] } as Flow;
  const ok = await send(deps, { channel, contact, flow }, { text });
  return ok ? null : "Falha no envio (veja o erro na conversa)";
}
