import type { Actor, StoredEvent } from '@/lib/domain/events';
import { euro } from '@/lib/client/format';
import { isNotChecked } from '@/lib/client/photo-check';

export function actorLabel(actor: Actor): string {
  return actor === 'shop' ? 'Shop' : actor === 'renter' ? 'Renter' : 'System';
}

const WHEN = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });

/** Local time with the date and a short zone name, e.g. "08 Nov 2026, 12:15:03 GMT+2". Stamps use the same clock. */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : WHEN.format(date);
}

const DAY_ONLY = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
function day(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DAY_ONLY.format(date);
}

const LOST: Record<'EXPIRED' | 'VOIDED' | 'CAPTURED' | 'DENIED', string> = {
  EXPIRED: 'The PayPal hold ran out.',
  VOIDED: 'The PayPal hold was cancelled.',
  CAPTURED: 'The PayPal hold was already collected.',
  DENIED: 'PayPal refused the hold.',
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/** One plain English line for a sealed event. Neutral wording: it states what happened, never who is to blame. */
export function describeEvent(entry: StoredEvent): string {
  const event = entry.event;
  switch (event.type) {
    case 'created':
      return `Handover opened for ${event.itemType}, reference ${event.itemRef}.`;
    case 'photoAdded':
      return `${event.photo.phase === 'pickup' ? 'Pickup' : 'Return'} photo added: ${event.photo.angle === 'closeup' ? 'close-up' : event.photo.angle} view.`;
    case 'photoChecked':
      if (event.usable) {
        return isNotChecked(event.reason) ? 'Photo accepted without an AI check.' : `Photo checked and accepted: ${event.reason}`;
      }
      return event.overridden ? `Photo flagged (${event.reason}) and kept anyway by the shop.` : `Photo flagged as not usable: ${event.reason}`;
    case 'conditionRecorded':
      if (event.aiFailed === true && event.assessmentId !== null) {
        return 'AI condition check was not available. No marks were written down.';
      }
      return `Condition record written: ${plural(event.marks.length, 'existing mark', 'existing marks')} noted before pickup.`;
    case 'depositSet':
      return `Deposit set to ${euro(event.amountCents)}.`;
    case 'sharedWithRenter':
      return 'Record shared with the renter.';
    case 'renterConfirmed':
      return `Renter checked the record and confirmed it (language: ${event.language}).`;
    case 'holdOrderCreated':
      return 'PayPal hold requested by the renter.';
    case 'holdAuthorized':
      return `PayPal hold of ${euro(event.amountCents)} placed. The shop can rely on it until ${day(event.honorUntil)}; it stays valid until ${day(event.expiresAt)}.`;
    case 'holdReauthorized':
      return `PayPal hold renewed. The shop can rely on it until ${day(event.honorUntil)}; it stays valid until ${day(event.expiresAt)}.`;
    case 'returnStarted':
      return 'Return started. Return photos are being taken.';
    case 'comparisonDone':
      return event.aiFailed
        ? 'AI comparison was not available. The photos were left for the shop to compare.'
        : `AI compared the return photos with the pickup photos: ${plural(event.findings.length, 'possible new mark', 'possible new marks')} found. A person decides.`;
    case 'findingAdded':
      return `Shop added a finding by hand: ${event.finding.location}.`;
    case 'findingUpdated':
      return event.status === 'confirmed' ? 'Shop confirmed a finding.' : 'Shop dismissed a finding.';
    case 'chargeProposed':
      return `Charge of ${euro(event.chargeCents)} proposed; ${euro(event.releaseCents)} would be released.${
        event.exceedsHoldByCents > 0 ? ` The damage is ${euro(event.exceedsHoldByCents)} more than the hold covers.` : ''
      }`;
    case 'released':
      return 'Hold released. Nothing was charged.';
    case 'charged':
      return `${euro(event.chargeCents)} collected from the hold; ${euro(event.releaseCents)} released.`;
    case 'disputed':
      return `Renter disputed the proposed charge: "${event.reason}"`;
    case 'holdLost':
      return LOST[event.status];
    case 'closed':
      return 'Record closed.';
  }
}
