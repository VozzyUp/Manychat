import Link from 'next/link';
import { buttonClass } from './button';

/** Previous/next links that keep the current filters (`params`) in the URL. */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    if (p > 1) query.set('page', String(p));
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav aria-label="Paginação" className="mt-4 flex items-center justify-between gap-3 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonClass('secondary', 'sm')}>
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted">
        Página {page} de {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={buttonClass('secondary', 'sm')}>
          Próxima
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
