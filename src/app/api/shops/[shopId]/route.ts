import { shopListsSchema } from '@/lib/api-schemas';
import type { Shop } from '@/lib/domain/types';
import { ok, readJson, respond } from '@/lib/http';
import { authorizeShop } from '@/lib/route-auth';

interface Context {
  params: Promise<{ shopId: string }>;
}

/** The shop as a client may see it: no secret hash. */
function publicShop(shop: Shop): Omit<Shop, 'secretHash'> {
  const { secretHash: _secretHash, ...rest } = shop;
  return rest;
}

export async function GET(req: Request, ctx: Context): Promise<Response> {
  return respond(async () => {
    const { shopId } = await ctx.params;
    const { shop } = await authorizeShop(req, shopId);
    return ok({ shop: publicShop(shop) });
  });
}

export async function PUT(req: Request, ctx: Context): Promise<Response> {
  return respond(async () => {
    const { shopId } = await ctx.params;
    const { service, shop } = await authorizeShop(req, shopId);
    const input = await readJson(req, shopListsSchema);
    return ok({ shop: publicShop(await service.updateShopLists(shop.id, input)) });
  });
}
