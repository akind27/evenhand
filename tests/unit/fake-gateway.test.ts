import { describe, expect, it } from 'vitest';
import { PaymentError } from '@/lib/payments/gateway';
import { createFakeGateway } from '@/lib/payments/fake-gateway';

const NOW = new Date('2026-11-08T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

async function expectPaymentError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(PaymentError);
  await expect(promise).rejects.toMatchObject({ code });
}

/** Creates an approved, authorized hold for handover `handoverId`. */
async function authorizedHold(
  gateway: ReturnType<typeof createFakeGateway>,
  handoverId: string,
  amountCents = 15000,
) {
  const { orderId } = await gateway.createHoldOrder({ handoverId, amountCents, description: 'Hold' });
  return gateway.authorizeOrder({ handoverId, orderId });
}

describe('fake gateway: orders and authorization', () => {
  it('issues ids FAKE-ORDER-1 and FAKE-AUTH-1 in order', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });

    const { orderId } = await gateway.createHoldOrder({ handoverId: 'h1', amountCents: 15000, description: 'x' });
    const hold = await gateway.authorizeOrder({ handoverId: 'h1', orderId });

    expect(orderId).toBe('FAKE-ORDER-1');
    expect(hold.authorizationId).toBe('FAKE-AUTH-1');
    expect(hold.amountCents).toBe(15000);
  });

  it('computes honorUntil as three days and expiresAt as 29 days after now', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });

    const hold = await authorizedHold(gateway, 'h1');

    expect(hold.honorUntil).toBe(new Date(NOW.getTime() + 3 * DAY_MS).toISOString());
    expect(hold.expiresAt).toBe(new Date(NOW.getTime() + 29 * DAY_MS).toISOString());
  });

  it('refuses to authorize before approve()', async () => {
    const gateway = createFakeGateway({ now: () => NOW });
    const { orderId } = await gateway.createHoldOrder({ handoverId: 'h1', amountCents: 15000, description: 'x' });

    await expectPaymentError(gateway.authorizeOrder({ handoverId: 'h1', orderId }), 'NOT_APPROVED');

    gateway.approve(orderId);
    await expect(gateway.authorizeOrder({ handoverId: 'h1', orderId })).resolves.toMatchObject({ orderId });
  });

  it('approves at creation when autoApprove is true', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const { orderId } = await gateway.createHoldOrder({ handoverId: 'h1', amountCents: 100, description: 'x' });

    await expect(gateway.authorizeOrder({ handoverId: 'h1', orderId })).resolves.toMatchObject({ orderId });
  });

  it('returns the first result when the same authorize is repeated for the same handover', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const { orderId } = await gateway.createHoldOrder({ handoverId: 'h1', amountCents: 15000, description: 'x' });

    const first = await gateway.authorizeOrder({ handoverId: 'h1', orderId });
    const second = await gateway.authorizeOrder({ handoverId: 'h1', orderId });

    expect(second).toEqual(first);
  });
});

describe('fake gateway: void', () => {
  it('voids a hold and reports VOIDED', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1');

    await gateway.voidHold({ handoverId: 'h1', authorizationId: hold.authorizationId });

    await expect(gateway.getHoldStatus(hold.authorizationId)).resolves.toBe('VOIDED');
  });

  it('repeating the void for the same handover is not an error', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1');

    await gateway.voidHold({ handoverId: 'h1', authorizationId: hold.authorizationId });
    await expect(
      gateway.voidHold({ handoverId: 'h1', authorizationId: hold.authorizationId }),
    ).resolves.toBeUndefined();
  });

  it('voiding a hold a second time under a new handover gives ALREADY_VOIDED', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1');

    await gateway.voidHold({ handoverId: 'h1', authorizationId: hold.authorizationId });

    await expectPaymentError(
      gateway.voidHold({ handoverId: 'h2', authorizationId: hold.authorizationId }),
      'ALREADY_VOIDED',
    );
  });
});

describe('fake gateway: capture', () => {
  it('captures a partial amount and reports PARTIALLY_CAPTURED', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1', 15000);

    await gateway.captureHold({ handoverId: 'h1', authorizationId: hold.authorizationId, amountCents: 2000, note: 'x' });

    await expect(gateway.getHoldStatus(hold.authorizationId)).resolves.toBe('PARTIALLY_CAPTURED');
  });

  it('capturing the full hold reports CAPTURED', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1', 15000);

    await gateway.captureHold({ handoverId: 'h1', authorizationId: hold.authorizationId, amountCents: 15000, note: 'x' });

    await expect(gateway.getHoldStatus(hold.authorizationId)).resolves.toBe('CAPTURED');
  });

  it('capture after void gives ALREADY_VOIDED', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1');
    await gateway.voidHold({ handoverId: 'h1', authorizationId: hold.authorizationId });

    await expectPaymentError(
      gateway.captureHold({ handoverId: 'h2', authorizationId: hold.authorizationId, amountCents: 100, note: 'x' }),
      'ALREADY_VOIDED',
    );
  });

  it('capture above the hold amount gives UPSTREAM', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1', 15000);

    await expectPaymentError(
      gateway.captureHold({ handoverId: 'h1', authorizationId: hold.authorizationId, amountCents: 15001, note: 'x' }),
      'UPSTREAM',
    );
  });

  it('idempotent capture returns the same captureId', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1', 15000);
    const input = { handoverId: 'h1', authorizationId: hold.authorizationId, amountCents: 2000, note: 'x' };

    const first = await gateway.captureHold(input);
    const second = await gateway.captureHold(input);

    expect(second.captureId).toBe(first.captureId);
    expect(first.amountCents).toBe(2000);
  });

  it('a different amount is a different capture request, not a cached answer', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1', 15000);
    const base = { handoverId: 'h1', authorizationId: hold.authorizationId, note: 'x' };
    const first = await gateway.captureHold({ ...base, amountCents: 2000 });
    await expectPaymentError(gateway.captureHold({ ...base, amountCents: 8000 }), 'ALREADY_CAPTURED');
    expect(first.amountCents).toBe(2000);
  });

  it('capture of an already captured hold under a new handover gives ALREADY_CAPTURED', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1', 15000);
    await gateway.captureHold({ handoverId: 'h1', authorizationId: hold.authorizationId, amountCents: 15000, note: 'x' });

    await expectPaymentError(
      gateway.captureHold({ handoverId: 'h2', authorizationId: hold.authorizationId, amountCents: 100, note: 'x' }),
      'ALREADY_CAPTURED',
    );
  });

  it('capture after expiry gives EXPIRED', async () => {
    let current = NOW.getTime();
    const gateway = createFakeGateway({ now: () => new Date(current), autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1');
    current += 30 * DAY_MS;

    await expectPaymentError(
      gateway.captureHold({ handoverId: 'h1', authorizationId: hold.authorizationId, amountCents: 100, note: 'x' }),
      'EXPIRED',
    );
  });

  it('rejects capturing zero cents with UPSTREAM', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1');

    await expectPaymentError(
      gateway.captureHold({ handoverId: 'h1', authorizationId: hold.authorizationId, amountCents: 0, note: 'x' }),
      'UPSTREAM',
    );
  });
});

