import { describe, expect, it } from 'vitest';
import { canonicalWaId, formatWaId, phoneInputToWaId } from './phone';

describe('Brazilian WhatsApp ids', () => {
  it('adds the missing 9 to legacy mobile ids and keeps everything else', () => {
    expect(canonicalWaId('551187654321')).toBe('5511987654321');
    expect(canonicalWaId('5511987654321')).toBe('5511987654321');
    expect(canonicalWaId('551132654321')).toBe('551132654321'); // landline (starts with 3)
    expect(canonicalWaId('14155550123')).toBe('14155550123'); // USA
  });

  it('turns panel input into a canonical id', () => {
    expect(phoneInputToWaId('(11) 98765-4321')).toBe('5511987654321');
    expect(phoneInputToWaId('+55 11 8765-4321')).toBe('5511987654321');
    expect(phoneInputToWaId('+1 415 555 0123')).toBe('14155550123');
    expect(phoneInputToWaId('123')).toBeNull();
    expect(phoneInputToWaId('12345678x')).toBeNull();
    expect(phoneInputToWaId('')).toBeNull();
  });

  it('formats for display', () => {
    expect(formatWaId('5511987654321')).toBe('+55 11 98765-4321');
    expect(formatWaId('14155550123')).toBe('+14155550123');
  });
});
