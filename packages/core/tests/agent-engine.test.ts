import { randomInt } from 'node:crypto';
import { createServiceDb } from '@nurion/db';
import { createTestTenant, findLocalStack, runSql, type LocalStack } from '@nurion/db/testing';
import { createLogger, createSecretBox } from '@nurion/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStaffClassifier,
  defineModule,
  GUARDRAILS,
  KnowledgeUnavailableError,
  testKnowledge,
  ModuleRegistry,
  parsePricing,
  runAgentTurn,
  type AgentDefinition,
  type AgentEngineContext,
  type AgentTurnInput,
  type ChunkRef,
  type OutboundJob,
} from '../src';
import { createFakeLlm, message, text, toolUse } from './fake-llm';

const stack = await findLocalStack('core agent engine');
const describeStack = stack ? describe : describe.skip;
const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');

const CHUNK_A = '11111111-1111-4111-8111-111111111111';
const CHUNK_B = '22222222-2222-4222-8222-222222222222';

const searchCalls: { query: string; collections: string[]; tenantId: string }[] = [];
let searchResult: ChunkRef[] | 'unavailable' = [
  {
    chunkId: CHUNK_A,
    title: 'POP-012',
    section: '4.2',
    version: '3',
    text: 'Manter entre 2 e 8 °C.',
  },
];

const agent: AgentDefinition = {
  key: 'test.agent',
  module: 'log',
  systemPrompt: (c) => `Você atende ${c.contactKind} da ${c.tenantName}.`,
  tools: [],
  knowledgeScopes: ['pop'],
  requireCitation: true,
  maxTurns: 4,
};

