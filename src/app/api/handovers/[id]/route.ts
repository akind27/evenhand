import { ok, respond } from '@/lib/http';
import { authorize, type IdContext } from '@/lib/route-auth';
import { ServiceError } from '@/lib/service/errors';

export async function GET(req: Request, ctx: IdContext): Promise<Response> {
  return respond(async () => {
    const { id } = await ctx.params;
    const { service, state, role, view } = await authorize(req, id, null);
    let current = state;
    // Only when the already-loaded state says the hold is due (I7): every other poll does no extra read.
    // This is how holds get reauthorized and lost holds get noticed.
    if (role === 'shop' && service.holdRefreshDue(state)) {
      try {
        current = await service.refreshHold(state.id);
      } catch (error) {
        if (!(error instanceof ServiceError && error.code === 'PAYMENT')) {
          throw error;
        }
        console.error('Hold refresh failed', error);
      }
    }
    return ok({ handover: view(current) });
  });
}
