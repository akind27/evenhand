import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PaymentError } from '@/lib/payments/gateway';
import { AppendConflictError, type EvidenceStore } from '@/lib/evidence/store';
import { createRecordedAssessor } from '@/lib/ai/recorded-assessor';
import { createSampleRouter } from '@/lib/ai/sample-router';
import { isSampleHash } from '@/lib/demo/sample-photos';
import {
  failureOutcome,
  successOutcome,
  type AiOutcome,
  type CompareResult,
  type ConditionResult,
  type PhotoCheckResult,
  type VisionAssessor,
} from '@/lib/ai/assessor';
import { computeCharge } from '@/lib/domain/settlement';
import type { HandoverState } from '@/lib/domain/state';
import type { Angle } from '@/lib/domain/types';
import { createLocalStore } from '@/lib/evidence/local-store';
import { sha256Hex } from '@/lib/evidence/hash';
import { createFakeGateway } from '@/lib/payments/fake-gateway';
import { createHandoverService, ServiceError, type HandoverService } from '@/lib/service/handover-service';

const START = Date.parse('2026-11-08T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const ANGLES: Angle[] = ['front', 'back', 'left', 'right'];
const PICKUP_BYTES = [1, 2, 3, 4];
const RETURN_BYTES = [5, 6, 7, 8];

const SCRATCH = {
  angle: 'front',
  location: 'Front fender',
  description: 'New scratch on the fender',
  severity: 'minor',
  confidence: 0.9,
  box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
  priceItemId: 'scratch-panel',
};

function jpeg(n: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, n]);
}

function keyFor(kind: 'condition' | 'comparison', ns: number[]): string {
  return `${kind}:${ns.map((n) => sha256Hex(jpeg(n))).sort().join(',')}`;
}

interface Setup {
  svc: HandoverService;
  clock: { ms: number };
  gateway: ReturnType<typeof createFakeGateway>;
  store: ReturnType<typeof createLocalStore>;
  ai: VisionAssessor;
}

interface SetupOptions {
  compare?: { findings: unknown[]; explanation: string } | null;
  condition?: boolean;
  wrapAi?: (ai: VisionAssessor) => VisionAssessor;
  wrapStore?: (store: EvidenceStore) => EvidenceStore;
}

function setup(options: SetupOptions = {}): Setup {
  const clock = { ms: START };
  const now = () => new Date(clock.ms);
  let counter = 0;
  const newId = () => `id${++counter}`;
  const store = createLocalStore(fs.mkdtempSync(path.join(os.tmpdir(), 'evenhand-')));
  const gateway = createFakeGateway({ now, autoApprove: true });
  const answers: Record<string, unknown> = {};
  if (options.condition !== false) {
    answers[keyFor('condition', PICKUP_BYTES)] = {
      itemDescription: 'Red scooter',
      detectedItemType: '125cc scooter',
      suggestedRuleId: 'scooter-125',
      marks: [],
    };
  }
  if (options.compare) {
    answers[keyFor('comparison', [...PICKUP_BYTES, ...RETURN_BYTES])] = options.compare;
  }
  const recorded = createRecordedAssessor(answers, { now, newId });
  const ai = options.wrapAi ? options.wrapAi(recorded) : recorded;
  const used = options.wrapStore ? options.wrapStore(store) : store;
  return { svc: createHandoverService({ store: used, payments: gateway, ai, now, newId }), clock, gateway, store, ai };
}

async function startHandover(svc: HandoverService): Promise<string> {
  const { shop } = await svc.createShop({ name: 'Island Rentals', isDemo: true });
  const { handoverId } = await svc.createHandover(shop.id, { itemType: '125cc scooter', itemRef: 'ABC-123' });
  return handoverId;
}

async function addPhotos(svc: HandoverService, id: string, phase: 'pickup' | 'return', ns: number[]): Promise<void> {
  for (const [index, angle] of ANGLES.entries()) {
    await svc.addPhoto(id, { phase, angle, bytes: jpeg(ns[index]), source: 'camera' });
  }
}

async function toOrdered(svc: HandoverService): Promise<{ id: string; orderId: string }> {
  const id = await startHandover(svc);
  await addPhotos(svc, id, 'pickup', PICKUP_BYTES);
  await svc.recordCondition(id);
  await svc.setDeposit(id, 'scooter-125');
  await svc.shareWithRenter(id);
  await svc.renterConfirm(id, { language: 'en', renterName: 'Sam', deviceHash: DEVICE_HASH });
  const { orderId } = await svc.createHoldOrder(id);
  return { id, orderId };
}

async function toActive(svc: HandoverService): Promise<string> {
  const { id, orderId } = await toOrdered(svc);
  await svc.authorizeHold(id, orderId);
  return id;
}

/** Shop confirms the first finding as a scratch and freezes the charge. */
async function confirmAndPropose(svc: HandoverService, id: string): Promise<HandoverState> {
  const state = await svc.getState(id);
  await svc.updateFinding(id, state.findings[0].id, { status: 'confirmed', priceItemId: 'scratch-panel' });
  return svc.proposeCharge(id);
}

async function toReviewed(s: Setup): Promise<string> {
  const id = await toActive(s.svc);
  await s.svc.startReturn(id);
  await addPhotos(s.svc, id, 'return', RETURN_BYTES);
  await s.svc.compare(id);
  return id;
}

const withScratch = { findings: [SCRATCH], explanation: 'One new scratch on the front.' };
const DEVICE_HASH = sha256Hex('renter-phone-secret');

async function eventTypes(s: Setup, id: string): Promise<string[]> {
  return (await s.store.listEvents(id)).map((entry) => entry.event.type);
}

async function rejectionCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ServiceError) return error.code;
    throw error;
  }
  return 'NO_ERROR';
}

