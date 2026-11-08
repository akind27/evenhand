import { isSampleHash } from '@/lib/demo/sample-photos';
import type { HandoverEvent, StoredEvent } from '@/lib/domain/events';
import type { HandoverState } from '@/lib/domain/state';
import { missingPickupAngles } from '@/lib/domain/state';
import type { ExistingMark, PhotoRef } from '@/lib/domain/types';
import { sha256Hex } from '@/lib/evidence/hash';
import type { ServiceDeps } from '@/lib/service/deps';
import { ServiceError, invalidInput } from '@/lib/service/errors';
import type { HandoverService } from '@/lib/service/handover-service';
import type { Mutator } from '@/lib/service/mutate';
import { conditionEvent, photoCheckFrom, saveRecord, toPhotoInput, type PhotoCheckReport } from '@/lib/service/ai-steps';
import { isRealCheck, type PhotoSlot } from '@/lib/service/ai-need';

type PhotoOps = Pick<HandoverService, 'addPhoto' | 'overridePhotoCheck' | 'recordCondition' | 'updateMarks'>;
type PhotoChecked = Extract<HandoverEvent, { type: 'photoChecked' }>;

export const SAMPLE_REFUSED = 'A sample photo must be one of the bundled sample photos, used by a demo shop';

function checkMarks(state: HandoverState, marks: ExistingMark[]): void {
  if (!Array.isArray(marks)) {
    invalidInput('Marks must be a list');
  }
  const pickupIds = new Set(state.pickupPhotos.map((photo) => photo.id));
  const seen = new Set<string>();
  for (const mark of marks) {
    if (typeof mark.id !== 'string' || mark.id === '' || seen.has(mark.id)) {
      invalidInput('Every mark needs its own id');
    }
    seen.add(mark.id);
    if (!pickupIds.has(mark.photoId)) {
      invalidInput('A mark must point at a current pickup photo');
    }
    const box = mark.box;
    if (box !== undefined) {
      const numbers = [box.x, box.y, box.w, box.h];
      if (!numbers.every(Number.isFinite) || box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || box.x + box.w > 1.0001 || box.y + box.h > 1.0001) {
        invalidInput('The box must lie inside the photo');
      }
    }
  }
}

/** A mark without a box carries no box key at all (the sealed record cannot hash undefined). */
function cleanMark(mark: ExistingMark): ExistingMark {
  const { box, ...rest } = mark;
  return box === undefined ? rest : { ...rest, box };
}

/**
 * The AI check of an earlier photo of this handover with exactly these bytes, if it really checked the photo.
 * A retake of the same bytes in the same phase and angle reuses it: no new AI call (I5).
 * The same bytes in another slot do not: the angle is part of what the check judged.
 */
function earlierCheck(events: StoredEvent[], slot: PhotoSlot): PhotoChecked | null {
  const sameBytes = new Set(
    events.flatMap((entry) => {
      const photo = entry.event.type === 'photoAdded' ? entry.event.photo : null;
      return photo !== null && photo.sha256 === slot.sha256 && photo.phase === slot.phase && photo.angle === slot.angle ? [photo.id] : [];
    }),
  );
  const checks = events.flatMap((entry) =>
    entry.event.type === 'photoChecked' && sameBytes.has(entry.event.photoId) && !entry.event.overridden && isRealCheck(entry.event)
      ? [entry.event]
      : [],
  );
  return checks.at(-1) ?? null;
}

