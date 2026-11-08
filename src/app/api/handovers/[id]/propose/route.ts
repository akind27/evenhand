import { actionRoute } from '@/lib/route-auth';

export const POST = actionRoute('proposeCharge', ({ service, id }) => service.proposeCharge(id));
