import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';
import { buildCsp, STATIC_SECURITY_HEADERS } from '@/lib/security-headers';

function header(name: string): string | undefined {
  return STATIC_SECURITY_HEADERS.find((entry) => entry.key.toLowerCase() === name.toLowerCase())?.value;
}

function directive(csp: string, name: string): string {
  const found = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `) || part === name);
  return found ?? '';
}

describe('static security headers', () => {
  it('stops type sniffing, framing and leaky referrers, and forces https', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains');
  });

  it('lets the page use the camera and nothing else', () => {
    expect(header('Permissions-Policy')).toBe('camera=(self), microphone=(), geolocation=()');
  });

  it('leaves the Content-Security-Policy to the proxy, which makes a new nonce per request', () => {
    expect(header('Content-Security-Policy')).toBeUndefined();
  });
});

describe('buildCsp', () => {
  const nonce = 'dGVzdC1ub25jZQ==';
  const prod = buildCsp(nonce, true);

  it('puts the nonce and strict-dynamic on scripts', () => {
    const scripts = directive(prod, 'script-src');
    expect(scripts).toContain(`'nonce-${nonce}'`);
    expect(scripts).toContain("'strict-dynamic'");
  });

  it('allows PayPal, Vercel Blob and data/blob images, and no other hosts', () => {
    expect(directive(prod, 'img-src')).toBe(
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.paypal.com https://*.paypalobjects.com",
    );
    expect(directive(prod, 'connect-src')).toBe("connect-src 'self' https://*.paypal.com https://*.paypalobjects.com");
    expect(directive(prod, 'frame-src')).toBe('frame-src https://*.paypal.com');
    expect(directive(prod, 'script-src')).toContain('https://*.paypal.com');
  });

  it('closes the other doors', () => {
    expect(directive(prod, 'default-src')).toBe("default-src 'self'");
    expect(directive(prod, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(prod, 'font-src')).toBe("font-src 'self'");
    expect(directive(prod, 'object-src')).toBe("object-src 'none'");
    expect(directive(prod, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(prod, 'form-action')).toBe("form-action 'self'");
    expect(directive(prod, 'frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('allows unsafe-eval and plain upgrade rules only where they belong', () => {
    expect(prod).not.toContain('unsafe-eval');
    expect(prod).toContain('upgrade-insecure-requests');
    const dev = buildCsp(nonce, false);
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain('upgrade-insecure-requests');
    expect(dev).toContain(`'nonce-${nonce}'`);
  });

  it('is one line, with no line breaks', () => {
    expect(prod).not.toMatch(/\n/);
  });
});

describe('proxy', () => {
  it('sets a different nonce and a matching policy on every page request', () => {
    const first = proxy(new NextRequest('http://localhost:4321/'));
    const second = proxy(new NextRequest('http://localhost:4321/'));
    const csp = first.headers.get('Content-Security-Policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain("'strict-dynamic'");
    const other = /'nonce-([^']+)'/.exec(second.headers.get('Content-Security-Policy') ?? '')?.[1];
    expect(other).not.toBe(nonce);
  });

  it('hands the same policy and nonce to Next on the request side, so Next puts the nonce on its scripts', () => {
    const response = proxy(new NextRequest('http://localhost:4321/'));
    const csp = response.headers.get('Content-Security-Policy');
    const nonce = /'nonce-([^']+)'/.exec(csp ?? '')?.[1];
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(response.headers.get('x-middleware-override-headers')).toContain('content-security-policy');
  });

  it('skips the demo photo folder but not a page whose name starts with "demo"', async () => {
    const { config } = await import('@/proxy');
    const source = (config.matcher[0] as { source: string }).source;
    const matches = (path: string) => new RegExp(`^${source}$`).test(path);
    expect(matches('/demo/scooter-a/pickup/left.jpg')).toBe(false);
    expect(matches('/demonstration')).toBe(true);
    expect(matches('/how-it-works')).toBe(true);
  });
});
