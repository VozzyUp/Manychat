import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EnvError, parseEnv } from './env';

describe('parseEnv', () => {
  const schema = z.object({ A: z.string().min(1), B: z.coerce.number().default(3) });

  it('returns typed values and applies defaults', () => {
    expect(parseEnv(schema, { A: 'x' })).toEqual({ A: 'x', B: 3 });
  });

  it('treats empty strings as missing', () => {
    expect(() => parseEnv(schema, { A: '' })).toThrow(EnvError);
  });

  it('lists every invalid variable', () => {
    try {
      parseEnv(z.object({ A: z.string(), C: z.url() }), { C: 'not-a-url' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect((error as EnvError).issues).toHaveLength(2);
    }
  });
});
