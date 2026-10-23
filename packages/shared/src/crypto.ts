import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for third-party secrets stored in the database (ADR-0004).
 * Format: v1.<keyId>.<iv>.<tag>.<ciphertext> (base64url). keyId says which key encrypted it,
 * so a rotation can read old values with ENCRYPTION_KEY_PREVIOUS and re-encrypt them.
 */
export type SecretBox = {
  encrypt(plaintext: string): string;
  decrypt(token: string): string;
  /** True when `token` was encrypted with the previous key and should be re-encrypted. */
  needsRotation(token: string): boolean;
};

const b64 = (buf: Buffer) => buf.toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url');

function parseKey(base64: string, name: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32)
    throw new Error(`${name} must be 32 bytes in base64 (openssl rand -base64 32)`);
  return key;
}

const keyId = (key: Buffer) => createHash('sha256').update(key).digest('hex').slice(0, 8);

export function createSecretBox(options: { key: string; previousKey?: string }): SecretBox {
  const current = parseKey(options.key, 'ENCRYPTION_KEY');
  const keys = new Map<string, Buffer>([[keyId(current), current]]);
  if (options.previousKey) {
    const previous = parseKey(options.previousKey, 'ENCRYPTION_KEY_PREVIOUS');
    keys.set(keyId(previous), previous);
  }
  const currentId = keyId(current);

  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', current, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return ['v1', currentId, b64(iv), b64(cipher.getAuthTag()), b64(ciphertext)].join('.');
    },
    decrypt(token) {
      const [version, kid, iv, tag, ciphertext] = token.split('.');
      if (version !== 'v1' || !kid || !iv || !tag || ciphertext === undefined) {
        throw new Error('invalid encrypted value');
      }
      const key = keys.get(kid);
      if (!key) throw new Error('encrypted with an unknown key (rotation incomplete?)');
      const decipher = createDecipheriv('aes-256-gcm', key, unb64(iv));
      decipher.setAuthTag(unb64(tag));
      return Buffer.concat([decipher.update(unb64(ciphertext)), decipher.final()]).toString('utf8');
    },
    needsRotation(token) {
      return token.split('.')[1] !== currentId;
    },
  };
}