describe('handover service: settlement', () => {
  it('clean return: hold is voided and status released', async () => {
    const s = setup({ compare: { findings: [], explanation: 'No new damage.' } });
    const id = await toReviewed(s);
    const state = await s.svc.release(id);
    expect(state.status).toBe('released');
    expect(state.settlement).toEqual({ kind: 'released' });
    expect(await s.gateway.getHoldStatus(state.hold!.authorizationId)).toBe('VOIDED');
  });

  it('damaged return: shop confirms a 20 euro scratch, renter accepts, capture is 2000 and release 13000', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    const reviewed = await s.svc.getState(id);
    expect(reviewed.findings[0].status).toBe('proposed');
    const proposed = await confirmAndPropose(s.svc, id);
    expect(proposed.status).toBe('chargeProposed');
    expect(proposed.proposal).toMatchObject({ chargeCents: 2000, releaseCents: 13000 });
    const state = await s.svc.acceptCharge(id);
    expect(state.status).toBe('charged');
    expect(state.settlement).toMatchObject({ kind: 'charged', chargeCents: 2000, releaseCents: 13000 });
    expect(await s.gateway.getHoldStatus(state.hold!.authorizationId)).toBe('PARTIALLY_CAPTURED');
  });

  it('low-confidence finding is needsHuman and not charged until confirmed', async () => {
    const unsure = { ...SCRATCH, confidence: 0.5 };
    const s = setup({ compare: { findings: [unsure], explanation: 'Maybe a scratch.' } });
    const id = await toReviewed(s);
    const reviewed = await s.svc.getState(id);
    expect(reviewed.findings[0].status).toBe('needsHuman');
    expect(computeCharge(reviewed.findings, reviewed.priceList, reviewed.hold!.amountCents).chargeCents).toBe(0);
    expect(await rejectionCode(s.svc.proposeCharge(id))).toBe('INVALID_STATE');
    await confirmAndPropose(s.svc, id);
    const state = await s.svc.acceptCharge(id);
    expect(state.settlement).toMatchObject({ kind: 'charged', chargeCents: 2000 });
  });

  it('accept before the shop proposes is refused and never touches the hold', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    const capture = vi.spyOn(s.gateway, 'captureHold');
    const voided = vi.spyOn(s.gateway, 'voidHold');
    expect(await rejectionCode(s.svc.acceptCharge(id))).toBe('INVALID_STATE');
    const reviewed = await s.svc.getState(id);
    await s.svc.updateFinding(id, reviewed.findings[0].id, { status: 'dismissed', priceItemId: null });
    expect(await rejectionCode(s.svc.acceptCharge(id))).toBe('INVALID_STATE');
    expect(capture).not.toHaveBeenCalled();
    expect(voided).not.toHaveBeenCalled();
    expect(await s.gateway.getHoldStatus(reviewed.hold!.authorizationId)).toBe('CREATED');
  });

  it('the findings are frozen after the proposal, so the captured amount cannot change', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    const proposed = await confirmAndPropose(s.svc, id);
    const edit = s.svc.updateFinding(id, proposed.findings[0].id, { status: 'dismissed', priceItemId: null });
    expect(await rejectionCode(edit)).toBe('INVALID_STATE');
    const manual = s.svc.addManualFinding(id, { angle: 'back', location: 'Back', description: 'Dent', priceItemId: 'dent-panel' });
    expect(await rejectionCode(manual)).toBe('INVALID_STATE');
    expect(await rejectionCode(s.svc.release(id))).toBe('INVALID_STATE');
    const capture = vi.spyOn(s.gateway, 'captureHold');
    const state = await s.svc.acceptCharge(id);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0].amountCents).toBe(2000);
    expect(state.settlement).toMatchObject({ chargeCents: 2000, releaseCents: 13000 });
  });

  it('charged records the amount PayPal really captured when it differs from the request', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    await confirmAndPropose(s.svc, id);
    vi.spyOn(s.gateway, 'captureHold').mockResolvedValue({ captureId: 'CAP-ODD', amountCents: 1500 });
    const state = await s.svc.acceptCharge(id);
    expect(state.settlement).toEqual({ kind: 'charged', captureId: 'CAP-ODD', chargeCents: 1500, releaseCents: 13500 });
  });

  it('a post-payment append conflict records the same charge once more', async () => {
    let svcRef: HandoverService | undefined;
    let conflicted = false;
    const s = setup({
      compare: withScratch,
      wrapStore: (inner) => ({
        ...inner,
        appendEvent: async (handoverId, ev) => {
          if (!conflicted && ev.event.type === 'charged') {
            conflicted = true;
            await svcRef!.dispute(handoverId, 'Too late');
            throw new AppendConflictError('simulated race');
          }
          return inner.appendEvent(handoverId, ev);
        },
      }),
    });
    svcRef = s.svc;
    const id = await toReviewed(s);
    await confirmAndPropose(s.svc, id);
    const capture = vi.spyOn(s.gateway, 'captureHold');
    const state = await s.svc.acceptCharge(id);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(state.status).toBe('charged');
    expect(state.dispute).toEqual({ reason: 'Too late' });
    expect(state.settlement).toMatchObject({ chargeCents: 2000, releaseCents: 13000 });
    expect((await eventTypes(s, id)).filter((type) => type === 'charged')).toHaveLength(1);
  });

  it('a payment that cannot be recorded is reported, not hidden', async () => {
    const s = setup({
      compare: withScratch,
      wrapStore: (inner) => ({
        ...inner,
        appendEvent: async (handoverId, ev) => {
          if (ev.event.type === 'charged') throw new AppendConflictError('always');
          return inner.appendEvent(handoverId, ev);
        },
      }),
    });
    const id = await toReviewed(s);
    await confirmAndPropose(s.svc, id);
    expect(await rejectionCode(s.svc.acceptCharge(id))).toBe('PAYMENT');
    expect((await s.svc.getState(id)).holdLost).toBeNull();
  });

  it('repeated taps return the current state', async () => {
    const s = setup({ compare: withScratch });
    const { id, orderId } = await toOrdered(s.svc);
    const first = await s.svc.authorizeHold(id, orderId);
    const second = await s.svc.authorizeHold(id, orderId);
    expect(second.lastSeq).toBe(first.lastSeq);
    const again = await s.svc.renterConfirm(id, { language: 'de', renterName: null, deviceHash: sha256Hex('another-device') });
    expect(again.renter?.language).toBe('en');
    // The first device keeps the binding.
    expect(again.renterDeviceHash).toBe(DEVICE_HASH);
    await s.svc.startReturn(id);
    await addPhotos(s.svc, id, 'return', RETURN_BYTES);
    const compared = await s.svc.compare(id);
    expect((await s.svc.compare(id)).lastSeq).toBe(compared.lastSeq);
    const proposed = await confirmAndPropose(s.svc, id);
    expect((await s.svc.proposeCharge(id)).lastSeq).toBe(proposed.lastSeq);
    const disputed = await s.svc.dispute(id, 'No');
    expect((await s.svc.dispute(id, 'No')).lastSeq).toBe(disputed.lastSeq);
  });

  it('confirming a finding needs a price item', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    const reviewed = await s.svc.getState(id);
    const update = s.svc.updateFinding(id, reviewed.findings[0].id, { status: 'confirmed', priceItemId: null });
    expect(await rejectionCode(update)).toBe('INVALID_INPUT');
  });

  it('release is refused while a finding is confirmed, and the hold is not voided', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    const reviewed = await s.svc.getState(id);
    await s.svc.updateFinding(id, reviewed.findings[0].id, { status: 'confirmed', priceItemId: 'scratch-panel' });
    const voided = vi.spyOn(s.gateway, 'voidHold');
    expect(await rejectionCode(s.svc.release(id))).toBe('INVALID_STATE');
    expect(voided).not.toHaveBeenCalled();
    expect(await s.gateway.getHoldStatus(reviewed.hold!.authorizationId)).toBe('CREATED');
  });

  it('dispute keeps the hold and marks disputed', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    const state = await s.svc.dispute(id, '  The scratch was already there  ');
    expect(state.status).toBe('disputed');
    expect(state.dispute).toEqual({ reason: 'The scratch was already there' });
    expect(await s.gateway.getHoldStatus(state.hold!.authorizationId)).toBe('CREATED');
  });

  it('the shop can release a disputed handover: one void call and status released', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    await confirmAndPropose(s.svc, id);
    expect((await s.svc.dispute(id, 'It was already there')).status).toBe('disputed');
    const voided = vi.spyOn(s.gateway, 'voidHold');
    const state = await s.svc.release(id);
    expect(voided).toHaveBeenCalledTimes(1);
    expect(state.status).toBe('released');
    expect(state.settlement).toEqual({ kind: 'released' });
    expect(await s.gateway.getHoldStatus(state.hold!.authorizationId)).toBe('VOIDED');
  });

  it('accepting a dispute that has no proposal never captures', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    const reviewed = await s.svc.getState(id);
    await s.svc.updateFinding(id, reviewed.findings[0].id, { status: 'confirmed', priceItemId: 'scratch-panel' });
    await s.svc.dispute(id, 'No');
    const capture = vi.spyOn(s.gateway, 'captureHold');
    expect(await rejectionCode(s.svc.acceptCharge(id))).toBe('INVALID_STATE');
    expect(capture).not.toHaveBeenCalled();
  });

  it('a capture larger than the hold is reported as a payment problem, not a state problem', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    await confirmAndPropose(s.svc, id);
    vi.spyOn(s.gateway, 'captureHold').mockResolvedValue({ captureId: 'CAP-BIG', amountCents: 99999 });
    const attempt = s.svc.acceptCharge(id);
    await expect(attempt).rejects.toMatchObject({
      code: 'PAYMENT',
      message: 'Payment completed at PayPal but could not be recorded — check the PayPal dashboard',
    });
  });

  it('two services in one process do not share an in-flight call', async () => {
    const a = setup({ compare: { findings: [], explanation: 'No new damage.' } });
    const b = setup({ compare: { findings: [], explanation: 'No new damage.' } });
    const idA = await toReviewed(a);
    const idB = await toReviewed(b);
    expect(idA).toBe(idB);
    const voidA = vi.spyOn(a.gateway, 'voidHold');
    const voidB = vi.spyOn(b.gateway, 'voidHold');
    const [stateA, stateB] = await Promise.all([a.svc.release(idA), b.svc.release(idB)]);
    expect(voidA).toHaveBeenCalledTimes(1);
    expect(voidB).toHaveBeenCalledTimes(1);
    expect(stateA.status).toBe('released');
    expect(stateB.status).toBe('released');
    expect(await eventTypes(b, idB)).toContain('released');
  });

  it('idempotent release: two concurrent release calls make one void and both return released', async () => {
    const s = setup({ compare: { findings: [], explanation: 'No new damage.' } });
    const id = await toReviewed(s);
    const voided = vi.spyOn(s.gateway, 'voidHold');
    const [a, b] = await Promise.all([s.svc.release(id), s.svc.release(id)]);
    expect(voided).toHaveBeenCalledTimes(1);
    expect(a.status).toBe('released');
    expect(b.status).toBe('released');
    expect((await eventTypes(s, id)).filter((type) => type === 'released')).toHaveLength(1);
    expect((await s.svc.release(id)).status).toBe('released');
  });

  it('idempotent accept: two accept calls make one capture', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    await confirmAndPropose(s.svc, id);
    const capture = vi.spyOn(s.gateway, 'captureHold');
    const [a, b] = await Promise.all([s.svc.acceptCharge(id), s.svc.acceptCharge(id)]);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(a.status).toBe('charged');
    expect(b.status).toBe('charged');
    expect(a.settlement).toEqual(b.settlement);
    expect((await eventTypes(s, id)).filter((type) => type === 'charged')).toHaveLength(1);
    expect((await s.svc.acceptCharge(id)).status).toBe('charged');
  });

  it('compare failure falls back to manual: aiFailed true, shop adds a manual finding and confirms it', async () => {
    const s = setup({ compare: null });
    const id = await toReviewed(s);
    const reviewed = await s.svc.getState(id);
    expect(reviewed.aiFailed).toBe(true);
    expect(reviewed.findings).toEqual([]);
    expect(reviewed.explanation).toBe('The AI check could not run. Please compare the photos yourself.');
    const added = await s.svc.addManualFinding(id, {
      angle: 'front',
      location: 'Front fender',
      description: 'Scratch seen by the shop',
      priceItemId: 'scratch-panel',
    });
    const finding = added.findings[0];
    expect(finding).toMatchObject({ source: 'shop', status: 'confirmed', confidence: 1, severity: 'moderate' });
    await s.svc.updateFinding(id, finding.id, { status: 'confirmed', priceItemId: 'scratch-panel' });
    await s.svc.proposeCharge(id);
    const state = await s.svc.acceptCharge(id);
    expect(state.settlement).toMatchObject({ kind: 'charged', chargeCents: 2000, releaseCents: 13000 });
  });
});

