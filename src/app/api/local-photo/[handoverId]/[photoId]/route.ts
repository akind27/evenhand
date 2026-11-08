import { fail, requireId, respond } from '@/lib/http';
import { getMode, getService } from '@/lib/service/container';

interface Context {
  params: Promise<{ handoverId: string; photoId: string }>;
}

/**
 * Development only: serves photos kept on this machine. Photo ids are random, so the link works as the secret.
 * With blob storage the photos have their own URLs and this route does not exist.
 */
export async function GET(_req: Request, ctx: Context): Promise<Response> {
  return respond(async () => {
    if (getMode().storage !== 'local' || process.env.NODE_ENV === 'production') {
      return fail('NOT_FOUND', 'Not found', 404);
    }
    const { handoverId, photoId } = await ctx.params;
    const bytes = await getService().getPhotoBytes(requireId(handoverId, 'Handover'), requireId(photoId, 'Photo'));
    return new Response(bytes as BodyInit, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' },
    });
  });
}
