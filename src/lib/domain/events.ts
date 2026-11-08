import { canonicalJson, sha256Hex } from '@/lib/evidence/hash';
import type { ChargeLine } from '@/lib/domain/settlement';
import type { DepositRule, ExistingMark, Finding, Lang, PhotoRef, PriceItem } from '@/lib/domain/types';

export type Actor = 'shop' | 'renter' | 'system';

export type HandoverEvent =
  | { type: 'created'; shopId: string; itemType: string; itemRef: string; priceList: PriceItem[]; depositRules: DepositRule[]; renterTokenHash: string; viewKeyHash: string }
  | { type: 'photoAdded'; photo: PhotoRef }
  // model: the model that answered (M1). recorded: the answer was replayed from the recorded sample answers (C1).
  // personVisible: the check found a person as the main subject; such a photo can never be kept anyway (M13).
  | { type: 'photoChecked'; photoId: string; usable: boolean; reason: string; overridden: boolean; assessmentId: string | null; model?: string; recorded?: boolean; personVisible?: boolean }
  | { type: 'conditionRecorded'; marks: ExistingMark[]; suggestedRuleId: string | null; itemDescription: string; assessmentId: string | null; model?: string; recorded?: boolean; aiFailed?: boolean }
  | { type: 'depositSet'; ruleId: string; amountCents: number }
  | { type: 'sharedWithRenter' }
  // renterDeviceHash: SHA-256 of a secret the confirming browser keeps. Later renter actions must show that secret (Ruling R36).
  // Optional only so that logs written before device binding still read.
  | { type: 'renterConfirmed'; language: Lang; renterName: string | null; renterDeviceHash?: string }
  | { type: 'holdAuthorized'; orderId: string; authorizationId: string; amountCents: number; honorUntil: string; expiresAt: string }
  | { type: 'holdReauthorized'; authorizationId: string; honorUntil: string; expiresAt: string }
  | { type: 'returnStarted' }
  | { type: 'comparisonDone'; findings: Finding[]; explanation: string; explanationLanguage: Lang; assessmentId: string | null; aiFailed: boolean; model?: string; recorded?: boolean }
  | { type: 'findingAdded'; finding: Finding }
  | { type: 'findingUpdated'; findingId: string; status: 'confirmed' | 'dismissed'; priceItemId: string | null }
  | { type: 'chargeProposed'; lines: ChargeLine[]; chargeCents: number; releaseCents: number; exceedsHoldByCents: number }
  | { type: 'holdOrderCreated'; orderId: string }
  | { type: 'released'; authorizationId: string }
  | { type: 'charged'; authorizationId: string; captureId: string; chargeCents: number; releaseCents: number }
  | { type: 'disputed'; reason: string }
  | { type: 'holdLost'; status: 'EXPIRED' | 'VOIDED' | 'CAPTURED' | 'DENIED' }
  | { type: 'closed' };

export interface StoredEvent {
  seq: number;
  at: string;
  actor: Actor;
  event: HandoverEvent;
  prevHash: string;
  hash: string;
}

export const GENESIS_HASH = '0'.repeat(64);

function hashEntry(prevHash: string, seq: number, at: string, actor: Actor, event: HandoverEvent): string {
  return sha256Hex(prevHash + canonicalJson({ seq, at, actor, event }));
}

/** Adds one event to the end of the chain. The new event is linked to the hash of the event before it. */
export function appendEvent(chain: StoredEvent[], actor: Actor, event: HandoverEvent, now: Date): StoredEvent {
  const seq = chain.length;
  const prevHash = seq === 0 ? GENESIS_HASH : chain[seq - 1].hash;
  const at = now.toISOString();
  return { seq, at, actor, event, prevHash, hash: hashEntry(prevHash, seq, at, actor, event) };
}

/** Recomputes every hash in order. Reports the first position that does not match. */
export function verifyChain(chain: StoredEvent[]): { ok: true } | { ok: false; brokenAt: number } {
  let expectedPrev = GENESIS_HASH;
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    if (!entryMatches(entry, i, expectedPrev)) {
      return { ok: false, brokenAt: i };
    }
    expectedPrev = entry.hash;
  }
  return { ok: true };
}

function entryMatches(entry: StoredEvent, position: number, expectedPrev: string): boolean {
  if (entry.seq !== position || entry.prevHash !== expectedPrev) {
    return false;
  }
  try {
    return hashEntry(entry.prevHash, entry.seq, entry.at, entry.actor, entry.event) === entry.hash;
  } catch {
    return false;
  }
}
