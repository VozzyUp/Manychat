import { describe, expect, it } from 'vitest';
import { roleAtLeast } from './domain';

describe('roleAtLeast', () => {
  it('follows the role order viewer < operator < quality < manager < admin < owner', () => {
    expect(roleAtLeast('owner', 'admin')).toBe(true);
    expect(roleAtLeast('quality', 'operator')).toBe(true);
    expect(roleAtLeast('operator', 'quality')).toBe(false);
    expect(roleAtLeast('viewer', 'viewer')).toBe(true);
  });
});
