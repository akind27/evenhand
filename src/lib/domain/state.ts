import type { HandoverEvent, StoredEvent } from '@/lib/domain/events';
import { computeCharge, type ChargeLine } from '@/lib/domain/settlement';
import { canonicalJson } from '@/lib/evidence/hash';
import {
  REQUIRED_ANGLES,
  type Angle,
  type DepositRule,
  type ExistingMark,
  type Finding,
  type HandoverStatus,
  type Lang,
  type PhotoRef,
  type PriceItem,
} from '@/lib/domain/types';

export interface PhotoCheck {
  usable: boolean;
  reason: string;
  overridden: boolean;
  /** True when the check was a recorded answer for a bundled sample photo, not a live call. */
  recorded: boolean;
  /** True when a person was the main subject. Such a photo can never be kept anyway (M13). */
  personVisible: boolean;
}

/** Overriding a photo check needs this many failed tries of the same phase and angle first (M13). */
export const TRIES_BEFORE_OVERRIDE = 2;

/** The key of `photoTries`: one count per phase and angle, e.g. "return:front". */
export function triesKey(phase: PhotoRef['phase'], angle: Angle): string {
  return `${phase}:${angle}`;
}

/** Who wrote an AI step's answer: the model the record names, and whether it was replayed from a recording. */
export interface AiAnswer {
  /** Null for logs written before the model was recorded on the event. */
  model: string | null;
  recorded: boolean;
}

export interface HandoverState {
  id: string;
  shopId: string;
  /** When the handover was created: the time of its first event. */
  createdAt: string;
  status: HandoverStatus;
  itemType: string;
  itemRef: string;
  priceList: PriceItem[];
  depositRules: DepositRule[];
  pickupPhotos: PhotoRef[]; // latest photo per angle wins (retakes replace)
  returnPhotos: PhotoRef[]; // latest photo per angle wins (retakes replace)
  photoChecks: Record<string, PhotoCheck>;
  /** Failed photo checks per phase and angle (see `triesKey`). Retakes add up. */
  photoTries: Record<string, number>;
  marks: ExistingMark[];
  itemDescription: string | null;
  suggestedRuleId: string | null;
  deposit: { ruleId: string; amountCents: number } | null;
  renter: { language: Lang; name: string | null } | null;
  holdOrderId: string | null;
  /**
   * `authorizationId` is the current authorization: a reauthorization replaces it, and captures use it.
   * `parentAuthorizationId` is the first one. PayPal voids a reauthorized hold only through its parent.
   */
  hold: {
    orderId: string;
    authorizationId: string;
    parentAuthorizationId: string;
    amountCents: number;
    honorUntil: string;
    expiresAt: string;
  } | null;
  holdLost: null | 'EXPIRED' | 'VOIDED' | 'CAPTURED' | 'DENIED';
  findings: Finding[];
  explanation: string | null;
  explanationLanguage: Lang | null;
  aiFailed: boolean;
  proposal: { lines: ChargeLine[]; chargeCents: number; releaseCents: number; exceedsHoldByCents: number } | null;
  settlement: null | { kind: 'released' } | { kind: 'charged'; captureId: string; chargeCents: number; releaseCents: number };
  dispute: { reason: string } | null;
  /** The condition record's AI answer. A shop's hand edit of the marks keeps it. */
  conditionAi: AiAnswer | null;
  /** True when the AI condition step could not run. A shop's hand edit of the marks keeps it. */
  conditionAiFailed: boolean;
  comparisonAi: AiAnswer | null;
  renterTokenHash: string;
  viewKeyHash: string;
  /** Hash of the confirming device's secret. Null before confirmation (or in logs from before device binding). */
  renterDeviceHash: string | null;
  lastSeq: number;
  lastHash: string;
}

type Verdict = { ok: true } | { ok: false; reason: string };
type CreatedEvent = Extract<HandoverEvent, { type: 'created' }>;

const ALLOWED: Verdict = { ok: true };
const MAX_CLOSEUPS_PER_PHASE = 4;

function refuse(reason: string): Verdict {
  return { ok: false, reason };
}

function requireStatus(state: HandoverState, statuses: HandoverStatus[], action: string): Verdict {
  return statuses.includes(state.status)
    ? ALLOWED
    : refuse(`${action} is not allowed while the handover is ${state.status}`);
}

