import { describe, expect, it } from 'vitest';
import { appendEvent, type Actor, type HandoverEvent, type StoredEvent } from '@/lib/domain/events';
import { canApply, missingPickupAngles, reduce, type HandoverState } from '@/lib/domain/state';
import type { DepositRule, Finding, PhotoRef, PriceItem } from '@/lib/domain/types';
import { buildPairs } from '@/lib/service/ai-steps';

const NOW = new Date('2026-11-08T10:00:00.000Z');
const LATER = '2026-11-09T10:00:00.000Z';

const PRICE_LIST: PriceItem[] = [{ id: 'p-mirror', label: 'Mirror', amountCents: 3000 }];
const DEPOSIT_RULES: DepositRule[] = [
  { id: 'r1', itemType: 'scooter', label: 'Scooter deposit', amountCents: 15000 },
];

const CREATED: HandoverEvent = {
  type: 'created',
  shopId: 'shop-1',
  itemType: 'scooter',
  itemRef: 'SC-01',
  priceList: PRICE_LIST,
  depositRules: DEPOSIT_RULES,
  renterTokenHash: 'a'.repeat(64),
  viewKeyHash: 'b'.repeat(64),
};

function photo(id: string, phase: PhotoRef['phase'], angle: PhotoRef['angle']): PhotoRef {
  return {
    id,
    phase,
    angle,
    url: `https://example.test/${id}.jpg`,
    sha256: 'c'.repeat(64),
    takenAt: NOW.toISOString(),
    source: 'camera',
  };
}

function buildChain(events: [Actor, HandoverEvent][]): StoredEvent[] {
  const chain: StoredEvent[] = [];
  for (const [actor, event] of events) {
    chain.push(appendEvent(chain, actor, event, NOW));
  }
  return chain;
}

function build(events: [Actor, HandoverEvent][]): HandoverState {
  return reduce('h1', buildChain(events));
}

/** Like build, but first checks that canApply allows every event after created. */
function buildChecked(events: [Actor, HandoverEvent][]): HandoverState {
  const chain: StoredEvent[] = [];
  for (const [actor, event] of events) {
    if (chain.length > 0) {
      expect(canApply(reduce('h1', chain), event), `canApply refused ${event.type}`).toEqual({ ok: true });
    }
    chain.push(appendEvent(chain, actor, event, NOW));
  }
  return reduce('h1', chain);
}

function pickupEvents(): [Actor, HandoverEvent][] {
  return [
    ['shop', { type: 'photoAdded', photo: photo('p-f', 'pickup', 'front') }],
    ['shop', { type: 'photoAdded', photo: photo('p-b', 'pickup', 'back') }],
    ['shop', { type: 'photoAdded', photo: photo('p-l', 'pickup', 'left') }],
    ['shop', { type: 'photoAdded', photo: photo('p-r', 'pickup', 'right') }],
  ];
}

function checkEvents(ids: string[]): [Actor, HandoverEvent][] {
  return ids.map((photoId): [Actor, HandoverEvent] => [
    'shop',
    { type: 'photoChecked', photoId, usable: true, reason: 'clear', overridden: false, assessmentId: null },
  ]);
}

function sharedEvents(): [Actor, HandoverEvent][] {
  return [
    ...checkEvents(['p-f', 'p-b', 'p-l', 'p-r']),
    ['shop', { type: 'conditionRecorded', marks: [], suggestedRuleId: 'r1', itemDescription: 'Scooter', assessmentId: null }],
    ['shop', { type: 'depositSet', ruleId: 'r1', amountCents: 15000 }],
    ['shop', { type: 'sharedWithRenter' }],
  ];
}

function confirmedEvents(): [Actor, HandoverEvent][] {
  return [
    ...sharedEvents(),
    ['renter', { type: 'renterConfirmed', language: 'en', renterName: 'Test Renter' }],
    ['renter', { type: 'holdOrderCreated', orderId: 'o1' }],
    ['renter', { type: 'holdAuthorized', orderId: 'o1', authorizationId: 'auth-1', amountCents: 15000, honorUntil: LATER, expiresAt: LATER }],
  ];
}

function returnPhotoEvents(): [Actor, HandoverEvent][] {
  return [
    ['shop', { type: 'photoAdded', photo: photo('r-f', 'return', 'front') }],
    ['shop', { type: 'photoAdded', photo: photo('r-b', 'return', 'back') }],
    ['shop', { type: 'photoAdded', photo: photo('r-l', 'return', 'left') }],
    ['shop', { type: 'photoAdded', photo: photo('r-r', 'return', 'right') }],
  ];
}

function activeEvents(): [Actor, HandoverEvent][] {
  return [...pickupEvents(), ...confirmedEvents()];
}

