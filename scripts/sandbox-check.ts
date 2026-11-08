/**
 * Manual check against the PayPal sandbox. Not part of `npm test`.
 *
 * Run with: npx tsx scripts/sandbox-check.ts
 * Needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox keys) in .env.local.
 *
 * Flow: create a EUR 10.00 hold order, you approve it in the browser,
 * authorize it, capture EUR 3.00 with final_capture, then print the status.
 */
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { loadConfig } from '@/lib/config';
import { toPayPalValue } from '@/lib/money';
import { createPayPalGateway } from '@/lib/payments/paypal-gateway';

const HOLD_CENTS = 1000;
const CAPTURE_CENTS = 300;
const ENV_FILE = '.env.local';

function loadEnvFile(): void {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    throw new Error(
      `Could not read ${ENV_FILE}. Copy .env.example to ${ENV_FILE} and add your PayPal sandbox keys.`,
    );
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig(process.env);
  if (config.mode.payments !== 'paypal-sandbox' || !config.paypal) {
    throw new Error('PayPal sandbox keys are not set in .env.local. Refusing to run without them.');
  }

  const gateway = createPayPalGateway(config.paypal);
  const handoverId = `sandbox-check-${Date.now()}`;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const { orderId } = await gateway.createHoldOrder({
      handoverId,
      amountCents: HOLD_CENTS,
      description: 'Sandbox check hold',
    });
    console.log(`Order created: ${orderId}`);
    console.log(`Approve it here: https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`);
    await rl.question('Press Enter after you approve the order in the browser... ');

    const hold = await gateway.authorizeOrder({ handoverId, orderId });
    console.log(`Authorized EUR ${toPayPalValue(hold.amountCents)} (${hold.authorizationId})`);

    const { captureId } = await gateway.captureHold({
      handoverId,
      authorizationId: hold.authorizationId,
      amountCents: CAPTURE_CENTS,
      note: 'Sandbox check partial capture',
    });
    console.log(`Captured EUR ${toPayPalValue(CAPTURE_CENTS)} (${captureId})`);

    const status = await gateway.getHoldStatus(hold.authorizationId);
    console.log(`Authorization status: ${status}`);
  } finally {
    rl.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Sandbox check failed');
  process.exitCode = 1;
});
