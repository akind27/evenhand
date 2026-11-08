// SERVER ONLY. Works out who is calling a route and whether they may do what they ask.
import {
  DEVICE_HEADER,
  SHOP_COOKIE,
  isOtherRenterDevice,
  publicView,
  resolveHandoverRole,
  roleMayPerform,
  verifyShop,
  type PublicHandoverView,
  type Role,
} from '@/lib/auth';
import type { HandoverState } from '@/lib/domain/state';
import type { Shop } from '@/lib/domain/types';
import { HttpError, clientIp, ok, parseCookies, requireId, respond } from '@/lib/http';
import type { RateLimiter } from '@/lib/rate-limit';
import { getService, ipLimiter } from '@/lib/service/container';
import type { AiStep, HandoverService } from '@/lib/service/handover-service';

export interface HandoverAccess {
  service: HandoverService;
  state: HandoverState;
  role: Role;
  /** The view of a state as this caller may see it. */
  view: (state: HandoverState) => PublicHandoverView;
}

function forbidden(): HttpError {
  return new HttpError(403, 'FORBIDDEN', 'You are not allowed to do this');
}

export const OTHER_DEVICE_MESSAGE = 'This record was confirmed on another device.';

/**
 * Loads the handover and checks the caller. `action` is the service method the route will call;
 * pass null for read-only routes, which any known role may use. No state changes on a refusal.
 * After the renter confirms, a renter action also needs the secret of the device that confirmed (Ruling R36).
 */
export async function authorize(req: Request, rawId: string, action: string | null): Promise<HandoverAccess> {
  const id = requireId(rawId, 'Handover');
  const service = getService();
  const state = await service.getState(id);
  const shop = await service.getShop(state.shopId);
  const cookies = parseCookies(req);
  const role = resolveHandoverRole(state, {
    shopCookie: cookies[SHOP_COOKIE(state.shopId)],
    shopSecretHash: shop.secretHash,
    renterToken: req.headers.get('x-renter-token') ?? undefined,
    viewKey: req.headers.get('x-view-key') ?? undefined,
  });
  const allowed = action === null ? role !== null : roleMayPerform(role, action);
  if (role === null || !allowed) {
    throw forbidden();
  }
  const deviceSecret = req.headers.get(DEVICE_HEADER) ?? undefined;
  // renterConfirm itself is a safe repeat: once confirmed it changes nothing, and the view then says "other device".
  if (action !== null && action !== 'renterConfirm' && isOtherRenterDevice(state, role, deviceSecret)) {
    throw new HttpError(403, 'OTHER_DEVICE', OTHER_DEVICE_MESSAGE);
  }
  return { service, state, role, view: (next) => publicView(next, role, { deviceSecret, isDemo: shop.isDemo }) };
}

/** Checks the shop cookie for a shop-level route. Returns the shop record (with its secret hash: do not send it out). */
export async function authorizeShop(req: Request, rawShopId: string): Promise<{ service: HandoverService; shop: Shop }> {
  const shopId = requireId(rawShopId, 'Shop');
  const service = getService();
  const shop = await service.getShop(shopId);
  if (!verifyShop(shop, parseCookies(req)[SHOP_COOKIE(shopId)])) {
    throw forbidden();
  }
  return { service, shop };
}

export interface IdContext {
  params: Promise<{ id: string }>;
}

export interface ActionArgs {
  service: HandoverService;
  id: string;
  req: Request;
}

/**
 * Builds a handler for a route that runs one service action on a handover and returns the new state.
 * Order: find the handover, check the role, spend the AI budget (for an `aiStep` that makes a paid call), then run.
 */
export function actionRoute(
  action: string,
  run: (args: ActionArgs) => Promise<HandoverState>,
  opts: { aiStep?: AiStep } = {},
): (req: Request, ctx: IdContext) => Promise<Response> {
  return (req, ctx) =>
    respond(async () => {
      const { id } = await ctx.params;
      const access = await authorize(req, id, action);
      if (opts.aiStep !== undefined) {
        spendAiBudget(req, access, opts.aiStep);
      }
      const state = await run({ service: access.service, id: access.state.id, req });
      return ok({ handover: access.view(state) });
    });
}

/**
 * Counts one try against the caller's IP, but only when the step would make a paid AI call: recorded mode,
 * recorded sample answers and reused retake checks are free (I5). 429 when the hourly budget is used up.
 */
export function spendAiBudget(req: Request, access: Pick<HandoverAccess, 'service' | 'state'>, step: AiStep): void {
  if (!access.service.aiCallNeeded(access.state, step)) {
    return;
  }
  throwIfLimited(ipLimiter, req, 'Too many requests. Please try again later.');
}

/** Counts one request against the caller's IP. 429 with the friendly message when the limiter says no. */
export function throwIfLimited(limiter: RateLimiter, req: Request, message: string): void {
  if (!limiter.take(clientIp(req))) {
    throw new HttpError(429, 'RATE_LIMITED', message);
  }
}
