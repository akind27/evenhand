/**
 * True when a handover page has nothing left to wait for, so its polling timer can stop (I7):
 * the handover is settled, or the PayPal hold is lost (expired, voided, charged or denied outside Evenhand).
 * A manual refresh still works.
 */
export function pollingDone(data: { handover: { settlement: unknown; holdLost: unknown } }): boolean {
  return data.handover.settlement !== null || data.handover.holdLost !== null;
}
