import type { ResolvedBranding } from '@nurion/shared';
import type { CSSProperties } from 'react';

/** CSS variables that re-skin the panel with the tenant's brand (white-label). */
export function brandingStyle(branding: ResolvedBranding): CSSProperties {
  return {
    '--nh-accent': branding.accent,
    '--nh-on-accent': branding.onAccent,
    '--nh-accent-text': branding.accentText,
  } as CSSProperties;
}