function findPhoto(state: HandoverState, photoId: string): PhotoRef | undefined {
  return [...state.pickupPhotos, ...state.returnPhotos].find((photo) => photo.id === photoId);
}

function currentPickupPhoto(state: HandoverState, angle: Angle): PhotoRef | undefined {
  return state.pickupPhotos.find((photo) => photo.angle === angle);
}

/** Required pickup angles that have no photo yet. */
export function missingPickupAngles(state: HandoverState): Angle[] {
  return REQUIRED_ANGLES.filter((angle) => currentPickupPhoto(state, angle) === undefined);
}

function missingReturnAngles(state: HandoverState): Angle[] {
  return REQUIRED_ANGLES.filter((angle) => !state.returnPhotos.some((photo) => photo.angle === angle));
}

function withPhoto(photos: PhotoRef[], photo: PhotoRef): PhotoRef[] {
  if (photo.angle === 'closeup') {
    return [...photos, photo];
  }
  return [...photos.filter((existing) => existing.angle !== photo.angle), photo];
}

function canAddPhoto(state: HandoverState, photo: PhotoRef): Verdict {
  const phaseCheck = photo.phase === 'pickup'
    ? requireStatus(state, ['draft'], 'Adding a pickup photo')
    : requireStatus(state, ['returning'], 'Adding a return photo');
  if (!phaseCheck.ok) {
    return phaseCheck;
  }
  if (findPhoto(state, photo.id) !== undefined) {
    return refuse(`Photo ${photo.id} already exists`);
  }
  const phasePhotos = photo.phase === 'pickup' ? state.pickupPhotos : state.returnPhotos;
  const closeups = phasePhotos.filter((existing) => existing.angle === 'closeup').length;
  if (photo.angle === 'closeup' && closeups >= MAX_CLOSEUPS_PER_PHASE) {
    return refuse(`At most ${MAX_CLOSEUPS_PER_PHASE} closeup photos are allowed per phase`);
  }
  return ALLOWED;
}

function canCheckPhoto(state: HandoverState, photoId: string): Verdict {
  const photo = findPhoto(state, photoId);
  if (photo === undefined) {
    return refuse(`Photo ${photoId} not found`);
  }
  return photo.phase === 'pickup'
    ? requireStatus(state, ['draft'], 'Checking a pickup photo')
    : requireStatus(state, ['returning'], 'Checking a return photo');
}

/** M13: only a current, rejected photo, after two failed tries of its angle, and never one that shows a person. */
function canOverridePhoto(state: HandoverState, photoId: string): Verdict {
  const status = canCheckPhoto(state, photoId);
  if (!status.ok) {
    return status;
  }
  const check = state.photoChecks[photoId];
  if (check === undefined || check.usable || check.overridden) {
    return refuse('Only a photo the check rejected can be kept anyway');
  }
  if (check.personVisible) {
    return refuse('A photo with a person as the main subject cannot be kept. Please photograph only the vehicle.');
  }
  const photo = findPhoto(state, photoId) as PhotoRef;
  const tries = state.photoTries[triesKey(photo.phase, photo.angle)] ?? 0;
  return tries >= TRIES_BEFORE_OVERRIDE
    ? ALLOWED
    : refuse('Retake the photo first: it can be kept anyway only after two failed tries');
}

/** True for a closeup whose check failed and was not kept. Such a closeup is left out of the comparison. */
export function isDroppedCloseup(state: HandoverState, photo: PhotoRef): boolean {
  const check = state.photoChecks[photo.id];
  return photo.angle === 'closeup' && check !== undefined && !check.usable && !check.overridden;
}

/**
 * True when every current return photo passed its check or was kept by the shop.
 * A closeup that failed its check (for example a person is the main subject) is left out: it cannot block
 * the comparison forever. The four required angles still must pass or be kept.
 */
function returnPhotosPassed(state: HandoverState): boolean {
  return state.returnPhotos.every((photo) => {
    const check = state.photoChecks[photo.id];
    return check !== undefined && (check.usable || check.overridden || photo.angle === 'closeup');
  });
}

function canSetDeposit(state: HandoverState, ruleId: string, amountCents: number): Verdict {
  const status = requireStatus(state, ['draft'], 'Setting the deposit');
  if (!status.ok) {
    return status;
  }
  const rule = state.depositRules.find((candidate) => candidate.id === ruleId);
  if (rule === undefined) {
    return refuse(`Unknown deposit rule ${ruleId}`);
  }
  return rule.amountCents === amountCents ? ALLOWED : refuse('Deposit amount must match its rule');
}

