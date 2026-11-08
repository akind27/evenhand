import { describe, expect, it } from 'vitest';
import { RENTER_ACTIONS, SHOP_COOKIE, publicView, renterDeviceMatches, resolveHandoverRole, roleMayPerform, verifyShop } from '@/lib/auth';
import type { HandoverState } from '@/lib/domain/state';
import type { Shop } from '@/lib/domain/types';
import { sha256Hex } from '@/lib/evidence/hash';

const SHOP_SECRET = 'shop-secret-value';
const RENTER_TOKEN = 'renter-token-value';
const VIEW_KEY = 'view-key-value';

const shop: Shop = {
  id: 'shop1',
  name: 'Island Rentals',
  currency: 'EUR',
  depositRules: [],
  priceList: [],
  isDemo: true,
  secretHash: sha256Hex(SHOP_SECRET),
  createdAt: '2026-11-08T10:00:00.000Z',
};

const state = {
  id: 'h1',
  shopId: 'shop1',
  status: 'draft',
  itemType: '125cc scooter',
  itemRef: 'ABC-123',
  renterTokenHash: sha256Hex(RENTER_TOKEN),
  viewKeyHash: sha256Hex(VIEW_KEY),
  lastSeq: 1,
  lastHash: 'abc',
} as unknown as HandoverState;

const SHOP_HASH = shop.secretHash;

describe('shop sessions', () => {
  it('names the cookie after the shop', () => {
    expect(SHOP_COOKIE('shop1')).toBe('eh_shop_shop1');
  });

  it('accepts the right shop cookie', () => {
    expect(verifyShop(shop, SHOP_SECRET)).toBe(true);
  });

  it('wrong shop cookie is rejected', () => {
    expect(verifyShop(shop, 'wrong')).toBe(false);
    expect(verifyShop(shop, '')).toBe(false);
    expect(verifyShop(shop, undefined)).toBe(false);
  });
});

describe('handover roles', () => {
  it('shop cookie gives the shop role', () => {
    const role = resolveHandoverRole(state, { shopCookie: SHOP_SECRET, shopSecretHash: SHOP_HASH });
    expect(role).toBe('shop');
  });

  it('a wrong shop cookie does not give the shop role', () => {
    const role = resolveHandoverRole(state, { shopCookie: 'wrong', shopSecretHash: SHOP_HASH });
    expect(role).toBeNull();
  });

  it('a shop cookie without a known shop hash does not give the shop role', () => {
    expect(resolveHandoverRole(state, { shopCookie: SHOP_SECRET })).toBeNull();
  });

  it('renter token gives renter role', () => {
    expect(resolveHandoverRole(state, { renterToken: RENTER_TOKEN })).toBe('renter');
  });

  it('a wrong renter token gives nothing', () => {
    expect(resolveHandoverRole(state, { renterToken: 'nope' })).toBeNull();
  });

  it('view key gives viewer role only', () => {
    expect(resolveHandoverRole(state, { viewKey: VIEW_KEY })).toBe('viewer');
    expect(resolveHandoverRole(state, { viewKey: RENTER_TOKEN })).toBeNull();
  });

  it('no credentials gives null', () => {
    expect(resolveHandoverRole(state, {})).toBeNull();
    expect(resolveHandoverRole(state, { shopCookie: '', renterToken: '', viewKey: '' })).toBeNull();
  });

  it('renter wins over shop, shop wins over viewer (R24)', () => {
    const all = { shopCookie: SHOP_SECRET, shopSecretHash: SHOP_HASH, renterToken: RENTER_TOKEN, viewKey: VIEW_KEY };
    expect(resolveHandoverRole(state, all)).toBe('renter');
    expect(roleMayPerform(resolveHandoverRole(state, all), 'renterConfirm')).toBe(true);
    const wrongToken = { shopCookie: SHOP_SECRET, shopSecretHash: SHOP_HASH, renterToken: 'nope', viewKey: VIEW_KEY };
    expect(resolveHandoverRole(state, wrongToken)).toBe('shop');
    expect(roleMayPerform(resolveHandoverRole(state, wrongToken), 'renterConfirm')).toBe(false);
    expect(resolveHandoverRole(state, { shopCookie: SHOP_SECRET, shopSecretHash: SHOP_HASH, viewKey: VIEW_KEY })).toBe('shop');
    expect(resolveHandoverRole(state, { renterToken: RENTER_TOKEN, viewKey: VIEW_KEY })).toBe('renter');
  });
});

