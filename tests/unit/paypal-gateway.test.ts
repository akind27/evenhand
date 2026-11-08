import { describe, expect, it } from 'vitest';
import { PaymentError } from '@/lib/payments/gateway';
import { createPayPalGateway } from '@/lib/payments/paypal-gateway';

const BASE = 'https://api-m.sandbox.paypal.com';
const NOW = new Date('2026-11-08T10:00:00.000Z');
const cfg = { clientId: 'test-client-id', clientSecret: 'test-secret', baseUrl: BASE };
const DAY_MS = 24 * 60 * 60 * 1000;

interface RecordedCall {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fresh token response each time, because a Response body can only be read once. */
const tokenOk = (): Response => jsonResponse({ access_token: 'test-token', expires_in: 32400, token_type: 'Bearer' });

/** Builds a fetch stand-in that records every call and answers with `route`. */
function scriptedFetch(route: (url: string, method: string) => Response) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const rawBody = typeof init?.body === 'string' ? init.body : null;
    calls.push({
      url,
      method,
      headers: new Headers(init?.headers),
      body: rawBody && !url.endsWith('/token') ? (JSON.parse(rawBody) as Record<string, unknown>) : null,
    });
    return route(url, method);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

/** Answers the token request and sends everything else to `route`. */
function withToken(route: (url: string, method: string) => Response) {
  return scriptedFetch((url, method) => (url.endsWith('/v1/oauth2/token') ? tokenOk() : route(url, method)));
}

const AUTHORIZATION_BODY = {
  id: 'ORDER-1',
  purchase_units: [
    {
      payments: {
        authorizations: [
          {
            id: 'AUTH-1',
            status: 'CREATED',
            amount: { currency_code: 'EUR', value: '150.00' },
            expiration_time: '2026-12-08T00:00:00Z',
          },
        ],
      },
    },
  ],
};

describe('PayPal gateway: createHoldOrder', () => {
  it('sends intent AUTHORIZE and EUR 150.00 with a handover-scoped request id', async () => {
    const { fetchImpl, calls } = withToken(() => jsonResponse({ id: 'ORDER-1', status: 'CREATED' }, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    const result = await gateway.createHoldOrder({ handoverId: 'h1', amountCents: 15000, description: 'Scooter hold' });

    expect(result).toEqual({ orderId: 'ORDER-1' });
    const order = calls.find((c) => c.url === `${BASE}/v2/checkout/orders`);
    expect(order?.method).toBe('POST');
    expect(order?.headers.get('PayPal-Request-Id')).toBe('h1:order');
    expect(order?.headers.get('Authorization')).toBe('Bearer test-token');
    expect(order?.headers.get('Prefer')).toBe('return=representation');
    expect(order?.body).toEqual({
      intent: 'AUTHORIZE',
      purchase_units: [
        {
          reference_id: 'h1',
          description: 'Scooter hold',
          amount: { currency_code: 'EUR', value: '150.00' },
        },
      ],
    });
  });

  it('rejects a non-integer amount before making any request', async () => {
    const { fetchImpl, calls } = withToken(() => jsonResponse({}));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(
      gateway.createHoldOrder({ handoverId: 'h1', amountCents: 1.5, description: 'x' }),
    ).rejects.toThrow(RangeError);
    expect(calls).toHaveLength(0);
  });
});

describe('PayPal gateway: authorizeOrder', () => {
  it('maps the authorization and sets honorUntil to three days from now', async () => {
    const { fetchImpl, calls } = withToken(() => jsonResponse(AUTHORIZATION_BODY, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    const hold = await gateway.authorizeOrder({ handoverId: 'h1', orderId: 'ORDER-1' });

    expect(hold).toEqual({
      orderId: 'ORDER-1',
      authorizationId: 'AUTH-1',
      amountCents: 15000,
      honorUntil: new Date(NOW.getTime() + 3 * DAY_MS).toISOString(),
      expiresAt: '2026-12-08T00:00:00Z',
    });
    const authorize = calls.find((c) => c.url === `${BASE}/v2/checkout/orders/ORDER-1/authorize`);
    expect(authorize?.method).toBe('POST');
    expect(authorize?.headers.get('PayPal-Request-Id')).toBe('h1:authorize');
  });

  it('falls back to 29 days when PayPal gives no expiration_time', async () => {
    const body = structuredClone(AUTHORIZATION_BODY);
    delete (body.purchase_units[0].payments.authorizations[0] as { expiration_time?: string }).expiration_time;
    const { fetchImpl } = withToken(() => jsonResponse(body, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    const hold = await gateway.authorizeOrder({ handoverId: 'h1', orderId: 'ORDER-1' });

    expect(hold.expiresAt).toBe(new Date(NOW.getTime() + 29 * DAY_MS).toISOString());
  });

  it('throws UPSTREAM when the response has no authorization', async () => {
    const { fetchImpl } = withToken(() => jsonResponse({ id: 'ORDER-1', purchase_units: [{}] }, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(gateway.authorizeOrder({ handoverId: 'h1', orderId: 'ORDER-1' })).rejects.toMatchObject({
      code: 'UPSTREAM',
    });
  });
});

describe('PayPal gateway: captureHold', () => {
  it('sends final_capture true and the partial amount "20.00"', async () => {
    const { fetchImpl, calls } = withToken(() => jsonResponse({ id: 'CAP-1', status: 'COMPLETED' }, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    const result = await gateway.captureHold({
      handoverId: 'h1',
      authorizationId: 'AUTH-1',
      amountCents: 2000,
      note: 'Damage: scratched panel',
    });

    expect(result).toEqual({ captureId: 'CAP-1', amountCents: 2000 });
    const capture = calls.find((c) => c.url === `${BASE}/v2/payments/authorizations/AUTH-1/capture`);
    expect(capture?.method).toBe('POST');
    expect(capture?.headers.get('PayPal-Request-Id')).toBe('h1:capture:AUTH-1:2000');
    expect(capture?.body).toEqual({
      amount: { currency_code: 'EUR', value: '20.00' },
      final_capture: true,
      note_to_payer: 'Damage: scratched panel',
    });
  });

  it('reports the amount PayPal says it captured', async () => {
    const { fetchImpl } = withToken(() => jsonResponse({ id: 'CAP-2', amount: { value: '12.50' } }, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);
    const result = await gateway.captureHold({ handoverId: 'h1', authorizationId: 'AUTH-1', amountCents: 2000, note: 'x' });
    expect(result).toEqual({ captureId: 'CAP-2', amountCents: 1250 });
  });

  it('throws UPSTREAM when asked to capture zero cents', async () => {
    const { fetchImpl, calls } = withToken(() => jsonResponse({}));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(
      gateway.captureHold({ handoverId: 'h1', authorizationId: 'AUTH-1', amountCents: 0, note: 'x' }),
    ).rejects.toMatchObject({ code: 'UPSTREAM', message: 'Nothing to capture' });
    expect(calls).toHaveLength(0);
  });
});

describe('PayPal gateway: voidHold', () => {
  it('succeeds on HTTP 204', async () => {
    const { fetchImpl, calls } = withToken(() => new Response(null, { status: 204 }));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(gateway.voidHold({ handoverId: 'h1', authorizationId: 'AUTH-1' })).resolves.toBeUndefined();
    const voidCall = calls.find((c) => c.url === `${BASE}/v2/payments/authorizations/AUTH-1/void`);
    expect(voidCall?.headers.get('PayPal-Request-Id')).toBe('h1:void:AUTH-1');
  });

  it.each([
    ['PREVIOUSLY_VOIDED', 'ALREADY_VOIDED'],
    ['AUTHORIZATION_VOIDED', 'ALREADY_VOIDED'],
    // PayPal's answer for voiding a reauthorization: the money is still held, so this is never "already voided".
    ['CANNOT_BE_VOIDED', 'UPSTREAM'],
    ['SOMETHING_ABOUT_A_VOID', 'UPSTREAM'],
  ])('maps 422 %s to %s', async (issue, code) => {
    const { fetchImpl } = withToken(() => jsonResponse({ name: 'UNPROCESSABLE_ENTITY', details: [{ issue }] }, 422));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(gateway.voidHold({ handoverId: 'h1', authorizationId: 'AUTH-1' })).rejects.toMatchObject({ code });
  });

  it('succeeds on HTTP 200', async () => {
    const { fetchImpl } = withToken(() => jsonResponse({ id: 'AUTH-1', status: 'VOIDED' }));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(gateway.voidHold({ handoverId: 'h1', authorizationId: 'AUTH-1' })).resolves.toBeUndefined();
  });

  it('maps 422 AUTHORIZATION_VOIDED to ALREADY_VOIDED', async () => {
    const { fetchImpl } = withToken(() =>
      jsonResponse({ name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'AUTHORIZATION_VOIDED' }] }, 422),
    );
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(gateway.voidHold({ handoverId: 'h1', authorizationId: 'AUTH-1' })).rejects.toMatchObject({
      code: 'ALREADY_VOIDED',
      httpStatus: 422,
    });
  });
});

describe('PayPal gateway: error mapping', () => {
  it('maps 422 AUTHORIZATION_EXPIRED to EXPIRED', async () => {
    const { fetchImpl } = withToken(() =>
      jsonResponse({ name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'AUTHORIZATION_EXPIRED' }] }, 422),
    );
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(
      gateway.captureHold({ handoverId: 'h1', authorizationId: 'AUTH-1', amountCents: 100, note: 'x' }),
    ).rejects.toMatchObject({ code: 'EXPIRED', httpStatus: 422 });
  });

  it('maps 500 to UPSTREAM', async () => {
    const { fetchImpl } = withToken(() => jsonResponse({ name: 'INTERNAL_SERVER_ERROR' }, 500));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(gateway.voidHold({ handoverId: 'h1', authorizationId: 'AUTH-1' })).rejects.toMatchObject({
      code: 'UPSTREAM',
      httpStatus: 500,
    });
  });

  it('maps a network failure to UPSTREAM', async () => {
    const { fetchImpl } = withToken(() => {
      throw new TypeError('fetch failed');
    });
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(gateway.voidHold({ handoverId: 'h1', authorizationId: 'AUTH-1' })).rejects.toBeInstanceOf(PaymentError);
    await expect(gateway.voidHold({ handoverId: 'h1', authorizationId: 'AUTH-1' })).rejects.toMatchObject({
      code: 'UPSTREAM',
    });
  });

  it('never puts the secret or the client id in a thrown error message', async () => {
    const { fetchImpl } = scriptedFetch(() =>
      jsonResponse({ error: 'invalid_client', error_description: 'Client Authentication failed' }, 401),
    );
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    let caught: unknown;
    try {
      await gateway.createHoldOrder({ handoverId: 'h1', amountCents: 100, description: 'x' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PaymentError);
    const message = (caught as Error).message;
    expect(message).toContain('401');
    expect(message).not.toContain('test-secret');
    expect(message).not.toContain('test-client-id');
    expect(message).not.toContain('Basic ');
  });
});

describe('PayPal gateway: token caching', () => {
  it('fetches the token once and reuses it across calls', async () => {
    const { fetchImpl, calls } = withToken(() => jsonResponse({ id: 'ORDER-1' }, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await gateway.createHoldOrder({ handoverId: 'h1', amountCents: 100, description: 'x' });
    await gateway.createHoldOrder({ handoverId: 'h2', amountCents: 100, description: 'x' });

    const tokenCalls = calls.filter((c) => c.url === `${BASE}/v1/oauth2/token`);
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]?.method).toBe('POST');
    expect(tokenCalls[0]?.headers.get('Authorization')).toBe(
      `Basic ${Buffer.from('test-client-id:test-secret').toString('base64')}`,
    );
    expect(tokenCalls[0]?.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
  });

  it('fetches a new token after expires_in minus 60 seconds', async () => {
    let current = NOW.getTime();
    const { fetchImpl, calls } = withToken(() => jsonResponse({ id: 'ORDER-1' }, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => new Date(current));

    await gateway.createHoldOrder({ handoverId: 'h1', amountCents: 100, description: 'x' });
    current += (32400 - 60) * 1000 + 1;
    await gateway.createHoldOrder({ handoverId: 'h2', amountCents: 100, description: 'x' });

    expect(calls.filter((c) => c.url === `${BASE}/v1/oauth2/token`)).toHaveLength(2);
  });
});

describe('PayPal gateway: getHoldStatus', () => {
  it('returns the status string from the authorization', async () => {
    const { fetchImpl, calls } = withToken(() => jsonResponse({ id: 'AUTH-1', status: 'PARTIALLY_CAPTURED' }));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(gateway.getHoldStatus('AUTH-1')).resolves.toBe('PARTIALLY_CAPTURED');
    const get = calls.find((c) => c.url === `${BASE}/v2/payments/authorizations/AUTH-1`);
    expect(get?.method).toBe('GET');
  });

  it('throws UPSTREAM on an unknown status string', async () => {
    const { fetchImpl } = withToken(() => jsonResponse({ id: 'AUTH-1', status: 'SOMETHING_NEW' }));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);

    await expect(gateway.getHoldStatus('AUTH-1')).rejects.toMatchObject({ code: 'UPSTREAM' });
  });
});

describe('PayPal gateway: hardening', () => {
  it('capture falls back to the requested amount when the reply amount is malformed', async () => {
    const { fetchImpl } = withToken(() => jsonResponse({ id: 'CAP-3', amount: { value: 'twelve' } }, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);
    const result = await gateway.captureHold({ handoverId: 'h1', authorizationId: 'AUTH-1', amountCents: 2000, note: 'x' });
    expect(result).toEqual({ captureId: 'CAP-3', amountCents: 2000 });
  });

  it.each(['PENDING', 'DENIED'])('authorizeOrder refuses an authorization whose status is %s', async (status) => {
    const body = structuredClone(AUTHORIZATION_BODY);
    body.purchase_units[0].payments.authorizations[0].status = status;
    const { fetchImpl } = withToken(() => jsonResponse(body, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);
    await expect(gateway.authorizeOrder({ handoverId: 'h1', orderId: 'ORDER-1' })).rejects.toMatchObject({ code: 'DENIED' });
  });

  it('authorizeOrder accepts an authorization with no status field', async () => {
    const body = structuredClone(AUTHORIZATION_BODY);
    delete (body.purchase_units[0].payments.authorizations[0] as { status?: string }).status;
    const { fetchImpl } = withToken(() => jsonResponse(body, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);
    await expect(gateway.authorizeOrder({ handoverId: 'h1', orderId: 'ORDER-1' })).resolves.toMatchObject({ authorizationId: 'AUTH-1' });
  });

  it('reauthorize sends the amount, uses the reauth request id and maps the reply', async () => {
    const { fetchImpl, calls } = withToken(() =>
      jsonResponse({ id: 'AUTH-2', amount: { currency_code: 'EUR', value: '150.00' }, expiration_time: '2026-12-09T00:00:00Z' }, 201),
    );
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);
    const hold = await gateway.reauthorize({ handoverId: 'h1', authorizationId: 'AUTH-1', amountCents: 15000 });
    expect(hold).toEqual({
      orderId: '',
      authorizationId: 'AUTH-2',
      amountCents: 15000,
      honorUntil: new Date(NOW.getTime() + 3 * DAY_MS).toISOString(),
      expiresAt: '2026-12-09T00:00:00Z',
    });
    const call = calls.find((c) => c.url === `${BASE}/v2/payments/authorizations/AUTH-1/reauthorize`);
    expect(call?.method).toBe('POST');
    expect(call?.headers.get('PayPal-Request-Id')).toBe('h1:reauth:AUTH-1');
    expect(call?.body).toEqual({ amount: { currency_code: 'EUR', value: '150.00' } });
  });

  it('a second renewal targets the parent but carries the current authorization in its request id', async () => {
    const { fetchImpl, calls } = withToken(() => jsonResponse({ id: 'AUTH-3' }, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);
    await gateway.reauthorize({ handoverId: 'h1', authorizationId: 'AUTH-1', currentAuthorizationId: 'AUTH-2', amountCents: 15000 });
    const call = calls.find((c) => c.url === `${BASE}/v2/payments/authorizations/AUTH-1/reauthorize`);
    expect(call?.headers.get('PayPal-Request-Id')).toBe('h1:reauth:AUTH-2');
  });

  it.each([
    ['AUTHORIZATION_EXPIRED', 'EXPIRED'],
    ['INSTRUMENT_DECLINED', 'DENIED'],
    ['TRANSACTION_REFUSED', 'DENIED'],
    // Only exact issue codes count: a code that merely contains a word is an upstream error.
    ['RENEWAL_WINDOW_EXPIRED_SOON', 'UPSTREAM'],
    ['NOT_DENIED_OR_DECLINED', 'UPSTREAM'],
    ['AUTHORIZATION_ALREADY_REAUTHORIZED', 'UPSTREAM'],
  ])('reauthorize maps 422 %s to %s', async (issue, code) => {
    const { fetchImpl } = withToken(() => jsonResponse({ name: 'UNPROCESSABLE_ENTITY', details: [{ issue }] }, 422));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);
    await expect(gateway.reauthorize({ handoverId: 'h1', authorizationId: 'AUTH-1', amountCents: 15000 })).rejects.toMatchObject({ code });
  });

  it('reauthorize falls back to the requested amount when the reply has no amount', async () => {
    const { fetchImpl } = withToken(() => jsonResponse({ id: 'AUTH-1' }, 201));
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);
    const hold = await gateway.reauthorize({ handoverId: 'h1', authorizationId: 'AUTH-1', amountCents: 15000 });
    expect(hold.amountCents).toBe(15000);
  });

  it('every request carries an abort signal', async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal);
      return String(input).endsWith('/v1/oauth2/token') ? tokenOk() : jsonResponse({ id: 'ORDER-9' }, 201);
    }) as typeof fetch;
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);
    await gateway.createHoldOrder({ handoverId: 'h1', amountCents: 15000, description: 'x' });
    expect(signals).toHaveLength(2);
    for (const signal of signals) {
      expect(signal).toBeDefined();
      expect(signal).toBeInstanceOf(AbortSignal);
    }
  });

  it.each(['AbortError', 'TimeoutError'])('maps a %s rejection to UPSTREAM', async (name) => {
    const fetchImpl = (async () => {
      throw new DOMException('timed out', name);
    }) as typeof fetch;
    const gateway = createPayPalGateway(cfg, fetchImpl, () => NOW);
    await expect(gateway.voidHold({ handoverId: 'h1', authorizationId: 'AUTH-1' })).rejects.toMatchObject({ code: 'UPSTREAM' });
  });
});
