import { depositSchema } from '@/lib/api-schemas';
import { readJson } from '@/lib/http';
import { actionRoute } from '@/lib/route-auth';

export const POST = actionRoute('setDeposit', async ({ service, id, req }) => {
  const { ruleId } = await readJson(req, depositSchema);
  return service.setDeposit(id, ruleId);
});
