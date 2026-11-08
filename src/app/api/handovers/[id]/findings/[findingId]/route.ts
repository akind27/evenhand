import { findingUpdateSchema } from '@/lib/api-schemas';
import { ok, readJson, requireId, respond } from '@/lib/http';
import { authorize } from '@/lib/route-auth';

interface Context {
  params: Promise<{ id: string; findingId: string }>;
}

export async function PUT(req: Request, ctx: Context): Promise<Response> {
  return respond(async () => {
    const { id, findingId } = await ctx.params;
    const { service, state, view } = await authorize(req, id, 'updateFinding');
    const input = await readJson(req, findingUpdateSchema);
    const next = await service.updateFinding(state.id, requireId(findingId, 'Finding'), input);
    return ok({ handover: view(next) });
  });
}