function reviewedEvents(findings: Finding[]): [Actor, HandoverEvent][] {
  return [
    ...pickupEvents(),
    ...confirmedEvents(),
    ['system', { type: 'returnStarted' }],
    ...returnPhotoEvents(),
    ...checkEvents(['r-f', 'r-b', 'r-l', 'r-r']),
    ['system', { type: 'comparisonDone', findings, explanation: 'Reviewed', explanationLanguage: 'en', assessmentId: null, aiFailed: false }],
  ];
}

function confirmedFinding(priceItemId: string | null): Finding {
  return {
    id: 'f1',
    angle: 'front',
    beforePhotoId: 'p-f',
    afterPhotoId: 'r-f',
    location: 'front bumper',
    description: 'Scratch',
    severity: 'minor',
    confidence: 0.9,
    box: { x: 0, y: 0, w: 0.1, h: 0.1 },
    priceItemId,
    status: 'confirmed',
    source: 'ai',
  };
}

describe('reduce', () => {
  it('full clean path reaches released', () => {
    const state = buildChecked([
      ['shop', CREATED],
      ...pickupEvents(),
      ...sharedEvents(),
      ['renter', { type: 'renterConfirmed', language: 'en', renterName: 'Test Renter' }],
      ['renter', { type: 'holdOrderCreated', orderId: 'o1' }],
      ['renter', { type: 'holdAuthorized', orderId: 'o1', authorizationId: 'auth-1', amountCents: 15000, honorUntil: LATER, expiresAt: LATER }],
      ['system', { type: 'returnStarted' }],
      ...returnPhotoEvents(),
      ...checkEvents(['r-f', 'r-b', 'r-l', 'r-r']),
      ['system', { type: 'comparisonDone', findings: [], explanation: 'No new damage', explanationLanguage: 'en', assessmentId: null, aiFailed: false }],
      ['system', { type: 'released', authorizationId: 'auth-1' }],
    ]);

    expect(state.status).toBe('released');
    expect(state.settlement).toEqual({ kind: 'released' });
    expect(state.lastSeq).toBe(25);
  });

  it('throws on an empty chain', () => {
    expect(() => reduce('h1', [])).toThrow(Error);
  });

  it('throws when the first event is not created', () => {
    const chain = [appendEvent([], 'shop', { type: 'closed' }, NOW)];
    expect(() => reduce('h1', chain)).toThrow(Error);
  });

  it('a retake replaces the photo for that angle', () => {
    const state = build([
      ['shop', CREATED],
      ['shop', { type: 'photoAdded', photo: photo('p-f1', 'pickup', 'front') }],
      ['shop', { type: 'photoAdded', photo: photo('p-f2', 'pickup', 'front') }],
    ]);

    const fronts = state.pickupPhotos.filter((p) => p.angle === 'front');
    expect(fronts).toHaveLength(1);
    expect(fronts[0].id).toBe('p-f2');
  });

  it('keeps closeup photos as a list', () => {
    const state = build([
      ['shop', CREATED],
      ['shop', { type: 'photoAdded', photo: photo('c1', 'pickup', 'closeup') }],
      ['shop', { type: 'photoAdded', photo: photo('c2', 'pickup', 'closeup') }],
    ]);

    expect(state.pickupPhotos.filter((p) => p.angle === 'closeup').map((p) => p.id)).toEqual(['c1', 'c2']);
  });
});

describe('conditionAiFailed', () => {
  const failed: [Actor, HandoverEvent] = ['system', { type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: '', assessmentId: 'a1', aiFailed: true }];

  it('is false by default and for old events without the flag', () => {
    expect(build([['shop', CREATED]]).conditionAiFailed).toBe(false);
    const state = build([['shop', CREATED], ['system', { type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: 'x', assessmentId: 'a1' }]]);
    expect(state.conditionAiFailed).toBe(false);
  });

  it('is true when the condition step failed, and a hand edit of the marks keeps it', () => {
    const state = build([['shop', CREATED], failed]);
    expect(state.conditionAiFailed).toBe(true);
    const edited = build([['shop', CREATED], failed, ['shop', { type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: '', assessmentId: null, aiFailed: true }]]);
    expect(edited.conditionAiFailed).toBe(true);
    const editedWithoutFlag = build([['shop', CREATED], failed, ['shop', { type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: '', assessmentId: null }]]);
    expect(editedWithoutFlag.conditionAiFailed).toBe(true);
  });
});

