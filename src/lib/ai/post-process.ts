import type { Angle, DepositRule, PriceItem } from '@/lib/domain/types';
import type { CompareResult, ConditionResult, PhotoCheckResult, PhotoInput } from '@/lib/ai/assessor';

export const PERSON_REASON = 'Please photograph only the vehicle.';

/** Code, not the model, decides: a person in the photo or a wrong angle makes the photo unusable. */
export function enforcePhotoCheck(v: PhotoCheckResult): PhotoCheckResult {
  if (v.personVisible) return { ...v, usable: false, reason: PERSON_REASON };
  if (!v.angleMatches) return { ...v, usable: false };
  return v;
}

/** Nulls a rule id that is not in the rules, and drops marks that point at photos that were not sent. */
export function filterCondition(v: ConditionResult, photos: PhotoInput[], rules: DepositRule[]): ConditionResult {
  const photoIds = new Set(photos.map((p) => p.photoId));
  const ruleIds = new Set(rules.map((r) => r.id));
  return {
    ...v,
    suggestedRuleId: v.suggestedRuleId !== null && ruleIds.has(v.suggestedRuleId) ? v.suggestedRuleId : null,
    marks: v.marks.filter((m) => photoIds.has(m.photoId)),
  };
}

/** Nulls a price item id that is not in the price list, and drops findings for angles that were not sent. */
export function filterComparison(v: CompareResult, angles: Angle[], priceList: PriceItem[]): CompareResult {
  const sent = new Set(angles);
  const priceIds = new Set(priceList.map((p) => p.id));
  return {
    ...v,
    findings: v.findings
      .filter((f) => sent.has(f.angle))
      .map((f) => ({ ...f, priceItemId: f.priceItemId !== null && priceIds.has(f.priceItemId) ? f.priceItemId : null })),
  };
}
