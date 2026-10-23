import { randomBytes, randomInt } from 'node:crypto';
import { createServiceDb } from '@nurion/db';
import { createTestTenant, findLocalStack, runSql, type LocalStack } from '@nurion/db/testing';
import { createLogger, createSecretBox, type ModuleKey } from '@nurion/shared';
import { inbound } from '@nurion/whatsapp/fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  defineModule,
  ModuleRegistry,
  processConversationTurn,
  processInboundWebhook,
  processOutbound,
  type AgentTurnInput,
  type OutboundJob,
  type TurnContext,
} from '../src';
import { createFakeGraph } from './fake-graph';

const stack = await findLocalStack('core turn');
const describeStack = stack ? describe : describe.skip;
const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');

describeStack('conversation turns and routing against the local stack', () => {
  const s = stack as LocalStack;
  const graph = createFakeGraph();
  const secrets = createSecretBox({ key: randomBytes(32).toString('base64') });
  const agentCalls: AgentTurnInput[] = [];
  const outboundJobs: OutboundJob[] = [];
  const classifierCalls: string[] = [];
  let classifierAnswer: { module: ModuleKey; confidence: number } | null = null;
  const tenants: Awaited<ReturnType<typeof createTestTenant>>[] = [];

  const registry = new ModuleRegistry()
    .register(
      defineModule({
        key: 'log',
        label: 'Log',
        agentFor: (k) => (k === 'driver' ? 'log.driver' : undefined),
      }),
    )
    .register(defineModule({ key: 'labs', label: 'Labs' }))
    .register(defineModule({ key: 'consult', label: 'Consult', agentFor: () => 'consult.copilot' }))
    .register(defineModule({ key: 'adm', label: 'ADM', agentFor: () => 'adm.requests' }));

  let ctx: TurnContext;

  async function setupTenant(modules: ModuleKey[]) {
    const tenant = await createTestTenant(s, modules);
    tenants.push(tenant);
    const phoneNumberId = digits(15);
    await runSql(
      s,
      `insert into whatsapp_numbers (tenant_id, phone_number_id, waba_id, display_number, access_token_enc) values ($1, $2, '102290129340398', '+55 11 4002-8922', $3)`,
      [tenant.tenantId, phoneNumberId, secrets.encrypt('tok')],
    );
    return { ...tenant, phoneNumberId };
  }

  /** Delivers a webhook message and returns the conversation id. */
  async function receive(phoneNumberId: string, from: string, message: Record<string, unknown>) {
    const body = inbound(message, `wamid.${digits(20)}`);
    const value = body.entry[0]!.changes[0]!.value as unknown as {
      metadata: { phone_number_id: string };
      contacts: { wa_id: string }[];
      messages: { from: string }[];
    };
    value.metadata.phone_number_id = phoneNumberId;
    value.contacts[0]!.wa_id = from;
    value.messages[0]!.from = from;
    let conversationId = '';
    await processInboundWebhook(ctx, body, {
      attempt: 1,
      onInbound: async (e) => void (conversationId = e.conversationId),
    });
    return conversationId;
  }

  beforeAll(() => {
    ctx = {
      db: createServiceDb({ url: s.url, serviceRoleKey: s.serviceKey }),
      secrets,
      graph: { version: 'v23.0', fetch: graph.fetch },
      logger: createLogger('turn-test', { level: 'silent' }),
      registry,
      enqueueOutbound: async (job) => void outboundJobs.push(job),
      classifyStaffIntent: async ({ text }) => {
        classifierCalls.push(text);
        return classifierAnswer;
      },
      runAgent: async (input) => void agentCalls.push(input),
    };
  });

  afterAll(async () => {
    for (const t of tenants) await t.drop();
  });

  it('a driver registered with the 9th digit is recognised when WhatsApp drops it, and the reply goes to the id WhatsApp used', async () => {
    const t = await setupTenant(['log', 'consult']);
    await runSql(
      s,
      `insert into contacts (tenant_id, wa_id, name, kind) values ($1, '5511987654321', 'João', 'driver')`,
      [t.tenantId],
    );

    const conversationId = await receive(t.phoneNumberId, '551187654321', {
      type: 'text',
      text: { body: 'iniciar' },
    });
    const result = await processConversationTurn(ctx, { tenantId: t.tenantId, conversationId });
    expect(result).toMatchObject({
      status: 'routed',
      decision: { action: 'agent', module: 'log', reason: 'driver' },
    });
    expect(agentCalls.at(-1)).toMatchObject({
      module: 'log',
      agentKey: 'log.driver',
      contactKind: 'driver',
    });
    expect(agentCalls.at(-1)!.messages.map((m) => m.text)).toEqual(['iniciar']);

    const contacts = await runSql(s, `select id from contacts where tenant_id = $1`, [t.tenantId]);
    expect(contacts).toHaveLength(1);
    expect(await processConversationTurn(ctx, { tenantId: t.tenantId, conversationId })).toEqual({
      status: 'idle',
    });

    const [conv] = await runSql<{ module: string; agent_key: string }>(
      s,
      `select module, agent_key from conversations where id = $1`,
      [conversationId],
    );
    expect(conv).toEqual({ module: 'log', agent_key: 'log.driver' });

    const { queueOutboundMessage } = await import('../src');
    const messageId = await queueOutboundMessage(ctx.db.withTenant(t.tenantId), async () => {}, {
      conversationId,
      author: 'ai',
      content: { kind: 'text', text: 'Bom dia, João' },
    });
    await processOutbound(ctx, { tenantId: t.tenantId, messageId }, { isLastAttempt: false });
    expect(graph.sends().at(-1)!.body).toMatchObject({ to: '551187654321' });
  });

  it('unknown contacts on a tenant without Labs: identification message, human handoff, then silence', async () => {
    const t = await setupTenant(['log', 'adm']);
    const from = `5521${digits(9)}`;
    const conversationId = await receive(t.phoneNumberId, from, {
      type: 'text',
      text: { body: 'oi' },
    });
    const before = outboundJobs.length;
    expect(
      await processConversationTurn(ctx, { tenantId: t.tenantId, conversationId }),
    ).toMatchObject({ decision: { action: 'unidentified' } });
    expect(outboundJobs.length).toBe(before + 1);
    const [handoff] = await runSql<{ reason: string; status: string }>(
      s,
      `select reason, status from handoffs where conversation_id = $1`,
      [conversationId],
    );
    expect(handoff).toEqual({ reason: 'unidentified', status: 'open' });

    await receive(t.phoneNumberId, from, { type: 'text', text: { body: 'alguém aí?' } });
    expect(
      await processConversationTurn(ctx, { tenantId: t.tenantId, conversationId }),
    ).toMatchObject({ decision: { action: 'human' } });
    expect(outboundJobs.length).toBe(before + 1);
  });

  it('staff: confident classifier routes; doubtful asks with a list; the choice sticks for the session', async () => {
    const t = await setupTenant(['log', 'consult', 'adm']);
    const from = `5531${digits(9)}`;
    await runSql(
      s,
      `insert into contacts (tenant_id, wa_id, name, kind) values ($1, $2, 'Ana', 'staff')`,
      [t.tenantId, from],
    );

    classifierAnswer = { module: 'adm', confidence: 0.95 };
    let conversationId = await receive(t.phoneNumberId, from, {
      type: 'text',
      text: { body: 'preciso de reembolso' },
    });
    expect(
      await processConversationTurn(ctx, { tenantId: t.tenantId, conversationId }),
    ).toMatchObject({
      decision: { action: 'agent', module: 'adm', reason: 'classifier' },
    });
    expect(classifierCalls.at(-1)).toBe('preciso de reembolso');

    // Session expired → routed again; this time the classifier is unsure.
    await runSql(
      s,
      `update conversations set state_expires_at = now() - interval '1 minute' where id = $1`,
      [conversationId],
    );
    classifierAnswer = { module: 'consult', confidence: 0.3 };
    conversationId = await receive(t.phoneNumberId, from, {
      type: 'text',
      text: { body: 'dúvida' },
    });
    const jobsBefore = outboundJobs.length;
    expect(
      await processConversationTurn(ctx, { tenantId: t.tenantId, conversationId }),
    ).toMatchObject({ decision: { action: 'ask_module' } });
    const [list] = await runSql<{
      payload: { outbound: { kind: string; sections: { rows: { id: string }[] }[] } };
    }>(s, `select payload from messages where id = $1`, [outboundJobs[jobsBefore]!.messageId]);
    expect(list!.payload.outbound.kind).toBe('list');
    expect(list!.payload.outbound.sections[0]!.rows.map((r) => r.id)).toEqual([
      'module:log',
      'module:consult',
      'module:adm',
    ]);

    await receive(t.phoneNumberId, from, {
      type: 'interactive',
      interactive: {
        type: 'list_reply',
        list_reply: { id: 'module:consult', title: 'Normas e qualidade' },
      },
    });
    expect(
      await processConversationTurn(ctx, { tenantId: t.tenantId, conversationId }),
    ).toMatchObject({
      decision: { action: 'agent', module: 'consult', reason: 'contact_choice' },
    });

    const calls = classifierCalls.length;
    await receive(t.phoneNumberId, from, { type: 'text', text: { body: 'e o POP de limpeza?' } });
    expect(
      await processConversationTurn(ctx, { tenantId: t.tenantId, conversationId }),
    ).toMatchObject({
      decision: { action: 'agent', module: 'consult', reason: 'sticky' },
    });
    expect(classifierCalls.length).toBe(calls);
  });

  it('expired conversation state is cleaned up (§4.10)', async () => {
    const { data, error } = await ctx.db.system.cleanupExpiredConversationState();
    expect(error).toBeNull();
    expect(data).toBeGreaterThanOrEqual(0);
  });
});
