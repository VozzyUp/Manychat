import {
  createStaffClassifier,
  DEFAULT_JOB_OPTIONS,
  PermanentJobError,
  processConversationTurn,
  processInboundWebhook,
  processOutbound,
  QUEUES,
  runAgentTurn,
  type LlmClient,
  type ModelNames,
  type Pricing,
  type OutboundJob,
  type TurnContext,
  type TurnJob,
} from '@nurion/core';
import type { Logger } from '@nurion/shared';
import { Queue, UnrecoverableError, Worker, type Job, type Processor } from 'bullmq';
import type { Redis } from 'ioredis';

export type InboundJob = { body: string; receivedAt: string };

/** Messages that arrive within this window are answered in one turn (ADR-0008). */
export const TURN_DEBOUNCE_MS = 1_500;

export type WorkerSetup = {
  connection: Redis;
  prefix: string;
  /** Turn context without the outbound queue (built here). */
  ctx: Omit<TurnContext, 'enqueueOutbound'>;
  /** The model side of the agent engine. Without it, conversations that need an agent go to a human. */
  llm?: { client: LlmClient; models: ModelNames; pricing: Pricing };
  logger: Logger;
  concurrency: number;
  reportError?: (error: unknown, tags: Record<string, string | undefined>) => void;
  /** Recurring jobs (§4.10). Off in tests that do not need them. */
  schedules?: boolean;
  turnDebounceMs?: number;
};

/** Domain errors that retrying cannot fix become BullMQ's UnrecoverableError (no more attempts). */
function guard<T, R>(processor: (job: Job<T>) => Promise<R>): Processor<T, R> {
  return async (job) => {
    try {
      return await processor(job);
    } catch (error) {
      if (error instanceof PermanentJobError) throw new UnrecoverableError(error.message);
      throw error;
    }
  };
}

const isLastAttempt = (job: Job) => job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

/** Starts every queue consumer. Failed jobs that will not retry go to the dead-letter queue. */
export async function startWorkers(setup: WorkerSetup) {
  const { connection, prefix, logger } = setup;
  const queue = (name: string) => new Queue(name, { connection, prefix });
  const queues = {
    outbound: queue(QUEUES.outboundMessages),
    turns: queue(QUEUES.conversationTurns),
    scheduled: queue(QUEUES.scheduled),
    deadLetter: queue(QUEUES.deadLetter),
  };

  const ctx: TurnContext = {
    ...setup.ctx,
    enqueueOutbound: async (job) => {
      await queues.outbound.add('send', job, {
        ...DEFAULT_JOB_OPTIONS[QUEUES.outboundMessages],
        jobId: job.messageId,
      });
    },
  };
  if (setup.llm) {
    const { client, models, pricing } = setup.llm;
    ctx.runAgent = (input) =>
      runAgentTurn({ ...ctx, llm: client, models, pricing, registry: ctx.registry }, input);
    ctx.classifyStaffIntent = createStaffClassifier({
      llm: client,
      model: models.fast,
      pricing,
      db: ctx.db,
      logger: ctx.logger,
    });
  }

  const scheduleTurn = async (job: TurnJob) => {
    await queues.turns.add('turn', job, {
      ...DEFAULT_JOB_OPTIONS[QUEUES.conversationTurns],
      delay: setup.turnDebounceMs ?? TURN_DEBOUNCE_MS,
      // One turn per conversation at a time; messages during a turn trigger exactly one more.
      deduplication: { id: job.conversationId, keepLastIfActive: true },
    });
  };

  const workers = [
    new Worker<InboundJob>(
      QUEUES.inboundMessages,
      guard(async (job) => {
        const summary = await processInboundWebhook(ctx, JSON.parse(job.data.body), {
          attempt: job.attemptsMade + 1,
          onInbound: async (event) =>
            scheduleTurn({ tenantId: event.tenantId, conversationId: event.conversationId }),
        });
        logger.info({ job_id: job.id, ...summary }, 'webhook processed');
        return summary;
      }),
      { connection, prefix, concurrency: setup.concurrency },
    ),
    new Worker<TurnJob>(
      QUEUES.conversationTurns,
      guard((job) => processConversationTurn(ctx, job.data)),
      { connection, prefix, concurrency: setup.concurrency },
    ),
    new Worker<OutboundJob>(
      QUEUES.outboundMessages,
      guard((job) => processOutbound(ctx, job.data, { isLastAttempt: isLastAttempt(job) })),
      { connection, prefix, concurrency: Math.max(1, Math.floor(setup.concurrency / 2)) },
    ),
    new Worker(
      QUEUES.scheduled,
      guard(async (job) => {
        if (job.name === 'conversation-state-cleanup') {
          const { data, error } = await ctx.db.system.cleanupExpiredConversationState();
          if (error) throw new Error(error.message);
          logger.info({ job_id: job.id, cleared: data }, 'expired conversation state cleared');
          return { cleared: data };
        }
        throw new PermanentJobError(`unknown scheduled job ${job.name}`);
      }),
      { connection, prefix, concurrency: 1 },
    ),
  ];

  if (setup.schedules !== false) {
    await queues.scheduled.upsertJobScheduler(
      'conversation-state-cleanup',
      { every: 15 * 60 * 1000 },
      { name: 'conversation-state-cleanup', opts: DEFAULT_JOB_OPTIONS[QUEUES.scheduled] },
    );
  }

  for (const worker of workers) {
    worker.on('failed', (job, error) => {
      if (!job) return;
      const exhausted =
        error instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
      const log = logger.child({ job_id: job.id, queue: worker.name });
      if (!exhausted) {
        log.warn({ err: error, attempt: job.attemptsMade }, 'job failed, will retry');
        return;
      }
      log.error({ err: error }, 'job failed for good, moved to dead-letter');
      setup.reportError?.(error, { queue: worker.name, job_id: job.id });
      void queues.deadLetter
        .add(
          worker.name,
          {
            queue: worker.name,
            jobId: job.id,
            data: job.data,
            error: error.message,
            failedAt: new Date().toISOString(),
          },
          DEFAULT_JOB_OPTIONS['dead-letter'],
        )
        .catch((dlqError: unknown) =>
          log.error({ err: dlqError }, 'could not write to dead-letter'),
        );
    });
    worker.on('error', (error) => logger.error({ err: error, queue: worker.name }, 'worker error'));
  }

  return {
    workers,
    queues,
    close: async () => {
      await Promise.all(workers.map((w) => w.close()));
      await Promise.all(Object.values(queues).map((q) => q.close()));
    },
  };
}