describe('handover service: a manual finding with a box', () => {
  const manual = { angle: 'front' as const, location: 'Front fender', description: 'Scratch seen by the shop', priceItemId: 'scratch-panel' };

  it('keeps the box the shop placed, and uses the whole photo when there is none', async () => {
    const s = setup({ compare: null });
    const id = await toReviewed(s);
    const withBox = await s.svc.addManualFinding(id, { ...manual, box: { x: 0.3, y: 0.4, w: 0.2, h: 0.12 } });
    expect(withBox.findings[0].box).toEqual({ x: 0.3, y: 0.4, w: 0.2, h: 0.12 });
    const without = await s.svc.addManualFinding(id, manual);
    expect(without.findings[1].box).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it.each([
    ['runs past the right edge', { x: 0.9, y: 0.1, w: 0.2, h: 0.1 }],
    ['runs past the bottom edge', { x: 0.1, y: 0.95, w: 0.1, h: 0.1 }],
    ['has no size', { x: 0.1, y: 0.1, w: 0, h: 0.1 }],
    ['is negative', { x: -0.1, y: 0.1, w: 0.2, h: 0.1 }],
  ])('refuses a box that %s', async (_name, box) => {
    const s = setup({ compare: null });
    const id = await toReviewed(s);
    expect(await rejectionCode(s.svc.addManualFinding(id, { ...manual, box }))).toBe('INVALID_INPUT');
    expect((await s.svc.getState(id)).findings).toEqual([]);
  });
});

describe('handover service: hold problems', () => {
  it('expired hold: capture throws EXPIRED → holdLost recorded and HOLD_LOST thrown', async () => {
    const s = setup({ compare: withScratch });
    const id = await toReviewed(s);
    await confirmAndPropose(s.svc, id);
    s.clock.ms += 30 * DAY_MS;
    expect(await rejectionCode(s.svc.acceptCharge(id))).toBe('HOLD_LOST');
    const state = await s.svc.getState(id);
    expect(state.holdLost).toBe('EXPIRED');
    expect(state.settlement).toBeNull();
    expect(await rejectionCode(s.svc.release(id))).toBe('HOLD_LOST');
  });

  it('refreshHold reauthorizes after the honor period', async () => {
    const s = setup({ compare: { findings: [], explanation: '' } });
    const id = await toActive(s.svc);
    const before = await s.svc.getState(id);
    s.clock.ms += DAY_MS;
    expect((await s.svc.refreshHold(id)).lastSeq).toBe(before.lastSeq);
    s.clock.ms += 3 * DAY_MS;
    const after = await s.svc.refreshHold(id);
    expect(after.lastSeq).toBe(before.lastSeq + 1);
    // PayPal gives a reauthorization its own id; the parent id is kept for the void.
    expect(after.hold!.authorizationId).not.toBe(before.hold!.authorizationId);
    expect(after.hold!.parentAuthorizationId).toBe(before.hold!.authorizationId);
    expect(after.hold!.orderId).toBe(before.hold!.orderId);
    expect(Date.parse(after.hold!.honorUntil)).toBeGreaterThan(Date.parse(before.hold!.honorUntil));
  });

  it('a second renewal reauthorizes the parent, never the child, with a new request id', async () => {
    const s = setup({ compare: { findings: [], explanation: '' } });
    const id = await toActive(s.svc);
    const first = (await s.svc.getState(id)).hold!;
    const reauth = vi.spyOn(s.gateway, 'reauthorize');
    s.clock.ms += 4 * DAY_MS;
    const once = (await s.svc.refreshHold(id)).hold!;
    s.clock.ms += 4 * DAY_MS;
    const twice = (await s.svc.refreshHold(id)).hold!;
    expect(reauth).toHaveBeenCalledTimes(2);
    expect(reauth.mock.calls[0][0]).toMatchObject({ authorizationId: first.authorizationId, currentAuthorizationId: first.authorizationId });
    expect(reauth.mock.calls[1][0]).toMatchObject({ authorizationId: first.authorizationId, currentAuthorizationId: once.authorizationId });
    expect(twice.authorizationId).not.toBe(once.authorizationId);
    expect(twice.parentAuthorizationId).toBe(first.authorizationId);
  });

  it('release after a reauthorization voids the parent authorization, and the money is really released', async () => {
    const s = setup({ compare: { findings: [], explanation: 'No new damage.' } });
    const id = await toActive(s.svc);
    const parent = (await s.svc.getState(id)).hold!.authorizationId;
    s.clock.ms += 4 * DAY_MS;
    const child = (await s.svc.refreshHold(id)).hold!.authorizationId;
    await s.svc.startReturn(id);
    await addPhotos(s.svc, id, 'return', RETURN_BYTES);
    await s.svc.compare(id);
    const voided = vi.spyOn(s.gateway, 'voidHold');
    const state = await s.svc.release(id);
    expect(voided).toHaveBeenCalledTimes(1);
    expect(voided.mock.calls[0][0].authorizationId).toBe(parent);
    expect(state.status).toBe('released');
    expect(await s.gateway.getHoldStatus(child)).toBe('VOIDED');
  });

  it('capture after a reauthorization uses the current (reauthorized) id', async () => {
    const s = setup({ compare: withScratch });
    const id = await toActive(s.svc);
    s.clock.ms += 4 * DAY_MS;
    const child = (await s.svc.refreshHold(id)).hold!.authorizationId;
    await s.svc.startReturn(id);
    await addPhotos(s.svc, id, 'return', RETURN_BYTES);
    await s.svc.compare(id);
    await confirmAndPropose(s.svc, id);
    const capture = vi.spyOn(s.gateway, 'captureHold');
    const state = await s.svc.acceptCharge(id);
    expect(capture.mock.calls[0][0].authorizationId).toBe(child);
    expect(state.settlement).toMatchObject({ kind: 'charged', chargeCents: 2000 });
  });

  it('a void PayPal refuses (CANNOT_BE_VOIDED) is not recorded as released', async () => {
    const s = setup({ compare: { findings: [], explanation: 'No new damage.' } });
    const id = await toReviewed(s);
    vi.spyOn(s.gateway, 'voidHold').mockRejectedValue(new PaymentError('UPSTREAM', 'PayPal refused the request (HTTP 422: CANNOT_BE_VOIDED)', 422));
    expect(await rejectionCode(s.svc.release(id))).toBe('PAYMENT');
    const state = await s.svc.getState(id);
    expect(state.status).toBe('reviewed');
    expect(state.settlement).toBeNull();
    expect(await eventTypes(s, id)).not.toContain('released');
  });

  it('refreshHold records holdLost when the hold is gone', async () => {
    const s = setup();
    const id = await toActive(s.svc);
    const state = await s.svc.getState(id);
    await s.gateway.voidHold({ handoverId: id, authorizationId: state.hold!.authorizationId });
    s.clock.ms += 4 * DAY_MS;
    expect((await s.svc.refreshHold(id)).holdLost).toBe('VOIDED');
    expect((await s.svc.refreshHold(id)).holdLost).toBe('VOIDED');
  });

  it('polling refreshHold after the honor period does not flood the log', async () => {
    const s = setup();
    const id = await toActive(s.svc);
    s.clock.ms += 4 * DAY_MS;
    const first = await s.svc.refreshHold(id);
    const second = await s.svc.refreshHold(id);
    const third = await s.svc.refreshHold(id);
    expect((await eventTypes(s, id)).filter((type) => type === 'holdReauthorized')).toHaveLength(1);
    expect(second.lastSeq).toBe(first.lastSeq);
    expect(third.lastSeq).toBe(first.lastSeq);
  });

  it('refreshHold does not call PayPal when the hold is not due', async () => {
    const s = setup();
    const id = await toActive(s.svc);
    const status = vi.spyOn(s.gateway, 'getHoldStatus');
    const reauth = vi.spyOn(s.gateway, 'reauthorize');
    s.clock.ms += DAY_MS;
    await s.svc.refreshHold(id);
    expect(status).not.toHaveBeenCalled();
    expect(reauth).not.toHaveBeenCalled();
  });

  it('a failing reauthorization is not retried more often than every 5 minutes', async () => {
    const s = setup();
    const id = await toActive(s.svc);
    const reauth = vi.spyOn(s.gateway, 'reauthorize').mockRejectedValue(new PaymentError('UPSTREAM', 'PayPal returned HTTP 500', 500));
    const status = vi.spyOn(s.gateway, 'getHoldStatus');
    s.clock.ms += 4 * DAY_MS;
    expect(await rejectionCode(s.svc.refreshHold(id))).toBe('PAYMENT');
    // Polling every few seconds: no new PayPal calls while the back-off lasts.
    s.clock.ms += 4 * 60 * 1000;
    expect((await s.svc.refreshHold(id)).holdLost).toBeNull();
    expect(reauth).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledTimes(1);
    s.clock.ms += 61 * 1000;
    reauth.mockRestore();
    const after = await s.svc.refreshHold(id);
    expect(status).toHaveBeenCalledTimes(2);
    expect(after.hold!.authorizationId).not.toBe(after.hold!.parentAuthorizationId);
  });

  it('says from the loaded state alone whether a hold refresh is due, so a poll does no extra reads (I7)', async () => {
    const s = setup();
    const id = await toActive(s.svc);
    expect(s.svc.holdRefreshDue(await s.svc.getState(id))).toBe(false);
    s.clock.ms += 4 * DAY_MS;
    const due = await s.svc.getState(id);
    expect(s.svc.holdRefreshDue(due)).toBe(true);
    vi.spyOn(s.gateway, 'getHoldStatus').mockRejectedValueOnce(new PaymentError('UPSTREAM', 'PayPal returned HTTP 500', 500));
    expect(await rejectionCode(s.svc.refreshHold(id))).toBe('PAYMENT');
    // While the back-off lasts, the route is told not to ask.
    expect(s.svc.holdRefreshDue(due)).toBe(false);
    expect(due.createdAt).toBe(new Date(START).toISOString());
  });

  it('refreshHold records holdLost when reauthorizing says EXPIRED', async () => {
    const s = setup();
    const id = await toActive(s.svc);
    vi.spyOn(s.gateway, 'reauthorize').mockRejectedValue(new PaymentError('EXPIRED', 'expired'));
    s.clock.ms += 4 * DAY_MS;
    expect((await s.svc.refreshHold(id)).holdLost).toBe('EXPIRED');
  });

  it('createHoldOrder twice makes one PayPal order', async () => {
    const s = setup();
    const created = vi.spyOn(s.gateway, 'createHoldOrder');
    const { id, orderId } = await toOrdered(s.svc);
    const again = await s.svc.createHoldOrder(id);
    expect(again.orderId).toBe(orderId);
    expect(created).toHaveBeenCalledTimes(1);
    expect((await s.svc.getState(id)).holdOrderId).toBe(orderId);
  });

  it('authorizeHold rejects a real order that belongs to another handover', async () => {
    const s = setup();
    const authorize = vi.spyOn(s.gateway, 'authorizeOrder');
    const first = await toOrdered(s.svc);
    const second = await toOrdered(s.svc);
    expect(second.orderId).not.toBe(first.orderId);
    expect(await rejectionCode(s.svc.authorizeHold(first.id, second.orderId))).toBe('INVALID_INPUT');
    expect(await rejectionCode(s.svc.authorizeHold(first.id, 'FAKE-ORDER-999'))).toBe('INVALID_INPUT');
    expect(authorize).not.toHaveBeenCalled();
    expect((await s.svc.authorizeHold(first.id, first.orderId)).hold?.orderId).toBe(first.orderId);
  });

  it('authorizeHold before the order exists is refused', async () => {
    const s = setup();
    const id = await startHandover(s.svc);
    expect(await rejectionCode(s.svc.authorizeHold(id, 'FAKE-ORDER-1'))).toBe('INVALID_STATE');
  });
});

describe('handover service: pickup', () => {
  it('cannot share with renter before all four angles and the condition record', async () => {
    const s = setup();
    const id = await startHandover(s.svc);
    await s.svc.setDeposit(id, 'scooter-125');
    expect(await rejectionCode(s.svc.shareWithRenter(id))).toBe('INVALID_STATE');
    await s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: jpeg(1), source: 'camera' });
    expect(await rejectionCode(s.svc.shareWithRenter(id))).toBe('INVALID_STATE');
    expect(await rejectionCode(s.svc.recordCondition(id))).toBe('INVALID_STATE');
  });

  it('cannot share with four checked photos but no condition record', async () => {
    const s = setup();
    const id = await startHandover(s.svc);
    await addPhotos(s.svc, id, 'pickup', PICKUP_BYTES);
    await s.svc.setDeposit(id, 'scooter-125');
    expect(await rejectionCode(s.svc.shareWithRenter(id))).toBe('INVALID_STATE');
    await s.svc.recordCondition(id);
    expect((await s.svc.shareWithRenter(id)).status).toBe('awaitingRenter');
  });

  it('marks cannot be edited before the condition is recorded', async () => {
    const s = setup();
    const id = await startHandover(s.svc);
    await addPhotos(s.svc, id, 'pickup', PICKUP_BYTES);
    expect(await rejectionCode(s.svc.updateMarks(id, []))).toBe('INVALID_STATE');
  });

  it('photo check failure: personVisible photo is unusable with the exact reason "Please photograph only the vehicle."', async () => {
    const s = setup({
      wrapAi: (ai) => ({
        ...ai,
        checkPhoto: async ({ photo }) =>
          successOutcome(
            { id: `check-${photo.photoId}`, kind: 'photoCheck', model: 'test', at: '2026-11-08T10:00:00.000Z', inputHashes: [photo.sha256] },
            { usable: true, reason: 'Looks fine', personVisible: true, angleMatches: true },
          ),
      }),
    });
    const id = await startHandover(s.svc);
    const { check, photo } = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: jpeg(1), source: 'camera' });
    expect(check).toEqual({ usable: false, reason: 'Please photograph only the vehicle.', recorded: false, personVisible: true });
    expect((await s.svc.getState(id)).photoChecks[photo.id].usable).toBe(false);
    // M13: even after a second failed try, a photo of a person can never be kept anyway.
    const again = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: jpeg(2), source: 'camera' });
    expect(await rejectionCode(s.svc.overridePhotoCheck(id, again.photo.id))).toBe('INVALID_STATE');
    expect((await s.svc.getState(id)).photoChecks[again.photo.id]).toMatchObject({ usable: false, overridden: false });
  });

  it('a photo can be kept anyway only after two failed tries (M13)', async () => {
    const s = setup({
      wrapAi: (ai) => ({
        ...ai,
        checkPhoto: async ({ photo }) =>
          successOutcome(
            { id: `check-${photo.photoId}`, kind: 'photoCheck', model: 'test', at: '2026-11-08T10:00:00.000Z', inputHashes: [photo.sha256] },
            { usable: false, reason: 'This looks like the back, not the front', personVisible: false, angleMatches: false },
          ),
      }),
    });
    const id = await startHandover(s.svc);
    const first = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: jpeg(1), source: 'camera' });
    expect(await rejectionCode(s.svc.overridePhotoCheck(id, first.photo.id))).toBe('INVALID_STATE');
    const second = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: jpeg(2), source: 'camera' });
    const kept = await s.svc.overridePhotoCheck(id, second.photo.id);
    expect(kept.photoChecks[second.photo.id]).toMatchObject({ usable: false, overridden: true });
  });

  it('a failed AI photo check accepts the photo with a notice', async () => {
    const s = setup({
      wrapAi: (ai) => ({
        ...ai,
        checkPhoto: async ({ photo }) =>
          failureOutcome(
            { id: `check-${photo.photoId}`, kind: 'photoCheck', model: 'test', at: '2026-11-08T10:00:00.000Z', inputHashes: [photo.sha256] },
            'timeout',
          ),
      }),
    });
    const id = await startHandover(s.svc);
    const { check } = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'back', bytes: jpeg(2), source: 'camera' });
    expect(check).toEqual({ usable: true, reason: 'AI check unavailable — photo accepted without a check', recorded: false, personVisible: false });
  });

  it('a failed condition record still completes with no marks', async () => {
    const s = setup({ condition: false });
    const id = await startHandover(s.svc);
    await addPhotos(s.svc, id, 'pickup', PICKUP_BYTES);
    const state = await s.svc.recordCondition(id);
    expect(state.itemDescription).toBe('');
    expect(state.marks).toEqual([]);
    expect(state.suggestedRuleId).toBeNull();
    expect(state.conditionAiFailed).toBe(true);
  });

  it('a hand-added mark after a failed condition check keeps the failure flag; a good check has none', async () => {
    const s = setup({ condition: false });
    const id = await startHandover(s.svc);
    await addPhotos(s.svc, id, 'pickup', PICKUP_BYTES);
    await s.svc.recordCondition(id);
    const state = await s.svc.getState(id);
    const mark = { id: 'm1', photoId: state.pickupPhotos[0].id, location: 'Left mirror', note: 'Chipped', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } };
    const updated = await s.svc.updateMarks(id, [mark]);
    expect(updated.marks).toEqual([mark]);
    expect(updated.conditionAiFailed).toBe(true);

    const ok = setup();
    const okId = await startHandover(ok.svc);
    await addPhotos(ok.svc, okId, 'pickup', PICKUP_BYTES);
    expect((await ok.svc.recordCondition(okId)).conditionAiFailed).toBe(false);
  });

  it('updateMarks only accepts marks on current pickup photos', async () => {
    const s = setup();
    const id = await startHandover(s.svc);
    await addPhotos(s.svc, id, 'pickup', PICKUP_BYTES);
    await s.svc.recordCondition(id);
    const state: HandoverState = await s.svc.getState(id);
    const mark = { id: 'm1', photoId: state.pickupPhotos[0].id, location: 'Left mirror', note: 'Chipped', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } };
    const updated = await s.svc.updateMarks(id, [mark]);
    expect(updated.marks).toEqual([mark]);
    expect(updated.itemDescription).toBe('Red scooter');
    expect(await rejectionCode(s.svc.updateMarks(id, [{ ...mark, photoId: 'nope' }]))).toBe('INVALID_INPUT');
  });

  it('updateMarks keeps a hand-added mark that has no box, and refuses a box outside the photo', async () => {
    const s = setup();
    const id = await startHandover(s.svc);
    await addPhotos(s.svc, id, 'pickup', PICKUP_BYTES);
    await s.svc.recordCondition(id);
    const state: HandoverState = await s.svc.getState(id);
    const photoId = state.pickupPhotos[0].id;
    const unplaced = { id: 'm2', photoId, location: 'Seat', note: 'Tear' };
    const updated = await s.svc.updateMarks(id, [unplaced]);
    expect(updated.marks).toEqual([unplaced]);
    expect('box' in updated.marks[0]).toBe(false);
    // A box key that holds undefined is dropped, not hashed.
    const withUndefined = await s.svc.updateMarks(id, [{ ...unplaced, box: undefined }]);
    expect('box' in withUndefined.marks[0]).toBe(false);
    expect(await rejectionCode(s.svc.updateMarks(id, [{ ...unplaced, box: { x: 0.9, y: 0.1, w: 0.5, h: 0.2 } }]))).toBe('INVALID_INPUT');
  });
});

