/** Stable error codes the rest of the app matches on. Messages are for humans and may change. */
export type PaymentErrorCode =
  | 'ALREADY_VOIDED'
  | 'ALREADY_CAPTURED'
  | 'EXPIRED'
  | 'DENIED'
  | 'NOT_APPROVED'
  | 'UPSTREAM'
  | 'CONFIG';

export class PaymentError extends Error {
  constructor(
    public readonly code: PaymentErrorCode,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

/** A PayPal authorization ("hold") on a rental handover. Amounts are whole cents. */
export interface Hold {
  orderId: string;
  authorizationId: string;
  amountCents: number;
  honorUntil: string;
  expiresAt: string;
}

export const HOLD_STATUSES = [
  'CREATED',
  'PENDING',
  'CAPTURED',
  'PARTIALLY_CAPTURED',
  'VOIDED',
  'EXPIRED',
  'DENIED',
] as const;

export type HoldStatus = (typeof HOLD_STATUSES)[number];

export interface PaymentsGateway {
  readonly kind: 'paypal-sandbox' | 'fake';
  createHoldOrder(input: { handoverId: string; amountCents: number; description: string }): Promise<{ orderId: string }>;
  authorizeOrder(input: { handoverId: string; orderId: string }): Promise<Hold>;
  voidHold(input: { handoverId: string; authorizationId: string }): Promise<void>;
  captureHold(input: {
    handoverId: string;
    authorizationId: string;
    amountCents: number;
    note: string;
  }): Promise<{ captureId: string; amountCents: number }>; // amountCents is what was really captured
  /**
   * `authorizationId` must be the original (parent) authorization: PayPal never reauthorizes a reauthorization.
   * `currentAuthorizationId` is the newest one; it only goes into the request id, so each renewal is a new request.
   */
  reauthorize(input: { handoverId: string; authorizationId: string; currentAuthorizationId?: string; amountCents: number }): Promise<Hold>;
  getHoldStatus(authorizationId: string): Promise<HoldStatus>;
}

/** How long a hold is promised to be honored after authorization. */
export const HONOR_DAYS = 3;
/** Used when PayPal does not return an expiration time for an authorization. */
export const FALLBACK_EXPIRY_DAYS = 29;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Returns a new Date `days` after `from`. Never mutates `from`. */
export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}
