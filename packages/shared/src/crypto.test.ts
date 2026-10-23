import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSecretBox } from './crypto';

const key = () => randomBytes(32).toString('base64');

describe('createSecretBox (AES-256-GCM)', () => {
  it('round-trips and never repeats the ciphertext', () => {
    const box = createSecretBox({ key: key() });
    const a = box.encrypt('EAAG-token');
    const b = box.encrypt('EAAG-token');
    expect(a).not.toBe(b);
    expect(a).not.toContain('EAAG');
    expect(box.decrypt(a)).toBe('EAAG-token');
  });

  it('detects tampering', () => {
    const box = createSecretBox({ key: key() });
    const parts = box.encrypt('segredo').split('.');
    parts[4] = Buffer.from('outro').toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
  });

  it('reads values from the previous key during rotation', () => {
    const oldKey = key();
    const old = createSecretBox({ key: oldKey }).encrypt('antigo');
    const rotated = createSecretBox({ key: key(), previousKey: oldKey });
    expect(rotated.decrypt(old)).toBe('antigo');
    expect(rotated.needsRotation(old)).toBe(true);
    expect(rotated.needsRotation(rotated.encrypt('novo'))).toBe(false);
    expect(() => createSecretBox({ key: key() }).decrypt(old)).toThrow(/unknown key/);
  });

  it('rejects keys of the wrong size', () => {
    expect(() => createSecretBox({ key: Buffer.from('curta').toString('base64') })).toThrow(
      /32 bytes/,
    );
  });
});
