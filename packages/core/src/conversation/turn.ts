import {
  contactKindSchema,
  moduleKeySchema,
  type ContactKind,
  type ModuleKey,
} from '@nurion/shared';
import type { ChannelContext } from '../channel/context';
import { queueOutboundMessage, type EnqueueOutbound } from '../channel/outbound';
import { hasOpenHandoff, openHandoff } from '../handoff/handoff';
import { coreMessages } from '../messages.pt-BR';
import type { ModuleRegistry } from '../modules';
import { routeConversation, type RouteDecision } from './router';

export type TurnJob = { tenantId: string; conversationId: string };

export type TurnMessage = {
  id: string;
  type: string;
  text: string | null;
  payload: unknown;
  created_at: string;
};

/** What an agent receives for one turn (the agent engine plugs in here in build step 1.6). */
export type AgentTurnInput = {
  tenantId: string;
  conversationId: string;
  contactId: string;
  contactKind: ContactKind;
  module: ModuleKey;
  agentKey: string | null;
  messages: TurnMessage[];
};

export type StaffIntentClassifier = (input: {
  tenantId: string;
  conversationId: string;
  text: string;
  modules: ModuleKey[];
}) => Promise<{ module: ModuleKey; confidence: number } | null>;

export type TurnContext = ChannelContext & {
  registry: ModuleRegistry;
  enqueueOutbound: EnqueueOutbound;
  classifyStaffIntent?: StaffIntentClassifier;
  runAgent?: (input: AgentTurnInput) => Promise<unknown>;
  /** How long a conversation keeps its module before routing again (default 2 h). */
  stickyMinutes?: number;
};

export type TurnResult =
  | { status: 'idle' }
  | { status: 'routed'; decision: RouteDecision; messages: number };

const MODULE_CHOICE = /^module:(log|labs|consult|adm)$/;

/**
 * One agent turn for a conversation (job of `conversation-turns`, at most one per conversation at a
 * time — ADR-0008). Takes every inbound message not yet processed, decides who answers (§4.3) and
 * acts: human inbox, ask which module, identification + human, or hand the turn to the agent.
 */
