import { PaymentError, type PaymentErrorCode, type PaymentsGateway } from '@/lib/payments/gateway';
import type { HandoverState } from '@/lib/domain/state';
import { ServiceError } from '@/lib/service/errors';
import type { Mutation, Mutator } from '@/lib/service/mutate';

export type LostStatus = 'EXPIRED' | 'VOIDED' | 'CAPTURED' | 'DENIED';

/** Thrown inside a mutation when the hold can no longer be used. The wrapper records it. */
export class HoldLostSignal extends Error {
  constructor(public status: LostStatus) {
    super(`Hold lost: ${status}`);
    this.name = 'HoldLostSignal';
  }
}

type LostTable = Partial<Record<PaymentErrorCode, LostStatus>>;

const LOST_ON_CAPTURE: LostTable = {
  EXPIRED: 'EXPIRED',
  DENIED: 'DENIED',
  ALREADY_VOIDED: 'VOIDED',
  ALREADY_CAPTURED: 'CAPTURED',
};

const LOST_ON_VOID: LostTable = { EXPIRED: 'EXPIRED', DENIED: 'DENIED', ALREADY_CAPTURED: 'CAPTURED' };

const LOST_MESSAGES: Record<LostStatus, string> = {
  EXPIRED: 'The hold has expired and can no longer be used.',
  DENIED: 'The hold was denied.',
  VOIDED: 'The hold was already cancelled.',
  CAPTURED: 'The hold was already charged.',
};

function translate(error: unknown, table: LostTable): never {
  if (error instanceof PaymentError) {
    const lost = table[error.code];
    if (lost !== undefined) {
      throw new HoldLostSignal(lost);
    }
    throw new ServiceError('PAYMENT', error.message);
  }
  throw error;
}

/** Runs any payment call and turns payment failures into a PAYMENT service error. */
export async function paying<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    return translate(error, {});
  }
}

/** Voids the hold. A hold that is already voided counts as success. */
export async function safeVoid(
  payments: PaymentsGateway,
  input: { handoverId: string; authorizationId: string },
): Promise<void> {
  try {
    await payments.voidHold(input);
  } catch (error) {
    if (error instanceof PaymentError && error.code === 'ALREADY_VOIDED') {
      return;
    }
    translate(error, LOST_ON_VOID);
  }
}

export async function safeCapture(
  payments: PaymentsGateway,
  input: { handoverId: string; authorizationId: string; amountCents: number; note: string },
): Promise<{ captureId: string; amountCents: number }> {
  try {
    return await payments.captureHold(input);
  } catch (error) {
    return translate(error, LOST_ON_CAPTURE);
  }
}

/** Reauthorizes the hold. An expired or denied hold throws a HoldLostSignal. */
export async function safeReauthorize(
  payments: PaymentsGateway,
  input: { handoverId: string; authorizationId: string; currentAuthorizationId?: string; amountCents: number },
): Promise<Awaited<ReturnType<PaymentsGateway['reauthorize']>>> {
  try {
    return await payments.reauthorize(input);
  } catch (error) {
    return translate(error, { EXPIRED: 'EXPIRED', DENIED: 'DENIED' });
  }
}

export function failIfHoldLost(state: HandoverState): void {
  if (state.holdLost !== null) {
    throw new ServiceError('HOLD_LOST', LOST_MESSAGES[state.holdLost]);
  }
}

/** Runs a mutation. If the hold turns out to be lost, records that fact and throws HOLD_LOST. */
export async function mutateGuardingHold(mutator: Mutator, handoverId: string, mutation: Mutation): Promise<HandoverState> {
  try {
    return await mutator.mutate(handoverId, mutation);
  } catch (error) {
    if (!(error instanceof HoldLostSignal)) {
      throw error;
    }
    await recordHoldLost(mutator, handoverId, error.status);
    throw new ServiceError('HOLD_LOST', LOST_MESSAGES[error.status]);
  }
}

export function recordHoldLost(mutator: Mutator, handoverId: string, status: LostStatus): Promise<HandoverState> {
  return mutator.mutate(handoverId, {
    actor: 'system',
    build: async () => ({ type: 'holdLost', status }),
    settledBy: (state) => state.holdLost !== null,
  });
}
