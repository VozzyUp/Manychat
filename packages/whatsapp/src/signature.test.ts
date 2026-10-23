import { describe, expect, it } from 'vitest';
import { signWebhookBody, verifyWebhookSignature } from './signature';

describe('verifyWebhookSignature', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');

  it('accepts the exact body signed with the app secret', () => {
    expect(verifyWebhookSignature(body, signWebhookBody(body, 'segredo'), 'segredo')).toBe(true);
  });

  it('rejects another secret, a changed body, a missing or malformed header', () => {
    const header = signWebhookBody(body, 'segredo');
    expect(verifyWebhookSignature(body, header, 'outro')).toBe(false);
    expect(verifyWebhookSignature(Buffer.from(`${body.toString()} `), header, 'segredo')).toBe(
      false,
    );
    expect(verifyWebhookSignature(body, undefined, 'segredo')).toBe(false);
    expect(verifyWebhookSignature(body, 'sha1=abc', 'segredo')).toBe(false);
    expect(verifyWebhookSignature(body, 'sha256=zz', 'segredo')).toBe(false);
    expect(verifyWebhookSignature(body, header, '')).toBe(false);
  });
});
