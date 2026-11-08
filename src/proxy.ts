import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from '@/lib/security-headers';

/**
 * Gives every page request its own nonce and a matching Content-Security-Policy.
 * Next.js reads the nonce from the request header and puts it on its own scripts.
 * Pages are rendered per request (the root layout waits for the connection) so the nonce can be applied.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'production');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API, Next's static files, the demo photos or the favicon.
      source: '/((?!api|_next/static|_next/image|demo/|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
