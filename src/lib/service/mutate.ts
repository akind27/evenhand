import { appendEvent, type Actor, type HandoverEvent, type StoredEvent } from '@/lib/domain/events';
import { canApply, reduce, type HandoverState } from '@/lib/domain/state';
import { AppendConflictError } from '@/lib/evidence/store';
import type { ServiceDeps } from '@/lib/service/deps';
import { ServiceError } from '@/lib/service/errors';

export interface Mutation {
  actor: Actor;
  /** Builds the event. It may call AI or payments, so it runs before the append. */
  build(state: HandoverState): Promise<HandoverEvent>;
  /** True when the state already shows the intended outcome. Then the call is a safe repeat. */
  settledBy?(state: HandoverState): boolean;
  /** True when `build` has already changed something at PayPal by the time it returns. The event must then be recorded. */
  paid?: boolean;
}

export interface Mutator {
  load(handoverId: string): Promise<{ events: StoredEvent[]; state: HandoverState }>;
  mutate(handoverId: string, mutation: Mutation): Promise<HandoverState>;
  assertCan(state: HandoverState, event: HandoverEvent): void;
}

const UNRECORDED_PAYMENT =
  'Payment completed at PayPal but could not be recorded — check the PayPal dashboard';

/** Marks an id that is not valid for the store as "not found". */
function isInvalidId(error: unknown): boolean {
  return error instanceof Error && error.message === 'Invalid id';
}

export function createMutator(deps: Pick<ServiceDeps, 'store' | 'now'>): Mutator {
  const { store, now } = deps;

  async function load(handoverId: string): Promise<{ events: StoredEvent[]; state: HandoverState }> {
    let events: StoredEvent[];
    try {
      events = await store.listEvents(handoverId);
    } catch (error) {
      if (isInvalidId(error)) {
        throw new ServiceError('NOT_FOUND', 'Handover not found');
      }
      throw error;
    }
    if (events.length === 0) {
      throw new ServiceError('NOT_FOUND', 'Handover not found');
    }
    return { events, state: reduce(handoverId, events) };
  }

  function assertCan(state: HandoverState, event: HandoverEvent): void {
    const verdict = canApply(state, event);
    if (!verdict.ok) {
      throw new ServiceError('INVALID_STATE', verdict.reason);
    }
  }

  /** Appends the event once more after money already moved. A second conflict is reported, never hidden. */
  async function reappendAfterPayment(handoverId: string, mutation: Mutation, event: HandoverEvent): Promise<HandoverState> {
    const { events, state } = await load(handoverId);
    if (mutation.settledBy?.(state)) {
      return state;
    }
    if (!canApply(state, event).ok) {
      throw new ServiceError('PAYMENT', UNRECORDED_PAYMENT);
    }
    const stored = appendEvent(events, mutation.actor, event, now());
    try {
      await store.appendEvent(handoverId, stored);
    } catch (error) {
      if (error instanceof AppendConflictError) {
        throw new ServiceError('PAYMENT', UNRECORDED_PAYMENT);
      }
      throw error;
    }
    return reduce(handoverId, [...events, stored]);
  }

  /** Another call won the race. Return its result if it is the outcome we wanted. */
  async function resolveConflict(handoverId: string, mutation: Mutation, event: HandoverEvent): Promise<HandoverState> {
    if (mutation.paid) {
      return reappendAfterPayment(handoverId, mutation, event);
    }
    const { state } = await load(handoverId);
    if (mutation.settledBy?.(state)) {
      return state;
    }
    throw new ServiceError('INVALID_STATE', 'The handover changed at the same moment. Please reload and try again.');
  }

  async function mutate(handoverId: string, mutation: Mutation): Promise<HandoverState> {
    const { events, state } = await load(handoverId);
    if (mutation.settledBy?.(state)) {
      return state;
    }
    const event = await mutation.build(state);
    if (mutation.paid) {
      // Money has already moved at PayPal, so a refusal now means the payment cannot be recorded.
      if (!canApply(state, event).ok) {
        throw new ServiceError('PAYMENT', UNRECORDED_PAYMENT);
      }
    } else {
      assertCan(state, event);
    }
    const stored = appendEvent(events, mutation.actor, event, now());
    try {
      await store.appendEvent(handoverId, stored);
    } catch (error) {
      if (error instanceof AppendConflictError) {
        return resolveConflict(handoverId, mutation, event);
      }
      throw error;
    }
    return reduce(handoverId, [...events, stored]);
  }

  return { load, mutate, assertCan };
}

export type SingleFlight = <T>(key: string, run: () => Promise<T>) => Promise<T>;

/**
 * Calls made at the same moment for the same key share one run. Only the first call does the work.
 * Each service makes its own, so two services in one process never share a result.
 */
export function createSingleFlight(): SingleFlight {
  const inFlight = new Map<string, Promise<unknown>>();
  return <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const running = inFlight.get(key);
    if (running !== undefined) {
      return running as Promise<T>;
    }
    const started = run().finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, started);
    return started;
  };
}
