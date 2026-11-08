import { z } from 'zod';

export const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com' as const;

export type AppMode = {
  payments: 'paypal-sandbox' | 'fake';
  ai: 'claude' | 'recorded';
  storage: 'blob' | 'local';
};

export interface AppConfig {
  mode: AppMode;
  paypal?: {
    clientId: string;
    clientSecret: string;
    baseUrl: typeof PAYPAL_SANDBOX_BASE_URL;
  };
  anthropicApiKey?: string;
  blobToken?: string;
  /** Where the renter and record links point. Null: use the origin of the request that made the handover (I6a). */
  publicBaseUrl: string | null;
  aiDailyCallLimit: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const EnvSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  PUBLIC_BASE_URL: z.url().optional(),
  AI_DAILY_CALL_LIMIT: z.string().regex(/^\d+$/, 'must be a whole number').default('300'),
});

const HOSTED_NEEDS =
  'This site runs on Vercel, so it needs the real PayPal sandbox and Vercel Blob storage: ' +
  'set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox) and BLOB_READ_WRITE_TOKEN. ' +
  'The keyless demo mode is for local runs only.';

/**
 * Trims every value (M9: a key pasted with a trailing space or newline must still work) and treats empty
 * strings, as written in .env.example, the same as unset variables.
 */
function cleanValues(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => {
      const trimmed = value?.trim();
      return [key, trimmed ? trimmed : undefined];
    }),
  );
}

/**
 * Ruling R39: a hosted site has no local disk that lasts and must not take fake payments, so on Vercel the
 * keyless fallbacks are refused with a message that says exactly what to set.
 */
function refuseKeylessOnVercel(env: Record<string, string | undefined>, hasPayPal: boolean, hasBlob: boolean): void {
  if (env.VERCEL === undefined) {
    return;
  }
  const missing = [hasPayPal ? null : 'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET', hasBlob ? null : 'BLOB_READ_WRITE_TOKEN'].filter(
    (name): name is string => name !== null,
  );
  if (missing.length > 0) {
    throw new ConfigError(`${HOSTED_NEEDS} Missing: ${missing.join('; ')}.`);
  }
}

export function loadConfig(rawEnv: Record<string, string | undefined>): AppConfig {
  const env = cleanValues(rawEnv);
  if (env.PAYPAL_ENV !== undefined && env.PAYPAL_ENV !== 'sandbox') {
    throw new ConfigError(
      `PAYPAL_ENV is "${env.PAYPAL_ENV}". Only "sandbox" is allowed. Live PayPal is refused by this app.`,
    );
  }

  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
    throw new ConfigError(`Invalid configuration: ${details}`);
  }
  const values = parsed.data;

  const hasClientId = values.PAYPAL_CLIENT_ID !== undefined;
  const hasClientSecret = values.PAYPAL_CLIENT_SECRET !== undefined;
  if (hasClientId !== hasClientSecret) {
    throw new ConfigError('Set both PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, or neither.');
  }

  const paypal =
    values.PAYPAL_CLIENT_ID !== undefined && values.PAYPAL_CLIENT_SECRET !== undefined
      ? {
          clientId: values.PAYPAL_CLIENT_ID,
          clientSecret: values.PAYPAL_CLIENT_SECRET,
          baseUrl: PAYPAL_SANDBOX_BASE_URL,
        }
      : undefined;
  refuseKeylessOnVercel(env, paypal !== undefined, values.BLOB_READ_WRITE_TOKEN !== undefined);

  return {
    mode: {
      payments: paypal ? 'paypal-sandbox' : 'fake',
      ai: values.ANTHROPIC_API_KEY ? 'claude' : 'recorded',
      storage: values.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local',
    },
    paypal,
    anthropicApiKey: values.ANTHROPIC_API_KEY,
    blobToken: values.BLOB_READ_WRITE_TOKEN,
    publicBaseUrl: values.PUBLIC_BASE_URL === undefined ? null : values.PUBLIC_BASE_URL.replace(/\/+$/, ''),
    aiDailyCallLimit: Number(values.AI_DAILY_CALL_LIMIT),
  };
}
