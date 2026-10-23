import { z } from 'zod';
import { ensureContrast, isHexColor, pickTextOn, toHex, parseHex } from './color';

export const DEFAULT_ACCENT = '#0f766e';
export const PANEL_BACKGROUND = '#ffffff';

const hexColor = z
  .string()
  .trim()
  .refine(isHexColor, 'Cor inválida: use o formato #RRGGBB')
  .transform((v) => toHex(parseHex(v)));

/** What a tenant or partner can store in `branding` (jsonb). */
export const brandingSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  primary: hexColor.optional(),
  logo_url: z.url().optional(),
});
export type Branding = z.infer<typeof brandingSchema>;

/** Branding as the panel uses it: tenant overrides partner, partner overrides defaults. */
export type ResolvedBranding = {
  /** Product name shown in the header (tenant brand name, else partner brand name). */
  productName: string;
  logoUrl: string | null;
  /** Buttons and highlights. */
  accent: string;
  /** Text on top of `accent`. */
  onAccent: string;
  /** Accent used as text/link colour on the white panel background (≥ 4.5:1). */
  accentText: string;
};

export function parseBranding(value: unknown): Branding {
  const result = brandingSchema.safeParse(value ?? {});
  return result.success ? result.data : {};
}

export function resolveBranding(input: {
  tenant?: unknown;
  partner?: unknown;
  partnerName?: string;
}): ResolvedBranding {
  const tenant = parseBranding(input.tenant);
  const partner = parseBranding(input.partner);
  const accent = tenant.primary ?? partner.primary ?? DEFAULT_ACCENT;
  return {
    productName: tenant.name ?? partner.name ?? input.partnerName ?? 'Nurion Hub',
    logoUrl: tenant.logo_url ?? partner.logo_url ?? null,
    accent,
    onAccent: pickTextOn(accent),
    accentText: ensureContrast(accent, PANEL_BACKGROUND, 4.5),
  };
}
