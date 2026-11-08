import { failureOutcome, successOutcome, type RecordParts, type VisionAssessor } from '@/lib/ai/assessor';
import { randomToken } from '@/lib/evidence/hash';

const LIMIT_MODEL = 'ai-limit';
export const LIMIT_REASON = 'AI limit reached — photo accepted without a check';

/** At most this many live AI calls per shop per UTC day (in memory, per server instance). */
export const SHOP_DAILY_AI_LIMIT = 40;

export interface LimitOptions {
  /** Live AI calls allowed per UTC day for the whole instance. */
  daily: number;
  /** Live AI calls allowed per shop per UTC day. */
  perShop?: number;
  now?: () => Date;
}

/**
 * Counts live AI calls per UTC day in memory: for the whole instance and for each shop. Over a limit, photos are
 * accepted without a check and the other calls report "unavailable", so the flow goes on as "needs a human look".
 * It wraps only the live assessor, so recorded answers never use up the budget.
 */
export function createLimitedAssessor(inner: VisionAssessor, options: LimitOptions): VisionAssessor {
  const now = options.now ?? (() => new Date());
  const perShop = options.perShop ?? SHOP_DAILY_AI_LIMIT;
  let day = '';
  let used = 0;
  let usedByShop = new Map<string, number>();

  /** Counts one call. True when it is still within today's limits. */
  function take(shopId: string | undefined): boolean {
    const today = now().toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      used = 0;
      usedByShop = new Map();
    }
    const shopUsed = shopId === undefined ? 0 : (usedByShop.get(shopId) ?? 0);
    if (used >= options.daily || shopUsed >= perShop) {
      return false;
    }
    used += 1;
    if (shopId !== undefined) {
      usedByShop.set(shopId, shopUsed + 1);
    }
    return true;
  }

  const parts = (kind: RecordParts['kind'], inputHashes: string[]): RecordParts => ({
    id: randomToken(12),
    kind,
    model: LIMIT_MODEL,
    at: now().toISOString(),
    inputHashes,
  });

  return {
    kind: inner.kind,
    isFree: (kind, hashes, angle) => inner.isFree(kind, hashes, angle),
    async checkPhoto(input) {
      if (take(input.shopId)) {
        return inner.checkPhoto(input);
      }
      return successOutcome(parts('photoCheck', [input.photo.sha256]), {
        usable: true,
        reason: LIMIT_REASON,
        personVisible: false,
        angleMatches: true,
      });
    },
    async recordCondition(input) {
      if (take(input.shopId)) {
        return inner.recordCondition(input);
      }
      return failureOutcome(parts('condition', input.photos.map((p) => p.sha256).sort()), 'unavailable');
    },
    async compare(input) {
      if (take(input.shopId)) {
        return inner.compare(input);
      }
      const hashes = input.pairs.flatMap((pair) => [pair.before.sha256, pair.after.sha256]).sort();
      return failureOutcome(parts('comparison', hashes), 'unavailable');
    },
  };
}
