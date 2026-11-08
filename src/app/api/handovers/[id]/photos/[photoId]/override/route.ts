import { ok, requireId, respond } from '@/lib/http';
import { authorize } from '@/lib/route-auth';

interface Context {
  params: Promise<{ id: string; photoId: string }>;
}

export async function POST(req: Request, ctx: Context): Promise<Response> {
  return respond(async () => {
    const { id, photoId } = await ctx.params;
    const { service, state, view } = await authorize(req, id, 'overridePhotoCheck');
    const next = await service.overridePhotoCheck(state.id, requireId(photoId, 'Photo'));
    return ok({ handover: view(next) });
  });
}
