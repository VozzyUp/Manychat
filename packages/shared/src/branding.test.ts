import { describe, expect, it } from 'vitest';
import { brandingSchema, DEFAULT_ACCENT, resolveBranding } from './branding';
import { contrastRatio } from './color';

describe('branding', () => {
  it('tenant overrides partner, partner overrides defaults', () => {
    expect(resolveBranding({}).accent).toBe(DEFAULT_ACCENT);
    expect(resolveBranding({ partner: { primary: '#123456', name: 'Nurion' } })).toMatchObject({
      accent: '#123456',
      productName: 'Nurion',
    });
    expect(
      resolveBranding({ partner: { primary: '#123456' }, tenant: { primary: '#ABCDEF' } }).accent,
    ).toBe('#abcdef');
  });

  it('keeps every resolved colour readable', () => {
    const b = resolveBranding({ tenant: { primary: '#fde047' } });
    expect(contrastRatio(b.onAccent, b.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(b.accentText, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('ignores invalid stored branding instead of breaking the panel', () => {
    expect(resolveBranding({ tenant: { primary: 'red', logo_url: 'nope' } }).accent).toBe(
      DEFAULT_ACCENT,
    );
  });

  it('validates input colours', () => {
    expect(brandingSchema.safeParse({ primary: '#12345' }).success).toBe(false);
    expect(brandingSchema.parse({ primary: ' #ABC ' }).primary).toBe('#aabbcc');
  });
});
