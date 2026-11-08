import { timingSafeEqual } from 'node:crypto';
import type { HandoverState } from '@/lib/domain/state';
import type { Shop } from '@/lib/domain/types';
import { sha256Hex } from '@/lib/evidence/hash';

export type Role = 'shop' | 'renter' | 'viewer';

export type PublicHandoverView = Omit<HandoverState, 'renterTokenHash' | 'viewKeyHash' | 'renterDeviceHash'> & {
  role: Role;
  /** True for a renter whose device is not the one that confirmed: that device may only read (Ruling R36). */
  otherDevice: boolean;
  /** True when the handover's shop is a demo shop: the screens then offer the bundled sample photos (Ruling R35). */
  isDemo: boolean;
};

/** What a route knows about the caller and the shop besides the role. */
export interface ViewContext {
  /** The `x-renter-device` secret the caller sent, if any. */
  deviceSecret?: string;
  /** The shop's demo flag. */
  isDemo?: boolean;
}

/** The header a renter's browser sends with its device secret (never in a body, address or log). */
export const DEVICE_HEADER = 'x-renter-device';

export const SHOP_COOKIE = (shopId: string): string => `eh_shop_${shopId}`;

/** Service actions that only the renter may perform. Every other action belongs to the shop. */
export const RENTER_ACTIONS = ['renterConfirm', 'createHoldOrder', 'authorizeHold', 'acceptCharge', 'dispute'] as const;

/** Hashes the presented secret and compares it to the stored hash in constant time. */
function matchesHash(presented: string | undefined, storedHash: string | undefined): boolean {
  if (!presented || !storedHash) {
    return false;
  }
  const a = Buffer.from(sha256Hex(presented));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyShop(shop: Shop, cookieValue: string | undefined): boolean {
  return matchesHash(cookieValue, shop.secretHash);
}

/** True when the secret belongs to the device that confirmed the handover. Constant-time compare of the hashes. */
export function renterDeviceMatches(state: HandoverState, deviceSecret: string | undefined): boolean {
  return matchesHash(deviceSecret, state.renterDeviceHash ?? undefined);
}

/**
 * True when a renter must be treated as a second device: the renter has confirmed and this device is not the
 * one that did. Such a device can read the record but cannot act.
 */
export function isOtherRenterDevice(state: HandoverState, role: Role | null, deviceSecret: string | undefined): boolean {
  return role === 'renter' && state.renter !== null && !renterDeviceMatches(state, deviceSecret);
}

/** Works out who is calling. The shop hash comes from the shop record the caller loaded for `state.shopId`. */
export function resolveHandoverRole(
  state: HandoverState,
  creds: { shopCookie?: string; shopSecretHash?: string; renterToken?: string; viewKey?: string },
): Role | null {
  // Ruling R24: a valid renter token wins, so a judge with the shop open in the same browser can still act as the renter.
  if (matchesHash(creds.renterToken, state.renterTokenHash)) {
    return 'renter';
  }
  if (matchesHash(creds.shopCookie, creds.shopSecretHash)) {
    return 'shop';
  }
  if (matchesHash(creds.viewKey, state.viewKeyHash)) {
    return 'viewer';
  }
  return null;
}

/** True when this role may call the named service action. Viewers and strangers may call none. */
export function roleMayPerform(role: Role | null, action: string): boolean {
  if (role === null || role === 'viewer') {
    return false;
  }
  const renterAction = (RENTER_ACTIONS as readonly string[]).includes(action);
  return renterAction ? role === 'renter' : role === 'shop';
}

/** The state as a client may see it: no credential hashes, plus the caller's role and what that role may do. */
export function publicView(state: HandoverState, role: Role, context: ViewContext): PublicHandoverView {
  const { renterTokenHash: _renterTokenHash, viewKeyHash: _viewKeyHash, renterDeviceHash: _renterDeviceHash, ...rest } = state;
  return { ...rest, role, otherDevice: isOtherRenterDevice(state, role, context.deviceSecret), isDemo: context.isDemo ?? false };
}
