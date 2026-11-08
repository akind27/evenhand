import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '@/lib/config';

const state = vi.hoisted(() => ({ config: null as unknown }));
vi.mock('@/lib/service/container', () => ({ getConfig: () => state.config }));

import { GET } from '@/app/api/mode/route';

afterEach(() => {
  delete process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
});

const base = { publicBaseUrl: 'http://localhost', aiDailyCallLimit: 1 };

describe('GET /api/mode', () => {
  it('gives the public client id in paypal-sandbox mode', async () => {
    state.config = {
      ...base,
      mode: { payments: 'paypal-sandbox', ai: 'recorded', storage: 'local' },
      paypal: { clientId: 'public-id', clientSecret: 'never-sent', baseUrl: 'https://api-m.sandbox.paypal.com' },
    } satisfies AppConfig;
    const json = await (await GET()).json();
    expect(json.data).toEqual({ payments: 'paypal-sandbox', ai: 'recorded', storage: 'local', paypalClientId: 'public-id' });
    expect(JSON.stringify(json)).not.toContain('never-sent');
  });

  it('gives null in demo mode, even if the old public variable is set', async () => {
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = 'stale';
    state.config = { ...base, mode: { payments: 'fake', ai: 'recorded', storage: 'local' } } satisfies AppConfig;
    const json = await (await GET()).json();
    expect(json.data.paypalClientId).toBeNull();
  });
});
