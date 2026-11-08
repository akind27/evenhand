// @vitest-environment jsdom
// C1 (Ruling R35): the sample controls follow the shop (a demo shop), not the server mode.
// Here the server runs with real PayPal sandbox keys and live Claude, as a hosted judge site does.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuidedCapture } from '@/components/shop/GuidedCapture';
import { HandoverScreen } from '@/components/shop/HandoverScreen';
import type { HandoverView } from '@/lib/client/api';

const LIVE_MODE = { payments: 'paypal-sandbox', ai: 'claude', storage: 'blob', paypalClientId: 'public-client-id' };

vi.mock('@/lib/client/use-mode', () => ({
  useMode: () => LIVE_MODE,
  isDemo: () => false,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function returning(isDemo: boolean): HandoverView {
  return {
    id: 'h1',
    shopId: 's1',
    createdAt: '2026-11-08T10:00:00.000Z',
    status: 'returning',
    itemType: 'Scooter',
    itemRef: 'ABC-123',
    priceList: [],
    depositRules: [],
    pickupPhotos: [],
    returnPhotos: [],
    photoChecks: {},
    photoTries: {},
    marks: [],
    itemDescription: 'White scooter',
    suggestedRuleId: null,
    deposit: { ruleId: 'r', amountCents: 15000 },
    renter: { language: 'en', name: null },
    holdOrderId: 'o',
    hold: { orderId: 'o', authorizationId: 'a', parentAuthorizationId: 'a', amountCents: 15000, honorUntil: '2026-11-11T10:00:00Z', expiresAt: '2026-12-07T10:00:00Z' },
    holdLost: null,
    findings: [],
    explanation: null,
    explanationLanguage: null,
    aiFailed: false,
    proposal: null,
    settlement: null,
    dispute: null,
    conditionAi: null,
    conditionAiFailed: false,
    comparisonAi: null,
    lastSeq: 9,
    lastHash: 'abcdef0123456789'.repeat(4),
    role: 'shop',
    otherDevice: false,
    isDemo,
  };
}

describe('sample controls with real sandbox payments and live Claude', () => {
  it('a demo shop gets "Use sample photo"', () => {
    render(<GuidedCapture handoverId="h1" phase="pickup" existing={[]} sampleSet="pickup" demoShop />);
    expect(screen.getByRole('button', { name: 'Use sample photo' })).toBeTruthy();
  });

  it('a shop that is not a demo shop does not', () => {
    render(<GuidedCapture handoverId="h1" phase="pickup" existing={[]} sampleSet="pickup" demoShop={false} />);
    expect(screen.queryByRole('button', { name: 'Use sample photo' })).toBeNull();
  });

  it.each([true, false])('the return chooser "Sample: new marks / no new marks" follows the demo shop flag (%s)', async (isDemo) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { handover: returning(isDemo) } }), { status: 200 })));
    render(<HandoverScreen shopId="s1" id="h1" />);
    await screen.findByText('Return photos');
    expect(screen.queryByRole('button', { name: 'Sample: new marks' }) !== null).toBe(isDemo);
    expect(screen.queryByRole('button', { name: 'Sample: no new marks' }) !== null).toBe(isDemo);
  });
});
