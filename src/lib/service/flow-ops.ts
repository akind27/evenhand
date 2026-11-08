import type { HandoverState } from '@/lib/domain/state';
import type { ServiceDeps } from '@/lib/service/deps';
import { ServiceError, invalidInput } from '@/lib/service/errors';
import type { HandoverService } from '@/lib/service/handover-service';
import type { Mutator } from '@/lib/service/mutate';
import { HoldLostSignal, paying, recordHoldLost, safeReauthorize, type LostStatus } from '@/lib/service/payment-errors';
import { cleanHash, cleanLanguage, cleanText } from '@/lib/service/validation';

type FlowOps = Pick<
  HandoverService,
  | 'setDeposit'
  | 'shareWithRenter'
  | 'renterConfirm'
  | 'createHoldOrder'
  | 'authorizeHold'
  | 'startReturn'
  | 'refreshHold'
  | 'holdRefreshDue'
>;

type Hold = NonNullable<HandoverState['hold']>;

const LOST_GATEWAY_STATUSES: Record<string, LostStatus> = {
  VOIDED: 'VOIDED',
  EXPIRED: 'EXPIRED',
  CAPTURED: 'CAPTURED',
  PARTIALLY_CAPTURED: 'CAPTURED',
  DENIED: 'DENIED',
};

function depositOrThrow(state: HandoverState): { ruleId: string; amountCents: number } {
  if (state.deposit === null) {
    throw new ServiceError('INVALID_STATE', 'The deposit has not been set');
  }
  return state.deposit;
}

/** After a failed hold refresh, PayPal is not asked again for this long (per handover, in memory). */
export const REFRESH_BACKOFF_MS = 5 * 60 * 1000;

/** True when the hold is past its honor period and still open, so a refresh would call PayPal. */
export function isDue(state: HandoverState, now: Date): state is HandoverState & { hold: Hold } {
  return (
    state.hold !== null &&
    state.settlement === null &&
    state.holdLost === null &&
    state.status !== 'closed' &&
    now > new Date(state.hold.honorUntil)
  );
}