function canShareWithRenter(state: HandoverState): Verdict {
  const status = requireStatus(state, ['draft'], 'Sharing with the renter');
  if (!status.ok) {
    return status;
  }
  const missing = missingPickupAngles(state);
  if (missing.length > 0) {
    return refuse(`Missing pickup photos: ${missing.join(', ')}`);
  }
  return requiredPhotosAccepted(state) && state.itemDescription !== null && state.deposit !== null
    ? ALLOWED
    : refuse('Every pickup photo must be accepted, the condition recorded and the deposit set');
}

function requiredPhotosAccepted(state: HandoverState): boolean {
  return REQUIRED_ANGLES.every((angle) => {
    const photo = currentPickupPhoto(state, angle);
    const check = photo === undefined ? undefined : state.photoChecks[photo.id];
    return check !== undefined && (check.usable || check.overridden);
  });
}

function canConfirmRenter(state: HandoverState): Verdict {
  const status = requireStatus(state, ['awaitingRenter'], 'Renter confirmation');
  if (!status.ok) {
    return status;
  }
  return state.renter === null ? ALLOWED : refuse('The renter has already confirmed');
}

function canAuthorizeHold(state: HandoverState, orderId: string, amountCents: number): Verdict {
  const status = requireStatus(state, ['awaitingRenter'], 'Authorizing the hold');
  if (!status.ok) {
    return status;
  }
  if (state.renter === null) {
    return refuse('The renter has not confirmed yet');
  }
  if (state.deposit === null || state.deposit.amountCents !== amountCents) {
    return refuse('Hold amount must match the deposit');
  }
  return state.holdOrderId === orderId ? ALLOWED : refuse('The order is not the one created for this handover');
}

function canCreateHoldOrder(state: HandoverState): Verdict {
  const status = requireStatus(state, ['awaitingRenter'], 'Creating the hold order');
  if (!status.ok) {
    return status;
  }
  if (state.renter === null) {
    return refuse('The renter has not confirmed yet');
  }
  return state.holdOrderId === null ? ALLOWED : refuse('A hold order already exists');
}

function isUndecided(finding: Finding): boolean {
  return finding.status === 'proposed' || finding.status === 'needsHuman';
}

function canProposeCharge(state: HandoverState, event: Extract<HandoverEvent, { type: 'chargeProposed' }>): Verdict {
  const status = requireStatus(state, ['reviewed'], 'Proposing a charge');
  if (!status.ok) {
    return status;
  }
  if (state.hold === null) {
    return refuse('There is no hold to charge');
  }
  if (state.findings.some(isUndecided)) {
    return refuse('Every finding must be confirmed or dismissed first');
  }
  if (!hasConfirmedPricedFinding(state)) {
    return refuse('A charge needs at least one confirmed, priced finding');
  }
  const expected = computeCharge(state.findings, state.priceList, state.hold.amountCents);
  const { lines, chargeCents, releaseCents, exceedsHoldByCents } = event;
  if (canonicalJson(expected) !== canonicalJson({ lines, totalCents: expected.totalCents, chargeCents, releaseCents, exceedsHoldByCents })) {
    return refuse('The proposed charge does not match the confirmed findings');
  }
  return chargeCents > 0 ? ALLOWED : refuse('The proposed charge must be more than zero');
}

function canReauthorizeHold(state: HandoverState): Verdict {
  const status = requireStatus(state, ['active', 'returning', 'reviewed', 'chargeProposed', 'disputed'], 'Reauthorizing the hold');
  if (!status.ok) {
    return status;
  }
  if (state.hold === null) {
    return refuse('There is no hold to reauthorize');
  }
  return state.holdLost === null ? ALLOWED : refuse('A lost hold cannot be reauthorized');
}

function isKnownPriceItem(state: HandoverState, priceItemId: string | null): boolean {
  return priceItemId === null || state.priceList.some((item) => item.id === priceItemId);
}

/** New finding ids must be unique, both among themselves and against recorded findings. Price items must exist. */
function checkNewFindings(state: HandoverState, incoming: Finding[]): Verdict {
  const seen = new Set(state.findings.map((finding) => finding.id));
  for (const finding of incoming) {
    if (seen.has(finding.id)) {
      return refuse(`Finding ${finding.id} already exists or is repeated`);
    }
    seen.add(finding.id);
    if (!isKnownPriceItem(state, finding.priceItemId)) {
      return refuse(`Unknown price item ${finding.priceItemId}`);
    }
  }
  return ALLOWED;
}

