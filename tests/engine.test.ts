import { beforeEach, describe, expect, it } from "vitest";
import { handleInbound, resumeDueRuns, render } from "@/lib/engine";
import type { Sender } from "@/lib/meta/send";
import { MemoryStore } from "@/lib/store-memory";
import { flowSchema, type Channel, type Flow, type InboundEvent, type OutboundMessage, type Recipient } from "@/lib/types";

class FakeSender implements Sender {
  sent: { to: Recipient; msg: OutboundMessage }[] = [];
  publicReplies: { commentId: string; text: string }[] = [];
  failNext = false;
  async send(_c: Channel, to: Recipient, msg: OutboundMessage) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("token inválido");
    }
    this.sent.push({ to, msg });
    return { externalId: `out${this.sent.length}` };
  }
  async replyToComment(_c: Channel, commentId: string, text: string) {
    this.publicReplies.push({ commentId, text });
  }
}

let store: MemoryStore;
let sender: FakeSender;
let clock: Date;
let n = 0;
const deps = () => ({ store, sender, now: () => clock });

function flow(partial: Partial<Flow> & Pick<Flow, "trigger" | "steps">): Flow {
  return flowSchema.parse({ id: `F${++n}`, name: "f", active: true, priority: 0, channel_types: [], ...partial });
}

function dm(text: string, extra: Partial<InboundEvent> = {}): InboundEvent {
  return {
    channelType: "instagram",
    accountId: "IG1",
    senderId: "U1",
    senderName: "Ana Souza",
    kind: "message",
    eventId: `e${++n}`,
    text,
    timestamp: clock.toISOString(),
    ...extra,
  };
}

const texts = () => sender.sent.map((s) => s.msg.text);

beforeEach(() => {
  store = new MemoryStore();
  sender = new FakeSender();
  clock = new Date("2026-01-01T12:00:00Z");
  store.channels.push({ id: "ch1", type: "instagram", name: "IG", external_id: "IG1", access_token: "t", active: true });
});

describe("gatilhos", () => {
  it("responde palavra-chave ignorando acento e maiúscula", async () => {
    store.flows.push(flow({ trigger: { type: "keyword", keywords: ["preço"], match: "contains" }, steps: [{ id: "a", type: "text", text: "Oi {{first_name}}, custa R$10" }] }));
    await handleInbound(deps(), dm("Qual o PRECO?"));
    expect(texts()).toEqual(["Oi Ana, custa R$10"]);
  });

  it("exact só casa a mensagem inteira", async () => {
    store.flows.push(flow({ trigger: { type: "keyword", keywords: ["menu"], match: "exact" }, steps: [{ id: "a", type: "text", text: "MENU" }] }));
    await handleInbound(deps(), dm("quero ver o menu"));
    await handleInbound(deps(), dm(" Menu "));
    expect(texts()).toEqual(["MENU"]);
  });

  it("boas-vindas só no primeiro contato; depois cai na resposta padrão", async () => {
    store.flows.push(flow({ trigger: { type: "welcome" }, steps: [{ id: "a", type: "text", text: "bem-vindo" }] }));
    store.flows.push(flow({ trigger: { type: "default" }, steps: [{ id: "a", type: "text", text: "não entendi" }] }));
    await handleInbound(deps(), dm("oi"));
    await handleInbound(deps(), dm("oi de novo"));
    expect(texts()).toEqual(["bem-vindo", "não entendi"]);
  });

  it("prioridade maior ganha e filtra por canal", async () => {
    store.flows.push(flow({ priority: 1, trigger: { type: "keyword", keywords: ["oi"], match: "contains" }, steps: [{ id: "a", type: "text", text: "baixa" }] }));
    store.flows.push(flow({ priority: 5, trigger: { type: "keyword", keywords: ["oi"], match: "contains" }, steps: [{ id: "a", type: "text", text: "alta" }] }));
    store.flows.push(flow({ priority: 9, channel_types: ["whatsapp"], trigger: { type: "keyword", keywords: ["oi"], match: "contains" }, steps: [{ id: "a", type: "text", text: "zap" }] }));
    await handleInbound(deps(), dm("oi"));
    expect(texts()).toEqual(["alta"]);
  });

  it("ignora fluxo inativo e canal desconhecido", async () => {
    store.flows.push(flow({ active: false, trigger: { type: "default" }, steps: [{ id: "a", type: "text", text: "x" }] }));
    await handleInbound(deps(), dm("oi"));
    await handleInbound(deps(), dm("oi", { accountId: "OUTRA" }));
    expect(sender.sent).toEqual([]);
  });

  it("ignora evento repetido da Meta", async () => {
    store.flows.push(flow({ trigger: { type: "default" }, steps: [{ id: "a", type: "text", text: "x" }] }));
    const ev = dm("oi");
    await handleInbound(deps(), ev);
    await handleInbound(deps(), ev);
    expect(sender.sent).toHaveLength(1);
  });
});

