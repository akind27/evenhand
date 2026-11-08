// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HandoverScreen } from '@/components/shop/HandoverScreen';
import type { HandoverView } from '@/lib/client/api';
import type { HandoverStatus } from '@/lib/domain/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

function handover(over: Partial<HandoverView> = {}): HandoverView {
  return {
    id: 'h1',
    shopId: 's1',
    createdAt: '2026-11-08T10:00:00.000Z',
    status: 'active',
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
    lastSeq: 9,
    lastHash: 'abcdef0123456789'.repeat(4),
    role: 'shop',
    otherDevice: false,
    isDemo: true,
    conditionAi: null,
    conditionAiFailed: false,
    comparisonAi: null,
    ...over,
  };
}

function serve(view: HandoverView) {
  const fetchMock = vi.fn(async (url: string) => {
    const data = url === '/api/mode' ? { payments: 'fake', ai: 'recorded', storage: 'local', paypalClientId: null } : { handover: view };
    return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.localStorage.setItem('eh_links_h1', JSON.stringify({ renterUrl: 'http://localhost/r/h1#t=tok', recordUrl: 'http://localhost/record/h1#v=key' }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('HandoverScreen: a lost hold (I4)', () => {
  it('shows the lost hold in place of the Held stamp, with what to do', async () => {
    serve(handover({ status: 'active', holdLost: 'EXPIRED' }));
    render(<HandoverScreen shopId="s1" id="h1" />);
    expect(await screen.findByRole('img', { name: 'Hold expired' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Held' })).toBeNull();
    expect(screen.getByText('Hold expired — settle with the renter directly')).toBeTruthy();
    expect(screen.queryByText('The deposit is held. Start the return when the item comes back.')).toBeNull();
  });

  it('keeps the Held stamp while the hold is live', async () => {
    serve(handover({ status: 'active' }));
    render(<HandoverScreen shopId="s1" id="h1" />);
    expect(await screen.findByRole('img', { name: 'Held' })).toBeTruthy();
  });
});

describe('HandoverScreen: polish', () => {
  it('writes "Not set" as plain text, not in the number font', async () => {
    serve(handover({ status: 'draft', deposit: null }));
    render(<HandoverScreen shopId="s1" id="h1" />);
    const text = await screen.findByText('Not set');
    expect(text.className).not.toContain('mono');
    expect(text.className).toContain('text-2xl');
  });

  it('does not say the same thing twice: no status chip next to a stamp that shows that state', async () => {
    serve(handover({ status: 'active' }));
    const { unmount } = render(<HandoverScreen shopId="s1" id="h1" />);
    expect(await screen.findByRole('img', { name: 'Held' })).toBeTruthy();
    expect(screen.queryByText('Deposit held')).toBeNull();
    unmount();
    serve(handover({ status: 'returning' }));
    render(<HandoverScreen shopId="s1" id="h1" />);
    expect(await screen.findByText('Return in progress')).toBeTruthy();
  });

  it('a settled stamp does not replay its landing when the page opens on a finished handover', async () => {
    serve(handover({ status: 'released', settlement: { kind: 'released' } }));
    render(<HandoverScreen shopId="s1" id="h1" />);
    const stamp = await screen.findByRole('img', { name: 'Released' });
    expect(stamp.className).not.toContain('stamp-land');
  });

  it('puts the demo stamp in the header with the status stamp, not in a row of its own', async () => {
    serve(handover({ status: 'active' }));
    render(<HandoverScreen shopId="s1" id="h1" />);
    const held = await screen.findByRole('img', { name: 'Held' });
    const demo = screen.getByRole('img', { name: 'Demo mode' });
    expect(held.closest('header')).not.toBeNull();
    expect(demo.closest('header')).toBe(held.closest('header'));
  });
});

describe('HandoverScreen: the renter link (I3)', () => {
  it('does not offer the renter link in the draft state, before there is a renter to show it to', async () => {
    serve(handover({ status: 'draft', settlement: null }));
    render(<HandoverScreen shopId="s1" id="h1" />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Show renter link again')).toBeNull();
  });

  it.each<HandoverStatus>(['active', 'returning', 'reviewed', 'chargeProposed', 'disputed'])(
    'offers "Show renter link again" while the handover is %s',
    async (status) => {
      serve(handover({ status, settlement: null }));
      render(<HandoverScreen shopId="s1" id="h1" />);
      fireEvent.click(await screen.findByText('Show renter link again'));
      expect((await screen.findByRole('link', { name: 'Open renter view' })).getAttribute('href')).toBe('http://localhost/r/h1#t=tok');
    },
  );

  it('shows the QR as the main step while waiting for the renter, without the extra link', async () => {
    serve(handover({ status: 'awaitingRenter', renter: null, hold: null }));
    render(<HandoverScreen shopId="s1" id="h1" />);
    expect(await screen.findByRole('link', { name: 'Open renter view' })).toBeTruthy();
    expect(screen.queryByText('Show renter link again')).toBeNull();
  });

  it.each<HandoverStatus>(['released', 'charged'])('does not offer the renter link once the handover is %s', async (status) => {
    serve(handover({ status, settlement: status === 'released' ? { kind: 'released' } : { kind: 'charged', captureId: 'c', chargeCents: 2000, releaseCents: 13000 } }));
    render(<HandoverScreen shopId="s1" id="h1" />);
    await screen.findByText(/was released|was charged/);
    expect(screen.queryByText('Show renter link again')).toBeNull();
  });
});
