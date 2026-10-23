import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Checks Meta's X-Hub-Signature-256 header against the raw request body (ESCOPO §4.2 step 1).
 * Must run on the exact bytes received — never on re-serialized JSON.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header?.startsWith('sha256=') || !appSecret) return false;
  const received = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Signs a body like Meta does (tests and local tools). */
export function signWebhookBody(rawBody: Buffer | string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}
