import type Anthropic from '@anthropic-ai/sdk';
import type { TenantDb } from '@nurion/db';
import { contactKindSchema } from '@nurion/shared';
import { z } from 'zod';
import type { ChannelContext } from '../channel/context';
import { queueOutboundMessage, type EnqueueOutbound } from '../channel/outbound';
import type { AgentTurnInput } from '../conversation/turn';
import { openHandoff, type HandoffReason } from '../handoff/handoff';
import { coreMessages } from '../messages.pt-BR';
import type { ModuleRegistry } from '../modules';
import { GUARDRAILS } from './guardrails';
import { usageOf, type LlmClient, type ModelNames } from './llm';
import { addUsage, costUsd, emptyUsage, type Pricing, type Usage } from './pricing';
import { CORE_TOOLS } from './tools';
import type {
  AgentContext,
  AgentDefinition,
  ChunkRef,
  Terminal,
  ToolContext,
  ToolDefinition,
} from './types';

export type AgentEngineContext = ChannelContext & {
  llm: LlmClient;
  models: ModelNames;
  pricing: Pricing;
  registry: ModuleRegistry;
  enqueueOutbound: EnqueueOutbound;
  /** Messages of the conversation sent to the model (default 20). */
  historyLimit?: number;
};

export type RunOutcome = 'answered' | 'handoff' | 'error';

export type RunSummary = {
  runId: string;
  outcome: RunOutcome;
  turns: number;
  handoffReason?: HandoffReason;
  costUsd: number;
  usage: Usage;
};

const MAX_TOKENS = 8000;
const NO_REPLY_NUDGE =
  'Você ainda não respondeu. Use a ferramenta reply para enviar a resposta ao contato ou handoff_to_human para encaminhar a uma pessoa. Texto fora dessas ferramentas não é enviado.';

type ToolCallRecord = {
  tool: string;
  args: unknown;
  summary: string;
  isError: boolean;
  durationMs: number;
};

/** JSON Schema the model sees, generated from the same zod schema that validates the call. */
function apiTool(tool: ToolDefinition): Anthropic.Tool {
  const schema = z.toJSONSchema(tool.input, { io: 'input' }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: schema as Anthropic.Tool.InputSchema,
  };
}

export function toolsFor(agent: AgentDefinition): ToolDefinition[] {
  const tools = [...CORE_TOOLS, ...agent.tools];
  const names = new Set<string>();
  for (const t of tools) {
    if (names.has(t.name)) throw new Error(`Agent ${agent.key}: duplicate tool ${t.name}`);
    names.add(t.name);
  }
  return tools;
}

const TYPE_PLACEHOLDER: Record<string, string> = {
  audio: 'áudio',
  image: 'imagem',
  document: 'documento',
  video: 'vídeo',
  sticker: 'figurinha',
  location: 'localização',
};

type HistoryRow = {
  direction: string;
  type: string;
  text: string | null;
  transcription: string | null;
};

/** Conversation → alternating-safe message list. The model gets text only (data minimisation). */
export function buildHistory(rows: HistoryRow[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  for (const row of rows) {
    const role = row.direction === 'in' ? 'user' : 'assistant';
    const body = row.text?.trim() || row.transcription?.trim();
    const content =
      body ||
      (role === 'user'
        ? `[O contato enviou ${TYPE_PLACEHOLDER[row.type] ?? 'uma mensagem sem texto'}]`
        : '');
    if (!content) continue;
    const last = messages[messages.length - 1];
    if (last && last.role === role && typeof last.content === 'string') {
      last.content = `${last.content}\n${content}`;
    } else {
      messages.push({ role, content });
    }
  }
  while (messages[0]?.role === 'assistant') messages.shift();
  return messages;
}

function systemBlocks(agent: AgentDefinition, context: AgentContext): Anthropic.TextBlockParam[] {
  return [
    // Stable across conversations of this agent: the cache breakpoint sits here (tools + this block).
    {
      type: 'text',
      text: `${GUARDRAILS}\n\n${agent.systemPrompt(context)}`,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: [
        `Empresa: ${context.tenantName}`,
        `Contato: ${context.contactName ?? 'nome não informado'} (${context.contactKind})`,
        `Agora: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: context.timezone }).format(context.now)}`,
      ].join('\n'),
    },
  ];
}

async function runTool(
  tool: ToolDefinition | undefined,
  rawArgs: unknown,
  toolCtx: ToolContext,
): Promise<{
  block: { content: string; isError: boolean };
  record: ToolCallRecord;
  chunks: ChunkRef[];
  terminal?: Terminal;
}> {
  const started = Date.now();
  const done = (
    content: unknown,
    isError: boolean,
    summary: string,
    extra: { chunks?: ChunkRef[]; terminal?: Terminal } = {},
  ) => ({
    block: { content: JSON.stringify(content), isError },
    record: {
      tool: tool?.name ?? 'unknown',
      args: rawArgs,
      summary,
      isError,
      durationMs: Date.now() - started,
    },
    chunks: extra.chunks ?? [],
    terminal: extra.terminal,
  });
  if (!tool) return done({ error: 'ferramenta desconhecida' }, true, 'unknown tool');
  const parsed = tool.input.safeParse(rawArgs);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
      .join('; ');
    return done({ error: `argumentos inválidos: ${message}` }, true, 'invalid arguments');
  }
  try {
    const result = await tool.run(parsed.data, toolCtx);
    return done(result.content, false, tool.summarize(parsed.data, result), {
      chunks: result.chunks,
      terminal: result.terminal,
    });
  } catch (err) {
    toolCtx.logger.error(
      {
        err,
        tenant_id: toolCtx.tenantId,
        conversation_id: toolCtx.conversationId,
        tool: tool.name,
      },
      'tool failed',
    );
    return done({ error: 'falha ao executar a ferramenta' }, true, 'tool error');
  }
}

