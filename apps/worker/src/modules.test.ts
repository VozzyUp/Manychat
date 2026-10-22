import { describe, expect, it } from 'vitest';
import { buildRegistry } from './modules';

describe('worker module registry', () => {
  it('registers the four product modules', () => {
    expect(
      buildRegistry()
        .list()
        .map((m) => m.key),
    ).toEqual(['log', 'labs', 'consult', 'adm']);
  });
});