const SAMPLE_DIR = path.join(process.cwd(), 'public', 'demo', 'scooter-a');
type SampleSet = 'pickup' | 'return-clean' | 'return-damaged';
const sampleBytes = (set: SampleSet, angle: Angle) => new Uint8Array(fs.readFileSync(path.join(SAMPLE_DIR, set, `${angle}.jpg`)));
const sampleHash = (set: SampleSet, angle: Angle) => sha256Hex(sampleBytes(set, angle));
const sampleKey = (kind: 'condition' | 'comparison', sets: SampleSet[]) =>
  `${kind}:${sets.flatMap((set) => ANGLES.map((angle) => sampleHash(set, angle))).sort().join(',')}`;

/** Recorded answers for the bundled sample photos, as scripts/record-demo-answers.ts writes them. */
function sampleAnswers(): Record<string, unknown> {
  const answers: Record<string, unknown> = {
    [sampleKey('condition', ['pickup'])]: { itemDescription: 'White 125cc scooter', detectedItemType: '125cc scooter', suggestedRuleId: 'scooter-125', marks: [] },
    [sampleKey('comparison', ['pickup', 'return-damaged'])]: {
      findings: [{ ...SCRATCH, angle: 'left', location: 'Left mirror', description: 'The left mirror is missing', priceItemId: 'mirror' }],
      explanation: 'The left mirror is missing since pickup.',
    },
  };
  for (const set of ['pickup', 'return-clean', 'return-damaged'] as const) {
    for (const angle of ANGLES) {
      answers[`photoCheck:${sampleHash(set, angle)}`] = { usable: true, reason: 'Clear photo of the whole scooter', personVisible: false, angleMatches: true };
    }
  }
  return answers;
}

