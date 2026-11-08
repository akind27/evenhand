import type { HandoverView } from '@/lib/client/api';

type LostStatus = NonNullable<HandoverView['holdLost']>;

/** What the shop sees when the PayPal hold ended outside the app (I4): the stamp, and what to do now. */
export const SHOP_HOLD_LOST: Record<LostStatus, { stamp: string; message: string }> = {
  EXPIRED: { stamp: 'Hold expired', message: 'Hold expired — settle with the renter directly' },
  VOIDED: { stamp: 'Hold cancelled', message: 'Hold cancelled outside Evenhand — settle with the renter directly' },
  CAPTURED: { stamp: 'Charged elsewhere', message: 'Hold charged outside Evenhand — check PayPal, then settle with the renter directly' },
  DENIED: { stamp: 'Hold denied', message: 'Hold denied by PayPal — settle with the renter directly' },
};

/** The lost status of a hold that was never settled in the app, or null while the hold is live (or settled). */
export function lostHold(view: HandoverView): LostStatus | null {
  return view.settlement === null ? view.holdLost : null;
}