describe("comentários", () => {
  const comment = (text: string, postId = "P1"): InboundEvent => ({
    channelType: "instagram", accountId: "IG1", senderId: "U9", senderName: "bia", kind: "comment",
    eventId: `c${++n}`, commentId: `C${n}`, postId, text, timestamp: clock.toISOString(),
  });

  it("manda resposta privada, responde em público e filtra por post", async () => {
    store.flows.push(flow({
      trigger: { type: "comment", keywords: ["quero"], post_ids: ["P1"], public_reply: "Te mandei no direct!" },
      steps: [{ id: "a", type: "buttons", text: "Aqui está", buttons: [{ title: "Receber link", next: "b" }] }, { id: "b", type: "text", text: "link" }],
    }));
    await handleInbound(deps(), comment("Eu QUERO", "P2"));
    expect(sender.sent).toEqual([]);
    const ev = comment("eu quero!");
    await handleInbound(deps(), ev);
    expect(sender.sent[0].to).toEqual({ commentId: ev.commentId });
    expect(sender.publicReplies).toEqual([{ commentId: ev.commentId, text: "Te mandei no direct!" }]);
  });

  it("depois da resposta privada não manda mais nada sem o contato responder", async () => {
    store.flows.push(flow({
      trigger: { type: "comment", keywords: [], post_ids: [] },
      steps: [{ id: "a", type: "text", text: "1" }, { id: "b", type: "text", text: "2" }],
    }));
    await handleInbound(deps(), comment("qualquer"));
    expect(texts()).toEqual(["1"]);
    expect(store.messages.find((m) => m.status === "failed")?.error).toMatch(/24h/);
  });

  it("clique no botão depois do comentário continua o fluxo pelo direct", async () => {
    const f = flow({
      trigger: { type: "comment", keywords: [], post_ids: [] },
      steps: [{ id: "a", type: "buttons", text: "Quer?", buttons: [{ title: "Sim", next: "b" }] }, { id: "b", type: "text", text: "link aqui" }],
    });
    store.flows.push(f);
    await handleInbound(deps(), comment("x"));
    const payload = sender.sent[0].msg.buttons![0].payload;
    await handleInbound(deps(), dm("Sim", { senderId: "U9", kind: "postback", payload }));
    expect(sender.sent[1]).toEqual({ to: { userId: "U9" }, msg: { text: "link aqui" } });
  });
});