/** A stand-in for the live Claude assessor that records every call. The sample path must never reach it. */
function liveClaude() {
  let liveCalls = 0;
  const parts = { id: 'live', kind: 'photoCheck' as const, model: 'claude-opus-5-5', at: '2026-11-08T10:00:00.000Z', inputHashes: [] };
  return {
    kind: 'claude' as const,
    isFree: () => false,
    checkPhoto: vi.fn(async (): Promise<AiOutcome<PhotoCheckResult>> =>
      successOutcome({ ...parts, id: `live-${++liveCalls}` }, { usable: true, reason: 'Live check', personVisible: false, angleMatches: true })),
    recordCondition: vi.fn(async (): Promise<AiOutcome<ConditionResult>> => failureOutcome({ ...parts, kind: 'condition' }, 'api')),
    compare: vi.fn(async (): Promise<AiOutcome<CompareResult>> => failureOutcome({ ...parts, kind: 'comparison' }, 'api')),
  };
}

function claudeModeSetup() {
  const live = liveClaude();
  const s = setup({ wrapAi: () => createSampleRouter({ live, recorded: createRecordedAssessor(sampleAnswers()), isSample: isSampleHash }) });
  return { ...s, live };
}

async function addSampleSet(svc: HandoverService, id: string, phase: 'pickup' | 'return', set: SampleSet): Promise<void> {
  for (const angle of ANGLES) {
    await svc.addPhoto(id, { phase, angle, bytes: sampleBytes(set, angle), source: 'sample' });
  }
}

