import { assertCents } from '@/lib/money';
import type { DepositRule, Lang, PriceItem } from '@/lib/domain/types';
import { invalidInput } from '@/lib/service/errors';

const ID_PATTERN = /^[a-z0-9-]{1,40}$/;
const MAX_AMOUNT_CENTS = 1_000_000;
const LANGUAGES: readonly Lang[] = ['en', 'el', 'de', 'it', 'fr'];

/** Trims the text and checks its length. Throws INVALID_INPUT otherwise. */
export function cleanText(value: unknown, field: string, max: number, min = 1): string {
  if (typeof value !== 'string') {
    return invalidInput(`${field} must be text`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    return invalidInput(`${field} must be ${min} to ${max} characters`);
  }
  return trimmed;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** A lowercase SHA-256 hex digest, such as the hash of a device secret. Throws INVALID_INPUT otherwise. */
export function cleanHash(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) {
    return invalidInput(`${field} must be a SHA-256 hex digest`);
  }
  return value;
}

export function cleanLanguage(value: unknown): Lang {
  if (!LANGUAGES.includes(value as Lang)) {
    return invalidInput('Unknown language');
  }
  return value as Lang;
}

function cleanId(value: unknown, field: string, seen: Set<string>): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    return invalidInput(`${field} id must use a-z, 0-9 and dashes (1 to 40 characters)`);
  }
  if (seen.has(value)) {
    return invalidInput(`${field} id "${value}" is used twice`);
  }
  seen.add(value);
  return value;
}

function cleanAmount(value: unknown, field: string): number {
  try {
    const cents = assertCents(value as number);
    if (cents === 0) {
      // M10: a zero deposit holds nothing, and a zero price charges nothing.
      return invalidInput(`${field} amount must be more than zero`);
    }
    if (cents > MAX_AMOUNT_CENTS) {
      return invalidInput(`${field} amount is too large`);
    }
    return cents;
  } catch (error) {
    if (error instanceof RangeError) {
      return invalidInput(`${field} amount must be a whole number of cents`);
    }
    throw error;
  }
}

function cleanDepositRules(rules: DepositRule[]): DepositRule[] {
  const seen = new Set<string>();
  return rules.map((rule) => ({
    id: cleanId(rule.id, 'Deposit rule', seen),
    itemType: cleanText(rule.itemType, 'Item type', 40),
    label: cleanText(rule.label, 'Deposit label', 60),
    amountCents: cleanAmount(rule.amountCents, 'Deposit'),
  }));
}

function cleanPriceList(items: PriceItem[]): PriceItem[] {
  const seen = new Set<string>();
  return items.map((item) => ({
    id: cleanId(item.id, 'Price', seen),
    label: cleanText(item.label, 'Price label', 60),
    amountCents: cleanAmount(item.amountCents, 'Price'),
  }));
}

export function cleanLists(input: { depositRules: DepositRule[]; priceList: PriceItem[] }): {
  depositRules: DepositRule[];
  priceList: PriceItem[];
} {
  if (!Array.isArray(input.depositRules) || !Array.isArray(input.priceList)) {
    return invalidInput('Deposit rules and price list must be lists');
  }
  return { depositRules: cleanDepositRules(input.depositRules), priceList: cleanPriceList(input.priceList) };
}