async function loadContext(tdb: TenantDb, ctx: AgentEngineContext, input: AgentTurnInput) {
  const [tenant, contact, history] = await Promise.all([
    ctx.db.system.getTenant(input.tenantId),
    tdb.from('contacts').select('name, profile_name').eq('id', input.contactId).single(),
    tdb
      .from('messages')
      .select('direction, type, text, transcription')
      .eq('conversation_id', input.conversationId)
      .neq('status', 'failed')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(ctx.historyLimit ?? 20),
  ]);
  if (contact.error) throw new Error(contact.error.message);
  if (history.error) throw new Error(history.error.message);
  const settings = (tenant?.settings ?? {}) as { timezone?: unknown };
  return {
    tenantName: tenant?.name ?? '',
    timezone: typeof settings.timezone === 'string' ? settings.timezone : 'America/Sao_Paulo',
    contactName: contact.data.name ?? contact.data.profile_name ?? null,
    history: buildHistory([...history.data].reverse()),
  };
}

/**
 * One agent run for a conversation turn (ESCOPO §4.4): context → model with tools → execute tools
 * → repeat until `reply`/`handoff_to_human` or `maxTurns` → audit → send.
 *
 * The only way text reaches the contact is the `reply` tool, after the citation check (ADR-0006).
 * Anything else (refusal, no reply, too many turns, model errors) ends in a human handoff.
 */
export async function runAgentTurn(
  ctx: AgentEngineContext,
  input: AgentTurnInput,
): Promise<RunSummary> {
  const tdb = ctx.db.withTenant(input.tenantId);
  const log = ctx.logger.child({
    tenant_id: input.tenantId,
    conversation_id: input.conversationId,
    agent_key: input.agentKey,
  });
  const started = Date.now();
  const usage = emptyUsage();
  const calls: ToolCallRecord[] = [];
  const retrieved = new Map<string, ChunkRef>();
  let turns = 0;
  let terminal: Terminal | undefined;
  let errorText: string | undefined;

  const agent = input.agentKey ? ctx.registry.agent(input.agentKey) : undefined;
  if (!agent) {
    log.warn('no agent definition for this conversation: handing off to a human');
    terminal = {
      type: 'handoff',
      reason: 'other',
      summary: 'Nenhum agente configurado para este caso.',
    };
  } else {
    try {
      const loaded = await loadContext(tdb, ctx, input);
      const agentContext: AgentContext = {
        tenantName: loaded.tenantName,
        contactName: loaded.contactName,
        contactKind: contactKindSchema.catch('unknown').parse(input.contactKind),
        module: input.module,
        timezone: loaded.timezone,
        now: ctx.now?.() ?? new Date(),
      };
      const tools = toolsFor(agent);
      const apiTools = tools.map(apiTool);
      const system = systemBlocks(agent, agentContext);
      const messages = loaded.history;
      const toolCtx: ToolContext = {
        tdb,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        contactId: input.contactId,
        contactKind: input.contactKind,
        module: input.module,
        agent,
        retrieved,
        logger: log,
      };
      let nudged = false;

      while (!terminal) {
        if (turns >= agent.maxTurns) {
          terminal = {
            type: 'handoff',
            reason: 'max_turns',
            summary: 'O agente atingiu o limite de passos.',
          };
          break;
        }
        turns += 1;
        const response = await ctx.llm.create({
          model: ctx.models.agent,
          max_tokens: MAX_TOKENS,
          system,
          tools: apiTools,
          messages,
        });
        addUsage(usage, usageOf(response));

        if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
          log.warn({ stop_reason: response.stop_reason }, 'model stopped without an answer');
          errorText = `stop_reason ${response.stop_reason}`;
          terminal = {
            type: 'handoff',
            reason: 'ai_error',
            summary: 'O modelo não conseguiu responder.',
          };
          break;
        }
        messages.push({ role: 'assistant', content: response.content });
        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );
        if (!toolUses.length) {
          if (nudged) {
            errorText = 'no reply tool call';
            terminal = {
              type: 'handoff',
              reason: 'ai_error',
              summary: 'O modelo não usou a ferramenta de resposta.',
            };
          } else {
            nudged = true;
            messages.push({ role: 'user', content: NO_REPLY_NUDGE });
          }
          continue;
        }

        const alone = toolUses.length === 1;
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const use of toolUses) {
          // A reply written in the same breath as a search cannot have used its results.
          const tool =
            use.name === 'reply' && !alone ? undefined : tools.find((t) => t.name === use.name);
          const run =
            use.name === 'reply' && !alone
              ? {
                  block: {
                    content: JSON.stringify({
                      error:
                        'Chame reply sozinha, depois de ver os resultados das outras ferramentas.',
                    }),
                    isError: true,
                  },
                  record: {
                    tool: 'reply',
                    args: use.input,
                    summary: 'rejected: not alone',
                    isError: true,
                    durationMs: 0,
                  },
                  chunks: [] as ChunkRef[],
                  terminal: undefined,
                }
              : await runTool(tool, use.input, { ...toolCtx, retrieved });
          calls.push(run.record);
          for (const chunk of run.chunks) retrieved.set(chunk.chunkId, chunk);
          if (run.terminal && !terminal) terminal = run.terminal;
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: run.block.content,
            is_error: run.block.isError || undefined,
          });
        }
        messages.push({ role: 'user', content: results });
      }
    } catch (err) {
      log.error({ err }, 'agent run failed');
      errorText = err instanceof Error ? err.message : String(err);
      terminal = {
        type: 'handoff',
        reason: 'ai_error',
        summary: 'Erro técnico ao processar a mensagem.',
      };
    }
  }

  if (!terminal) throw new Error('unreachable: run ended without a terminal state');
  const outcome: RunOutcome =
    terminal.type === 'reply' ? 'answered' : terminal.reason === 'ai_error' ? 'error' : 'handoff';

  const cost = costUsd(ctx.pricing, ctx.models.agent, usage);
  const runId = await recordRun(tdb, {
    input,
    model: agent ? ctx.models.agent : 'none',
    usage,
    cost,
    latencyMs: Date.now() - started,
    turns,
    outcome,
    handoffReason: terminal.type === 'handoff' ? terminal.reason : undefined,
    error: errorText,
    calls,
    citations: terminal.type === 'reply' ? terminal.citations : [],
  });

  // Side effects after the audit trail is written: a failed audit never leaves an unaudited answer.
  if (terminal.type === 'reply') {
    await queueOutboundMessage(tdb, ctx.enqueueOutbound, {
      conversationId: input.conversationId,
      author: 'ai',
      content: { kind: 'text', text: terminal.text },
    });
  } else {
    const { created } = await openHandoff(tdb, {
      conversationId: input.conversationId,
      reason: terminal.reason,
      summary: terminal.summary,
      openedBy: 'ai',
    });
    if (created) {
      await queueOutboundMessage(tdb, ctx.enqueueOutbound, {
        conversationId: input.conversationId,
        author: 'system',
        content: { kind: 'text', text: coreMessages.handoff },
      });
    }
  }

  log.info({ run_id: runId, outcome, turns, cost_usd: cost }, 'agent run finished');
  return {
    runId,
    outcome,
    turns,
    handoffReason: terminal.type === 'handoff' ? terminal.reason : undefined,
    costUsd: cost,
    usage,
  };
}

