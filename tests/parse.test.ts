import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { parseWebhook } from "@/lib/meta/parse";
import { verifySignature } from "@/lib/meta/signature";
import { messengerMessage, whatsappMessage } from "@/lib/meta/send";

describe("parseWebhook", () => {
  it("lê DM do Instagram e ignora eco", () => {
    const evs = parseWebhook({
      object: "instagram",
      entry: [
        {
          id: "IG1",
          messaging: [
            { sender: { id: "U1" }, recipient: { id: "IG1" }, timestamp: 1700000000000, message: { mid: "m1", text: "Oi" } },
            { sender: { id: "IG1" }, recipient: { id: "U1" }, timestamp: 1700000000000, message: { mid: "m2", text: "eco", is_echo: true } },
          ],
        },
      ],
    });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ channelType: "instagram", accountId: "IG1", senderId: "U1", kind: "message", text: "Oi", eventId: "m1" });
    expect(evs[0].timestamp).toBe(new Date(1700000000000).toISOString());
  });

  it("lê comentário do Instagram e ignora o da própria conta", () => {
    const evs = parseWebhook({
      object: "instagram",
      entry: [
        {
          id: "IG1",
          changes: [
            { field: "comments", value: { id: "C1", text: "quero", from: { id: "U2", username: "ana" }, media: { id: "P1" } } },
            { field: "comments", value: { id: "C2", text: "obrigado", from: { id: "IG1" }, media: { id: "P1" } } },
          ],
        },
      ],
    });
    expect(evs).toEqual([
      expect.objectContaining({ kind: "comment", commentId: "C1", postId: "P1", senderId: "U2", senderName: "ana", eventId: "c:C1" }),
    ]);
  });

  it("lê postback e quick reply do Messenger", () => {
    const evs = parseWebhook({
      object: "page",
      entry: [
        {
          id: "PG",
          messaging: [
            { sender: { id: "U" }, timestamp: 1, postback: { mid: "p1", title: "Sim", payload: "f:F:s2" } },
            { sender: { id: "U" }, timestamp: 2, message: { mid: "m3", text: "Não", quick_reply: { payload: "f:F:s3" } } },
          ],
        },
      ],
    });
    expect(evs.map((e) => [e.kind, e.payload])).toEqual([
      ["postback", "f:F:s2"],
      ["postback", "f:F:s3"],
    ]);
  });

  it("lê comentário de página do Facebook", () => {
    const evs = parseWebhook({
      object: "page",
      entry: [
        {
          id: "PG",
          changes: [
            { field: "feed", value: { item: "comment", verb: "add", comment_id: "C9", post_id: "PG_1", message: "eu", from: { id: "U", name: "Bia" }, created_time: 1700000000 } },
            { field: "feed", value: { item: "comment", verb: "edited", comment_id: "C9", from: { id: "U" } } },
          ],
        },
      ],
    });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ channelType: "messenger", kind: "comment", commentId: "C9", postId: "PG_1", senderName: "Bia" });
  });

  it("lê texto e botão do WhatsApp", () => {
    const evs = parseWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "PN1" },
                contacts: [{ wa_id: "5511999", profile: { name: "Carlos" } }],
                messages: [
                  { from: "5511999", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "preço" } },
                  { from: "5511999", id: "wamid.2", timestamp: "1700000001", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "f:F:s2", title: "Sim" } } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ channelType: "whatsapp", accountId: "PN1", senderId: "5511999", senderName: "Carlos", text: "preço" });
    expect(evs[0].timestamp).toBe(new Date(1700000000 * 1000).toISOString());
    expect(evs[1]).toMatchObject({ kind: "postback", payload: "f:F:s2" });
  });

  it("ignora status de entrega do WhatsApp", () => {
    const evs = parseWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN1" }, statuses: [{ id: "x", status: "read" }] } }] }],
    });
    expect(evs).toEqual([]);
  });
});

describe("verifySignature", () => {
  const body = '{"a":1}';
  const sig = "sha256=" + createHmac("sha256", "s2").update(body).digest("hex");
  it("aceita qualquer um dos secrets", () => expect(verifySignature(body, sig, ["s1", "s2"])).toBe(true));
  it("rejeita secret errado, corpo alterado ou cabeçalho ausente", () => {
    expect(verifySignature(body, sig, ["s1"])).toBe(false);
    expect(verifySignature('{"a":2}', sig, ["s2"])).toBe(false);
    expect(verifySignature(body, null, ["s2"])).toBe(false);
    expect(verifySignature(body, "sha256=abc", ["s2"])).toBe(false);
  });
});

describe("formato de envio", () => {
  const b = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `B${i}`, payload: `p${i}` }));
  it("Messenger/IG: template de botões até 3, quick replies acima", () => {
    expect(messengerMessage({ text: "oi" })).toEqual({ text: "oi" });
    expect(messengerMessage({ text: "oi", buttons: b(2) }).attachment?.payload.buttons).toHaveLength(2);
    expect(messengerMessage({ text: "oi", buttons: b(5) }).quick_replies).toHaveLength(5);
  });
  it("WhatsApp: botões até 3, lista acima", () => {
    expect(whatsappMessage("55", { text: "oi" })).toMatchObject({ type: "text", text: { body: "oi" } });
    expect((whatsappMessage("55", { text: "oi", buttons: b(3) }) as { interactive?: { type: string } }).interactive?.type).toBe("button");
    expect((whatsappMessage("55", { text: "oi", buttons: b(4) }) as { interactive?: { type: string } }).interactive?.type).toBe("list");
  });
});
