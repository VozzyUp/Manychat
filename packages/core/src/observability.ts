import * as Sentry from '@sentry/node';

export type ErrorReporter = {
  capture: (error: unknown, tags?: Record<string, string | undefined>) => void;
  flush: () => Promise<void>;
};

/**
 * Sentry when SENTRY_DSN is set; a no-op otherwise. Health data must not leave the platform
 * (ESCOPO §10), so every automatic data collection is off: no bodies, headers, cookies, query
 * strings, queue payloads, AI inputs/outputs or local variables. Tags carry only ids.
 */
export function createErrorReporter(dsn: string | undefined, service: string): ErrorReporter {
  if (!dsn) return { capture: () => undefined, flush: async () => undefined };
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    serverName: service,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
  });
  return {
    capture: (error, tags) => {
      Sentry.captureException(error, { tags: { service, ...tags } });
    },
    flush: async () => {
      await Sentry.flush(2_000);
    },
  };
}
