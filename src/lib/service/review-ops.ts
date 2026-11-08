import { computeCharge } from '@/lib/domain/settlement';
import type { HandoverEvent } from '@/lib/domain/events';
import type { HandoverState } from '@/lib/domain/state';
import type { Box, Finding } from '@/lib/domain/types';
import { saveRecord, buildPairs, comparisonEvent, toPhotoInput } from '@/lib/service/ai-steps';
import type { ServiceDeps } from '@/lib/service/deps';
import { ServiceError, invalidInput } from '@/lib/service/errors';
import type { HandoverService } from '@/lib/service/handover-service';
import { createSingleFlight, type Mutator } from '@/lib/service/mutate';
import { failIfHoldLost, mutateGuardingHold, safeCapture, safeVoid } from '@/lib/service/payment-errors';
import { cleanText } from '@/lib/service/validation';

type ReviewOps = Pick<
  HandoverService,
  'compare' | 'addManualFinding' | 'updateFinding' | 'proposeCharge' | 'release' | 'acceptCharge' | 'dispute'
>;

type Hold = NonNullable<HandoverState['hold']>;

/** A finding the shop adds without placing a box marks the whole photo. */
const WHOLE_PHOTO: Box = { x: 0, y: 0, w: 1, h: 1 };

/** A box the shop placed must have a size and lie inside the photo. */
function checkedBox(box: Box): Box {
  const numbers = [box.x, box.y, box.w, box.h];
  if (!numbers.every(Number.isFinite) || box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || box.x + box.w > 1.0001 || box.y + box.h > 1.0001) {
    return invalidInput('The box must lie inside the photo');
  }
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

function holdOrThrow(state: HandoverState): Hold {
  failIfHoldLost(state);
  if (state.hold === null) {
    throw new ServiceError('INVALID_STATE', 'There is no hold on this handover');
  }
  return state.hold;
}

export function createReviewOps(deps: ServiceDeps, mutator: Mutator): ReviewOps {
  const { store, payments, ai, newId } = deps;
  const singleFlight = createSingleFlight();

  async function buildRelease(handoverId: string, state: HandoverState): Promise<HandoverEvent> {
    // After a reauthorization PayPal refuses to void the new id (CANNOT_BE_VOIDED): the parent must be voided.
    const authorizationId = holdOrThrow(state).parentAuthorizationId;
    mutator.assertCan(state, { type: 'released', authorizationId });
    await safeVoid(payments, { handoverId, authorizationId });
    return { type: 'released', authorizationId };
  }

  async function buildCharge(handoverId: string, state: HandoverState): Promise<HandoverEvent> {
    const hold = holdOrThrow(state);
    if (state.status !== 'chargeProposed' || state.proposal === null) {
      throw new ServiceError('INVALID_STATE', 'The shop has not proposed a charge yet');
    }
    const requested = state.proposal.chargeCents;
    mutator.assertCan(state, {
      type: 'charged',
      authorizationId: hold.authorizationId,
      captureId: 'pending',
      chargeCents: requested,
      releaseCents: hold.amountCents - requested,
    });
    const captured = await safeCapture(payments, {
      handoverId,
      authorizationId: hold.authorizationId,
      amountCents: requested,
      note: 'Evenhand damage charge',
    });
    // Record what PayPal really captured, which is what the renter paid.
    return {
      type: 'charged',
      authorizationId: hold.authorizationId,
      captureId: captured.captureId,
      chargeCents: captured.amountCents,
      releaseCents: hold.amountCents - captured.amountCents,
    };
  }

  function buildProposal(state: HandoverState): Promise<HandoverEvent> {
    const hold = holdOrThrow(state);
    const { lines, chargeCents, releaseCents, exceedsHoldByCents } = computeCharge(state.findings, state.priceList, hold.amountCents);
    return Promise.resolve({ type: 'chargeProposed', lines, chargeCents, releaseCents, exceedsHoldByCents });
  }

  async function buildComparison(state: HandoverState): Promise<HandoverEvent> {
    mutator.assertCan(state, { type: 'comparisonDone', findings: [], explanation: '', explanationLanguage: 'en', assessmentId: null, aiFailed: false });
    const pairs = buildPairs(state);
    const inputs = await Promise.all(
      pairs.map(async (pair) => ({
        angle: pair.angle,
        before: await toPhotoInput(store, pair.before),
        after: await toPhotoInput(store, pair.after),
      })),
    );
    const outcome = await ai.compare({
      pairs: inputs,
      existingMarks: state.marks,
      priceList: state.priceList,
      language: state.renter?.language ?? 'en',
      shopId: state.shopId,
    });
    await saveRecord(store, outcome.record);
    return comparisonEvent(outcome, state, pairs, newId);
  }

  return {
    compare: (handoverId) =>
      mutator.mutate(handoverId, {
        actor: 'system',
        build: buildComparison,
        settledBy: (state) => state.explanation !== null,
      }),

    async addManualFinding(handoverId, input) {
      const location = cleanText(input.location, 'Location', 100);
      const description = cleanText(input.description, 'Description', 300);
      const box = input.box === undefined ? WHOLE_PHOTO : checkedBox(input.box);
      return mutator.mutate(handoverId, {
        actor: 'shop',
        build: async (state) => {
          const before = state.pickupPhotos.find((photo) => photo.angle === input.angle);
          const after = state.returnPhotos.find((photo) => photo.angle === input.angle);
          if (before === undefined || after === undefined) {
            return invalidInput('There is no pickup and return photo for that angle');
          }
          const finding: Finding = {
            id: newId(),
            angle: input.angle,
            beforePhotoId: before.id,
            afterPhotoId: after.id,
            location,
            description,
            severity: 'moderate',
            confidence: 1,
            box,
            priceItemId: input.priceItemId,
            status: 'confirmed',
            source: 'shop',
          };
          if (!state.priceList.some((item) => item.id === input.priceItemId)) {
            return invalidInput('Unknown price item');
          }
          return { type: 'findingAdded', finding };
        },
      });
    },

    async updateFinding(handoverId, findingId, input) {
      if (input.status !== 'confirmed' && input.status !== 'dismissed') {
        return invalidInput('Status must be confirmed or dismissed');
      }
      if (input.status === 'confirmed' && input.priceItemId === null) {
        return invalidInput('A confirmed finding needs a price item');
      }
      return mutator.mutate(handoverId, {
        actor: 'shop',
        build: async () => ({ type: 'findingUpdated', findingId, status: input.status, priceItemId: input.priceItemId }),
      });
    },

    proposeCharge: (handoverId) =>
      mutator.mutate(handoverId, {
        actor: 'shop',
        build: buildProposal,
        settledBy: (state) => state.proposal !== null,
      }),

    release: (handoverId) =>
      singleFlight(`release:${handoverId}`, () =>
        mutateGuardingHold(mutator, handoverId, {
          actor: 'shop',
          paid: true,
          build: (state) => buildRelease(handoverId, state),
          settledBy: (state) => state.settlement?.kind === 'released',
        }),
      ),

    acceptCharge: (handoverId) =>
      singleFlight(`accept:${handoverId}`, () =>
        mutateGuardingHold(mutator, handoverId, {
          actor: 'renter',
          paid: true,
          build: (state) => buildCharge(handoverId, state),
          settledBy: (state) => state.settlement !== null,
        }),
      ),

    async dispute(handoverId, reason) {
      const cleaned = cleanText(reason, 'Reason', 500);
      return mutator.mutate(handoverId, {
        actor: 'renter',
        build: async () => ({ type: 'disputed', reason: cleaned }),
        settledBy: (state) => state.dispute !== null,
      });
    },
  };
}
