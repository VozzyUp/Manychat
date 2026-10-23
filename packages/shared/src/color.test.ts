import { describe, expect, it } from 'vitest';
import { contrastRatio, ensureContrast, parseHex, pickTextOn, toHex } from './color';

describe('color', () => {
  it('parses short and long hex', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(toHex(parseHex('0F766E'))).toBe('#0f766e');
    expect(() => parseHex('blue')).toThrow();
  });

  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('always picks a readable text colour for any brand colour', () => {
    for (let i = 0; i < 4096; i += 7) {
      const hex = `#${i.toString(16).padStart(3, '0')}`;
      expect(contrastRatio(pickTextOn(hex), hex)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('darkens light brand colours until they are readable on white', () => {
    const yellow = '#facc15';
    expect(contrastRatio(yellow, '#ffffff')).toBeLessThan(4.5);
    expect(contrastRatio(ensureContrast(yellow, '#ffffff'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast('#0f766e', '#ffffff')).toBe('#0f766e');
  });
});