function canFinishComparison(state: HandoverState, findings: Finding[]): Verdict {
  const status = requireStatus(state, ['returning'], 'Finishing the comparison');
  if (!status.ok) {
    return status;
  }
  const missing = missingReturnAngles(state);
  if (missing.length > 0) {
    return refuse(`Missing return photos: ${missing.join(', ')}`);
  }
  if (!returnPhotosPassed(state)) {
    return refuse('Every return photo must pass its check, or be kept by the shop, before the comparison');
  }
  return checkNewFindings(state, findings);
}

function canAddFinding(state: HandoverState, finding: Finding): Verdict {
  const status = requireStatus(state, ['reviewed'], 'Adding a finding');
  if (!status.ok) {
    return status;
  }
  return checkNewFindings(state, [finding]);
}

function canUpdateFinding(state: HandoverState, findingId: string, priceItemId: string | null): Verdict {
  const status = requireStatus(state, ['reviewed'], 'Updating a finding');
  if (!status.ok) {
    return status;
  }
  if (!state.findings.some((finding) => finding.id === findingId)) {
    return refuse(`Finding ${findingId} not found`);
  }
  return isKnownPriceItem(state, priceItemId) ? ALLOWED : refuse(`Unknown price item ${priceItemId}`);
}

function hasConfirmedFinding(state: HandoverState): boolean {
  return state.findings.some((finding) => finding.status === 'confirmed');
}

function hasConfirmedPricedFinding(state: HandoverState): boolean {
  return state.findings.some((finding) => finding.status === 'confirmed' && finding.priceItemId !== null);
}

function canRelease(state: HandoverState, authorizationId: string): Verdict {
  // A disputed handover may be released at any time: the shop gives the deposit back to close the dispute.
  const status = requireStatus(state, ['reviewed', 'disputed'], 'Releasing the hold');
  if (!status.ok) {
    return status;
  }
  if (state.status === 'reviewed' && hasConfirmedFinding(state)) {
    return refuse('A confirmed finding means the hold must be charged, not released');
  }
  if (state.hold === null) {
    return refuse('There is no hold to release');
  }
  // The void goes to the parent authorization, which also voids any reauthorization of it.
  return state.hold.parentAuthorizationId === authorizationId ? ALLOWED : refuse('The authorization does not match the hold');
}

/** Charge and release must be whole, non-negative cent amounts that add up to the hold. */
function canSplitHold(chargeCents: number, releaseCents: number, holdCents: number): Verdict {
  const wholeAmounts = [chargeCents, releaseCents].every((cents) => Number.isSafeInteger(cents) && cents >= 0);
  if (!wholeAmounts) {
    return refuse('Charge and release must be whole, non-negative amounts of cents');
  }
  return chargeCents + releaseCents === holdCents ? ALLOWED : refuse('Charge and release must add up to the hold amount');
}

function canCharge(state: HandoverState, event: Extract<HandoverEvent, { type: 'charged' }>): Verdict {
  // A capture that already happened at PayPal wins over a dispute, so a disputed handover can still record it.
  const status = requireStatus(state, ['chargeProposed', 'disputed'], 'Charging the hold');
  if (!status.ok) {
    return status;
  }
  if (state.status === 'disputed' && state.proposal === null) {
    return refuse('Charging a disputed handover needs a charge the shop proposed first');
  }
  if (!hasConfirmedPricedFinding(state)) {
    return refuse('Charging needs at least one confirmed, priced finding');
  }
  if (state.hold === null) {
    return refuse('There is no hold to charge');
  }
  if (state.hold.authorizationId !== event.authorizationId) {
    return refuse('The authorization does not match the hold');
  }
  return canSplitHold(event.chargeCents, event.releaseCents, state.hold.amountCents);
}

function canMarkHoldLost(state: HandoverState): Verdict {
  if (state.hold === null) {
    return refuse('There is no hold to lose');
  }
  return state.settlement === null ? ALLOWED : refuse('The hold has already been settled');
}

