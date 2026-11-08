import { actionRoute } from '@/lib/route-auth';

export const POST = actionRoute('startReturn', ({ service, id }) => service.startReturn(id));
