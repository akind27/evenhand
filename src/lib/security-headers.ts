// Security headers. Kept free of imports so next.config.ts can load it directly.

export interface HeaderEntry {
  key: string;
  value: string;
}

/** Headers that never change between requests. Applied to every route from next.config.ts. */
export const STATIC_SECURITY_HEADERS: HeaderEntry[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const PAYPAL = 'https://*.paypal.com';
const PAYPAL_OBJECTS = 'https://*.paypalobjects.com';
const BLOB = 'https://*.public.blob.vercel-storage.com';

/**
 * The Content-Security-Policy for one request. The nonce is new for every request (see src/proxy.ts).
 * `strict-dynamic` lets the nonced Next.js scripts load the PayPal button script; the host names in
 * script-src are only a fallback for old browsers that ignore `strict-dynamic`.
 * `unsafe-eval` is allowed outside production only, because Next's dev server needs it.
 */
export function buildCsp(nonce: string, isProd: boolean): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", PAYPAL, PAYPAL_OBJECTS];
  const connectSrc = ["'self'", PAYPAL, PAYPAL_OBJECTS];
  if (!isProd) {
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push('ws:', 'wss:');
  }
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${BLOB} ${PAYPAL} ${PAYPAL_OBJECTS}`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src ${PAYPAL}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (isProd) {
    directives.push('upgrade-insecure-requests');
  }
  return directives.join('; ');
}