/** Says whether an event may be added after the current state. Every rule here is a pure check. */
export function canApply(state: HandoverState, event: HandoverEvent): Verdict {
  switch (event.type) {
    case 'created':
      return refuse('created may only be the first event');
    case 'photoAdded':
      return canAddPhoto(state, event.photo);
    case 'photoChecked':
      return event.overridden ? canOverridePhoto(state, event.photoId) : canCheckPhoto(state, event.photoId);
    case 'conditionRecorded':
      return requireStatus(state, ['draft'], 'Recording the condition');
    case 'depositSet':
      return canSetDeposit(state, event.ruleId, event.amountCents);
    case 'sharedWithRenter':
      return canShareWithRenter(state);
    case 'renterConfirmed':
      return canConfirmRenter(state);
    case 'holdAuthorized':
      return canAuthorizeHold(state, event.orderId, event.amountCents);
    case 'holdOrderCreated':
      return canCreateHoldOrder(state);
    case 'chargeProposed':
      return canProposeCharge(state, event);
    case 'holdReauthorized':
      return canReauthorizeHold(state);
    case 'returnStarted':
      return requireStatus(state, ['active'], 'Starting the return');
    case 'comparisonDone':
      return canFinishComparison(state, event.findings);
    case 'findingAdded':
      return canAddFinding(state, event.finding);
    case 'findingUpdated':
      return canUpdateFinding(state, event.findingId, event.priceItemId);
    case 'released':
      return canRelease(state, event.authorizationId);
    case 'charged':
      return canCharge(state, event);
    case 'disputed':
      return requireStatus(state, ['reviewed', 'chargeProposed'], 'Disputing');
    case 'holdLost':
      return canMarkHoldLost(state);
    case 'closed':
      return requireStatus(state, ['released', 'charged', 'disputed'], 'Closing');
  }
}

function initialState(id: string, created: CreatedEvent, stored: StoredEvent): HandoverState {
  return {
    id,
    shopId: created.shopId,
    createdAt: stored.at,
    status: 'draft',
    itemType: created.itemType,
    itemRef: created.itemRef,
    priceList: created.priceList,
    depositRules: created.depositRules,
    pickupPhotos: [],
    returnPhotos: [],
    photoChecks: {},
    photoTries: {},
    marks: [],
    itemDescription: null,
    suggestedRuleId: null,
    deposit: null,
    renter: null,
    holdOrderId: null,
    hold: null,
    holdLost: null,
    findings: [],
    explanation: null,
    explanationLanguage: null,
    aiFailed: false,
    proposal: null,
    settlement: null,
    dispute: null,
    conditionAi: null,
    conditionAiFailed: false,
    comparisonAi: null,
    renterTokenHash: created.renterTokenHash,
    viewKeyHash: created.viewKeyHash,
    renterDeviceHash: null,
    lastSeq: stored.seq,
    lastHash: stored.hash,
  };
}

function requireHold(state: HandoverState): NonNullable<HandoverState['hold']> {
  if (state.hold === null) {
    throw new Error('Event needs an existing hold');
  }
  return state.hold;
}

function applyPhotoEvent(state: HandoverState, event: Extract<HandoverEvent, { type: 'photoAdded' | 'photoChecked' }>): HandoverState {
  if (event.type === 'photoChecked') {
    const check: PhotoCheck = {
      usable: event.usable,
      reason: event.reason,
      overridden: event.overridden,
      recorded: event.recorded ?? false,
      personVisible: event.personVisible ?? false,
    };
    const photoChecks = { ...state.photoChecks, [event.photoId]: check };
    const photo = findPhoto(state, event.photoId);
    if (photo === undefined || event.usable || event.overridden) {
      return { ...state, photoChecks };
    }
    const key = triesKey(photo.phase, photo.angle);
    return { ...state, photoChecks, photoTries: { ...state.photoTries, [key]: (state.photoTries[key] ?? 0) + 1 } };
  }
  if (event.photo.phase === 'pickup') {
    return { ...state, pickupPhotos: withPhoto(state.pickupPhotos, event.photo) };
  }
  return { ...state, returnPhotos: withPhoto(state.returnPhotos, event.photo) };
}

function applyHoldEvent(state: HandoverState, event: Extract<HandoverEvent, { type: 'holdAuthorized' | 'holdReauthorized' | 'holdLost' }>): HandoverState {
  if (event.type === 'holdAuthorized') {
    const { orderId, authorizationId, amountCents, honorUntil, expiresAt } = event;
    const hold = { orderId, authorizationId, parentAuthorizationId: authorizationId, amountCents, honorUntil, expiresAt };
    return { ...state, status: 'active', hold };
  }
  if (event.type === 'holdReauthorized') {
    const hold = requireHold(state);
    const { authorizationId, honorUntil, expiresAt } = event;
    return { ...state, hold: { ...hold, authorizationId, honorUntil, expiresAt } };
  }
  return { ...state, holdLost: event.status };
}

