import { assertCents } from '@/lib/money';
import {
  FALLBACK_EXPIRY_DAYS,
  HONOR_DAYS,
  PaymentError,
  addDays,
  type Hold,
  type HoldStatus,
  type PaymentsGateway,
} from './gateway';

interface FakeOrder {
  amountCents: number;
  approved: boolean;
}

interface FakeAuthorization {
  handoverId: string;
  hold: Hold;
  status: HoldStatus;
  /** Set on a reauthorization: the authorization it extends. Like PayPal, only the parent can be voided. */
  parentId: string | null;
}

export interface FakeGatewayOptions {
  now?: () => Date;
  /** When true, orders are approved at creation (used by the keyless demo). */
  autoApprove?: boolean;
}

/**
 * In-memory stand-in for the PayPal gateway. It follows the same rules, including
 * the idempotency keys (`<handoverId>:<action>`), so tests and the demo behave like sandbox.
 */
export function createFakeGateway(
  opts: FakeGatewayOptions = {},
): PaymentsGateway & { approve(orderId: string): void } {
  const clock = opts.now ?? (() => new Date());
  const autoApprove = opts.autoApprove ?? false;
  const orders = new Map<string, FakeOrder>();
  const authorizations = new Map<string, FakeAuthorization>();
  const results = new Map<string, unknown>();
  let orderSeq = 0;
  let authSeq = 0;
  let captureSeq = 0;

  /** Runs `action` once per key. Repeats return the first result, like PayPal-Request-Id. */
  function once<T>(key: string, action: () => T): T {
    if (results.has(key)) {
      return results.get(key) as T;
    }
    const value = action();
    results.set(key, value);
    return value;
  }

  function findAuthorization(authorizationId: string): FakeAuthorization {
    const found = authorizations.get(authorizationId);
    if (!found) {
      throw new PaymentError('UPSTREAM', `Unknown authorization ${authorizationId}`);
    }
    return found;
  }

  function isExpired(auth: FakeAuthorization): boolean {
    return clock().getTime() >= Date.parse(auth.hold.expiresAt);
  }

  /** Throws the error that applies to a hold that can no longer be voided or captured. */
  function assertLive(auth: FakeAuthorization): void {
    if (auth.status === 'VOIDED') {
      throw new PaymentError('ALREADY_VOIDED', 'This hold has already been voided');
    }
    if (auth.status === 'CAPTURED' || auth.status === 'PARTIALLY_CAPTURED') {
      throw new PaymentError('ALREADY_CAPTURED', 'This hold has already been captured');
    }
    if (isExpired(auth)) {
      throw new PaymentError('EXPIRED', 'This hold has expired');
    }
  }

  return {
    kind: 'fake',

    approve(orderId: string): void {
      const order = orders.get(orderId);
      if (!order) {
        throw new PaymentError('UPSTREAM', `Unknown order ${orderId}`);
      }
      orders.set(orderId, { ...order, approved: true });
    },

    async createHoldOrder({ handoverId, amountCents }) {
      return once(`${handoverId}:order`, () => {
        assertCents(amountCents);
        orderSeq += 1;
        const orderId = `FAKE-ORDER-${orderSeq}`;
        orders.set(orderId, { amountCents, approved: autoApprove });
        return { orderId };
      });
    },

    async authorizeOrder({ handoverId, orderId }) {
      return once(`${handoverId}:authorize`, () => {
        const order = orders.get(orderId);
        if (!order) {
          throw new PaymentError('UPSTREAM', `Unknown order ${orderId}`);
        }
        if (!order.approved) {
          throw new PaymentError('NOT_APPROVED', 'The customer has not approved this order yet');
        }
        authSeq += 1;
        const authorizationId = `FAKE-AUTH-${authSeq}`;
        const created = clock();
        const hold: Hold = {
          orderId,
          authorizationId,
          amountCents: order.amountCents,
          honorUntil: addDays(created, HONOR_DAYS).toISOString(),
          expiresAt: addDays(created, FALLBACK_EXPIRY_DAYS).toISOString(),
        };
        authorizations.set(authorizationId, { handoverId, hold, status: 'CREATED', parentId: null });
        return { ...hold };
      });
    },

    async voidHold({ handoverId, authorizationId }) {
      return once(`${handoverId}:void:${authorizationId}`, () => {
        const auth = findAuthorization(authorizationId);
        if (auth.parentId !== null) {
          // PayPal answers CANNOT_BE_VOIDED here, which the real gateway maps to UPSTREAM.
          throw new PaymentError('UPSTREAM', 'A reauthorization cannot be voided. Void the parent authorization.');
        }
        if (auth.status === 'VOIDED') {
          throw new PaymentError('ALREADY_VOIDED', 'This hold has already been voided');
        }
        if (auth.status === 'CAPTURED' || auth.status === 'PARTIALLY_CAPTURED') {
          throw new PaymentError('ALREADY_CAPTURED', 'This hold has already been captured');
        }
        for (const [id, entry] of authorizations) {
          if (id === authorizationId || (entry.parentId === authorizationId && (entry.status === 'CREATED' || entry.status === 'PENDING'))) {
            authorizations.set(id, { ...entry, status: 'VOIDED' });
          }
        }
      });
    },

    async captureHold({ handoverId, authorizationId, amountCents }) {
      return once(`${handoverId}:capture:${authorizationId}:${amountCents}`, () => {
        assertCents(amountCents);
        if (amountCents === 0) {
          throw new PaymentError('UPSTREAM', 'Nothing to capture');
        }
        const auth = findAuthorization(authorizationId);
        assertLive(auth);
        if (amountCents > auth.hold.amountCents) {
          throw new PaymentError('UPSTREAM', 'Capture is larger than the hold');
        }
        const status: HoldStatus = amountCents < auth.hold.amountCents ? 'PARTIALLY_CAPTURED' : 'CAPTURED';
        authorizations.set(authorizationId, { ...auth, status });
        captureSeq += 1;
        return { captureId: `FAKE-CAP-${captureSeq}`, amountCents };
      });
    },

    async reauthorize({ handoverId, authorizationId, currentAuthorizationId, amountCents }) {
      return once(`${handoverId}:reauth:${currentAuthorizationId ?? authorizationId}`, () => {
        assertCents(amountCents);
        const auth = findAuthorization(authorizationId);
        if (auth.parentId !== null) {
          // PayPal refuses this; the real gateway maps the refusal to UPSTREAM.
          throw new PaymentError('UPSTREAM', 'A reauthorization cannot be reauthorized. Reauthorize the original authorization.');
        }
        assertLive(auth);
        // Like PayPal, a reauthorization is a new authorization with its own id. It points back at the first one.
        authSeq += 1;
        const childId = `FAKE-AUTH-${authSeq}`;
        const hold: Hold = {
          ...auth.hold,
          authorizationId: childId,
          amountCents,
          honorUntil: addDays(clock(), HONOR_DAYS).toISOString(),
        };
        authorizations.set(childId, { handoverId: auth.handoverId, hold, status: 'CREATED', parentId: auth.parentId ?? authorizationId });
        return { ...hold };
      });
    },

    async getHoldStatus(authorizationId): Promise<HoldStatus> {
      const auth = findAuthorization(authorizationId);
      const live = auth.status === 'CREATED' || auth.status === 'PENDING';
      return live && isExpired(auth) ? 'EXPIRED' : auth.status;
    },
  };
}
