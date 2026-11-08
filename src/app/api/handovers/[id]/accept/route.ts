import { actionRoute } from '@/lib/route-auth';

export const POST = actionRoute('acceptCharge', ({ service, id }) => service.acceptCharge(id));
