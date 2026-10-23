/** Small WCAG 2 colour helpers used to keep white-label colours readable. */

export type Rgb = { r: number; g: number; b: number };

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim());
}

export function parseHex(value: string): Rgb {
  const match = HEX.exec(value.trim());
  if (!match?.[1]) throw new Error(`not a hex colour: ${value}`);
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function relativeLuminance(color: string): number {
  const { r, g, b } = parseHex(color);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mixes `color` towards `target` by `amount` (0..1). */
export function mix(color: string, target: string, amount: number): string {
  const a = parseHex(color);
  const b = parseHex(target);
  return toHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

export const LIGHT_TEXT = '#ffffff';
export const DARK_TEXT = '#141a21';

/**
 * Text colour with the best contrast on `background`: white or the panel's near-black, falling back
 * to pure black for mid tones where neither reaches 4.5:1 (pure black or white always does).
 */
export function pickTextOn(background: string): string {
  const light = contrastRatio(LIGHT_TEXT, background);
  const dark = contrastRatio(DARK_TEXT, background);
  if (Math.max(light, dark) >= 4.5) return light >= dark ? LIGHT_TEXT : DARK_TEXT;
  return contrastRatio('#000000', background) >= light ? '#000000' : LIGHT_TEXT;
}

/**
 * Darkens (or lightens) `foreground` until it reaches `min` contrast on `background`.
 * Used for brand colours shown as text/links on the panel's white background.
 */
export function ensureContrast(foreground: string, background: string, min = 4.5): string {
  if (contrastRatio(foreground, background) >= min) return toHex(parseHex(foreground));
  const towards = relativeLuminance(background) > 0.5 ? '#000000' : '#ffffff';
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(foreground, towards, step / 20);
    if (contrastRatio(candidate, background) >= min) return candidate;
  }
  return towards;
}
