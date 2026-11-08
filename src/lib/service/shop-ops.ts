import { seedDepositRules, seedPriceList } from '@/lib/demo/seed';
import { appendEvent } from '@/lib/domain/events';
import type { Shop } from '@/lib/domain/types';
import { randomToken, sha256Hex } from '@/lib/evidence/hash';
import type { ServiceDeps } from '@/lib/service/deps';
import { ServiceError, invalidInput } from '@/lib/service/errors';
import type { HandoverService } from '@/lib/service/handover-service';
import type { Mutator } from '@/lib/service/mutate';
import { cleanLists, cleanText } from '@/lib/service/validation';

type ShopOps = Pick<
  HandoverService,
  'createShop' | 'updateShopLists' | 'createHandover' | 'getState' | 'getEvents' | 'getShop' | 'getPhotoBytes' | 'listShopHandovers'
>;

async function requireShop(deps: ServiceDeps, shopId: string, opts?: { fresh?: boolean }): Promise<Shop> {
  let shop: Shop | null;
  try {
    shop = await (opts === undefined ? deps.store.getShop(shopId) : deps.store.getShop(shopId, opts));
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid id') {
      shop = null;
    } else {
      throw error;
    }
  }
  if (shop === null) {
    throw new ServiceError('NOT_FOUND', 'Shop not found');
  }
  return shop;
}

export function createShopOps(deps: ServiceDeps, mutator: Mutator): ShopOps {
  const { store, now, newId } = deps;

  async function getState(handoverId: string) {
    return (await mutator.load(handoverId)).state;
  }

  return {
    getState,

    async getEvents(handoverId) {
      return (await mutator.load(handoverId)).events;
    },

    async getShop(shopId) {
      return requireShop(deps, shopId);
    },

    async getPhotoBytes(handoverId, photoId) {
      const state = await getState(handoverId);
      const photo = [...state.pickupPhotos, ...state.returnPhotos].find((candidate) => candidate.id === photoId);
      if (photo === undefined) {
        throw new ServiceError('NOT_FOUND', 'Photo not found');
      }
      return store.getPhotoBytes(photo.url);
    },

    async createShop(input) {
      const name = cleanText(input.name, 'Shop name', 60);
      const secret = randomToken();
      const shop: Shop = {
        id: newId(),
        name,
        currency: 'EUR',
        depositRules: input.isDemo ? seedDepositRules() : [],
        priceList: input.isDemo ? seedPriceList() : [],
        isDemo: input.isDemo,
        secretHash: sha256Hex(secret),
        createdAt: now().toISOString(),
      };
      await store.saveShop(shop);
      return { shop, secret };
    },

    async updateShopLists(shopId, input) {
      const shop = await requireShop(deps, shopId);
      const updated: Shop = { ...shop, ...cleanLists(input) };
      await store.saveShop(updated);
      return updated;
    },

    async createHandover(shopId, input) {
      // The prices and deposit rules are sealed into the record: never from a cached copy.
      const shop = await requireShop(deps, shopId, { fresh: true });
      if (!shop.depositRules.some((rule) => rule.itemType === input.itemType)) {
        return invalidInput('This shop has no deposit rule for that item type');
      }
      const itemRef = cleanText(input.itemRef, 'Item reference', 40);
      const handoverId = newId();
      const renterToken = randomToken();
      const viewKey = randomToken();
      const created = appendEvent(
        [],
        'shop',
        {
          type: 'created',
          shopId: shop.id,
          itemType: input.itemType,
          itemRef,
          priceList: shop.priceList,
          depositRules: shop.depositRules,
          renterTokenHash: sha256Hex(renterToken),
          viewKeyHash: sha256Hex(viewKey),
        },
        now(),
      );
      await store.appendEvent(handoverId, created);
      await store.indexHandover(shop.id, handoverId);
      return { handoverId, renterToken, viewKey };
    },

    async listShopHandovers(shopId) {
      const ids = await store.listHandoverIds(shopId);
      return Promise.all(ids.map(getState));
    },
  };
}
