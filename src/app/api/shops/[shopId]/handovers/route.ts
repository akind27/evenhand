import { publicView } from '@/lib/auth';
import { createHandoverSchema } from '@/lib/api-schemas';
import { ok, readJson, respond } from '@/lib/http';
import { authorizeShop, throwIfLimited } from '@/lib/route-auth';
import { getConfig, handoverLimiter } from '@/lib/service/container';

interface Context {
  params: Promise<{ shopId: string }>;
}

export async function GET(req: Request, ctx: Context): Promise<Response> {
  return respond(async () => {
    const { shopId } = await ctx.params;
    const { service, shop } = await authorizeShop(req, shopId);
    const states = await service.listShopHandovers(shop.id);
    // Each handover is read once: its created time is part of the loaded state (I7).
    const handovers = states.map((state) => publicView(state, 'shop', { isDemo: shop.isDemo }));
    return ok({ handovers });
  });
}

export async function POST(req: Request, ctx: Context): Promise<Response> {
  return respond(async () => {
    const { shopId } = await ctx.params;
    const { service, shop } = await authorizeShop(req, shopId);
    throwIfLimited(handoverLimiter, req, 'Too many new handovers from this network. Please try again in an hour.');
    const input = await readJson(req, createHandoverSchema);
    const { handoverId, renterToken, viewKey } = await service.createHandover(shop.id, input);
    // Without PUBLIC_BASE_URL, the links point back at the site the shop is using (Ruling R39).
    const base = getConfig().publicBaseUrl ?? new URL(req.url).origin;
    return ok({
      handoverId,
      renterUrl: `${base}/r/${handoverId}#t=${renterToken}`,
      recordUrl: `${base}/record/${handoverId}#v=${viewKey}`,
    });
  });
}
