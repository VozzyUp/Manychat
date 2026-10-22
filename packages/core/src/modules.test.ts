import { describe, expect, it } from 'vitest';
import { defineModule, ModuleRegistry } from './modules';

describe('ModuleRegistry', () => {
  it('registers modules once', () => {
    const registry = new ModuleRegistry().register(defineModule({ key: 'log', label: 'Log' }));
    expect(registry.get('log')?.label).toBe('Log');
    expect(() => registry.register(defineModule({ key: 'log', label: 'Again' }))).toThrow();
  });
});
