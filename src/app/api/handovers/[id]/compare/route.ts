import { actionRoute } from '@/lib/route-auth';

/** AI routes may wait for the model: up to 300 seconds (M8). */
export const maxDuration = 300;

export const POST = actionRoute('compare', ({ service, id }) => service.compare(id), { aiStep: { kind: 'comparison' } });