function applyFindingEvent(state: HandoverState, event: Extract<HandoverEvent, { type: 'findingAdded' | 'findingUpdated' }>): HandoverState {
  if (event.type === 'findingAdded') {
    return { ...state, findings: [...state.findings, event.finding] };
  }
  const findings = state.findings.map((finding) =>
    finding.id === event.findingId ? { ...finding, status: event.status, priceItemId: event.priceItemId } : finding,
  );
  return { ...state, findings };
}

function applyStatusEvent(state: HandoverState, event: HandoverEvent): HandoverState {
  switch (event.type) {
    case 'sharedWithRenter':
      return { ...state, status: 'awaitingRenter' };
    case 'returnStarted':
      return { ...state, status: 'returning' };
    case 'chargeProposed': {
      const { lines, chargeCents, releaseCents, exceedsHoldByCents } = event;
      return { ...state, status: 'chargeProposed', proposal: { lines, chargeCents, releaseCents, exceedsHoldByCents } };
    }
    case 'holdOrderCreated':
      return { ...state, holdOrderId: event.orderId };
    case 'released':
      return { ...state, status: 'released', settlement: { kind: 'released' } };
    case 'charged':
      return {
        ...state,
        status: 'charged',
        settlement: { kind: 'charged', captureId: event.captureId, chargeCents: event.chargeCents, releaseCents: event.releaseCents },
      };
    case 'disputed':
      return { ...state, status: 'disputed', dispute: { reason: event.reason } };
    case 'closed':
      return { ...state, status: 'closed' };
    default:
      return state;
  }
}

function aiAnswerOf(event: { model?: string; recorded?: boolean }): AiAnswer {
  return { model: event.model ?? null, recorded: event.recorded ?? false };
}

function applyBody(state: HandoverState, event: HandoverEvent): HandoverState {
  switch (event.type) {
    case 'created':
      throw new Error('created may only be the first event');
    case 'photoAdded':
    case 'photoChecked':
      return applyPhotoEvent(state, event);
    case 'conditionRecorded':
      return {
        ...state,
        marks: event.marks,
        itemDescription: event.itemDescription,
        suggestedRuleId: event.suggestedRuleId,
        // A hand edit of the marks has no assessment: the description is still the AI's, so its author stays.
        conditionAi: event.assessmentId === null ? state.conditionAi : aiAnswerOf(event),
        // Events from before the flag existed mean "the AI ran". A hand edit keeps what the AI step said.
        conditionAiFailed: event.assessmentId === null ? state.conditionAiFailed : event.aiFailed ?? false,
      };
    case 'depositSet':
      return { ...state, deposit: { ruleId: event.ruleId, amountCents: event.amountCents } };
    case 'renterConfirmed':
      return { ...state, renter: { language: event.language, name: event.renterName }, renterDeviceHash: event.renterDeviceHash ?? null };
    case 'holdAuthorized':
    case 'holdReauthorized':
    case 'holdLost':
      return applyHoldEvent(state, event);
    case 'comparisonDone':
      return {
        ...state,
        status: 'reviewed',
        findings: event.findings,
        explanation: event.explanation,
        explanationLanguage: event.explanationLanguage,
        aiFailed: event.aiFailed,
        comparisonAi: aiAnswerOf(event),
      };
    case 'findingAdded':
    case 'findingUpdated':
      return applyFindingEvent(state, event);
    default:
      return applyStatusEvent(state, event);
  }
}

function applyStored(state: HandoverState, stored: StoredEvent): HandoverState {
  const next = applyBody(state, stored.event);
  return { ...next, lastSeq: stored.seq, lastHash: stored.hash };
}

/** Builds the current state from the event log. The log is checked when events are appended, so this trusts it. */
export function reduce(id: string, chain: StoredEvent[]): HandoverState {
  const first = chain[0];
  if (first === undefined) {
    throw new Error('Cannot reduce an empty event chain');
  }
  if (first.event.type !== 'created') {
    throw new Error('The first event in a chain must be created');
  }
  let state = initialState(id, first.event, first);
  for (const stored of chain.slice(1)) {
    state = applyStored(state, stored);
  }
  return state;
}