export function createFlowOps(deps: ServiceDeps, mutator: Mutator): FlowOps {
  const { payments, now } = deps;
  /** Handover id → time (ms) before which a failed refresh is not tried again. */
  const backoffUntil = new Map<string, number>();

  function backingOff(handoverId: string): boolean {
    const waitUntil = backoffUntil.get(handoverId);
    return waitUntil !== undefined && now().getTime() < waitUntil;
  }

  /** Runs one refresh. A payment failure starts the back-off, so polling does not hammer PayPal. */
  async function refreshDue(handoverId: string, state: HandoverState & { hold: Hold }): Promise<HandoverState> {
    try {
      const status = await paying(() => payments.getHoldStatus(state.hold.authorizationId));
      const lost = LOST_GATEWAY_STATUSES[status];
      if (lost !== undefined) {
        return await recordHoldLost(mutator, handoverId, lost);
      }
      if (status === 'CREATED' || status === 'PENDING') {
        return await reauthorize(handoverId, state.hold);
      }
      return state;
    } catch (error) {
      if (error instanceof ServiceError && error.code === 'PAYMENT') {
        backoffUntil.set(handoverId, now().getTime() + REFRESH_BACKOFF_MS);
      }
      throw error;
    }
  }

  /** Asks PayPal to extend the hold. Records the new dates only when they are really later. */
  async function reauthorize(handoverId: string, hold: Hold): Promise<HandoverState> {
    let next;
    try {
      // PayPal never reauthorizes a reauthorization: always renew the original (parent) authorization.
      next = await safeReauthorize(payments, {
        handoverId,
        authorizationId: hold.parentAuthorizationId,
        currentAuthorizationId: hold.authorizationId,
        amountCents: hold.amountCents,
      });
    } catch (error) {
      if (error instanceof HoldLostSignal) {
        return recordHoldLost(mutator, handoverId, error.status);
      }
      throw error;
    }
    if (Date.parse(next.honorUntil) <= Date.parse(hold.honorUntil)) {
      return (await mutator.load(handoverId)).state;
    }
    return mutator.mutate(handoverId, {
      actor: 'system',
      build: async () => ({ type: 'holdReauthorized', authorizationId: next.authorizationId, honorUntil: next.honorUntil, expiresAt: next.expiresAt }),
      settledBy: (state) => state.hold?.honorUntil !== hold.honorUntil,
    });
  }

  return {
    async setDeposit(handoverId, ruleId) {
      return mutator.mutate(handoverId, {
        actor: 'shop',
        build: async (state) => {
          const rule = state.depositRules.find((candidate) => candidate.id === ruleId);
          if (rule === undefined) {
            return invalidInput('Unknown deposit rule');
          }
          return { type: 'depositSet', ruleId: rule.id, amountCents: rule.amountCents };
        },
      });
    },

    async shareWithRenter(handoverId) {
      return mutator.mutate(handoverId, { actor: 'shop', build: async () => ({ type: 'sharedWithRenter' }) });
    },

    async renterConfirm(handoverId, input) {
      const language = cleanLanguage(input.language);
      const renterName = input.renterName === null ? null : cleanText(input.renterName, 'Renter name', 80);
      const renterDeviceHash = cleanHash(input.deviceHash, 'Device hash');
      return mutator.mutate(handoverId, {
        actor: 'renter',
        build: async () => ({ type: 'renterConfirmed', language, renterName, renterDeviceHash }),
        // The first device to confirm keeps the binding. A later confirm, from any device, changes nothing.
        settledBy: (state) => state.renter !== null,
      });
    },

    async createHoldOrder(handoverId) {
      const state = await mutator.mutate(handoverId, {
        actor: 'renter',
        paid: true,
        build: async (current) => {
          const deposit = depositOrThrow(current);
          mutator.assertCan(current, { type: 'holdOrderCreated', orderId: 'pending' });
          const { orderId } = await paying(() =>
            payments.createHoldOrder({
              handoverId,
              amountCents: deposit.amountCents,
              description: `Evenhand deposit hold for ${current.itemType} ${current.itemRef}`,
            }),
          );
          return { type: 'holdOrderCreated', orderId };
        },
        settledBy: (current) => current.holdOrderId !== null,
      });
      return { orderId: state.holdOrderId as string };
    },

    async authorizeHold(handoverId, orderId) {
      return mutator.mutate(handoverId, {
        actor: 'renter',
        paid: true,
        build: async (state) => {
          const deposit = depositOrThrow(state);
          if (state.holdOrderId === null) {
            throw new ServiceError('INVALID_STATE', 'The hold order has not been created yet');
          }
          if (state.holdOrderId !== orderId) {
            return invalidInput('That order does not belong to this handover');
          }
          const probe = { type: 'holdAuthorized', orderId, authorizationId: 'pending', amountCents: deposit.amountCents, honorUntil: '', expiresAt: '' } as const;
          mutator.assertCan(state, probe);
          const hold = await paying(() => payments.authorizeOrder({ handoverId, orderId }));
          if (hold.orderId !== orderId) {
            return invalidInput('That order does not belong to this handover');
          }
          return { ...probe, authorizationId: hold.authorizationId, amountCents: hold.amountCents, honorUntil: hold.honorUntil, expiresAt: hold.expiresAt };
        },
        settledBy: (state) => state.hold?.orderId === orderId,
      });
    },

    async startReturn(handoverId) {
      return mutator.mutate(handoverId, { actor: 'shop', build: async () => ({ type: 'returnStarted' }) });
    },

    holdRefreshDue: (state) => isDue(state, now()) && !backingOff(state.id),

    async refreshHold(handoverId) {
      const { state } = await mutator.load(handoverId);
      if (!isDue(state, now()) || backingOff(handoverId)) {
        return state;
      }
      backoffUntil.delete(handoverId);
      return refreshDue(handoverId, state);
    },
  };
}
