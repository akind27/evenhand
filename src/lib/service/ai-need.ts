import type { VisionAssessor } from '@/lib/ai/assessor';
import { LIMIT_REASON } from '@/lib/ai/limited-assessor';
import type { HandoverState, PhotoCheck } from '@/lib/domain/state';
import type { Angle, Phase } from '@/lib/domain/types';
import { AI_UNAVAILABLE_REASON, comparisonHashes, conditionHashes } from '@/lib/service/ai-steps';

/** The bytes of an upload and the slot (phase and angle) they are uploaded for. */
export interface PhotoSlot {
  sha256: string;
  phase: Phase;
  angle: Angle;
}

/** An AI step a route is about to run. A photo check names the SHA-256 of the uploaded bytes and the slot. */
export type AiStep = ({ kind: 'photoCheck' } & PhotoSlot) | { kind: 'condition' } | { kind: 'comparison' };

/** True for a check that really looked at the photo (not "AI unavailable" or "limit reached"). */
export function isRealCheck(check: Pick<PhotoCheck, 'reason'>): boolean {
  return check.reason !== AI_UNAVAILABLE_REASON && check.reason !== LIMIT_REASON;
}

/**
 * True when a current photo of this handover with the same bytes, phase and angle already has a real check,
 * which a retake reuses. The same bytes in another slot are checked again.
 */
export function hasReusableCheck(state: HandoverState, slot: PhotoSlot): boolean {
  return [...state.pickupPhotos, ...state.returnPhotos].some((photo) => {
    const check = state.photoChecks[photo.id];
    return photo.sha256 === slot.sha256 && photo.phase === slot.phase && photo.angle === slot.angle && check !== undefined && isRealCheck(check);
  });
}

/**
 * True when running this step would make a paid AI call. False in recorded mode, for recorded sample answers,
 * and for a retake that reuses an earlier check. Routes spend the per-IP AI budget only when this is true (I5).
 */
export function aiCallNeeded(ai: VisionAssessor, state: HandoverState, step: AiStep): boolean {
  switch (step.kind) {
    case 'photoCheck':
      return !hasReusableCheck(state, step) && !ai.isFree('photoCheck', [step.sha256], step.angle);
    case 'condition':
      return !ai.isFree('condition', conditionHashes(state));
    case 'comparison':
      return !ai.isFree('comparison', comparisonHashes(state));
  }
}
