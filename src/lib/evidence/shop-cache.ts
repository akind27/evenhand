import type { Shop } from '@/lib/domain/types';
import type { EvidenceStore } from '@/lib/evidence/store';

/** How long a shop record is kept in memory (per server instance) before it is read from storage again. */
export const SHOP_CACHE_MS = 30_000;

/**
 * Every handover request reads the shop record (for the shop cookie check). On Vercel Blob that is a list and
 * a fetch each time, so the record is kept in memory for 30 seconds (I7). A save on this instance replaces the
 * cached copy at once; another instance may see a change up to 30 seconds late.
 * A cached copy is fine for the cookie check, but never for sealing prices and deposit rules into a new handover:
 * that read passes `{ fresh: true }`, skips the cache and refreshes it.
 */
export function withShopCache<S extends EvidenceStore>(inner: S, nowMs: () => number = () => Date.now()): S {
  const cache = new Map<string, { shop: Shop; until: number }>();
  return {
    ...inner,
    async getShop(shopId: string, opts?: { fresh?: boolean }): Promise<Shop | null> {
      const hit = cache.get(shopId);
      if (opts?.fresh !== true && hit !== undefined && nowMs() < hit.until) {
        return hit.shop;
      }
      const shop = await inner.getShop(shopId);
      if (shop === null) {
        cache.delete(shopId);
      } else {
        cache.set(shopId, { shop, until: nowMs() + SHOP_CACHE_MS });
      }
      return shop;
    },
    async saveShop(shop: Shop): Promise<void> {
      await inner.saveShop(shop);
      cache.set(shop.id, { shop, until: nowMs() + SHOP_CACHE_MS });
    },
  };
}
