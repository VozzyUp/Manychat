import { randomUUID } from 'node:crypto';
import { AppError, type Logger } from '@nurion/shared';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export type ReadinessCheck = { name: string; check: () => Promise<void> };

export type ServerOptions = {
  logger: Logger;
  checks?: ReadinessCheck[];
  /** Max time a readiness check may take before it counts as failed. */
  readinessTimeoutMs?: number;
  /** Unexpected (500) errors go here too (Sentry in production). */
  reportError?: (error: unknown, tags: Record<string, string>) => void;
};

export type App = FastifyInstance;

export async function buildServer(options: ServerOptions): Promise<App> {
  const { logger, checks = [], readinessTimeoutMs = 2_000 } = options;

  // pino's Logger satisfies Fastify's logger interface; widen it so the instance type stays the default.
  const loggerInstance: FastifyBaseLogger = logger;
  const app = Fastify({
    loggerInstance,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: 'Invalid request', details: error.issues },
      });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        error: { code: 'validation_error', message: (error as Error).message },
      });
    }
    request.log.error({ err: error }, 'unhandled error');
    options.reportError?.(error, {
      request_id: String(request.id),
      route: request.routeOptions.url ?? '',
    });
    return reply.status(500).send({
      error: { code: 'internal_error', message: 'Internal error', request_id: request.id },
    });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (_request, reply) => {
    const results = await Promise.all(
      checks.map(async ({ name, check }) => {
        try {
          await withTimeout(check(), readinessTimeoutMs);
          return { name, ok: true as const };
        } catch (error) {
          return { name, ok: false as const, error: (error as Error).message };
        }
      }),
    );
    const failed = results.filter((r) => !r.ok);
    return reply.status(failed.length ? 503 : 200).send({
      status: failed.length ? 'unavailable' : 'ok',
      checks: results,
    });
  });

  return app;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