describe('fake gateway: reauthorize', () => {
  it('returns a new authorization id with the new amount, like PayPal', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1', 15000);

    const updated = await gateway.reauthorize({
      handoverId: 'h1',
      authorizationId: hold.authorizationId,
      amountCents: 12000,
    });

    expect(updated.authorizationId).not.toBe(hold.authorizationId);
    expect(updated.orderId).toBe(hold.orderId);
    expect(updated.amountCents).toBe(12000);
    await expect(gateway.getHoldStatus(updated.authorizationId)).resolves.toBe('CREATED');
  });

  it('a reauthorization cannot be voided; voiding the parent voids both', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1', 15000);
    const child = await gateway.reauthorize({ handoverId: 'h1', authorizationId: hold.authorizationId, amountCents: 15000 });

    await expectPaymentError(gateway.voidHold({ handoverId: 'h1', authorizationId: child.authorizationId }), 'UPSTREAM');
    await expect(gateway.getHoldStatus(child.authorizationId)).resolves.toBe('CREATED');

    await gateway.voidHold({ handoverId: 'h1', authorizationId: hold.authorizationId });
    await expect(gateway.getHoldStatus(hold.authorizationId)).resolves.toBe('VOIDED');
    await expect(gateway.getHoldStatus(child.authorizationId)).resolves.toBe('VOIDED');
  });

  it('the reauthorization can be captured', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1', 15000);
    const child = await gateway.reauthorize({ handoverId: 'h1', authorizationId: hold.authorizationId, amountCents: 15000 });

    await gateway.captureHold({ handoverId: 'h1', authorizationId: child.authorizationId, amountCents: 2000, note: 'x' });
    await expect(gateway.getHoldStatus(child.authorizationId)).resolves.toBe('PARTIALLY_CAPTURED');
  });

  it('refuses to reauthorize a reauthorization: renewals must target the original authorization', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1', 15000);
    const child = await gateway.reauthorize({ handoverId: 'h1', authorizationId: hold.authorizationId, amountCents: 15000 });

    await expectPaymentError(
      gateway.reauthorize({ handoverId: 'h1', authorizationId: child.authorizationId, amountCents: 15000 }),
      'UPSTREAM',
    );
  });

  it('a second renewal of the parent is a new request when it names the current authorization', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1', 15000);
    const first = await gateway.reauthorize({ handoverId: 'h1', authorizationId: hold.authorizationId, currentAuthorizationId: hold.authorizationId, amountCents: 15000 });
    const second = await gateway.reauthorize({ handoverId: 'h1', authorizationId: hold.authorizationId, currentAuthorizationId: first.authorizationId, amountCents: 15000 });
    expect(second.authorizationId).not.toBe(first.authorizationId);
    // Repeating the same request is a replay, like PayPal-Request-Id.
    const replay = await gateway.reauthorize({ handoverId: 'h1', authorizationId: hold.authorizationId, currentAuthorizationId: first.authorizationId, amountCents: 15000 });
    expect(replay.authorizationId).toBe(second.authorizationId);
  });

  it('reauthorize after void gives ALREADY_VOIDED', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1');
    await gateway.voidHold({ handoverId: 'h1', authorizationId: hold.authorizationId });

    await expectPaymentError(
      gateway.reauthorize({ handoverId: 'h2', authorizationId: hold.authorizationId, amountCents: 100 }),
      'ALREADY_VOIDED',
    );
  });
});

describe('fake gateway: getHoldStatus', () => {
  it('reports CREATED for a fresh authorization and an unknown id throws UPSTREAM', async () => {
    const gateway = createFakeGateway({ now: () => NOW, autoApprove: true });
    const hold = await authorizedHold(gateway, 'h1');

    await expect(gateway.getHoldStatus(hold.authorizationId)).resolves.toBe('CREATED');
    await expectPaymentError(gateway.getHoldStatus('FAKE-AUTH-999'), 'UPSTREAM');
  });

  it('kind is "fake"', () => {
    expect(createFakeGateway({ now: () => NOW }).kind).toBe('fake');
  });
});
