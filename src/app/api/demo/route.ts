import { SHOP_COOKIE } from '@/lib/auth';
import { ok, respond } from '@/lib/http';
import { throwIfLimited } from '@/lib/route-auth';
import { demoLimiter, getService } from '@/lib/service/container';

const WEEK_SECONDS = 604800;

export async function POST(req: Request): Promise<Response> {
  return respond(async () => {
    throwIfLimited(demoLimiter, req, 'Too many demo shops from this network. Please try again in an hour.');
    const { shop, secret } = await getService().createShop({ name: 'Demo Rentals — Naxos', isDemo: true });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const cookie = `${SHOP_COOKIE(shop.id)}=${secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${WEEK_SECONDS}${secure}`;
    return ok({ shopId: shop.id }, { headers: { 'Set-Cookie': cookie } });
  });
}
