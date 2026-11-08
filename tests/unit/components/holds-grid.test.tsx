import { describe, expect, it } from 'vitest';
import { compareTimeLeft, dashboardTotals, holdTimeLeft } from '@/components/shop/HoldsGrid';
import { COLUMN_MIN_WIDTH, MONO_CELL, NO_HOLD_SORT } from '@/components/shop/holds-math';
import type { HandoverView } from '@/lib/client/api';

const NOW = new Date('2026-11-08T12:00:00Z');
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const holdOf = (honorMs: number, expiresMs: number, amountCents = 15000): NonNullable<HandoverView['hold']> => ({
  orderId: 'o',
  authorizationId: 'a',
  parentAuthorizationId: 'a',
  amountCents,
  honorUntil: iso(honorMs),
  expiresAt: iso(expiresMs),
});

describe('dashboard column sizes', () => {
  it('uses minimum widths that keep every value and header whole', () => {
    // Measured at 1280px (grid 1164px inside): "125cc scooter" needs 140, a plate needs up to 130, a date 157.
    // Long status labels wrap onto two lines instead of widening the column.
    expect(COLUMN_MIN_WIDTH).toEqual({ item: 150, ref: 130, status: 164, deposit: 110, timeLeft: 115, findings: 100, charged: 110, released: 110, opened: 160 });
    const sum = Object.values(COLUMN_MIN_WIDTH).reduce((total, width) => total + width, 0);
    // Nothing is cut: the sum stays below the 1164px the grid has at a 1280px window.
    expect(sum).toBe(1149);
  });

  it('sets monospace cells to 14px', () => {
    expect(MONO_CELL.cellClass).toBe('mono');
    expect(MONO_CELL.cellStyle.fontSize).toBe('0.875rem');
  });
});

function state(over: Partial<HandoverView> = {}): HandoverView {
  return {
    id: 'h1',
    shopId: 's1',
    createdAt: '2026-11-08T10:00:00.000Z',
    status: 'active',
    itemType: 'Scooter',
    itemRef: 'ABC-123',
    priceList: [],
    depositRules: [],
    pickupPhotos: [],
    returnPhotos: [],
    photoChecks: {},
    photoTries: {},
    marks: [],
    itemDescription: null,
    suggestedRuleId: null,
    deposit: { ruleId: 'r1', amountCents: 15000 },
    renter: null,
    holdOrderId: null,
    hold: holdOf(52 * HOUR, 29 * 24 * HOUR),
    holdLost: null,
    findings: [],
    explanation: null,
    explanationLanguage: null,
    aiFailed: false,
    proposal: null,
    settlement: null,
    dispute: null,
    lastSeq: 0,
    lastHash: 'x',
    role: 'shop',
    otherDevice: false,
    isDemo: true,
    conditionAi: null,
    conditionAiFailed: false,
    comparisonAi: null,
    ...over,
  };
}

describe('holdTimeLeft', () => {
  it('writes days and hours while the honor period is long', () => {
    expect(holdTimeLeft(state(), NOW)).toEqual({ label: '2 d 4 h', urgent: false, sortMs: 52 * HOUR });
  });

  it('is urgent and in hours and minutes under 24 hours', () => {
    const near = state({ hold: holdOf(5 * HOUR + 12 * 60_000, 20 * 24 * HOUR) });
    expect(holdTimeLeft(near, NOW)).toEqual({ label: '5 h 12 min', urgent: true, sortMs: 5 * HOUR + 12 * 60_000 });
  });

  it('says the honor period ended and shows when the hold itself ends', () => {
    const past = state({ hold: holdOf(-HOUR, 10 * 24 * HOUR + 3 * HOUR) });
    expect(holdTimeLeft(past, NOW)).toEqual({ label: 'Honor ended · hold ends in 10 d 3 h', urgent: true, sortMs: 0 });
  });

  it('says expired when the authorization has run out', () => {
    const gone = state({ hold: holdOf(-3 * HOUR, -HOUR) });
    expect(holdTimeLeft(gone, NOW)).toEqual({ label: 'Hold expired', urgent: true, sortMs: 0 });
  });

  it('shows a dash when there is no live hold', () => {
    expect(holdTimeLeft(state({ hold: null, status: 'draft' }), NOW)).toEqual({ label: '—', urgent: false, sortMs: NO_HOLD_SORT });
    expect(holdTimeLeft(state({ status: 'released', settlement: { kind: 'released' } }), NOW)).toMatchObject({ label: '—', urgent: false });
    expect(holdTimeLeft(state({ holdLost: 'VOIDED' }), NOW)).toMatchObject({ label: '—', urgent: false });
  });

  it('sorts by the milliseconds left, not by the text; no live hold sorts last', () => {
    const at = (hours: number) => holdTimeLeft(state({ hold: holdOf(hours * HOUR, 900 * HOUR, 1) }), NOW);
    const none = holdTimeLeft(state({ hold: null }), NOW);
    // As text "10 h 0 min" sorts before "9 h 0 min"; as numbers 9 h comes first.
    const sorted = [none, at(10), at(100), at(9)].sort(compareTimeLeft).map((value) => value.label);
    expect(sorted).toEqual(['9 h 0 min', '10 h 0 min', '4 d 4 h', '—']);
    expect(compareTimeLeft(undefined, at(1))).toBeGreaterThan(0);
  });
});

describe('dashboardTotals', () => {
  it('counts active holds, sums released and charged euros and counts disputes', () => {
    const states = [
      state({ id: 'a' }),
      state({ id: 'b', status: 'returning' }),
      state({ id: 'c', status: 'released', settlement: { kind: 'released' } }),
      state({ id: 'd', status: 'charged', settlement: { kind: 'charged', captureId: 'cap', chargeCents: 4000, releaseCents: 11000 } }),
      state({ id: 'e', status: 'disputed', dispute: { reason: 'no' } }),
      state({ id: 'f', status: 'draft', hold: null, deposit: null }),
    ];
    expect(dashboardTotals(states)).toEqual({ active: 3, releasedCents: 26000, chargedCents: 4000, disputes: 1 });
  });

  it('is all zero for an empty list', () => {
    expect(dashboardTotals([])).toEqual({ active: 0, releasedCents: 0, chargedCents: 0, disputes: 0 });
  });
});
