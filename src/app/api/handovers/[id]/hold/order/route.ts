import { ok, respond } from '@/lib/http';
import { authorize, type IdContext } from '@/lib/route-auth';

export async function POST(req: Request, ctx: IdContext): Promise<Response> {
  return respond(async () => {
    const { id } = await ctx.params;
    const { service, state } = await authorize(req, id, 'createHoldOrder');
    return ok(await service.createHoldOrder(state.id));
  });
}
