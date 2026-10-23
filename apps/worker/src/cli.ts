/**
 * Operations commands (docs/runbooks). Usage:
 *   pnpm --filter @nurion/worker ops queues:stats
 *   pnpm --filter @nurion/worker ops dlq:list
 *   pnpm --filter @nurion/worker ops dlq:retry [--queue outbound-messages]
 *   pnpm --filter @nurion/worker ops dlq:drop --id <dead-letter job id>
 *   pnpm --filter @nurion/worker ops crypto:rotate
 */
import { DEFAULT_JOB_OPTIONS, QUEUES, type QueueName } from '@nurion/core';
import { createServiceDb } from '@nurion/db';
import { createSecretBox, envFragments, parseEnv } from '@nurion/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

const baseEnv = parseEnv(
  z.object({ ...envFragments.redis, QUEUE_PREFIX: z.string().default('nurion') }),
);
const connection = new Redis(baseEnv.REDIS_URL, { maxRetriesPerRequest: null });
const queue = (name: string) => new Queue(name, { connection, prefix: baseEnv.QUEUE_PREFIX });
const out = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

async function main() {
  switch (command) {
    case 'queues:stats': {
      const stats: Record<string, unknown> = {};
      for (const name of Object.values(QUEUES)) {
        const q = queue(name);
        stats[name] = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
        await q.close();
      }
      out(stats);
      return;
    }
    case 'dlq:list': {
      const dead = queue(QUEUES.deadLetter);
      const jobs = await dead.getJobs(['waiting'], 0, 100);
      out(
        jobs.map((j) => ({
          id: j.id,
          queue: (j.data as { queue: string }).queue,
          error: (j.data as { error: string }).error,
          failedAt: (j.data as { failedAt: string }).failedAt,
        })),
      );
      await dead.close();
      return;
    }
    case 'dlq:retry': {
      const only = flag('queue');
      const dead = queue(QUEUES.deadLetter);
      let moved = 0;
      for (const job of await dead.getJobs(['waiting'], 0, 1000)) {
        const data = job.data as { queue: QueueName; data: unknown };
        if (only && data.queue !== only) continue;
        const target = queue(data.queue);
        await target.add('retry', data.data, DEFAULT_JOB_OPTIONS[data.queue]);
        await target.close();
        await job.remove();
        moved += 1;
      }
      out({ moved });
      await dead.close();
      return;
    }
    case 'dlq:drop': {
      const id = flag('id');
      if (!id) throw new Error('--id is required');
      const dead = queue(QUEUES.deadLetter);
      const job = await dead.getJob(id);
      if (!job) throw new Error(`dead-letter job ${id} not found`);
      await job.remove();
      out({ dropped: id });
      await dead.close();
      return;
    }
    case 'crypto:rotate': {
      const env = parseEnv(
        z.object({
          ...envFragments.supabase,
          ...envFragments.supabaseService,
          ...envFragments.crypto,
        }),
      );
      if (!env.ENCRYPTION_KEY_PREVIOUS)
        throw new Error('set ENCRYPTION_KEY_PREVIOUS (old key) and ENCRYPTION_KEY (new key)');
      const box = createSecretBox({
        key: env.ENCRYPTION_KEY,
        previousKey: env.ENCRYPTION_KEY_PREVIOUS,
      });
      const db = createServiceDb({
        url: env.SUPABASE_URL,
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      });
      let rotated = 0;
      for (const tenantId of await db.system.listAllTenantIds()) {
        const tdb = db.withTenant(tenantId);
        const { data, error } = await tdb.from('whatsapp_numbers').select('id, access_token_enc');
        if (error) throw error;
        for (const row of data) {
          if (!box.needsRotation(row.access_token_enc)) continue;
          const update = await tdb
            .from('whatsapp_numbers')
            .update({ access_token_enc: box.encrypt(box.decrypt(row.access_token_enc)) })
            .eq('id', row.id);
          if (update.error) throw update.error;
          rotated += 1;
        }
      }
      out({ rotated });
      return;
    }
    default:
      throw new Error(`unknown command "${command ?? ''}". See the header of src/cli.ts.`);
  }
}

main()
  .catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => connection.disconnect());
