import { marksSchema } from '@/lib/api-schemas';
import { readJson } from '@/lib/http';
import { actionRoute } from '@/lib/route-auth';

/** AI routes may wait for the model: up to 300 seconds (M8). */
export const maxDuration = 300;

export const POST = actionRoute('recordCondition', ({ service, id }) => service.recordCondition(id), { aiStep: { kind: 'condition' } });

export const PUT = actionRoute('updateMarks', async ({ service, id, req }) => {
  const { marks } = await readJson(req, marksSchema);
  return service.updateMarks(id, marks);
});
