import { describe, expect, it } from 'vitest';
import { assertCents, formatEUR, fromPayPalValue, toPayPalValue } from '@/lib/money';

describe('toPayPalValue', () => {
  it('formats cents as a two-decimal string', () => {
    expect(toPayPalValue(15000)).toBe('150.00');
    expect(toPayPalValue(5)).toBe('0.05');
  });
});

describe('fromPayPalValue', () => {
  it('parses a decimal string into cents', () => {
    expect(fromPayPalValue('12.5')).toBe(1250);
    expect(fromPayPalValue('150.00')).toBe(15000);
  });

  it('throws on more than two decimals', () => {
    expect(() => fromPayPalValue('1.234')).toThrow();
  });

  it('throws on a negative value', () => {
    expect(() => fromPayPalValue('-1.00')).toThrow();
  });

  it('throws on a value that is not a number', () => {
    expect(() => fromPayPalValue('')).toThrow();
    expect(() => fromPayPalValue('abc')).toThrow();
  });
});

describe('formatEUR', () => {
  it('formats cents as euros for the given locale', () => {
    expect(formatEUR(15000, 'en-IE')).toBe('€150.00');
  });
});

describe('assertCents', () => {
  it('returns a non-negative whole number unchanged', () => {
    expect(assertCents(0)).toBe(0);
    expect(assertCents(15000)).toBe(15000);
  });

  it('throws on a fraction', () => {
    expect(() => assertCents(1.5)).toThrow();
  });

  it('throws on a negative number', () => {
    expect(() => assertCents(-1)).toThrow();
  });

  it('throws on a number too large to be exact', () => {
    expect(() => assertCents(1e21)).toThrow();
  });
});
