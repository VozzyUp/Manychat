import type { JobsOptions } from 'bullmq';

/** Every BullMQ queue in the platform. Producers and consumers import names from here. */
export const QUEUES = {
  inboundMessages: 'inbound-messages',
  conversationTurns: 'conversation-turns',
  outboundMessages: 'outbound-messages',
  chatwootEvents: 'chatwoot-events',
  ingestDocument: 'ingest-document',
  reports: 'reports',
  scheduled: 'scheduled',
  deadLetter: 'dead-letter',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const exponential = (attempts: number, delay = 2_000): JobsOptions => ({
  attempts,
  backoff: { type: 'exponential', delay },
  removeOnComplete: { age: 24 * 3600, count: 10_000 },
  // Failed jobs are kept for inspection; the worker also copies them to the dead-letter queue.
  removeOnFail: { age: 14 * 24 * 3600 },
});

/** Retry policy per queue (ESCOPO §10: exponential retry + dead-letter). */
export const DEFAULT_JOB_OPTIONS: Record<QueueName, JobsOptions> = {
  'inbound-messages': exponential(5, 1_000),
  'conversation-turns': exponential(3, 2_000),
  'outbound-messages': exponential(5, 2_000),
  'chatwoot-events': exponential(5, 2_000),
  'ingest-document': exponential(3, 10_000),
  reports: exponential(3, 10_000),
  scheduled: exponential(3, 30_000),
  'dead-letter': { removeOnComplete: false, removeOnFail: false },
};
