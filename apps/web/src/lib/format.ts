/** Dates in the tenant's time zone, pt-BR. */
export function formatDateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone }).format(new Date(iso));
}

/** Keeps a free-text search safe for PostgREST filters (no commas, parentheses or wildcards). */
export function cleanSearch(value: string | undefined): string {
  return (value ?? '')
    .replace(/[^\p{L}\p{N}\s@.+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** Page number from the URL (1-based), clamped. */
export function pageFrom(value: string | undefined): number {
  const n = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 1;
}
