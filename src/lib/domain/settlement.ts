import { assertCents } from '@/lib/money';
import { CONFIDENCE_BAR, type Finding, type FindingStatus, type PriceItem } from '@/lib/domain/types';

export interface ChargeLine {
  findingId: string;
  priceItemId: string;
  label: string;
  amountCents: number;
}

export interface ChargeResult {
  lines: ChargeLine[];
  totalCents: number;
  chargeCents: number;
  releaseCents: number;
  exceedsHoldByCents: number;
}

/**
 * Works out what the renter pays from the deposit hold.
 * Only confirmed findings with a price item that exists in the price list are charged.
 * The charge can never exceed the hold; the rest of the hold is released.
 */
export function computeCharge(findings: Finding[], priceList: PriceItem[], holdCents: number): ChargeResult {
  assertCents(holdCents);
  const pricesById = new Map(priceList.map((item) => [item.id, item]));

  const lines: ChargeLine[] = findings.flatMap((finding) => {
    if (finding.status !== 'confirmed' || finding.priceItemId === null) {
      return [];
    }
    const price = pricesById.get(finding.priceItemId);
    if (price === undefined) {
      return [];
    }
    return [
      {
        findingId: finding.id,
        priceItemId: price.id,
        label: price.label,
        amountCents: price.amountCents,
      },
    ];
  });

  const totalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const chargeCents = Math.min(totalCents, holdCents);

  return {
    lines,
    totalCents,
    chargeCents,
    releaseCents: holdCents - chargeCents,
    exceedsHoldByCents: Math.max(0, totalCents - holdCents),
  };
}

/**
 * Findings the AI is unsure about go to a human first; the rest are proposed to the shop.
 * Fails closed: NaN is not at or above the bar, so it goes to a human.
 */
export function initialStatusFor(confidence: number): FindingStatus {
  return confidence >= CONFIDENCE_BAR ? 'proposed' : 'needsHuman';
}
