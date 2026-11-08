import { actionRoute } from '@/lib/route-auth';

export const POST = actionRoute('release', ({ service, id }) => service.release(id));
