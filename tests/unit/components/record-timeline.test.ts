import { describe, expect, it } from 'vitest';
import { actorLabel, describeEvent } from '@/components/record/timeline';
import type { HandoverEvent, StoredEvent } from '@/lib/domain/events';

const finding = {
  id: 'f1',
  angle: 'left' as const,
  beforePhotoId: 'p1',
  afterPhotoId: 'p2',
  location: 'left side panel',
  description: 'New mark',
  severity: 'minor' as const,
  confidence: 0.9,
  box: { x: 0, y: 0, w: 0.1, h: 0.1 },
  priceItemId: 'scratch',
  status: 'proposed' as const,
  source: 'ai' as const,
};

// One of every event type. The `satisfies` keeps this list in step with the union in events.ts.
const EVENTS = [
  { type: 'created', shopId: 's', itemType: 'Scooter', itemRef: 'ABC-123', priceList: [], depositRules: [], renterTokenHash: 'redacted', viewKeyHash: 'redacted' },
  { type: 'photoAdded', photo: { id: 'p1', phase: 'pickup', angle: 'front', url: '/x.jpg', sha256: 'a'.repeat(64), takenAt: '2026-11-08T10:00:00Z', source: 'camera' } },
  { type: 'photoChecked', photoId: 'p1', usable: true, reason: 'Clear', overridden: false, assessmentId: null },
  { type: 'photoChecked', photoId: 'p1', usable: false, reason: 'Too dark', overridden: true, assessmentId: null },
  { type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: 'White scooter', assessmentId: null },
  { type: 'depositSet', ruleId: 'r', amountCents: 15000 },
  { type: 'sharedWithRenter' },
  { type: 'renterConfirmed', language: 'el', renterName: null },
  { type: 'holdOrderCreated', orderId: 'o1' },
  { type: 'holdAuthorized', orderId: 'o1', authorizationId: 'a1', amountCents: 15000, honorUntil: '2026-11-11T10:00:00Z', expiresAt: '2026-12-07T10:00:00Z' },
  { type: 'holdReauthorized', authorizationId: 'a2', honorUntil: '2026-11-20T10:00:00Z', expiresAt: '2026-12-18T10:00:00Z' },
  { type: 'returnStarted' },
  { type: 'comparisonDone', findings: [finding], explanation: 'x', explanationLanguage: 'en', assessmentId: null, aiFailed: false },
  { type: 'comparisonDone', findings: [], explanation: '', explanationLanguage: 'en', assessmentId: null, aiFailed: true },
  { type: 'findingAdded', finding },
  { type: 'findingUpdated', findingId: 'f1', status: 'confirmed', priceItemId: 'scratch' },
  { type: 'findingUpdated', findingId: 'f1', status: 'dismissed', priceItemId: null },
  { type: 'chargeProposed', lines: [], chargeCents: 2000, releaseCents: 13000, exceedsHoldByCents: 0 },
  { type: 'chargeProposed', lines: [], chargeCents: 15000, releaseCents: 0, exceedsHoldByCents: 500 },
  { type: 'released', authorizationId: 'a1' },
  { type: 'charged', authorizationId: 'a1', captureId: 'c1', chargeCents: 2000, releaseCents: 13000 },
  { type: 'disputed', reason: 'I did not cause it' },
  { type: 'holdLost', status: 'EXPIRED' },
  { type: 'holdLost', status: 'VOIDED' },
  { type: 'holdLost', status: 'CAPTURED' },
  { type: 'holdLost', status: 'DENIED' },
  { type: 'closed' },
] satisfies HandoverEvent[];

const ALL_TYPES: HandoverEvent['type'][] = [
  'created', 'photoAdded', 'photoChecked', 'conditionRecorded', 'depositSet', 'sharedWithRenter', 'renterConfirmed',
  'holdAuthorized', 'holdReauthorized', 'returnStarted', 'comparisonDone', 'findingAdded', 'findingUpdated',
  'chargeProposed', 'holdOrderCreated', 'released', 'charged', 'disputed', 'holdLost', 'closed',
];

function stored(event: HandoverEvent, seq: number): StoredEvent {
  return { seq, at: '2026-11-08T10:00:00Z', actor: 'shop', event, prevHash: '0', hash: '1' };
}

describe('describeEvent', () => {
  it('covers every event type in the union', () => {
    expect(new Set(EVENTS.map((event) => event.type))).toEqual(new Set(ALL_TYPES));
  });

  it.each(EVENTS.map((event, index) => [`${event.type} #${index}`, event] as const))('writes a plain line for %s', (_name, event) => {
    const line = describeEvent(stored(event, 0));
    expect(line.trim().length).toBeGreaterThan(8);
    expect(line).not.toMatch(/undefined|\[object|NaN/);
  });

  it('writes money in euro', () => {
    expect(describeEvent(stored({ type: 'depositSet', ruleId: 'r', amountCents: 15000 }, 0))).toContain('€150.00');
    expect(describeEvent(stored({ type: 'charged', authorizationId: 'a', captureId: 'c', chargeCents: 2000, releaseCents: 13000 }, 0))).toContain('€20.00');
  });
});

describe('describeEvent: honest wording when the AI did not run', () => {
  it('a photo accepted without a real AI check says only that', () => {
    for (const reason of ['Demo mode: photo accepted without an AI check', 'AI check unavailable — photo accepted without a check', 'AI limit reached — photo accepted without a check']) {
      expect(describeEvent(stored({ type: 'photoChecked', photoId: 'p1', usable: true, reason, overridden: false, assessmentId: null }, 0))).toBe('Photo accepted without an AI check.');
    }
    expect(describeEvent(stored({ type: 'photoChecked', photoId: 'p1', usable: true, reason: 'Clear', overridden: false, assessmentId: null }, 0))).toBe('Photo checked and accepted: Clear');
  });

  it('a failed condition check says no marks were written down by it', () => {
    const line = describeEvent(stored({ type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: '', assessmentId: 'a1', aiFailed: true }, 0));
    expect(line).toBe('AI condition check was not available. No marks were written down.');
    expect(describeEvent(stored({ type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: 'White scooter', assessmentId: 'a1' }, 0))).toContain('Condition record written');
  });

  it('a hand edit after a failed check is still described as an edit with its marks', () => {
    const line = describeEvent(stored({ type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: '', assessmentId: null, aiFailed: true }, 0));
    expect(line).toContain('Condition record written');
  });

  it('a failed comparison says the photos were left for the shop to compare', () => {
    expect(describeEvent(stored({ type: 'comparisonDone', findings: [], explanation: '', explanationLanguage: 'en', assessmentId: null, aiFailed: true }, 0))).toBe(
      'AI comparison was not available. The photos were left for the shop to compare.',
    );
  });
});

describe('actorLabel', () => {
  it('names the three actors', () => {
    expect(actorLabel('shop')).toBe('Shop');
    expect(actorLabel('renter')).toBe('Renter');
    expect(actorLabel('system')).toBe('System');
  });
});
