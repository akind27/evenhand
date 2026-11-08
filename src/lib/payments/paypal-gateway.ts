import { z } from 'zod';
import { assertCents, fromPayPalValue, toPayPalValue } from '@/lib/money';
import {
  FALLBACK_EXPIRY_DAYS,
  HOLD_STATUSES,
  HONOR_DAYS,
  PaymentError,
  addDays,
  type Hold,
  type HoldStatus,
  type PaymentErrorCode,
  type PaymentsGateway,
} from './gateway';

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

const REQUEST_TIMEOUT_MS = 20_000;
/** Refresh the access token this many seconds before PayPal says it expires. */
const TOKEN_SAFETY_SECONDS = 60;
const CURRENCY = 'EUR';

const TokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() });
const OrderSchema = z.object({ id: z.string().min(1) });
const AuthorizationSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  amount: z.object({ value: z.string() }).optional(),
  expiration_time: z.string().optional(),
});
const AuthorizeResponseSchema = z.object({
  purchase_units: z
    .array(z.object({ payments: z.object({ authorizations: z.array(AuthorizationSchema).optional() }).optional() }))
    .optional(),
});
const CaptureSchema = z.object({ id: z.string().min(1), amount: z.object({ value: z.string() }).optional() });
const StatusSchema = z.object({ status: z.string() });
const ErrorBodySchema = z.object({
  name: z.string().optional(),
  details: z.array(z.object({ issue: z.string().optional() })).optional(),
});

/**
 * The exact issue codes that mean the hold is already voided. Anything else with "VOID" in it is not:
 * CANNOT_BE_VOIDED (a reauthorization, still holding the money) must never be read as a release.
 */
const VOIDED_ISSUES: ReadonlySet<string> = new Set(['PREVIOUSLY_VOIDED', 'AUTHORIZATION_VOIDED']);

/** The exact issue codes that mean the hold ran out. A code that only contains "EXPIRED" is an upstream error. */
const EXPIRED_ISSUES: ReadonlySet<string> = new Set(['AUTHORIZATION_EXPIRED']);
/** The exact issue codes that mean the payer's funding source refused the hold. */
const DENIED_ISSUES: ReadonlySet<string> = new Set(['INSTRUMENT_DECLINED', 'TRANSACTION_REFUSED']);

/** Maps PayPal's 422 "issue" text to our error codes. Anything unknown is an upstream error. */
function codeForIssue(issue: string): PaymentErrorCode {
  if (VOIDED_ISSUES.has(issue)) return 'ALREADY_VOIDED';
  if (issue.includes('VOID')) return 'UPSTREAM';
  if (issue.includes('CAPTURED')) return 'ALREADY_CAPTURED';
  if (EXPIRED_ISSUES.has(issue)) return 'EXPIRED';
  if (issue.includes('ORDER_NOT_APPROVED')) return 'NOT_APPROVED';
  if (DENIED_ISSUES.has(issue)) return 'DENIED';
  return 'UPSTREAM';
}

async function errorFromResponse(response: Response): Promise<PaymentError> {
  if (response.status !== 422) {
    return new PaymentError('UPSTREAM', `PayPal returned HTTP ${response.status}`, response.status);
  }
  const json: unknown = await response.json().catch(() => undefined);
  const parsed = ErrorBodySchema.safeParse(json);
  const detail = parsed.success ? (parsed.data.details?.[0]?.issue ?? parsed.data.name) : undefined;
  return new PaymentError(
    codeForIssue(detail ?? ''),
    `PayPal refused the request (HTTP 422: ${detail ?? 'no detail'})`,
    422,
  );
}

async function parseBody<S extends z.ZodType>(response: Response, schema: S): Promise<z.infer<S>> {
  const json: unknown = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new PaymentError('UPSTREAM', 'PayPal returned an unexpected response');
  }
  return parsed.data as z.infer<S>;
}

function amountFromPayPal(value: string): number {
  try {
    return fromPayPalValue(value);
  } catch {
    throw new PaymentError('UPSTREAM', 'PayPal returned an invalid amount');
  }
}

/** The captured amount from PayPal's reply, or the requested amount when the reply has none or it is malformed. */
function capturedAmount(value: string | undefined, requestedCents: number): number {
  if (value === undefined) {
    return requestedCents;
  }
  try {
    return amountFromPayPal(value);
  } catch {
    return requestedCents;
  }
}

function parseExpiry(value: string | undefined, clock: () => Date): string {
  return value ?? addDays(clock(), FALLBACK_EXPIRY_DAYS).toISOString();
}

