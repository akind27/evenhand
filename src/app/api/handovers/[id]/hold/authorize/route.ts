import { authorizeSchema } from '@/lib/api-schemas';
import { readJson } from '@/lib/http';
import { actionRoute } from '@/lib/route-auth';

export const POST = actionRoute('authorizeHold', async ({ service, id, req }) => {
  const { orderId } = await readJson(req, authorizeSchema);
  return service.authorizeHold(id, orderId);
});