describe('handover service: sample photos (C1)', () => {
  it('refuses a sample upload from a shop that is not a demo shop, and stores nothing', async () => {
    const s = setup();
    const { shop } = await s.svc.createShop({ name: 'Real Rentals', isDemo: false });
    await s.svc.updateShopLists(shop.id, { depositRules: [{ id: 'scooter-125', itemType: '125cc scooter', label: 'Scooter', amountCents: 15000 }], priceList: [] });
    const { handoverId } = await s.svc.createHandover(shop.id, { itemType: '125cc scooter', itemRef: 'R-1' });
    const upload = s.svc.addPhoto(handoverId, { phase: 'pickup', angle: 'front', bytes: sampleBytes('pickup', 'front'), source: 'sample' });
    expect(await rejectionCode(upload)).toBe('INVALID_INPUT');
    expect(await eventTypes(s, handoverId)).toEqual(['created']);
  });

  it('refuses a photo marked as a sample whose bytes are not one of the bundled sample photos', async () => {
    const s = setup();
    const id = await startHandover(s.svc);
    const upload = s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: jpeg(9), source: 'sample' });
    await expect(upload).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'A sample photo must be one of the bundled sample photos, used by a demo shop' });
    expect(await eventTypes(s, id)).toEqual(['created']);
  });

  it('a full sample set gets the recorded answers while the mode is claude; the live Claude assessor is never called', async () => {
    const s = claudeModeSetup();
    const id = await startHandover(s.svc);
    await addSampleSet(s.svc, id, 'pickup', 'pickup');
    const condition = await s.svc.recordCondition(id);
    expect(condition.itemDescription).toBe('White 125cc scooter');
    await s.svc.setDeposit(id, 'scooter-125');
    await s.svc.shareWithRenter(id);
    await s.svc.renterConfirm(id, { language: 'de', renterName: null, deviceHash: DEVICE_HASH });
    const { orderId } = await s.svc.createHoldOrder(id);
    await s.svc.authorizeHold(id, orderId);
    await s.svc.startReturn(id);
    await addSampleSet(s.svc, id, 'return', 'return-damaged');
    const compared = await s.svc.compare(id);

    expect(s.live.checkPhoto).not.toHaveBeenCalled();
    expect(s.live.recordCondition).not.toHaveBeenCalled();
    expect(s.live.compare).not.toHaveBeenCalled();
    expect(compared.findings).toHaveLength(1);
    expect(compared.findings[0]).toMatchObject({ location: 'Left mirror', priceItemId: 'mirror' });
    // M3: the recorded explanation is English, whatever the renter's language.
    expect(compared.explanationLanguage).toBe('en');
    // The record says truthfully that these are recorded answers from claude-opus-5-5.
    expect(compared.conditionAi).toEqual({ model: 'claude-opus-5-5', recorded: true });
    expect(compared.comparisonAi).toEqual({ model: 'claude-opus-5-5', recorded: true });
    const events = await s.store.listEvents(id);
    const aiEvents = events.filter((entry) => ['photoChecked', 'conditionRecorded', 'comparisonDone'].includes(entry.event.type));
    expect(aiEvents).toHaveLength(10);
    for (const entry of aiEvents) {
      expect(entry.event).toMatchObject({ model: 'claude-opus-5-5', recorded: true });
    }
  });

  it('stores sample bytes uploaded as camera with source sample in a demo shop, so the demo label stays truthful', async () => {
    const s = claudeModeSetup();
    const id = await startHandover(s.svc);
    const { photo } = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: sampleBytes('pickup', 'front'), source: 'camera' });
    expect(photo.source).toBe('sample');
    expect((await s.svc.getState(id)).pickupPhotos[0].source).toBe('sample');
    const other = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'back', bytes: jpeg(7), source: 'camera' });
    expect(other.photo.source).toBe('camera');
  });

  it('keeps source camera for sample bytes in a shop that is not a demo shop', async () => {
    const s = claudeModeSetup();
    const { shop } = await s.svc.createShop({ name: 'Real Rentals', isDemo: false });
    await s.svc.updateShopLists(shop.id, { depositRules: [{ id: 'scooter', itemType: 'Scooter', label: 'Scooter', amountCents: 15000 }], priceList: [] });
    const created = await s.svc.createHandover(shop.id, { itemType: 'Scooter', itemRef: 'S1' });
    const { photo } = await s.svc.addPhoto(created.handoverId, { phase: 'pickup', angle: 'front', bytes: sampleBytes('pickup', 'front'), source: 'camera' });
    expect(photo.source).toBe('camera');
  });

  it('a real camera photo still goes to Claude', async () => {
    const s = claudeModeSetup();
    const id = await startHandover(s.svc);
    const { check } = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: jpeg(1), source: 'camera' });
    expect(check.reason).toBe('Live check');
    expect(s.live.checkPhoto).toHaveBeenCalledTimes(1);
  });

  it('says when a step would make a paid AI call, so routes spend the AI budget only then (I5)', async () => {
    const s = claudeModeSetup();
    const id = await startHandover(s.svc);
    const front = { phase: 'pickup', angle: 'front' } as const;
    expect(s.svc.aiCallNeeded(await s.svc.getState(id), { kind: 'photoCheck', sha256: sampleHash('pickup', 'front'), ...front })).toBe(false);
    expect(s.svc.aiCallNeeded(await s.svc.getState(id), { kind: 'photoCheck', sha256: sha256Hex(jpeg(1)), ...front })).toBe(true);
    await addSampleSet(s.svc, id, 'pickup', 'pickup');
    expect(s.svc.aiCallNeeded(await s.svc.getState(id), { kind: 'condition' })).toBe(false);
    const recordedMode = setup();
    const other = await startHandover(recordedMode.svc);
    expect(recordedMode.svc.aiCallNeeded(await recordedMode.svc.getState(other), { kind: 'condition' })).toBe(false);
    expect(
      recordedMode.svc.aiCallNeeded(await recordedMode.svc.getState(other), { kind: 'photoCheck', sha256: sha256Hex(jpeg(1)), ...front }),
    ).toBe(false);
  });
});

