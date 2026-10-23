import type { ServiceDb } from '@nurion/db';
import type { Logger, SecretBox } from '@nurion/shared';
import { WhatsAppClient } from '@nurion/whatsapp';
import type { Transcriber } from '../multimodal/transcribe';

/** What the channel code needs from the outside world (built by the worker; fakes in tests). */
export type ChannelContext = {
  db: ServiceDb;
  secrets: SecretBox;
  graph: { version: string; baseUrl?: string; fetch?: typeof fetch };
  logger: Logger;
  now?: () => Date;
  /** Speech-to-text for voice notes (§4.6). Without it, audio reaches the agent as "not transcribed". */
  transcriber?: Transcriber;
};

/** Thrown for failures that retrying cannot fix (the worker turns it into a non-retryable job error). */
export class PermanentJobError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentJobError';
  }
}

/** Thrown to retry later on purpose (e.g. a delivery status arrived before our own write). */
export class RetryLaterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryLaterError';
  }
}

export function whatsappClientFor(
  ctx: ChannelContext,
  number: { phone_number_id: string; access_token_enc: string },
): WhatsAppClient {
  return new WhatsAppClient({
    phoneNumberId: number.phone_number_id,
    accessToken: ctx.secrets.decrypt(number.access_token_enc),
    graphVersion: ctx.graph.version,
    baseUrl: ctx.graph.baseUrl,
    fetch: ctx.graph.fetch,
  });
}
