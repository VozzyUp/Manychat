import type { DocumentStatus } from '@nurion/shared/domain';

type VersionLike = { version: number; status: string; review_date: string | null };

/** The version the list shows: the one feeding the AI if any, else the newest. */
export function headlineVersion<T extends VersionLike & { activated_at?: string | null }>(
  versions: T[],
): T | undefined {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  return sorted.find((v) => v.status === 'aprovado' && v.activated_at) ?? sorted[0];
}

/** Today as yyyy-mm-dd in the tenant's time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/** A document is overdue for review when its approved version's review date has passed. */
export function reviewOverdue(version: VersionLike | undefined, today: string): boolean {
  return Boolean(
    version && version.status === 'aprovado' && version.review_date && version.review_date < today,
  );
}

export const asDocumentStatus = (value: string) => value as DocumentStatus;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