describe('handover service: retakes (I5)', () => {
  it('a retake with the same bytes reuses the earlier check of this handover: no new AI call', async () => {
    const s = claudeModeSetup();
    const id = await startHandover(s.svc);
    const first = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: jpeg(1), source: 'camera' });
    const again = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: jpeg(1), source: 'camera' });
    expect(s.live.checkPhoto).toHaveBeenCalledTimes(1);
    expect(again.photo.id).not.toBe(first.photo.id);
    expect(again.check).toEqual(first.check);
    const checks = (await s.store.listEvents(id)).flatMap((entry) => (entry.event.type === 'photoChecked' ? [entry.event] : []));
    expect(checks).toHaveLength(2);
    expect(checks[1].assessmentId).toBe(checks[0].assessmentId);
    const state = await s.svc.getState(id);
    expect(s.svc.aiCallNeeded(state, { kind: 'photoCheck', sha256: sha256Hex(jpeg(1)), phase: 'pickup', angle: 'front' })).toBe(false);
  });

  it('does not reuse a check for the same bytes in another slot: a front photo in the back slot is checked again', async () => {
    const s = claudeModeSetup();
    const id = await startHandover(s.svc);
    await s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: jpeg(1), source: 'camera' });
    const sha256 = sha256Hex(jpeg(1));
    expect(s.svc.aiCallNeeded(await s.svc.getState(id), { kind: 'photoCheck', sha256, phase: 'pickup', angle: 'back' })).toBe(true);
    expect(s.svc.aiCallNeeded(await s.svc.getState(id), { kind: 'photoCheck', sha256, phase: 'return', angle: 'front' })).toBe(true);
    await s.svc.addPhoto(id, { phase: 'pickup', angle: 'back', bytes: jpeg(1), source: 'camera' });
    expect(s.live.checkPhoto).toHaveBeenCalledTimes(2);
  });

  it('a correct photo rejected in the wrong slot is checked again in its right slot', async () => {
    const s = claudeModeSetup();
    s.live.checkPhoto.mockResolvedValueOnce(
      successOutcome(
        { id: 'wrong', kind: 'photoCheck', model: 'claude-opus-5-5', at: '2026-11-08T10:00:00.000Z', inputHashes: [] },
        { usable: false, reason: 'This is the front, not the back', personVisible: false, angleMatches: false },
      ),
    );
    const id = await startHandover(s.svc);
    const wrong = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'back', bytes: jpeg(2), source: 'camera' });
    expect(wrong.check.usable).toBe(false);
    const right = await s.svc.addPhoto(id, { phase: 'pickup', angle: 'front', bytes: jpeg(2), source: 'camera' });
    expect(right.check.usable).toBe(true);
    expect(s.live.checkPhoto).toHaveBeenCalledTimes(2);
  });
});

