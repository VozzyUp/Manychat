import { pino, type Logger, type LoggerOptions } from 'pino';

export type { Logger } from 'pino';

/** Fields every log line should carry when known (CLAUDE.md conventions). */
export type LogContext = {
  tenant_id?: string;
  conversation_id?: string;
  job_id?: string;
  request_id?: string;
};

/** Paths never written to logs: secrets and personal data. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-hub-signature-256"]',
  '*.access_token',
  '*.access_token_enc',
  '*.token',
  '*.password',
  '*.api_key',
  '*.apiKey',
];

export function createLogger(service: string, options: LoggerOptions = {}): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...options,
  });
}

export function withContext(logger: Logger, context: LogContext): Logger {
  return logger.child(context);
}
