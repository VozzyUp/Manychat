export type ErrorCode =
  | 'validation_error'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'unprocessable'
  | 'rate_limited'
  | 'internal_error';

const HTTP_STATUS: Record<ErrorCode, number> = {
  validation_error: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unprocessable: 422,
  rate_limited: 429,
  internal_error: 500,
};

/** Error with a stable code that maps to an HTTP status (see docs/api.md). */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = HTTP_STATUS[code];
  }
}