/** Builds a PayPal gateway. `fetchImpl` and `now` are injectable for tests. */
export function createPayPalGateway(
  cfg: PayPalConfig,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): PaymentsGateway {
  let cachedToken: { value: string; validUntilMs: number } | undefined;

  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.name : 'unknown error';
      throw new PaymentError('UPSTREAM', `PayPal could not be reached (${reason})`);
    }
  }

  async function getToken(): Promise<string> {
    if (cachedToken && now().getTime() < cachedToken.validUntilMs) {
      return cachedToken.value;
    }
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    const response = await send(`${cfg.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok) {
      throw await errorFromResponse(response);
    }
    const token = await parseBody(response, TokenSchema);
    cachedToken = {
      value: token.access_token,
      validUntilMs: now().getTime() + (token.expires_in - TOKEN_SAFETY_SECONDS) * 1000,
    };
    return token.access_token;
  }

  /** The one place that calls PayPal with a bearer token, idempotency key and error mapping. */
  async function callPayPal(
    method: 'GET' | 'POST',
    path: string,
    options: { requestId?: string; body?: unknown } = {},
  ): Promise<Response> {
    const token = await getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
    if (options.requestId) {
      headers['PayPal-Request-Id'] = options.requestId;
    }
    const response = await send(`${cfg.baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      throw await errorFromResponse(response);
    }
    return response;
  }

  return {
    kind: 'paypal-sandbox',

    async createHoldOrder({ handoverId, amountCents, description }) {
      assertCents(amountCents);
      const response = await callPayPal('POST', '/v2/checkout/orders', {
        requestId: `${handoverId}:order`,
        body: {
          intent: 'AUTHORIZE',
          purchase_units: [
            {
              reference_id: handoverId,
              description,
              amount: { currency_code: CURRENCY, value: toPayPalValue(amountCents) },
            },
          ],
        },
      });
      const order = await parseBody(response, OrderSchema);
      return { orderId: order.id };
    },

    async authorizeOrder({ handoverId, orderId }) {
      const response = await callPayPal('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
        requestId: `${handoverId}:authorize`,
      });
      const data = await parseBody(response, AuthorizeResponseSchema);
      const authorization = data.purchase_units?.[0]?.payments?.authorizations?.[0];
      if (!authorization) {
        throw new PaymentError('UPSTREAM', 'PayPal returned no authorization for this order');
      }
      if (authorization.status !== undefined && authorization.status !== 'CREATED') {
        throw new PaymentError('DENIED', `PayPal did not create the hold (status ${authorization.status})`);
      }
      if (!authorization.amount) {
        throw new PaymentError('UPSTREAM', 'PayPal returned an authorization without an amount');
      }
      const created = now();
      return {
        orderId,
        authorizationId: authorization.id,
        amountCents: amountFromPayPal(authorization.amount.value),
        honorUntil: addDays(created, HONOR_DAYS).toISOString(),
        expiresAt: parseExpiry(authorization.expiration_time, now),
      };
    },

    async voidHold({ handoverId, authorizationId }) {
      await callPayPal('POST', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, {
        requestId: `${handoverId}:void:${authorizationId}`,
      });
    },

    async captureHold({ handoverId, authorizationId, amountCents, note }) {
      assertCents(amountCents);
      if (amountCents === 0) {
        throw new PaymentError('UPSTREAM', 'Nothing to capture');
      }
      const response = await callPayPal(
        'POST',
        `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
        {
          requestId: `${handoverId}:capture:${authorizationId}:${amountCents}`,
          body: {
            amount: { currency_code: CURRENCY, value: toPayPalValue(amountCents) },
            final_capture: true,
            note_to_payer: note,
          },
        },
      );
      const capture = await parseBody(response, CaptureSchema);
      return { captureId: capture.id, amountCents: capturedAmount(capture.amount?.value, amountCents) };
    },

    async reauthorize({ handoverId, authorizationId, currentAuthorizationId, amountCents }) {
      assertCents(amountCents);
      const response = await callPayPal(
        'POST',
        `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/reauthorize`,
        {
          // The current (newest) id makes every renewal a new request, not a replay of the one before.
          requestId: `${handoverId}:reauth:${currentAuthorizationId ?? authorizationId}`,
          body: { amount: { currency_code: CURRENCY, value: toPayPalValue(amountCents) } },
        },
      );
      const authorization = await parseBody(response, AuthorizationSchema);
      // PayPal's reauthorize reply does not repeat the order id, so it is left empty here.
      return {
        orderId: '',
        authorizationId: authorization.id,
        amountCents: authorization.amount ? amountFromPayPal(authorization.amount.value) : amountCents,
        honorUntil: addDays(now(), HONOR_DAYS).toISOString(),
        expiresAt: parseExpiry(authorization.expiration_time, now),
      } satisfies Hold;
    },

    async getHoldStatus(authorizationId): Promise<HoldStatus> {
      const response = await callPayPal('GET', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`);
      const { status } = await parseBody(response, StatusSchema);
      if (!(HOLD_STATUSES as readonly string[]).includes(status)) {
        throw new PaymentError('UPSTREAM', 'PayPal returned an unknown hold status');
      }
      return status as HoldStatus;
    },
  };
}
