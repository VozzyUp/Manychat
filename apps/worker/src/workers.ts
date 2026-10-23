import {
  DEFAULT_JOB_OPTIONS,
  PermanentJobError,
  processInboundWebhook,
  processOutbound,
  QUEUES,
  type ChannelContext,
  type OnInboundMessage,
  type OutboundJob,
} from '@nurion/core';
import type { Logger } from '@nurion/shared';
import { Queue, UnrecoverableError, Worker, type Job, type Processor } from 'bullmq';
import type { Redis } from 'ioredis';

export type InboundJob = { body: string; receivedAt: string };

export type WorkerSetup = {
  connection: Redis;
  prefix: string;
  ctx: ChannelContext;
  logger: Logger;
  concurrency: number;
  onInbound?: OnInboundMessage;
  reportError?: (error: unknown, tags: Record<string, string | undefined>) => void;
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

/** Starts every queue consumer of the channel. Failed jobs that will not retry go to the dead-letter queue. */
export function startWorkers(setup: WorkerSetup): {
  workers: Worker[];
  close: () => Promise<void>;
} {
  const { connection, prefix, ctx, logger } = setup;
  const deadLetter = new Queue(QUEUES.deadLetter, { connection, prefix });

  const inbound = new Worker<InboundJob>(
    QUEUES.inboundMessages,
    guard(async (job) => {
      const summary = await processInboundWebhook(ctx, JSON.parse(job.data.body), {
        attempt: job.attemptsMade + 1,
        onInbound: setup.onInbound,
      });
      logger.info({ job_id: job.id, ...summary }, 'webhook processed');
      return summary;
    }),
    { connection, prefix, concurrency: setup.concurrency },
  );

  const outbound = new Worker<OutboundJob>(
    QUEUES.outboundMessages,
    guard((job) => processOutbound(ctx, job.data, { isLastAttempt: isLastAttempt(job) })),
    { connection, prefix, concurrency: Math.max(1, Math.floor(setup.concurrency / 2)) },
  );

  const workers = [inbound, outbound];
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
      void deadLetter
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
    close: async () => {
      await Promise.all(workers.map((w) => w.close()));
      await deadLetter.close();
    },
  };
}
