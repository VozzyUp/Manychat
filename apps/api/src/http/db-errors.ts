import { AppError } from '@nurion/shared';
import { messages } from '../messages';

type PostgrestLikeError = { code?: string; message?: string; details?: string | null };

/**
 * Maps a Postgres/PostgREST error to the API error shape. RLS refusals become 403,
 * guard-trigger refusals keep their meaning, and anything unknown stays a 500.
 */
export function fromDbError(error: PostgrestLikeError): AppError {
  switch (error.code) {
    case '42501':
      return new AppError('forbidden', messages.forbidden);
    case '23505':
      return new AppError('conflict', messages.duplicate);
    case '23503':
      return new AppError('conflict', messages.inUse);
    case '23514':
      return new AppError(
        'conflict',
        error.message?.includes('owner')
          ? messages.lastOwner
          : (error.message ?? messages.duplicate),
      );
    case 'PGRST116':
      return new AppError('not_found', messages.notFound);
    default:
      return new AppError('internal_error', error.message ?? 'Database error', {
        code: error.code,
      });
  }
}

type DbResult = { data: unknown; error: PostgrestLikeError | null };

/** Data of a Supabase call; throws the mapped error, or not_found when there is no data. */
export function unwrap<R extends DbResult>(result: R): NonNullable<R['data']> {
  if (result.error) throw fromDbError(result.error);
  if (result.data === null || result.data === undefined) {
    throw new AppError('not_found', messages.notFound);
  }
  return result.data;
}

/** Same as `unwrap`, for `maybeSingle()` calls where "no row" is a valid answer. */
export function unwrapMaybe<R extends DbResult>(result: R): R['data'] {
  if (result.error) throw fromDbError(result.error);
  return result.data;
}
