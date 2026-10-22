import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_OPTIONS, QUEUES } from './queues';

describe('queues', () => {
  it('has a retry policy for every queue', () => {
    for (const name of Object.values(QUEUES)) {
      expect(DEFAULT_JOB_OPTIONS[name]).toBeDefined();
    }
  });

  it('retries the inbound webhook queue with exponential backoff', () => {
    expect(DEFAULT_JOB_OPTIONS['inbound-messages'].attempts).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_JOB_OPTIONS['inbound-messages'].backoff).toMatchObject({ type: 'exponential' });
  });
});