describe('role permissions', () => {
  it('lists the renter actions', () => {
    expect([...RENTER_ACTIONS].sort()).toEqual(['acceptCharge', 'authorizeHold', 'createHoldOrder', 'dispute', 'renterConfirm']);
  });

  it('renter actions need the renter role, everything else needs the shop role', () => {
    expect(roleMayPerform('renter', 'acceptCharge')).toBe(true);
    expect(roleMayPerform('shop', 'acceptCharge')).toBe(false);
    expect(roleMayPerform('shop', 'proposeCharge')).toBe(true);
    expect(roleMayPerform('shop', 'release')).toBe(true);
    expect(roleMayPerform('renter', 'proposeCharge')).toBe(false);
  });

  it('a viewer or a stranger can do nothing', () => {
    expect(roleMayPerform('viewer', 'dispute')).toBe(false);
    expect(roleMayPerform('viewer', 'release')).toBe(false);
    expect(roleMayPerform(null, 'release')).toBe(false);
  });
});

const DEVICE_SECRET = 'device-secret-value';
const bound = { ...state, renter: { language: 'en', name: null }, renterDeviceHash: sha256Hex(DEVICE_SECRET) } as unknown as HandoverState;

describe('renter device binding', () => {
  it('matches only the secret of the device that confirmed', () => {
    expect(renterDeviceMatches(bound, DEVICE_SECRET)).toBe(true);
    expect(renterDeviceMatches(bound, 'another-device')).toBe(false);
    expect(renterDeviceMatches(bound, undefined)).toBe(false);
    expect(renterDeviceMatches({ ...bound, renterDeviceHash: null }, DEVICE_SECRET)).toBe(false);
  });
});

describe('publicView', () => {
  it('publicView never contains token or device hashes', () => {
    for (const role of ['shop', 'renter', 'viewer'] as const) {
      const view = publicView(bound, role, { deviceSecret: DEVICE_SECRET });
      expect(view).not.toHaveProperty('renterTokenHash');
      expect(view).not.toHaveProperty('viewKeyHash');
      expect(view).not.toHaveProperty('renterDeviceHash');
      expect(JSON.stringify(view)).not.toContain(state.renterTokenHash);
      expect(JSON.stringify(view)).not.toContain(state.viewKeyHash);
      expect(JSON.stringify(view)).not.toContain(sha256Hex(DEVICE_SECRET));
      expect(view.role).toBe(role);
    }
  });

  it('keeps the rest of the state', () => {
    const view = publicView(state, 'viewer', {});
    expect(view.id).toBe('h1');
    expect(view.itemRef).toBe('ABC-123');
    expect(view.lastSeq).toBe(1);
  });

  it('tells a renter on another device that the record is read-only for them', () => {
    expect(publicView(bound, 'renter', { deviceSecret: DEVICE_SECRET }).otherDevice).toBe(false);
    expect(publicView(bound, 'renter', { deviceSecret: 'another-device' }).otherDevice).toBe(true);
    expect(publicView(bound, 'renter', {}).otherDevice).toBe(true);
    // Before confirmation no device is bound yet, and the shop is never "another device".
    expect(publicView({ ...bound, renter: null, renterDeviceHash: null }, 'renter', {}).otherDevice).toBe(false);
    expect(publicView(bound, 'shop', {}).otherDevice).toBe(false);
  });
});