export function createPhotoOps(deps: ServiceDeps, mutator: Mutator): PhotoOps {
  const { store, ai, now, newId } = deps;

  /** Ruling R35: `source: 'sample'` only for a demo shop, and only for the bytes of a bundled sample photo. */
  async function assertSampleAllowed(state: HandoverState, sha256: string): Promise<void> {
    const shop = await store.getShop(state.shopId);
    if (shop === null || !shop.isDemo || !isSampleHash(sha256)) {
      invalidInput(SAMPLE_REFUSED);
    }
  }

  /** True when these bytes are a bundled sample photo and the handover belongs to a demo shop. */
  async function isDemoSample(state: HandoverState, sha256: string): Promise<boolean> {
    if (!isSampleHash(sha256)) {
      return false;
    }
    const shop = await store.getShop(state.shopId);
    return shop !== null && shop.isDemo;
  }

  function appendCheck(handoverId: string, photoId: string, check: Omit<PhotoChecked, 'type' | 'photoId' | 'overridden'>): Promise<HandoverState> {
    return mutator.mutate(handoverId, {
      actor: 'system',
      build: async () => ({ type: 'photoChecked', photoId, overridden: false, ...check }),
    });
  }

  /** Checks the new photo and returns the check with the state after it, so the route needs no extra read (I7). */
  async function checkNewPhoto(
    handoverId: string,
    state: HandoverState,
    photo: PhotoRef,
    events: StoredEvent[],
  ): Promise<{ check: PhotoCheckReport; state: HandoverState }> {
    const reused = earlierCheck(events, photo);
    if (reused !== null) {
      const { usable, reason, assessmentId, model, recorded, personVisible } = reused;
      const after = await appendCheck(handoverId, photo.id, { usable, reason, assessmentId, model, recorded, personVisible });
      return { check: { usable, reason, recorded: recorded ?? false, personVisible: personVisible ?? false }, state: after };
    }
    const input = await toPhotoInput(store, photo);
    const outcome = await ai.checkPhoto({ photo: input, expectedAngle: photo.angle, itemType: state.itemType, shopId: state.shopId });
    await saveRecord(store, outcome.record);
    const check = photoCheckFrom(outcome);
    const after = await appendCheck(handoverId, photo.id, {
      usable: check.usable,
      reason: check.reason,
      assessmentId: outcome.record.id,
      model: outcome.record.model,
      recorded: check.recorded,
      personVisible: check.personVisible,
    });
    return { check, state: after };
  }

  return {
    async addPhoto(handoverId, input) {
      if (!(input.bytes instanceof Uint8Array) || input.bytes.length === 0) {
        return invalidInput('A photo cannot be empty');
      }
      const { events, state } = await mutator.load(handoverId);
      const sha256 = sha256Hex(input.bytes);
      if (input.source === 'sample') {
        await assertSampleAllowed(state, sha256);
      }
      const photo: PhotoRef = {
        id: newId(),
        phase: input.phase,
        angle: input.angle,
        url: '',
        sha256,
        takenAt: now().toISOString(),
        // Bytes that are a bundled sample photo are the AI-generated demo photo, however they arrived.
        source: input.source === 'camera' && (await isDemoSample(state, sha256)) ? 'sample' : input.source,
      };
      mutator.assertCan(state, { type: 'photoAdded', photo });
      const { url } = await store.putPhoto(handoverId, photo.id, input.bytes);
      const stored = { ...photo, url };
      const added = await mutator.mutate(handoverId, { actor: 'shop', build: async () => ({ type: 'photoAdded', photo: stored }) });
      const { check, state: checked } = await checkNewPhoto(handoverId, added, stored, events);
      return { photo: stored, check, state: checked };
    },

    async overridePhotoCheck(handoverId, photoId) {
      return mutator.mutate(handoverId, {
        actor: 'shop',
        build: async (state) => {
          const known = [...state.pickupPhotos, ...state.returnPhotos].some((photo) => photo.id === photoId);
          if (!known) {
            throw new ServiceError('INVALID_INPUT', 'Unknown photo');
          }
          // The domain refuses this unless the photo failed twice and does not show a person (M13).
          const current = state.photoChecks[photoId];
          return {
            type: 'photoChecked',
            photoId,
            usable: current?.usable ?? false,
            reason: current?.reason ?? '',
            overridden: true,
            assessmentId: null,
            personVisible: current?.personVisible ?? false,
          };
        },
      });
    },

    async recordCondition(handoverId) {
      return mutator.mutate(handoverId, {
        actor: 'system',
        build: async (state) => {
          mutator.assertCan(state, { type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: '', assessmentId: null });
          const missing = missingPickupAngles(state);
          if (missing.length > 0) {
            throw new ServiceError('INVALID_STATE', `Missing pickup photos: ${missing.join(', ')}`);
          }
          const photos = await Promise.all(state.pickupPhotos.map((photo) => toPhotoInput(store, photo)));
          const outcome = await ai.recordCondition({ photos, itemType: state.itemType, depositRules: state.depositRules, shopId: state.shopId });
          await saveRecord(store, outcome.record);
          return conditionEvent(outcome, newId);
        },
      });
    },

    async updateMarks(handoverId, marks) {
      return mutator.mutate(handoverId, {
        actor: 'shop',
        build: async (state) => {
          if (state.itemDescription === null) {
            throw new ServiceError('INVALID_STATE', 'Record the condition before editing marks');
          }
          checkMarks(state, marks);
          return {
            type: 'conditionRecorded',
            marks: marks.map(cleanMark),
            suggestedRuleId: state.suggestedRuleId,
            itemDescription: state.itemDescription ?? '',
            assessmentId: null,
          };
        },
      });
    },
  };
}
