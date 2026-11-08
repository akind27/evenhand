import { manualFindingSchema } from '@/lib/api-schemas';
import { readJson } from '@/lib/http';
import { actionRoute } from '@/lib/route-auth';

export const POST = actionRoute('addManualFinding', async ({ service, id, req }) => {
  return service.addManualFinding(id, await readJson(req, manualFindingSchema));
});
