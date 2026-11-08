import type { AiOutcome, CompareResult, ConditionResult, PhotoCheckResult, PhotoInput } from '@/lib/ai/assessor';
import { enforcePhotoCheck } from '@/lib/ai/post-process';
import type { HandoverEvent } from '@/lib/domain/events';
import { initialStatusFor } from '@/lib/domain/settlement';
import { isDroppedCloseup, type HandoverState } from '@/lib/domain/state';
import { REQUIRED_ANGLES, type Angle, type Finding, type PhotoRef } from '@/lib/domain/types';
import type { AssessmentRecord, EvidenceStore } from '@/lib/evidence/store';

export const AI_UNAVAILABLE_REASON = 'AI check unavailable — photo accepted without a check';
export const COMPARE_FAILED_TEXT = 'The AI check could not run. Please compare the photos yourself.';

export interface PhotoPair {
  angle: Angle;
  before: PhotoRef;
  after: PhotoRef;
}

export async function toPhotoInput(store: EvidenceStore, photo: PhotoRef): Promise<PhotoInput> {
  const bytes = await store.getPhotoBytes(photo.url);
  return { photoId: photo.id, angle: photo.angle, sha256: photo.sha256, base64: Buffer.from(bytes).toString('base64') };
}

export function saveRecord(store: EvidenceStore, record: AssessmentRecord): Promise<void> {
  return store.saveAssessment(record);
}

/** The photo check as the service reports it. A failed AI check never blocks the photo. */
export interface PhotoCheckReport {
  usable: boolean;
  reason: string;
  /** True when the answer was a recorded one for a bundled sample photo. */
  recorded: boolean;
  /** True when a person was the main subject: the shop cannot keep such a photo anyway (M13). */
  personVisible: boolean;
}

export function photoCheckFrom(outcome: AiOutcome<PhotoCheckResult>): PhotoCheckReport {
  if (!outcome.ok) {
    return { usable: true, reason: AI_UNAVAILABLE_REASON, recorded: false, personVisible: false };
  }
  const checked = enforcePhotoCheck(outcome.value);
  return { usable: checked.usable, reason: checked.reason, recorded: outcome.record.recorded ?? false, personVisible: checked.personVisible };
}

/** Who answered, as the events record it (M1, C1). */
function authorOf(outcome: AiOutcome<unknown>): { model: string; recorded: boolean } {
  return { model: outcome.record.model, recorded: outcome.record.recorded ?? false };
}

export function conditionEvent(
  outcome: AiOutcome<ConditionResult>,
  newId: () => string,
): Extract<HandoverEvent, { type: 'conditionRecorded' }> {
  if (!outcome.ok) {
    return { type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: '', assessmentId: outcome.record.id, ...authorOf(outcome), aiFailed: true };
  }
  const { marks, suggestedRuleId, itemDescription } = outcome.value;
  return {
    type: 'conditionRecorded',
    marks: marks.map((mark) => ({ ...mark, id: newId() })),
    suggestedRuleId,
    itemDescription,
    assessmentId: outcome.record.id,
    ...authorOf(outcome),
  };
}

/** The photo hashes the condition record sends: every current pickup photo, sorted. */
export function conditionHashes(state: HandoverState): string[] {
  return state.pickupPhotos.map((photo) => photo.sha256).sort();
}

/** The photo hashes the comparison sends: both photos of every pair, sorted. */
export function comparisonHashes(state: HandoverState): string[] {
  return buildPairs(state).flatMap((pair) => [pair.before.sha256, pair.after.sha256]).sort();
}

/** The 4 required angles, plus each return closeup paired with the pickup closeup at the same position. */
export function buildPairs(state: HandoverState): PhotoPair[] {
  const required = REQUIRED_ANGLES.flatMap((angle): PhotoPair[] => {
    const before = state.pickupPhotos.find((photo) => photo.angle === angle);
    const after = state.returnPhotos.find((photo) => photo.angle === angle);
    return before !== undefined && after !== undefined ? [{ angle, before, after }] : [];
  });
  // A closeup that failed its check is left out on both sides, so the rest still pair up by position.
  const pickupCloseups = state.pickupPhotos.filter((photo) => photo.angle === 'closeup' && !isDroppedCloseup(state, photo));
  const returnCloseups = state.returnPhotos.filter((photo) => photo.angle === 'closeup' && !isDroppedCloseup(state, photo));
  const closeups = returnCloseups.flatMap((after, index): PhotoPair[] => {
    const before = pickupCloseups[index];
    return before === undefined ? [] : [{ angle: 'closeup', before, after }];
  });
  return [...required, ...closeups];
}

function toFinding(
  found: CompareResult['findings'][number],
  pair: PhotoPair,
  priceIds: Set<string>,
  id: string,
): Finding {
  return {
    id,
    angle: found.angle,
    beforePhotoId: pair.before.id,
    afterPhotoId: pair.after.id,
    location: found.location,
    description: found.description,
    severity: found.severity,
    confidence: found.confidence,
    box: found.box,
    priceItemId: found.priceItemId !== null && priceIds.has(found.priceItemId) ? found.priceItemId : null,
    status: initialStatusFor(found.confidence),
    source: 'ai',
  };
}

export function comparisonEvent(
  outcome: AiOutcome<CompareResult>,
  state: HandoverState,
  pairs: PhotoPair[],
  newId: () => string,
): Extract<HandoverEvent, { type: 'comparisonDone' }> {
  const assessmentId = outcome.record.id;
  if (!outcome.ok) {
    // The fixed fallback text is English.
    return { type: 'comparisonDone', findings: [], explanation: COMPARE_FAILED_TEXT, explanationLanguage: 'en', assessmentId, aiFailed: true, ...authorOf(outcome) };
  }
  // M3: the recorded sample answers were written in English, whatever the renter's language.
  const explanationLanguage = outcome.record.recorded ? 'en' : (state.renter?.language ?? 'en');
  const priceIds = new Set(state.priceList.map((item) => item.id));
  const findings = outcome.value.findings.flatMap((found): Finding[] => {
    const pair = pairs.find((candidate) => candidate.angle === found.angle);
    return pair === undefined ? [] : [toFinding(found, pair, priceIds, newId())];
  });
  return { type: 'comparisonDone', findings, explanation: outcome.value.explanation, explanationLanguage, assessmentId, aiFailed: false, ...authorOf(outcome) };
}
