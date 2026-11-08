import { ok, respond } from '@/lib/http';
import { getConfig } from '@/lib/service/container';

export async function GET(): Promise<Response> {
  return respond(async () => {
    const { mode, paypal } = getConfig();
    // The client id is public by design. It is sent only in real (sandbox) mode; demo mode gets null, which turns on the simulated hold.
    const paypalClientId = mode.payments === 'paypal-sandbox' && paypal ? paypal.clientId : null;
    return ok({ payments: mode.payments, ai: mode.ai, storage: mode.storage, paypalClientId });
  });
}
