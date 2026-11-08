import { disputeSchema } from '@/lib/api-schemas';
import { readJson } from '@/lib/http';
import { actionRoute } from '@/lib/route-auth';

export const POST = actionRoute('dispute', async ({ service, id, req }) => {
  const { reason } = await readJson(req, disputeSchema);
  return service.dispute(id, reason);
});