describe("passos", () => {
  it("botões: cada botão leva ao seu passo", async () => {
    const f = flow({
      trigger: { type: "default" },
      steps: [
        { id: "q", type: "buttons", text: "Escolha", buttons: [{ title: "A", next: "a" }, { title: "B", next: "b" }] },
        { id: "a", type: "text", text: "você escolheu A", next: "fim" },
        { id: "b", type: "text", text: "você escolheu B" },
        { id: "fim", type: "end" },
      ],
    });
    store.flows.push(f);
    await handleInbound(deps(), dm("oi"));
    const [a, b] = sender.sent[0].msg.buttons!;
    await handleInbound(deps(), dm("A", { kind: "postback", payload: a.payload }));
    await handleInbound(deps(), dm("B", { kind: "postback", payload: b.payload }));
    expect(texts()).toEqual(["Escolha", "você escolheu A", "você escolheu B"]);
  });

  it("atraso: pausa e retoma pelo cron", async () => {
    store.flows.push(flow({ trigger: { type: "default" }, steps: [
      { id: "a", type: "text", text: "agora" },
      { id: "d", type: "delay", seconds: 600 },
      { id: "b", type: "text", text: "10 min depois" },
    ] }));
    await handleInbound(deps(), dm("oi"));
    expect(texts()).toEqual(["agora"]);
    clock = new Date(clock.getTime() + 5 * 60_000);
    expect(await resumeDueRuns(deps())).toBe(0);
    clock = new Date(clock.getTime() + 6 * 60_000);
    expect(await resumeDueRuns(deps())).toBe(1);
    expect(texts()).toEqual(["agora", "10 min depois"]);
    expect(store.runs[0].status).toBe("done");
    expect(await resumeDueRuns(deps())).toBe(0);
  });

  it("atraso além de 24h falha por causa da janela", async () => {
    store.flows.push(flow({ trigger: { type: "default" }, steps: [{ id: "d", type: "delay", seconds: 90000 }, { id: "b", type: "text", text: "tarde" }] }));
    await handleInbound(deps(), dm("oi"));
    clock = new Date(clock.getTime() + 90001_000);
    await resumeDueRuns(deps());
    expect(sender.sent).toEqual([]);
    expect(store.runs[0].status).toBe("failed");
  });

  it("captura resposta num campo, aplica tag e condição", async () => {
    store.flows.push(flow({ trigger: { type: "keyword", keywords: ["cadastro"], match: "exact" }, steps: [
      { id: "a", type: "text", text: "Qual seu email?" },
      { id: "w", type: "wait_reply", save_to: "email" },
      { id: "t", type: "add_tag", tag: "lead" },
      { id: "c", type: "condition", tag: "lead", then: "ok", else: "nao" },
      { id: "nao", type: "text", text: "erro", next: "fim" },
      { id: "ok", type: "text", text: "Anotado: {{email}}" },
      { id: "fim", type: "end" },
    ] }));
    await handleInbound(deps(), dm("cadastro"));
    await handleInbound(deps(), dm("ana@x.com"));
    expect(texts()).toEqual(["Qual seu email?", "Anotado: ana@x.com"]);
    expect(store.contacts[0]).toMatchObject({ tags: ["lead"], fields: { email: "ana@x.com" } });
    // a resposta foi consumida, não dispara mais nada
    await handleInbound(deps(), dm("cadastro"));
    expect(texts()).toHaveLength(3);
  });

  it("para loops infinitos", async () => {
    store.flows.push(flow({ trigger: { type: "default" }, steps: [{ id: "a", type: "goto", step: "b" }, { id: "b", type: "goto", step: "a" }] }));
    await handleInbound(deps(), dm("oi"));
    expect(sender.sent).toEqual([]);
  });

  it("registra falha de envio da Meta", async () => {
    store.flows.push(flow({ trigger: { type: "default" }, steps: [{ id: "a", type: "text", text: "x" }, { id: "b", type: "text", text: "y" }] }));
    sender.failNext = true;
    await handleInbound(deps(), dm("oi"));
    expect(sender.sent).toEqual([]);
    expect(store.messages.at(-1)).toMatchObject({ direction: "out", status: "failed", error: "token inválido" });
  });
});

describe("validação do fluxo", () => {
  it("recusa passo que aponta para ID inexistente ou ID repetido", () => {
    const base = { id: "x", name: "x", active: true, priority: 0, channel_types: [], trigger: { type: "default" } };
    expect(flowSchema.safeParse({ ...base, steps: [{ id: "a", type: "goto", step: "zz" }] }).success).toBe(false);
    expect(flowSchema.safeParse({ ...base, steps: [{ id: "a", type: "end" }, { id: "a", type: "end" }] }).success).toBe(false);
  });
  it("render usa campos do contato", () => {
    expect(render("{{name}}|{{first_name}}|{{x}}|{{nada}}", { id: "1", channel_id: "c", external_id: "e", name: "Ana Souza", tags: [], fields: { x: "1" }, last_inbound_at: null })).toBe("Ana Souza|Ana|1|");
  });
});
