import { COLLECTIONS } from '@nurion/shared';
import { executeAgent, outcomeOf, recordRun, type AgentRunDeps, type RunOutcome } from './engine';
import { costUsd } from './pricing';
import type { AgentDefinition, ChunkRef } from './types';

/** Generic agent used by "Testar a base" (S11): same search, same citation rule, no WhatsApp. */
export const KNOWLEDGE_TEST_AGENT: AgentDefinition = {
  key: 'knowledge.test',
  module: 'consult',
  systemPrompt: () =>
    'Um gestor da empresa está testando a base de conhecimento. Responda à pergunta como responderia a um colaborador, seguindo as regras acima, e use handoff_to_human quando a base não cobrir o assunto.',
  tools: [],
  knowledgeScopes: [...COLLECTIONS],
  requireCitation: true,
  maxTurns: 4,
};

export type KnowledgeTestResult = {
  runId: string;
  outcome: RunOutcome;
  /** Present when the agent answered (with the source lines). */
  answer?: string;
  /** Present when it would have handed off to a human. */
  handoffReason?: string;
  /** Every passage the search returned; `cited` marks the ones the answer relied on. */
  sources: (ChunkRef & { cited: boolean })[];
  costUsd: number;
  turns: number;
};

/**
 * Asks the base a question the way an agent would (ESCOPO §4.5 "Testar a base"). The run is audited
 * like any other (`ai_runs`, `ai_tool_calls`, `ai_citations`), with no conversation.
 */
export async function testKnowledge(
  ctx: AgentRunDeps,
  input: { tenantId: string; question: string; collections?: string[] },
): Promise<KnowledgeTestResult> {
  const tdb = ctx.db.withTenant(input.tenantId);
  const started = Date.now();
  const allowed = new Set<string>(COLLECTIONS);
  const scopes = (input.collections?.length ? input.collections : [...COLLECTIONS]).filter((c) =>
    allowed.has(c),
  );
  const agent: AgentDefinition = { ...KNOWLEDGE_TEST_AGENT, knowledgeScopes: scopes };
  const tenant = await ctx.db.system.getTenant(input.tenantId);
  const tz = (tenant?.settings as { timezone?: unknown } | null)?.timezone;

  const loop = await executeAgent(ctx, {
    agent,
    agentContext: {
      tenantName: tenant?.name ?? '',
      contactName: 'Gestor (teste da base)',
      contactKind: 'staff',
      module: 'consult',
      timezone: typeof tz === 'string' ? tz : 'America/Sao_Paulo',
      now: ctx.now?.() ?? new Date(),
    },
    history: [{ role: 'user', content: input.question.slice(0, 1000) }],
    toolCtx: {
      tdb,
      tenantId: input.tenantId,
      conversationId: null,
      contactId: null,
      contactKind: 'staff',
      module: 'consult',
      logger: ctx.logger.child({ tenant_id: input.tenantId, agent_key: agent.key }),
    },
  });

  const { terminal } = loop;
  const outcome = outcomeOf(terminal);
  const cost = costUsd(ctx.pricing, ctx.models.agent, loop.usage);
  const runId = await recordRun(tdb, {
    conversationId: null,
    messageId: null,
    agentKey: agent.key,
    model: ctx.models.agent,
    usage: loop.usage,
    cost,
    latencyMs: Date.now() - started,
    turns: loop.turns,
    outcome,
    handoffReason: terminal.type === 'handoff' ? terminal.reason : undefined,
    error: loop.errorText,
    calls: loop.calls,
    citations: terminal.type === 'reply' ? terminal.citations : [],
  });
  const cited = new Set(terminal.type === 'reply' ? terminal.citations.map((c) => c.chunkId) : []);
  return {
    runId,
    outcome,
    answer: terminal.type === 'reply' ? terminal.text : undefined,
    handoffReason: terminal.type === 'handoff' ? terminal.reason : undefined,
    sources: [...loop.retrieved.values()].map((c) => ({ ...c, cited: cited.has(c.chunkId) })),
    costUsd: cost,
    turns: loop.turns,
  };
}