export async function processConversationTurn(ctx: TurnContext, job: TurnJob): Promise<TurnResult> {
  const tdb = ctx.db.withTenant(job.tenantId);
  const now = ctx.now?.() ?? new Date();

  const { data: conversation, error } = await tdb
    .from('conversations')
    .select(
      'id, module, state, state_expires_at, contact:contacts(id, kind, anonymized_at), number:whatsapp_numbers(default_module)',
    )
    .eq('id', job.conversationId)
    .single();
  if (error) throw new Error(error.message);

  const { data: pending, error: pendingError } = await tdb
    .from('messages')
    .select('id, type, text, payload, created_at')
    .eq('conversation_id', job.conversationId)
    .eq('direction', 'in')
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(50);
  if (pendingError) throw new Error(pendingError.message);
  if (!pending.length) return { status: 'idle' };

  const markProcessed = async () => {
    const update = await tdb
      .from('messages')
      .update({ processed_at: now.toISOString() })
      .in(
        'id',
        pending.map((m) => m.id),
      );
    if (update.error) throw new Error(update.error.message);
  };

  const contact = conversation.contact;
  if (!contact || contact.anonymized_at) {
    await markProcessed();
    return { status: 'idle' };
  }

  const { data: modules, error: modulesError } = await tdb
    .from('tenant_modules')
    .select('module')
    .eq('enabled', true);
  if (modulesError) throw new Error(modulesError.message);
  const enabledModules = modules
    .map((m) => moduleKeySchema.safeParse(m.module))
    .filter((r) => r.success)
    .map((r) => r.data);

  const contactKind = contactKindSchema.catch('unknown').parse(contact.kind);
  const stateAlive =
    conversation.state_expires_at !== null && new Date(conversation.state_expires_at) > now;
  const choice = [...pending]
    .reverse()
    .map((m) => (m.payload as { reply?: { id?: string } } | null)?.reply?.id ?? '')
    .map((id) => MODULE_CHOICE.exec(id)?.[1])
    .find(Boolean);

  const input = {
    contactKind,
    enabledModules,
    numberDefaultModule: moduleKeySchema
      .nullable()
      .catch(null)
      .parse(conversation.number?.default_module ?? null),
    stickyModule: stateAlive
      ? moduleKeySchema.nullable().catch(null).parse(conversation.module)
      : null,
    handoffOpen: await hasOpenHandoff(tdb, job.conversationId),
    moduleChoice: (choice as ModuleKey | undefined) ?? null,
  };
  let decision = routeConversation(input);
  if (decision.action === 'classify') {
    const text = pending
      .map((m) => m.text ?? '')
      .filter(Boolean)
      .join('\n');
    const intent =
      ctx.classifyStaffIntent && text
        ? await ctx
            .classifyStaffIntent({
              tenantId: job.tenantId,
              conversationId: job.conversationId,
              text,
              modules: decision.candidates,
            })
            .catch((err: unknown) => {
              ctx.logger.warn(
                { err, tenant_id: job.tenantId, conversation_id: job.conversationId },
                'staff classifier failed',
              );
              return null;
            })
        : null;
    decision = routeConversation({ ...input, staffIntent: intent });
  }

  const log = ctx.logger.child({ tenant_id: job.tenantId, conversation_id: job.conversationId });
  const say = (content: Parameters<typeof queueOutboundMessage>[2]['content']) =>
    queueOutboundMessage(tdb, ctx.enqueueOutbound, {
      conversationId: job.conversationId,
      author: 'system',
      content,
    });

  switch (decision.action) {
    case 'human':
      // Messages go to the human inbox (Chatwoot, build step 1.10); the AI stays silent.
      break;
    case 'ask_module':
    case 'classify': {
      await say({
        kind: 'list',
        text: coreMessages.askModule.body,
        buttonLabel: coreMessages.askModule.button,
        sections: [
          {
            rows: decision.candidates.map((m) => ({
              id: `module:${m}`,
              title: coreMessages.moduleRows[m].title,
              description: coreMessages.moduleRows[m].description,
            })),
          },
        ],
      });
      break;
    }
    case 'unidentified':
    case 'no_module': {
      const { created } = await openHandoff(tdb, {
        conversationId: job.conversationId,
        reason: decision.action === 'unidentified' ? 'unidentified' : 'other',
        openedBy: 'system',
      });
      if (created)
        await say({
          kind: 'text',
          text:
            decision.action === 'unidentified' ? coreMessages.unidentified : coreMessages.noModule,
        });
      break;
    }
    case 'agent': {
      const agentKey = ctx.registry.get(decision.module)?.agentFor?.(contactKind) ?? null;
      const expires = new Date(now.getTime() + (ctx.stickyMinutes ?? 120) * 60_000);
      const update = await tdb
        .from('conversations')
        .update({
          module: decision.module,
          agent_key: agentKey,
          state_expires_at: expires.toISOString(),
        })
        .eq('id', job.conversationId);
      if (update.error) throw new Error(update.error.message);
      // Without an agent engine (no AI key configured) the conversation goes to the human inbox.
      const run =
        ctx.runAgent ??
        (async () => {
          const { created } = await openHandoff(tdb, {
            conversationId: job.conversationId,
            reason: 'other',
            openedBy: 'system',
          });
          if (created) await say({ kind: 'text', text: coreMessages.noModule });
        });
      await run({
        tenantId: job.tenantId,
        conversationId: job.conversationId,
        contactId: contact.id,
        contactKind,
        module: decision.module,
        agentKey,
        messages: pending,
      });
      break;
    }
  }

  await markProcessed();
  log.info(
    {
      action: decision.action,
      module: 'module' in decision ? decision.module : undefined,
      messages: pending.length,
    },
    'turn routed',
  );
  return { status: 'routed', decision, messages: pending.length };
}
