import { actionRoute } from '@/lib/route-auth';

export const POST = actionRoute('shareWithRenter', ({ service, id }) => service.shareWithRenter(id));