describeStack('agent engine against the local stack (Anthropic mocked)', () => {
  const s = stack as LocalStack;
  const tenants: Awaited<ReturnType<typeof createTestTenant>>[] = [];
  const outbound: OutboundJob[] = [];
  const fake = createFakeLlm();
  const registry = new ModuleRegistry().register(
    defineModule({ key: 'log', label: 'Log', agentFor: () => 'test.agent', agents: [agent] }),
  );
  let ctx: AgentEngineContext;

  beforeAll(() => {
    ctx = {
      db: createServiceDb({ url: s.url, serviceRoleKey: s.serviceKey }),
      secrets: createSecretBox({ key: Buffer.alloc(32, 7).toString('base64') }),
      graph: { version: 'v23.0' },
      logger: createLogger('agent-test', { level: 'silent' }),
      llm: fake.llm,
      models: { agent: 'test-model-agent', fast: 'test-model-fast', vision: 'test-model-vision' },
      pricing: parsePricing(
        '{"test-model-agent":{"input":2,"output":10,"cache_read":0.2},"test-model-fast":{"input":0.1,"output":0.5}}',
      ),
      registry,
      searchKnowledge: async (input) => {
        searchCalls.push({
          query: input.query,
          collections: input.collections,
          tenantId: input.tenantId,
        });
        if (searchResult === 'unavailable') throw new KnowledgeUnavailableError();
        return searchResult;
      },
      enqueueOutbound: async (job) => void outbound.push(job),
    };
  });
  afterAll(async () => {
    for (const t of tenants) await t.drop();
  });

  async function setup(agentKey: string | null = 'test.agent') {
    const tenant = await createTestTenant(s, ['log']);
    tenants.push(tenant);
    const [number] = await runSql<{ id: string }>(
      s,
      `insert into whatsapp_numbers (tenant_id, phone_number_id, waba_id, display_number, access_token_enc) values ($1, $2, '102290129340398', '+55 11 4002-8922', 'x') returning id`,
      [tenant.tenantId, digits(15)],
    );
    const [contact] = await runSql<{ id: string }>(
      s,
      `insert into contacts (tenant_id, wa_id, name, kind) values ($1, $2, 'João', 'driver') returning id`,
      [tenant.tenantId, `55119${digits(8)}`],
    );
    const [conv] = await runSql<{ id: string }>(
      s,
      `insert into conversations (tenant_id, contact_id, whatsapp_number_id, module, agent_key, last_inbound_at) values ($1, $2, $3, 'log', $4, now()) returning id`,
      [tenant.tenantId, contact!.id, number!.id, agentKey],
    );
    const ask = async (body: string): Promise<AgentTurnInput> => {
      const [m] = await runSql<{ id: string; created_at: string }>(
        s,
        `insert into messages (tenant_id, conversation_id, wamid, direction, type, text, status) values ($1, $2, $3, 'in', 'text', $4, 'received') returning id, created_at`,
        [tenant.tenantId, conv!.id, `wamid.${digits(20)}`, body],
      );
      return {
        tenantId: tenant.tenantId,
        conversationId: conv!.id,
        contactId: contact!.id,
        contactKind: 'driver',
        module: 'log',
        agentKey,
        messages: [{ id: m!.id, type: 'text', text: body, payload: {}, created_at: m!.created_at }],
      };
    };
    return { ...tenant, conversationId: conv!.id, ask };
  }

  const sentTexts = (conversationId: string) =>
    runSql<{ text: string; author: string }>(
      s,
      `select text, author from messages where conversation_id = $1 and direction = 'out' order by created_at`,
      [conversationId],
    );

  it('searches, replies with a citation, sends the source line and audits everything', async () => {
    const t = await setup();
    fake.script(
      message([toolUse('search_knowledge', { query: 'temperatura da vacina' })], {
        usage: { input_tokens: 2000, output_tokens: 50, cache_creation_input_tokens: 800 },
      }),
      message(
        [
          toolUse('reply', {
            kind: 'informative',
            text: 'Mantenha entre 2 e 8 °C.',
            chunk_ids: [CHUNK_A],
          }),
        ],
        { usage: { input_tokens: 300, output_tokens: 60, cache_read_input_tokens: 2800 } },
      ),
    );
    const before = fake.calls.length;
    const run = await runAgentTurn(ctx, await t.ask('Qual a temperatura da vacina?'));

    expect(run).toMatchObject({ outcome: 'answered', turns: 2 });
    expect(await sentTexts(t.conversationId)).toEqual([
      { text: 'Mantenha entre 2 e 8 °C.\n\n📄 Fonte: POP-012, 4.2 (v3)', author: 'ai' },
    ]);
    expect(outbound.at(-1)).toMatchObject({ tenantId: t.tenantId });

    // What the model received.
    const first = fake.calls[before]!;
    expect(first.model).toBe('test-model-agent');
    const system = first.system as { text: string; cache_control?: unknown }[];
    expect(system[0]!.text).toContain(GUARDRAILS);
    expect(system[0]!.text).toContain('Você atende driver da');
    expect(system[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(system[1]!.cache_control).toBeUndefined(); // volatile part stays after the breakpoint
    expect((first.tools as { name: string }[]).map((x) => x.name)).toEqual([
      'reply',
      'handoff_to_human',
      'get_contact_profile',
      'search_knowledge',
    ]);
    expect(first.messages).toEqual([{ role: 'user', content: 'Qual a temperatura da vacina?' }]);
    // Second call carries the tool result back.
    const second = fake.calls[before + 1]!.messages.at(-1) as {
      content: { type: string; tool_use_id: string }[];
    };
    expect(second.content[0]).toMatchObject({ type: 'tool_result' });

    // Audit trail.
    const [r] = await runSql<Record<string, unknown>>(
      s,
      `select agent_key, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd::float8 as cost_usd, turns, outcome, message_id is not null as has_message from ai_runs where id = $1`,
      [run.runId],
    );
    expect(r).toMatchObject({
      agent_key: 'test.agent',
      model: 'test-model-agent',
      input_tokens: 2300,
      output_tokens: 110,
      cache_read_tokens: 2800,
      cache_write_tokens: 800,
      turns: 2,
      outcome: 'answered',
      has_message: true,
    });
    // 2300*2 + 110*10 + 2800*0.2 + 800*2.5 per million
    expect(r!.cost_usd).toBeCloseTo((4600 + 1100 + 560 + 2000) / 1e6, 6);
    const calls = await runSql<{ tool: string; is_error: boolean }>(
      s,
      `select tool, is_error from ai_tool_calls where ai_run_id = $1 order by created_at, tool`,
      [run.runId],
    );
    expect(calls.map((c) => c.tool).sort()).toEqual(['reply', 'search_knowledge']);
    const cites = await runSql<{ chunk_id: string }>(
      s,
      `select chunk_id from ai_citations where ai_run_id = $1`,
      [run.runId],
    );
    expect(cites).toEqual([{ chunk_id: CHUNK_A }]);
  });

  it('discards an answer that cites a chunk the search did not return and hands off (no_citation)', async () => {
    const t = await setup();
    fake.script(
      message([toolUse('search_knowledge', { query: 'temperatura' })]),
      message([toolUse('reply', { kind: 'informative', text: 'É 5 °C.', chunk_ids: [CHUNK_B] })]),
    );
    const run = await runAgentTurn(ctx, await t.ask('Qual a temperatura?'));
    expect(run).toMatchObject({ outcome: 'handoff', handoffReason: 'no_citation' });
    const out = await sentTexts(t.conversationId);
    expect(out.map((o) => o.text)).toEqual([expect.stringContaining('pessoa da nossa equipe')]);
    expect(out.some((o) => o.text.includes('5 °C'))).toBe(false);
    const [h] = await runSql<{ reason: string; status: string }>(
      s,
      `select reason, status from handoffs where conversation_id = $1`,
      [t.conversationId],
    );
    expect(h).toEqual({ reason: 'no_citation', status: 'open' });
    expect(
      await runSql(s, `select 1 from ai_citations where tenant_id = $1`, [t.tenantId]),
    ).toHaveLength(0);
  });

  it('discards an informative answer given from memory, without any search', async () => {
    const t = await setup();
    fake.script(
      message([toolUse('reply', { kind: 'informative', text: 'Acho que é 5 °C.', chunk_ids: [] })]),
    );
    const run = await runAgentTurn(ctx, await t.ask('Qual a temperatura?'));
    expect(run).toMatchObject({ outcome: 'handoff', handoffReason: 'no_citation' });
    expect((await sentTexts(t.conversationId)).some((o) => o.text.includes('5 °C'))).toBe(false);
  });

  it('a reply in the same call as a search is rejected: the model must see the results first', async () => {
    const t = await setup();
    fake.script(
      message([
        toolUse('search_knowledge', { query: 'temperatura' }, 'toolu_s'),
        toolUse('reply', { kind: 'informative', text: 'Chute.', chunk_ids: [CHUNK_A] }, 'toolu_r'),
      ]),
      message([
        toolUse('reply', { kind: 'informative', text: 'Entre 2 e 8 °C.', chunk_ids: [CHUNK_A] }),
      ]),
    );
    const before = fake.calls.length;
    const run = await runAgentTurn(ctx, await t.ask('Temperatura?'));
    expect(run.outcome).toBe('answered');
    const results = (
      fake.calls[before + 1]!.messages.at(-1) as {
        content: { tool_use_id: string; is_error?: boolean }[];
      }
    ).content;
    expect(results.find((r) => r.tool_use_id === 'toolu_r')).toMatchObject({ is_error: true });
    expect((await sentTexts(t.conversationId))[0]!.text).toContain('Entre 2 e 8 °C.');
    expect((await sentTexts(t.conversationId))[0]!.text).not.toContain('Chute');
  });

  it('operational and clarification replies need no citation', async () => {
    const t = await setup();
    fake.script(
      message([toolUse('reply', { kind: 'clarification', text: 'Qual o número da entrega?' })]),
    );
    const run = await runAgentTurn(ctx, await t.ask('Cheguei'));
    expect(run.outcome).toBe('answered');
    expect((await sentTexts(t.conversationId))[0]!.text).toBe('Qual o número da entrega?');
  });

  it('plain text is never sent: one nudge, then a handoff (ai_error)', async () => {
    const t = await setup();
    fake.script(message([text('Oi! Posso ajudar.')]), message([text('Como posso ajudar?')]));
    const run = await runAgentTurn(ctx, await t.ask('oi'));
    expect(run).toMatchObject({ outcome: 'error', handoffReason: 'ai_error', turns: 2 });
    const out = await sentTexts(t.conversationId);
    expect(out.some((o) => o.text.includes('Posso ajudar'))).toBe(false);

    const t2 = await setup();
    fake.script(
      message([text('Olá')]),
      message([toolUse('reply', { kind: 'clarification', text: 'Em que posso ajudar?' })]),
    );
    expect((await runAgentTurn(ctx, await t2.ask('oi'))).outcome).toBe('answered');
  });

  it('stops at maxTurns and hands off', async () => {
    const t = await setup();
    fake.script(
      ...Array.from({ length: 4 }, () =>
        message([toolUse('search_knowledge', { query: 'temperatura' })]),
      ),
    );
    const run = await runAgentTurn(ctx, await t.ask('?'));
    expect(run).toMatchObject({ outcome: 'handoff', handoffReason: 'max_turns', turns: 4 });
    expect(fake.remaining()).toBe(0);
  });

  it('invalid tool arguments go back to the model as an error and it can recover', async () => {
    const t = await setup();
    fake.script(
      message([toolUse('search_knowledge', { query: 42 })]),
      message([toolUse('reply', { kind: 'clarification', text: 'Pode repetir?' })]),
    );
    const run = await runAgentTurn(ctx, await t.ask('?'));
    expect(run.outcome).toBe('answered');
    const calls = await runSql<{ tool: string; is_error: boolean; result_summary: string }>(
      s,
      `select tool, is_error, result_summary from ai_tool_calls where ai_run_id = $1 order by tool`,
      [run.runId],
    );
    expect(calls.find((c) => c.tool === 'search_knowledge')).toMatchObject({
      is_error: true,
      result_summary: 'invalid arguments',
    });
  });

  it('handoff_to_human opens the handoff with the summary and tells the contact', async () => {
    const t = await setup();
    fake.script(
      message([
        toolUse('handoff_to_human', { reason: 'urgency', summary: 'Motorista relata baú aberto.' }),
      ]),
    );
    const run = await runAgentTurn(ctx, await t.ask('o baú abriu!'));
    expect(run).toMatchObject({ outcome: 'handoff', handoffReason: 'urgency' });
    const [h] = await runSql<{ reason: string; summary: string; opened_by: string }>(
      s,
      `select reason, summary, opened_by from handoffs where conversation_id = $1`,
      [t.conversationId],
    );
    expect(h).toEqual({
      reason: 'urgency',
      summary: 'Motorista relata baú aberto.',
      opened_by: 'ai',
    });
    expect(await sentTexts(t.conversationId)).toHaveLength(1);
  });

  it('a model error or refusal becomes a handoff with outcome error, and is audited', async () => {
    const t = await setup();
    fake.script(new Error('upstream 529'));
    const run = await runAgentTurn(ctx, await t.ask('oi'));
    expect(run).toMatchObject({ outcome: 'error', handoffReason: 'ai_error' });
    const [r] = await runSql<{ error: string; outcome: string }>(
      s,
      `select error, outcome from ai_runs where id = $1`,
      [run.runId],
    );
    expect(r).toEqual({ error: 'upstream 529', outcome: 'error' });

    const t2 = await setup();
    fake.script(message([], { stop: 'refusal' }));
    expect(await runAgentTurn(ctx, await t2.ask('oi'))).toMatchObject({
      outcome: 'error',
      handoffReason: 'ai_error',
    });
  });

  it('without an agent definition the conversation goes to a human', async () => {
    const t = await setup(null);
    const run = await runAgentTurn(ctx, await t.ask('oi'));
    expect(run).toMatchObject({ outcome: 'handoff', handoffReason: 'other', turns: 0 });
    const [r] = await runSql<{ model: string; input_tokens: number }>(
      s,
      `select model, input_tokens from ai_runs where id = $1`,
      [run.runId],
    );
    expect(r).toEqual({ model: 'none', input_tokens: 0 });
  });

  it('keeps history and never sends another tenant’s data: tools run with the tenant scope', async () => {
    const t = await setup();
    const input = await t.ask('Preciso do meu nome');
    fake.script(
      message([toolUse('get_contact_profile', {})]),
      message([toolUse('reply', { kind: 'operational', text: 'Oi, João!' })]),
    );
    const before = fake.calls.length;
    await runAgentTurn(ctx, input);
    const toolResult = (
      fake.calls[before + 1]!.messages.at(-1) as { content: { content: string }[] }
    ).content[0]!.content;
    expect(JSON.parse(toolResult)).toEqual({ name: 'João', kind: 'driver' });
    expect(toolResult).not.toMatch(/\d{10}/); // no phone number
  });

  it('search_knowledge is scoped to the agent collections and the tenant', async () => {
    const t = await setup();
    searchCalls.length = 0;
    fake.script(
      message([toolUse('search_knowledge', { query: 'temperatura da vacina' })]),
      message([
        toolUse('reply', { kind: 'informative', text: 'Entre 2 e 8 °C.', chunk_ids: [CHUNK_A] }),
      ]),
    );
    await runAgentTurn(ctx, await t.ask('Qual a temperatura?'));
    expect(searchCalls).toEqual([
      { query: 'temperatura da vacina', collections: ['pop'], tenantId: t.tenantId },
    ]);
  });

  it('an empty search ends in a human handoff and records the unanswered question (S12)', async () => {
    const t = await setup();
    const saved = searchResult;
    searchResult = [];
    try {
      fake.script(
        message([toolUse('search_knowledge', { query: 'prazo de validade do reagente' })]),
        message([
          toolUse('handoff_to_human', {
            reason: 'no_knowledge',
            summary: 'Sem base sobre reagentes.',
          }),
        ]),
      );
      const before = fake.calls.length;
      const run = await runAgentTurn(ctx, await t.ask('Qual o prazo de validade do reagente?'));
      expect(run).toMatchObject({ outcome: 'handoff', handoffReason: 'no_knowledge' });
      const result = (fake.calls[before + 1]!.messages.at(-1) as { content: { content: string }[] })
        .content[0]!.content;
      expect(JSON.parse(result)).toMatchObject({
        results: [],
        note: expect.stringContaining('handoff_to_human'),
      });
      const gaps = await runSql<{
        question: string;
        reason: string;
        status: string;
        agent_key: string;
      }>(s, `select question, reason, status, agent_key from knowledge_gaps where tenant_id = $1`, [
        t.tenantId,
      ]);
      expect(gaps).toEqual([
        {
          question: 'Qual o prazo de validade do reagente?',
          reason: 'no_knowledge',
          status: 'open',
          agent_key: 'test.agent',
        },
      ]);
    } finally {
      searchResult = saved;
    }
  });

  it('a discarded answer (no_citation) is a gap too; a plain handoff for urgency is not', async () => {
    const t = await setup();
    fake.script(
      message([toolUse('reply', { kind: 'informative', text: 'Acho que é 5 °C.', chunk_ids: [] })]),
    );
    await runAgentTurn(ctx, await t.ask('Qual a temperatura?'));
    const gaps = await runSql<{ reason: string }>(
      s,
      `select reason from knowledge_gaps where tenant_id = $1`,
      [t.tenantId],
    );
    expect(gaps).toEqual([{ reason: 'no_citation' }]);

    const t2 = await setup();
    fake.script(message([toolUse('handoff_to_human', { reason: 'urgency', summary: 'Urgente' })]));
    await runAgentTurn(ctx, await t2.ask('socorro'));
    expect(
      await runSql(s, `select 1 from knowledge_gaps where tenant_id = $1`, [t2.tenantId]),
    ).toHaveLength(0);
  });

  it('no base configured: the tool says so and the agent hands off instead of guessing', async () => {
    const t = await setup();
    const saved = searchResult;
    searchResult = 'unavailable';
    try {
      fake.script(
        message([toolUse('search_knowledge', { query: 'qualquer coisa' })]),
        message([
          toolUse('handoff_to_human', { reason: 'no_knowledge', summary: 'Base indisponível.' }),
        ]),
      );
      const before = fake.calls.length;
      const run = await runAgentTurn(ctx, await t.ask('Qual a regra?'));
      expect(run.handoffReason).toBe('no_knowledge');
      const result = (fake.calls[before + 1]!.messages.at(-1) as { content: { content: string }[] })
        .content[0]!.content;
      expect(JSON.parse(result)).toMatchObject({
        results: [],
        error: expect.stringContaining('indisponível'),
      });
    } finally {
      searchResult = saved;
    }
  });

  it('"Testar a base": same search and citation rule, audited without a conversation', async () => {
    const t = await setup();
    searchCalls.length = 0;
    fake.script(
      message([toolUse('search_knowledge', { query: 'temperatura da câmara' })]),
      message([
        toolUse('reply', { kind: 'informative', text: 'Entre 2 e 8 °C.', chunk_ids: [CHUNK_A] }),
      ]),
    );
    const result = await testKnowledge(ctx, {
      tenantId: t.tenantId,
      question: 'Qual a temperatura da câmara?',
      collections: ['pop', 'receita'],
    });
    expect(result).toMatchObject({ outcome: 'answered', turns: 2 });
    expect(result.answer).toContain('📄 Fonte: POP-012, 4.2 (v3)');
    expect(result.sources).toEqual([
      expect.objectContaining({ chunkId: CHUNK_A, cited: true, text: 'Manter entre 2 e 8 °C.' }),
    ]);
    expect(searchCalls[0]!.collections).toEqual(['pop']); // unknown collections are dropped
    const [r] = await runSql<{
      agent_key: string;
      conversation_id: string | null;
      outcome: string;
    }>(s, `select agent_key, conversation_id, outcome from ai_runs where id = $1`, [result.runId]);
    expect(r).toEqual({ agent_key: 'knowledge.test', conversation_id: null, outcome: 'answered' });
    expect(
      await runSql(s, `select 1 from ai_citations where ai_run_id = $1`, [result.runId]),
    ).toHaveLength(1);
    // A test that finds nothing is not recorded as a gap of a conversation.
    fake.script(message([toolUse('handoff_to_human', { reason: 'no_knowledge', summary: 'x' })]));
    const none = await testKnowledge(ctx, { tenantId: t.tenantId, question: 'Algo fora da base?' });
    expect(none).toMatchObject({
      outcome: 'handoff',
      handoffReason: 'no_knowledge',
      answer: undefined,
    });
    expect(
      await runSql(s, `select 1 from knowledge_gaps where tenant_id = $1`, [t.tenantId]),
    ).toHaveLength(0);
  });
});

describeStack('staff classifier (fast model, structured output)', () => {
  const s = stack as LocalStack;
  const fake = createFakeLlm();
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;
  let conversationId: string;
  let classify: ReturnType<typeof createStaffClassifier>;

  beforeAll(async () => {
    tenant = await createTestTenant(s, ['log', 'consult']);
    const [number] = await runSql<{ id: string }>(
      s,
      `insert into whatsapp_numbers (tenant_id, phone_number_id, waba_id, display_number, access_token_enc) values ($1, $2, '102290129340398', '+55 11 4002-8922', 'x') returning id`,
      [tenant.tenantId, digits(15)],
    );
    const [contact] = await runSql<{ id: string }>(
      s,
      `insert into contacts (tenant_id, wa_id, kind) values ($1, $2, 'staff') returning id`,
      [tenant.tenantId, `55119${digits(8)}`],
    );
    const [conv] = await runSql<{ id: string }>(
      s,
      `insert into conversations (tenant_id, contact_id, whatsapp_number_id) values ($1, $2, $3) returning id`,
      [tenant.tenantId, contact!.id, number!.id],
    );
    conversationId = conv!.id;
    classify = createStaffClassifier({
      llm: fake.llm,
      model: 'test-model-fast',
      pricing: parsePricing('{"test-model-fast":{"input":0.1,"output":0.5}}'),
      db: createServiceDb({ url: s.url, serviceRoleKey: s.serviceKey }),
      logger: createLogger('classifier-test', { level: 'silent' }),
    });
  });
  afterAll(async () => tenant?.drop());

  const ask = (modules: ('log' | 'consult')[] = ['log', 'consult']) =>
    classify({
      tenantId: tenant.tenantId,
      conversationId,
      text: 'Como faço a NC da câmara fria?',
      modules,
    });
  const answer = (json: string) =>
    message([text(json)], { usage: { input_tokens: 400, output_tokens: 20 } });

  it('returns the validated module and confidence, using the fast model and a JSON schema', async () => {
    fake.script(answer('{"module":"consult","confidence":0.93}'));
    expect(await ask()).toEqual({ module: 'consult', confidence: 0.93 });
    const call = fake.calls.at(-1)!;
    expect(call.model).toBe('test-model-fast');
    expect(call.output_config?.format).toMatchObject({
      type: 'json_schema',
      schema: {
        properties: { module: { enum: ['log', 'consult', 'none'] } },
        additionalProperties: false,
      },
    });
    const runs = await runSql<{
      agent_key: string;
      model: string;
      outcome: string;
      input_tokens: number;
    }>(s, `select agent_key, model, outcome, input_tokens from ai_runs where tenant_id = $1`, [
      tenant.tenantId,
    ]);
    expect(runs.at(-1)).toEqual({
      agent_key: 'router.staff_classifier',
      model: 'test-model-fast',
      outcome: 'answered',
      input_tokens: 400,
    });
  });

  it('says "none" or an unavailable module → null; the router then asks with a list', async () => {
    fake.script(
      answer('{"module":"none","confidence":0.2}'),
      answer('{"module":"adm","confidence":0.99}'),
    );
    expect(await ask()).toBeNull();
    expect(await ask()).toBeNull();
  });

  it('invalid output is rejected by zod, returns null and is audited as an error', async () => {
    fake.script(answer('not json'), answer('{"module":"log","confidence":7}'));
    expect(await ask()).toBeNull();
    expect(await ask()).toBeNull();
    const runs = await runSql<{ outcome: string }>(
      s,
      `select outcome from ai_runs where tenant_id = $1 and outcome = 'error'`,
      [tenant.tenantId],
    );
    expect(runs.length).toBeGreaterThanOrEqual(2);
  });
});