describe('handover service: shops and lookups', () => {
  it('demo shop gets seeded lists and a secret that matches its hash', async () => {
    const s = setup();
    const { shop, secret } = await s.svc.createShop({ name: '  Demo  ', isDemo: true });
    expect(shop.name).toBe('Demo');
    expect(shop.depositRules).toHaveLength(5);
    expect(shop.priceList).toHaveLength(7);
    expect(shop.secretHash).toBe(sha256Hex(secret));
    const plain = await s.svc.createShop({ name: 'Plain', isDemo: false });
    expect(plain.shop.depositRules).toEqual([]);
  });

  it('updateShopLists validates and saves a new version', async () => {
    const s = setup();
    const { shop } = await s.svc.createShop({ name: 'Shop', isDemo: false });
    const rule = { id: 'boat', itemType: 'Boat', label: 'Boat', amountCents: 5000 };
    const saved = await s.svc.updateShopLists(shop.id, { depositRules: [rule], priceList: [{ id: 'oar', label: 'Oar', amountCents: 500 }] });
    expect(saved.depositRules).toEqual([rule]);
    const bad = (rules: unknown[], prices: unknown[] = []) =>
      rejectionCode(s.svc.updateShopLists(shop.id, { depositRules: rules as never, priceList: prices as never }));
    expect(await bad([{ ...rule, id: 'Bad Id' }])).toBe('INVALID_INPUT');
    expect(await bad([rule, rule])).toBe('INVALID_INPUT');
    expect(await bad([{ ...rule, amountCents: 1.5 }])).toBe('INVALID_INPUT');
    expect(await bad([{ ...rule, amountCents: 1_000_001 }])).toBe('INVALID_INPUT');
    // M10: a zero deposit or a zero price is not a real amount.
    expect(await bad([{ ...rule, amountCents: 0 }])).toBe('INVALID_INPUT');
    expect(await bad([], [{ id: 'oar', label: 'Oar', amountCents: 0 }])).toBe('INVALID_INPUT');
    expect(await bad([{ ...rule, label: '   ' }])).toBe('INVALID_INPUT');
    expect(await bad([], [{ id: 'oar', label: 'x'.repeat(61), amountCents: 5 }])).toBe('INVALID_INPUT');
    expect(await rejectionCode(s.svc.updateShopLists('missing', { depositRules: [], priceList: [] }))).toBe('NOT_FOUND');
  });

  it('createHandover reads the shop record fresh, so it never seals an old price list or old deposit rules', async () => {
    const s = setup();
    const { shop } = await s.svc.createShop({ name: 'Demo', isDemo: true });
    const read = vi.spyOn(s.store, 'getShop');
    await s.svc.createHandover(shop.id, { itemType: 'Quad', itemRef: 'Q1' });
    expect(read).toHaveBeenCalledWith(shop.id, { fresh: true });
  });

  it('createHandover checks the shop, item type and reference, and lists by shop', async () => {
    const s = setup();
    const { shop } = await s.svc.createShop({ name: 'Demo', isDemo: true });
    expect(await rejectionCode(s.svc.createHandover('missing', { itemType: 'Quad', itemRef: 'Q1' }))).toBe('NOT_FOUND');
    expect(await rejectionCode(s.svc.createHandover(shop.id, { itemType: 'Spaceship', itemRef: 'Q1' }))).toBe('INVALID_INPUT');
    expect(await rejectionCode(s.svc.createHandover(shop.id, { itemType: 'Quad', itemRef: '   ' }))).toBe('INVALID_INPUT');
    const created = await s.svc.createHandover(shop.id, { itemType: 'Quad', itemRef: ' Q1 ' });
    const state = await s.svc.getState(created.handoverId);
    expect(state.itemRef).toBe('Q1');
    expect(state.renterTokenHash).toBe(sha256Hex(created.renterToken));
    expect(state.viewKeyHash).toBe(sha256Hex(created.viewKey));
    expect((await s.svc.listShopHandovers(shop.id)).map((h) => h.id)).toEqual([created.handoverId]);
    expect(await rejectionCode(s.svc.getState('unknown'))).toBe('NOT_FOUND');
    expect(await rejectionCode(s.svc.getState('../etc'))).toBe('NOT_FOUND');
  });

  it('setDeposit and renterConfirm reject bad input', async () => {
    const s = setup();
    const id = await startHandover(s.svc);
    expect(await rejectionCode(s.svc.setDeposit(id, 'nope'))).toBe('INVALID_INPUT');
    expect(await rejectionCode(s.svc.renterConfirm(id, { language: 'xx' as never, renterName: null, deviceHash: DEVICE_HASH }))).toBe('INVALID_INPUT');
    expect(await rejectionCode(s.svc.renterConfirm(id, { language: 'en', renterName: null, deviceHash: 'not-a-hash' }))).toBe('INVALID_INPUT');
  });
});