describe('canApply', () => {
  it('cannot share before all four angles', () => {
    const state = build([
      ['shop', CREATED],
      ['shop', { type: 'photoAdded', photo: photo('p-f', 'pickup', 'front') }],
      ['shop', { type: 'photoAdded', photo: photo('p-b', 'pickup', 'back') }],
      ['shop', { type: 'photoAdded', photo: photo('p-r', 'pickup', 'right') }],
      ...checkEvents(['p-f', 'p-b', 'p-r']),
      ['shop', { type: 'conditionRecorded', marks: [], suggestedRuleId: 'r1', itemDescription: 'Scooter', assessmentId: null }],
      ['shop', { type: 'depositSet', ruleId: 'r1', amountCents: 15000 }],
    ]);

    expect(missingPickupAngles(state)).toEqual(['left']);
    const result = canApply(state, { type: 'sharedWithRenter' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('left');
    }
  });

  it('allows sharing once every angle is photographed, checked and the deposit is set', () => {
    const state = build([['shop', CREATED], ...pickupEvents(), ...checkEvents(['p-f', 'p-b', 'p-l', 'p-r']),
      ['shop', { type: 'conditionRecorded', marks: [], suggestedRuleId: 'r1', itemDescription: 'Scooter', assessmentId: null }],
      ['shop', { type: 'depositSet', ruleId: 'r1', amountCents: 15000 }]]);

    expect(canApply(state, { type: 'sharedWithRenter' })).toEqual({ ok: true });
  });

  it('rejects a fifth closeup in the same phase', () => {
    const closeups: [Actor, HandoverEvent][] = [1, 2, 3, 4].map((n): [Actor, HandoverEvent] => [
      'shop',
      { type: 'photoAdded', photo: photo(`c${n}`, 'pickup', 'closeup') },
    ]);
    const state = build([['shop', CREATED], ...closeups]);

    const result = canApply(state, { type: 'photoAdded', photo: photo('c5', 'pickup', 'closeup') });
    expect(result.ok).toBe(false);
  });

  it('holdAuthorized must match the deposit amount', () => {
    const state = build([['shop', CREATED], ...pickupEvents(), ...sharedEvents(),
      ['renter', { type: 'renterConfirmed', language: 'en', renterName: null }],
      ['renter', { type: 'holdOrderCreated', orderId: 'o1' }]]);

    const wrong = canApply(state, { type: 'holdAuthorized', orderId: 'o1', authorizationId: 'auth-1', amountCents: 14000, honorUntil: LATER, expiresAt: LATER });
    const right = canApply(state, { type: 'holdAuthorized', orderId: 'o1', authorizationId: 'auth-1', amountCents: 15000, honorUntil: LATER, expiresAt: LATER });
    const otherOrder = canApply(state, { type: 'holdAuthorized', orderId: 'o2', authorizationId: 'auth-1', amountCents: 15000, honorUntil: LATER, expiresAt: LATER });

    expect(wrong.ok).toBe(false);
    expect(right).toEqual({ ok: true });
    expect(otherOrder.ok).toBe(false);
  });

  it('holdOrderCreated needs a confirmed renter and only one order', () => {
    const shared = build([['shop', CREATED], ...pickupEvents(), ...sharedEvents()]);
    expect(canApply(shared, { type: 'holdOrderCreated', orderId: 'o1' }).ok).toBe(false);
    const confirmed = build([['shop', CREATED], ...pickupEvents(), ...sharedEvents(),
      ['renter', { type: 'renterConfirmed', language: 'en', renterName: null }]]);
    expect(canApply(confirmed, { type: 'holdOrderCreated', orderId: 'o1' })).toEqual({ ok: true });
    const ordered = build([['shop', CREATED], ...pickupEvents(), ...sharedEvents(),
      ['renter', { type: 'renterConfirmed', language: 'en', renterName: null }],
      ['renter', { type: 'holdOrderCreated', orderId: 'o1' }]]);
    expect(ordered.holdOrderId).toBe('o1');
    expect(canApply(ordered, { type: 'holdOrderCreated', orderId: 'o2' }).ok).toBe(false);
  });

  it('renter cannot confirm twice', () => {
    const state = build([['shop', CREATED], ...pickupEvents(), ...sharedEvents(),
      ['renter', { type: 'renterConfirmed', language: 'en', renterName: null }]]);

    expect(canApply(state, { type: 'renterConfirmed', language: 'en', renterName: null }).ok).toBe(false);
  });

  it('cannot release with a confirmed finding', () => {
    const state = build([['shop', CREATED], ...reviewedEvents([confirmedFinding('p-mirror')])]);

    expect(state.status).toBe('reviewed');
    expect(canApply(state, { type: 'released', authorizationId: 'auth-1' }).ok).toBe(false);
  });

  it('cannot charge without a confirmed priced finding', () => {
    const state = build([['shop', CREATED], ...reviewedEvents([])]);

    expect(canApply(state, { type: 'charged', authorizationId: 'auth-1', captureId: 'cap-1', chargeCents: 3000, releaseCents: 12000 }).ok).toBe(false);
  });

  it('rejects a finding update that points to an unknown price item', () => {
    const state = build([['shop', CREATED], ...reviewedEvents([confirmedFinding(null)])]);

    expect(canApply(state, { type: 'findingUpdated', findingId: 'f1', status: 'confirmed', priceItemId: 'nope' }).ok).toBe(false);
  });
});

describe('missingPickupAngles', () => {
  it('lists the required angles that have no pickup photo', () => {
    const state = build([['shop', CREATED], ['shop', { type: 'photoAdded', photo: photo('p-f', 'pickup', 'front') }]]);

    expect(missingPickupAngles(state)).toEqual(['back', 'left', 'right']);
  });
});

const LATER_REAUTH = '2026-11-10T10:00:00.000Z';
const REAUTHORIZE: HandoverEvent = {
  type: 'holdReauthorized',
  authorizationId: 'auth-2',
  honorUntil: LATER_REAUTH,
  expiresAt: LATER_REAUTH,
};
const RELEASE_OK: HandoverEvent = { type: 'released', authorizationId: 'auth-1' };

function checkOf(photoId: string): HandoverEvent {
  return { type: 'photoChecked', photoId, usable: true, reason: 'clear', overridden: false, assessmentId: null };
}

function lostOf(status: 'EXPIRED' | 'VOIDED' | 'CAPTURED' | 'DENIED'): HandoverEvent {
  return { type: 'holdLost', status };
}

function chargeOf(authorizationId: string, chargeCents: number, releaseCents: number): HandoverEvent {
  return { type: 'charged', authorizationId, captureId: 'cap-1', chargeCents, releaseCents };
}

function comparisonOf(findings: Finding[]): HandoverEvent {
  return { type: 'comparisonDone', findings, explanation: 'Reviewed', explanationLanguage: 'en', assessmentId: null, aiFailed: false };
}

function reasonOf(verdict: ReturnType<typeof canApply>): string {
  return verdict.ok ? '' : verdict.reason;
}

function reviewedState(findings: Finding[]): HandoverState {
  return build([['shop', CREATED], ...reviewedEvents(findings)]);
}

const PROPOSAL: Extract<HandoverEvent, { type: 'chargeProposed' }> = {
  type: 'chargeProposed',
  lines: [{ findingId: 'f1', priceItemId: 'p-mirror', label: 'Mirror', amountCents: 3000 }],
  chargeCents: 3000,
  releaseCents: 12000,
  exceedsHoldByCents: 0,
};

function proposedState(findings: Finding[]): HandoverState {
  return build([['shop', CREATED], ...reviewedEvents(findings), ['shop', PROPOSAL]]);
}

function returningState(): HandoverState {
  return build([['shop', CREATED], ...activeEvents(), ['system', { type: 'returnStarted' }], ...returnPhotoEvents()]);
}

/** Returning, with all four return photos checked and accepted: ready to compare. */
function checkedReturningState(): HandoverState {
  return build([['shop', CREATED], ...activeEvents(), ['system', { type: 'returnStarted' }], ...returnPhotoEvents(), ...checkEvents(['r-f', 'r-b', 'r-l', 'r-r'])]);
}

function failedCheckOf(photoId: string, personVisible = false): HandoverEvent {
  return { type: 'photoChecked', photoId, usable: false, reason: 'Too dark', overridden: false, assessmentId: 'a1', personVisible };
}

function overrideOf(photoId: string): HandoverEvent {
  return { type: 'photoChecked', photoId, usable: false, reason: 'Too dark', overridden: true, assessmentId: null };
}

describe('photo checks gate the comparison and the override (M13)', () => {
  const returning = (extra: [Actor, HandoverEvent][]) =>
    build([['shop', CREATED], ...activeEvents(), ['system', { type: 'returnStarted' }], ...returnPhotoEvents(), ...extra]);

  it('comparison needs every return photo to have passed its check', () => {
    expect(reasonOf(canApply(returningState(), comparisonOf([])))).toContain('Every return photo');
    const oneFailed = returning([...checkEvents(['r-f', 'r-b', 'r-l']), ['system', failedCheckOf('r-r')]]);
    expect(canApply(oneFailed, comparisonOf([])).ok).toBe(false);
    expect(canApply(checkedReturningState(), comparisonOf([]))).toEqual({ ok: true });
  });

  it('a rejected return closeup does not block the comparison, but a rejected required angle still does', () => {
    const withCloseup = (check: HandoverEvent, extra: [Actor, HandoverEvent][] = []) =>
      returning([
        ['shop', { type: 'photoAdded', photo: photo('r-c1', 'return', 'closeup') }],
        ...checkEvents(['r-f', 'r-b', 'r-l', 'r-r']),
        ['system', check],
        ...extra,
      ]);
    // A person as the main subject: this closeup can never be kept, so it must not block forever.
    expect(canApply(withCloseup(failedCheckOf('r-c1', true)), comparisonOf([]))).toEqual({ ok: true });
    expect(canApply(withCloseup(failedCheckOf('r-c1')), comparisonOf([]))).toEqual({ ok: true });
    const requiredFailed = returning([
      ['shop', { type: 'photoAdded', photo: photo('r-c1', 'return', 'closeup') }],
      ...checkEvents(['r-b', 'r-l', 'r-r']),
      ['system', failedCheckOf('r-f')],
      ['system', failedCheckOf('r-c1', true)],
    ]);
    expect(canApply(requiredFailed, comparisonOf([])).ok).toBe(false);
  });

  it('a closeup that has not been checked yet still blocks the comparison', () => {
    const state = returning([
      ['shop', { type: 'photoAdded', photo: photo('r-c1', 'return', 'closeup') }],
      ...checkEvents(['r-f', 'r-b', 'r-l', 'r-r']),
    ]);
    expect(canApply(state, comparisonOf([])).ok).toBe(false);
  });

  it('comparison pairs leave out closeups that failed their check', () => {
    const state = build([
      ['shop', CREATED],
      ['shop', { type: 'photoAdded', photo: photo('p-c1', 'pickup', 'closeup') }],
      ...activeEvents(),
      ['system', { type: 'returnStarted' }],
      ...returnPhotoEvents(),
      ['shop', { type: 'photoAdded', photo: photo('r-c1', 'return', 'closeup') }],
      ['shop', { type: 'photoAdded', photo: photo('r-c2', 'return', 'closeup') }],
      ...checkEvents(['r-f', 'r-b', 'r-l', 'r-r', 'r-c2']),
      ['system', failedCheckOf('r-c1', true)],
    ]);
    const closeups = buildPairs(state).filter((pair) => pair.angle === 'closeup');
    expect(closeups.map((pair) => [pair.before.id, pair.after.id])).toEqual([['p-c1', 'r-c2']]);
  });

  it('overriding needs two failed tries for that angle first', () => {
    const once = returning([['system', failedCheckOf('r-f')]]);
    expect(reasonOf(canApply(once, overrideOf('r-f')))).toContain('two failed tries');
    const twice = returning([
      ['system', failedCheckOf('r-f')],
      ['shop', { type: 'photoAdded', photo: photo('r-f2', 'return', 'front') }],
      ['system', failedCheckOf('r-f2')],
    ]);
    expect(twice.photoTries['return:front']).toBe(2);
    expect(canApply(twice, overrideOf('r-f2'))).toEqual({ ok: true });
  });

  it('an overridden photo counts as passed for the comparison', () => {
    const state = returning([
      ...checkEvents(['r-b', 'r-l', 'r-r']),
      ['system', failedCheckOf('r-f')],
      ['shop', { type: 'photoAdded', photo: photo('r-f2', 'return', 'front') }],
      ['system', failedCheckOf('r-f2')],
      ['shop', overrideOf('r-f2')],
    ]);
    expect(canApply(state, comparisonOf([]))).toEqual({ ok: true });
  });

  it('a photo rejected because a person is the main subject can never be overridden', () => {
    const state = returning([
      ['system', failedCheckOf('r-f', true)],
      ['shop', { type: 'photoAdded', photo: photo('r-f2', 'return', 'front') }],
      ['system', failedCheckOf('r-f2', true)],
    ]);
    expect(state.photoChecks['r-f2'].personVisible).toBe(true);
    expect(reasonOf(canApply(state, overrideOf('r-f2')))).toContain('person');
  });

  it('a photo that passed, or was never checked, is not overridden', () => {
    expect(canApply(checkedReturningState(), overrideOf('r-f')).ok).toBe(false);
    expect(canApply(returningState(), overrideOf('r-f')).ok).toBe(false);
  });
});

describe('photoChecked status guard', () => {
  it('allows checking a pickup photo while the handover is a draft', () => {
    const state = build([['shop', CREATED], ...pickupEvents()]);
    expect(canApply(state, checkOf('p-f'))).toEqual({ ok: true });
  });

  it('refuses checking a pickup photo once the hold is active', () => {
    const state = build([['shop', CREATED], ...activeEvents()]);
    expect(state.status).toBe('active');
    expect(canApply(state, checkOf('p-f')).ok).toBe(false);
  });

  it('allows checking a return photo while the handover is returning', () => {
    expect(canApply(returningState(), checkOf('r-f'))).toEqual({ ok: true });
  });

  it('refuses checking a return photo once the review is done', () => {
    expect(canApply(reviewedState([]), checkOf('r-f')).ok).toBe(false);
  });
});

describe('holdReauthorized and holdLost', () => {
  it('reauthorizes an active hold and keeps its order id and the parent authorization', () => {
    const state = build([['shop', CREATED], ...activeEvents(), ['system', REAUTHORIZE]]);
    expect(state.hold).toEqual({
      orderId: 'o1',
      authorizationId: 'auth-2',
      parentAuthorizationId: 'auth-1',
      amountCents: 15000,
      honorUntil: LATER_REAUTH,
      expiresAt: LATER_REAUTH,
    });
  });

  it('a second reauthorization still keeps the first (parent) authorization', () => {
    const again: HandoverEvent = { ...REAUTHORIZE, authorizationId: 'auth-3' };
    const state = build([['shop', CREATED], ...activeEvents(), ['system', REAUTHORIZE], ['system', again]]);
    expect(state.hold).toMatchObject({ authorizationId: 'auth-3', parentAuthorizationId: 'auth-1' });
  });

  it('after a reauthorization, release names the parent and charge names the current authorization', () => {
    const reviewed = build([
      ['shop', CREATED],
      ...pickupEvents(),
      ...confirmedEvents(),
      ['system', REAUTHORIZE],
      ['system', { type: 'returnStarted' }],
      ...returnPhotoEvents(),
      ['system', comparisonOf([])],
    ]);
    expect(canApply(reviewed, RELEASE_OK)).toEqual({ ok: true });
    expect(canApply(reviewed, { type: 'released', authorizationId: 'auth-2' }).ok).toBe(false);
    const proposed = build([
      ['shop', CREATED],
      ...pickupEvents(),
      ...confirmedEvents(),
      ['system', REAUTHORIZE],
      ['system', { type: 'returnStarted' }],
      ...returnPhotoEvents(),
      ['system', comparisonOf([confirmedFinding('p-mirror')])],
      ['shop', PROPOSAL],
    ]);
    expect(canApply(proposed, chargeOf('auth-2', 3000, 12000))).toEqual({ ok: true });
    expect(canApply(proposed, chargeOf('auth-1', 3000, 12000)).ok).toBe(false);
  });

  it('records a lost hold and leaves the status unchanged', () => {
    const state = build([['shop', CREATED], ...activeEvents(), ['system', lostOf('EXPIRED')]]);
    expect(state.holdLost).toBe('EXPIRED');
    expect(state.status).toBe('active');
  });

  it('refuses a lost event when there is no hold', () => {
    expect(canApply(build([['shop', CREATED]]), lostOf('VOIDED')).ok).toBe(false);
  });

  it('refuses a lost event once the hold is settled', () => {
    const state = build([['shop', CREATED], ...reviewedEvents([]), ['system', RELEASE_OK]]);
    expect(state.status).toBe('released');
    expect(canApply(state, lostOf('CAPTURED')).ok).toBe(false);
  });

  it('refuses reauthorization once the hold is lost', () => {
    const state = build([['shop', CREATED], ...activeEvents(), ['system', lostOf('EXPIRED')]]);
    expect(reasonOf(canApply(state, REAUTHORIZE))).toContain('lost');
  });

  it('refuses reauthorization when there is no hold', () => {
    const state = { ...build([['shop', CREATED], ...activeEvents()]), hold: null };
    expect(canApply(state, REAUTHORIZE).ok).toBe(false);
  });
});

describe('released and charged payload checks', () => {
  it('released is allowed on a reviewed handover with no confirmed finding', () => {
    expect(canApply(reviewedState([]), RELEASE_OK)).toEqual({ ok: true });
  });

  it('released must name the authorization that is on the hold', () => {
    expect(canApply(reviewedState([]), { type: 'released', authorizationId: 'auth-9' }).ok).toBe(false);
  });

  it('released refuses when there is no hold', () => {
    const state = { ...reviewedState([]), hold: null };
    expect(canApply(state, RELEASE_OK).ok).toBe(false);
  });

  it('charged is allowed after a proposal, with amounts that add up to the hold', () => {
    const state = proposedState([confirmedFinding('p-mirror')]);
    expect(state.status).toBe('chargeProposed');
    expect(canApply(state, chargeOf('auth-1', 3000, 12000))).toEqual({ ok: true });
  });

  it('charged is refused on a reviewed handover that has no proposal', () => {
    const state = reviewedState([confirmedFinding('p-mirror')]);
    expect(canApply(state, chargeOf('auth-1', 3000, 12000)).ok).toBe(false);
  });

  it('charged is still allowed after a dispute, because a capture at PayPal wins', () => {
    const state = build([
      ['shop', CREATED],
      ...reviewedEvents([confirmedFinding('p-mirror')]),
      ['shop', PROPOSAL],
      ['renter', { type: 'disputed', reason: 'No' }],
    ]);
    expect(state.status).toBe('disputed');
    expect(canApply(state, chargeOf('auth-1', 3000, 12000))).toEqual({ ok: true });
  });

  it('charged is refused after a dispute when the shop never proposed a charge', () => {
    const state = build([
      ['shop', CREATED],
      ...reviewedEvents([confirmedFinding('p-mirror')]),
      ['renter', { type: 'disputed', reason: 'No' }],
    ]);
    expect(state.status).toBe('disputed');
    expect(state.proposal).toBeNull();
    expect(canApply(state, chargeOf('auth-1', 3000, 12000)).ok).toBe(false);
  });

  it('released is allowed on a disputed handover, even with a confirmed finding', () => {
    const state = build([
      ['shop', CREATED],
      ...reviewedEvents([confirmedFinding('p-mirror')]),
      ['shop', PROPOSAL],
      ['renter', { type: 'disputed', reason: 'No' }],
    ]);
    expect(canApply(state, RELEASE_OK)).toEqual({ ok: true });
    const after = build([
      ['shop', CREATED],
      ...reviewedEvents([confirmedFinding('p-mirror')]),
      ['shop', PROPOSAL],
      ['renter', { type: 'disputed', reason: 'No' }],
      ['shop', RELEASE_OK],
    ]);
    expect(after.status).toBe('released');
  });

  it('released on a disputed handover still needs the right authorization', () => {
    const state = build([
      ['shop', CREATED],
      ...reviewedEvents([confirmedFinding('p-mirror')]),
      ['shop', PROPOSAL],
      ['renter', { type: 'disputed', reason: 'No' }],
    ]);
    expect(canApply(state, { type: 'released', authorizationId: 'auth-9' }).ok).toBe(false);
  });

  it('charged must name the authorization that is on the hold', () => {
    const state = proposedState([confirmedFinding('p-mirror')]);
    expect(canApply(state, chargeOf('auth-9', 3000, 12000)).ok).toBe(false);
  });

  it('charged amounts must add up to the hold amount', () => {
    const state = proposedState([confirmedFinding('p-mirror')]);
    expect(canApply(state, chargeOf('auth-1', 3000, 11000)).ok).toBe(false);
  });

  it('charged refuses a negative amount', () => {
    const state = proposedState([confirmedFinding('p-mirror')]);
    expect(canApply(state, chargeOf('auth-1', -1, 15001)).ok).toBe(false);
  });

  it('charged refuses a fraction of a cent', () => {
    const state = proposedState([confirmedFinding('p-mirror')]);
    expect(canApply(state, chargeOf('auth-1', 1.5, 14998.5)).ok).toBe(false);
  });

  it('charged refuses when there is no hold', () => {
    const state = { ...proposedState([confirmedFinding('p-mirror')]), hold: null };
    expect(canApply(state, chargeOf('auth-1', 3000, 12000)).ok).toBe(false);
  });

  it('reduces a charge into a charged settlement', () => {
    const state = build([
      ['shop', CREATED],
      ...reviewedEvents([confirmedFinding('p-mirror')]),
      ['shop', PROPOSAL],
      ['system', chargeOf('auth-1', 3000, 12000)],
    ]);
    expect(state.status).toBe('charged');
    expect(state.settlement).toEqual({ kind: 'charged', captureId: 'cap-1', chargeCents: 3000, releaseCents: 12000 });
  });
});

describe('chargeProposed', () => {
  it('is allowed when every finding is decided and the payload equals the computed charge', () => {
    const state = reviewedState([confirmedFinding('p-mirror')]);
    expect(canApply(state, PROPOSAL)).toEqual({ ok: true });
    expect(proposedState([confirmedFinding('p-mirror')]).proposal).toMatchObject({ chargeCents: 3000, releaseCents: 12000 });
  });

  it('is refused while a finding is proposed or needsHuman', () => {
    for (const status of ['proposed', 'needsHuman'] as const) {
      const state = reviewedState([confirmedFinding('p-mirror'), { ...confirmedFinding('p-mirror'), id: 'f2', status }]);
      expect(canApply(state, PROPOSAL).ok).toBe(false);
    }
  });

  it('is refused without a confirmed priced finding or with a zero charge', () => {
    expect(canApply(reviewedState([]), PROPOSAL).ok).toBe(false);
    expect(canApply(reviewedState([confirmedFinding(null)]), PROPOSAL).ok).toBe(false);
  });

  it('is refused when the payload differs from the computed charge', () => {
    const state = reviewedState([confirmedFinding('p-mirror')]);
    expect(canApply(state, { ...PROPOSAL, chargeCents: 2000, releaseCents: 13000 }).ok).toBe(false);
    expect(canApply(state, { ...PROPOSAL, lines: [] }).ok).toBe(false);
  });

  it('is refused outside reviewed, and freezes the findings afterwards', () => {
    expect(canApply(returningState(), PROPOSAL).ok).toBe(false);
    const state = proposedState([confirmedFinding('p-mirror')]);
    expect(canApply(state, PROPOSAL).ok).toBe(false);
    expect(canApply(state, { type: 'findingUpdated', findingId: 'f1', status: 'dismissed', priceItemId: null }).ok).toBe(false);
    expect(canApply(state, { type: 'findingAdded', finding: { ...confirmedFinding('p-mirror'), id: 'f9' } }).ok).toBe(false);
    expect(canApply(state, { type: 'released', authorizationId: 'auth-1' }).ok).toBe(false);
    expect(canApply(state, { type: 'disputed', reason: 'No' })).toEqual({ ok: true });
  });
});

describe('comparisonDone and finding checks', () => {
  it('comparisonDone is refused while a return angle is missing', () => {
    const state = build([
      ['shop', CREATED],
      ...activeEvents(),
      ['system', { type: 'returnStarted' }],
      ['shop', { type: 'photoAdded', photo: photo('r-f', 'return', 'front') }],
      ['shop', { type: 'photoAdded', photo: photo('r-b', 'return', 'back') }],
      ['shop', { type: 'photoAdded', photo: photo('r-l', 'return', 'left') }],
    ]);
    expect(reasonOf(canApply(state, comparisonOf([])))).toContain('right');
  });

  it('comparisonDone refuses two findings with the same id', () => {
    const findings = [confirmedFinding(null), confirmedFinding(null)];
    expect(canApply(checkedReturningState(), comparisonOf(findings)).ok).toBe(false);
  });

  it('comparisonDone refuses a price item that is not in the price list', () => {
    expect(reasonOf(canApply(checkedReturningState(), comparisonOf([confirmedFinding('nope')])))).toContain('Unknown price item');
  });

  it('comparisonDone accepts a finding with no price item', () => {
    expect(canApply(checkedReturningState(), comparisonOf([confirmedFinding(null)]))).toEqual({ ok: true });
  });

  it('findingAdded refuses a finding id that already exists', () => {
    const state = reviewedState([confirmedFinding(null)]);
    expect(canApply(state, { type: 'findingAdded', finding: confirmedFinding(null) }).ok).toBe(false);
  });

  it('findingAdded refuses a price item that is not in the price list', () => {
    expect(canApply(reviewedState([]), { type: 'findingAdded', finding: confirmedFinding('nope') }).ok).toBe(false);
  });
});

describe('reduction of later events', () => {
  it('findingUpdated changes the status and price item of a finding', () => {
    const state = build([
      ['shop', CREATED],
      ...reviewedEvents([confirmedFinding(null)]),
      ['shop', { type: 'findingUpdated', findingId: 'f1', status: 'dismissed', priceItemId: 'p-mirror' }],
    ]);
    expect(state.findings[0]).toMatchObject({ id: 'f1', status: 'dismissed', priceItemId: 'p-mirror' });
  });

  it('disputed records the reason and closed follows it', () => {
    const disputed = build([
      ['shop', CREATED],
      ...reviewedEvents([]),
      ['shop', { type: 'disputed', reason: 'Scratch not agreed' }],
    ]);
    expect(disputed.status).toBe('disputed');
    expect(disputed.dispute).toEqual({ reason: 'Scratch not agreed' });

    const closed = build([
      ['shop', CREATED],
      ...reviewedEvents([]),
      ['shop', { type: 'disputed', reason: 'Scratch not agreed' }],
      ['shop', { type: 'closed' }],
    ]);
    expect(closed.status).toBe('closed');
  });

  it('closed is refused from reviewed', () => {
    expect(canApply(reviewedState([]), { type: 'closed' }).ok).toBe(false);
  });

  it('lastHash is the hash of the last event', () => {
    const chain = buildChain([['shop', CREATED], ...activeEvents()]);
    const state = reduce('h1', chain);
    expect(state.lastHash).toBe(chain[chain.length - 1].hash);
    expect(state.lastSeq).toBe(chain.length - 1);
  });
});

describe('photo id uniqueness', () => {
  it('refuses a photo whose id is already used', () => {
    const state = build([['shop', CREATED], ['shop', { type: 'photoAdded', photo: photo('p-f', 'pickup', 'front') }]]);
    expect(canApply(state, { type: 'photoAdded', photo: photo('p-f', 'pickup', 'back') }).ok).toBe(false);
  });
});
