import { describe, expect, it } from 'vitest';
import type { Finding, PriceItem } from '@/lib/domain/types';
import { computeCharge, initialStatusFor } from '@/lib/domain/settlement';

const PRICE_LIST: PriceItem[] = [
  { id: 'mirror', label: 'Mirror', amountCents: 3000 },
  { id: 'scratch', label: 'Scratch', amountCents: 2000 },
  { id: 'dent', label: 'Dent', amountCents: 6000 },
  { id: 'light', label: 'Light', amountCents: 4000 },
];

function finding(overrides: Partial<Finding> & Pick<Finding, 'id' | 'status' | 'priceItemId'>): Finding {
  return {
    angle: 'front',
    beforePhotoId: 'before-1',
    afterPhotoId: 'after-1',
    location: 'front bumper',
    description: 'test finding',
    severity: 'minor',
    confidence: 0.9,
    box: { x: 0, y: 0, w: 0.1, h: 0.1 },
    source: 'ai',
    ...overrides,
  };
}

describe('computeCharge', () => {
  it('charges only confirmed findings with a price item', () => {
    const findings: Finding[] = [
      finding({ id: 'f1', status: 'confirmed', priceItemId: 'mirror' }),
      finding({ id: 'f2', status: 'proposed', priceItemId: 'scratch' }),
      finding({ id: 'f3', status: 'dismissed', priceItemId: 'dent' }),
      finding({ id: 'f4', status: 'confirmed', priceItemId: null }),
    ];

    const result = computeCharge(findings, PRICE_LIST, 15000);

    expect(result.chargeCents).toBe(3000);
    expect(result.releaseCents).toBe(12000);
    expect(result.lines.length).toBe(1);
    expect(result.lines[0]).toEqual({
      findingId: 'f1',
      priceItemId: 'mirror',
      label: 'Mirror',
      amountCents: 3000,
    });
  });

  it('caps the charge at the hold', () => {
    const findings: Finding[] = [
      finding({ id: 'f1', status: 'confirmed', priceItemId: 'dent' }),
      finding({ id: 'f2', status: 'confirmed', priceItemId: 'light' }),
      finding({ id: 'f3', status: 'confirmed', priceItemId: 'mirror' }),
    ];

    const result = computeCharge(findings, PRICE_LIST, 10000);

    expect(result.totalCents).toBe(13000);
    expect(result.chargeCents).toBe(10000);
    expect(result.releaseCents).toBe(0);
    expect(result.exceedsHoldByCents).toBe(3000);
  });

  it('releases the whole hold when there are no findings', () => {
    const result = computeCharge([], PRICE_LIST, 15000);

    expect(result.chargeCents).toBe(0);
    expect(result.releaseCents).toBe(15000);
    expect(result.exceedsHoldByCents).toBe(0);
  });

  it('ignores a priceItemId that is not in the price list', () => {
    const findings: Finding[] = [
      finding({ id: 'f1', status: 'confirmed', priceItemId: 'unknown-item' }),
    ];

    const result = computeCharge(findings, PRICE_LIST, 15000);

    expect(result.lines.length).toBe(0);
    expect(result.chargeCents).toBe(0);
    expect(result.releaseCents).toBe(15000);
  });

  it('rejects an invalid hold', () => {
    expect(() => computeCharge([], PRICE_LIST, -1)).toThrow();
    expect(() => computeCharge([], PRICE_LIST, 1.5)).toThrow();
  });
});

describe('initialStatusFor', () => {
  it('sends low confidence to a human', () => {
    expect(initialStatusFor(0.74)).toBe('needsHuman');
  });

  it('proposes findings at or above the confidence bar', () => {
    expect(initialStatusFor(0.75)).toBe('proposed');
  });

  it('fails closed on NaN by sending it to a human', () => {
    expect(initialStatusFor(NaN)).toBe('needsHuman');
  });
});