/** ESCOPO §4.8: ai_runs + ai_tool_calls + ai_citations. */
async function recordRun(
  tdb: TenantDb,
  run: {
    input: AgentTurnInput;
    model: string;
    usage: Usage;
    cost: number;
    latencyMs: number;
    turns: number;
    outcome: RunOutcome;
    handoffReason?: HandoffReason;
    error?: string;
    calls: ToolCallRecord[];
    citations: ChunkRef[];
  },
): Promise<string> {
  const { data, error } = await tdb
    .from('ai_runs')
    .insert({
      tenant_id: tdb.tenantId,
      conversation_id: run.input.conversationId,
      message_id: run.input.messages.at(-1)?.id ?? null,
      agent_key: run.input.agentKey ?? 'none',
      model: run.model,
      input_tokens: run.usage.inputTokens,
      output_tokens: run.usage.outputTokens,
      cache_read_tokens: run.usage.cacheReadTokens,
      cache_write_tokens: run.usage.cacheWriteTokens,
      cost_usd: run.cost,
      latency_ms: run.latencyMs,
      turns: run.turns,
      outcome: run.outcome,
      handoff_reason: run.handoffReason ?? null,
      error: run.error ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`record ai_run: ${error.message}`);

  if (run.calls.length) {
    const inserted = await tdb.from('ai_tool_calls').insert(
      run.calls.map((c) => ({
        tenant_id: tdb.tenantId,
        ai_run_id: data.id,
        tool: c.tool,
        args: (c.args ?? {}) as never,
        result_summary: c.summary,
        is_error: c.isError,
        duration_ms: c.durationMs,
      })),
    );
    if (inserted.error) throw new Error(`record ai_tool_calls: ${inserted.error.message}`);
  }
  if (run.citations.length) {
    const inserted = await tdb.from('ai_citations').insert(
      run.citations.map((c) => ({
        tenant_id: tdb.tenantId,
        ai_run_id: data.id,
        chunk_id: c.chunkId,
        document_version_id: c.documentVersionId ?? null,
      })),
    );
    if (inserted.error) throw new Error(`record ai_citations: ${inserted.error.message}`);
  }
  return data.id;
}
