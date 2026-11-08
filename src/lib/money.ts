const PAYPAL_VALUE_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Throws unless `n` is a non-negative whole number of cents. Returns it unchanged otherwise. */
export function assertCents(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`Expected a non-negative whole number of cents, got ${n}`);
  }
  return n;
}

/** Converts cents to the two-decimal string PayPal expects, e.g. 15000 -> "150.00". */
export function toPayPalValue(cents: number): string {
  assertCents(cents);
  const euros = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${euros}.${String(remainder).padStart(2, '0')}`;
}

/** Converts a PayPal decimal string to whole cents, e.g. "12.5" -> 1250. Throws on negatives or more than two decimals. */
export function fromPayPalValue(value: string): number {
  if (!PAYPAL_VALUE_PATTERN.test(value)) {
    throw new RangeError(`Invalid PayPal amount "${value}"`);
  }
  const [wholePart, fractionPart = ''] = value.split('.');
  const paddedFraction = fractionPart.padEnd(2, '0');
  return Number(wholePart) * 100 + Number(paddedFraction);
}

/** Formats cents as a localised euro amount, e.g. formatEUR(15000, 'en-IE') -> "€150.00". */
export function formatEUR(cents: number, locale: string): string {
  assertCents(cents);
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
