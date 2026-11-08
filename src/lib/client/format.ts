import { formatEUR } from '@/lib/money';

/** Euro amount for display, e.g. 15000 -> "€150.00". */
export function euro(cents: number): string {
  return formatEUR(cents, 'en-IE');
}

const LOCALES = { en: 'en-IE', el: 'el-GR', de: 'de-DE', it: 'it-IT', fr: 'fr-FR' } as const;

/** Euro amount in the renter's own language, e.g. 5000 in Greek -> "50,00 €". Shop screens keep `euro`. */
export function euroIn(cents: number, lang: keyof typeof LOCALES): string {
  return formatEUR(cents, LOCALES[lang]);
}

/** Euros typed by a person ("12.5" or "12,50") to whole cents. NaN when it is anything else. */
export function eurosToCents(text: string): number {
  if (!/^\d+([.,]\d{1,2})?$/.test(text)) {
    return Number.NaN;
  }
  return Math.round(Number.parseFloat(text.replace(',', '.')) * 100);
}

export function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2);
}
