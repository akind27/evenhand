import { confirmSchema } from '@/lib/api-schemas';
import { readJson } from '@/lib/http';
import { actionRoute } from '@/lib/route-auth';

export const POST = actionRoute('renterConfirm', async ({ service, id, req }) => {
  const { language, renterName, deviceHash } = await readJson(req, confirmSchema);
  return service.renterConfirm(id, { language, renterName: renterName || null, deviceHash });
});
