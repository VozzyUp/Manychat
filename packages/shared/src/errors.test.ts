import { describe, expect, it } from 'vitest';
import { AppError } from './errors';

describe('AppError', () => {
  it('maps codes to HTTP status', () => {
    expect(new AppError('not_found', 'x').statusCode).toBe(404);
    expect(new AppError('validation_error', 'x').statusCode).toBe(400);
    expect(new AppError('conflict', 'x').statusCode).toBe(409);
  });
});
