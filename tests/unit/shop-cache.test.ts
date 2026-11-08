import { describe, expect, it, vi } from 'vitest';
import type { Shop } from '@/lib/domain/types';
import { withShopCache, SHOP_CACHE_MS } from '@/lib/evidence/shop-cache';
import type { EvidenceStore } from '@/lib/evidence/store';

const shop = (name: string): Shop => ({
  id: 'shop1',
  name,
  currency: 'EUR',
  depositRules: [],
  priceList: [],
  isDemo: true,
  secretHash: 'hash',
  createdAt: '2026-11-08T10:00:00.000Z',
});

function innerStore() {
  const saved: Shop[] = [shop('v1')];
  const getShop = vi.fn(async (id: string) => (id === 'shop1' ? (saved.at(-1) ?? null) : null));
  const saveShop = vi.fn(async (next: Shop) => {
    saved.push(next);
  });
  return { getShop, saveShop } as unknown as EvidenceStore & { getShop: typeof getShop; saveShop: typeof saveShop };
}

describe('shop cache (I7)', () => {
  it('keeps a shop record for 30 seconds, then reads it again', async () => {
    expect(SHOP_CACHE_MS).toBe(30_000);
    const clock = { ms: 0 };
    const inner = innerStore();
    const store = withShopCache(inner, () => clock.ms);
    expect((await store.getShop('shop1'))?.name).toBe('v1');
    clock.ms += 29_999;
    await store.getShop('shop1');
    expect(inner.getShop).toHaveBeenCalledTimes(1);
    clock.ms += 1;
    await store.getShop('shop1');
    expect(inner.getShop).toHaveBeenCalledTimes(2);
  });

  it('a fresh read skips the cache and refreshes it, so a change saved elsewhere is seen', async () => {
    const inner = innerStore();
    const store = withShopCache(inner, () => 0);
    expect((await store.getShop('shop1'))?.name).toBe('v1');
    await inner.saveShop(shop('v2')); // another instance saved a new version
    expect((await store.getShop('shop1'))?.name).toBe('v1');
    expect((await store.getShop('shop1', { fresh: true }))?.name).toBe('v2');
    expect((await store.getShop('shop1'))?.name).toBe('v2');
  });

  it('a save on this instance is seen at once', async () => {
    const inner = innerStore();
    const store = withShopCache(inner, () => 0);
    await store.getShop('shop1');
    await store.saveShop(shop('v2'));
    expect(inner.saveShop).toHaveBeenCalledTimes(1);
    expect((await store.getShop('shop1'))?.name).toBe('v2');
    expect(inner.getShop).toHaveBeenCalledTimes(1);
  });

  it('does not cache a missing shop', async () => {
    const inner = innerStore();
    const store = withShopCache(inner, () => 0);
    expect(await store.getShop('nope')).toBeNull();
    expect(await store.getShop('nope')).toBeNull();
    expect(inner.getShop).toHaveBeenCalledTimes(2);
  });
});
