// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenterScreen } from '@/components/renter/RenterScreen';
import { ReturnResult } from '@/components/renter/ReturnResult';
import type { PublicHandoverView } from '@/lib/auth';
import { stampText } from '@/components/renter/RenterBits';
import * as api from '@/lib/client/api';
import { readRenterToken } from '@/lib/client/renter-token';
import type { Finding } from '@/lib/domain/types';
import { LANGS, t, tf } from '@/lib/i18n';
import { ConditionRecord } from '@/components/renter/ConditionRecord';

const finding: Finding = {
  id: 'f1',
  angle: 'left',
  beforePhotoId: 'pre-left',
  afterPhotoId: 'ret-left',
  location: 'left side panel',
  description: 'New mark on the left side panel',
  severity: 'minor',
  confidence: 0.9,
  box: { x: 0.2, y: 0.3, w: 0.2, h: 0.1 },
  priceItemId: 'scratch',
  status: 'confirmed',
  source: 'ai',
};

function view(over: Partial<PublicHandoverView> = {}): PublicHandoverView {
  return {
    id: 'h1',
    shopId: 's1',
    createdAt: '2026-11-08T10:00:00.000Z',
    status: 'reviewed',
    itemType: 'Scooter',
    itemRef: 'ABC-123',
    priceList: [{ id: 'scratch', label: 'Scratch', amountCents: 2000 }],
    depositRules: [],
    pickupPhotos: [],
    returnPhotos: [],
    photoChecks: {},
    photoTries: {},
    marks: [],
    itemDescription: 'White scooter',
    suggestedRuleId: null,
    deposit: { ruleId: 'r1', amountCents: 15000 },
    renter: { language: 'en', name: null },
    holdOrderId: 'o1',
    hold: { orderId: 'o1', authorizationId: 'a1', parentAuthorizationId: 'a1', amountCents: 15000, honorUntil: '2026-11-11T00:00:00Z', expiresAt: '2026-12-07T00:00:00Z' },
    holdLost: null,
    findings: [finding],
    explanation: 'A new scratch is visible on the left panel.',
    explanationLanguage: 'en',
    aiFailed: false,
    proposal: null,
    settlement: null,
    dispute: null,
    lastSeq: 9,
    lastHash: '0123456789abcdef0123456789abcdef',
    role: 'renter',
    otherDevice: false,
    isDemo: true,
    conditionAi: null,
    conditionAiFailed: false,
    comparisonAi: null,
    ...over,
  };
}

const proposal = {
  lines: [{ findingId: 'f1', priceItemId: 'scratch', label: 'Scratch', amountCents: 2000 }],
  chargeCents: 2000,
  releaseCents: 13000,
  exceedsHoldByCents: 0,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

/** A fetch stand-in for the renter page: answers /api/mode and the handover, and records every call. */
function renterFetch(handover: PublicHandoverView) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const data = url === '/api/mode' ? { payments: 'fake', ai: 'recorded', storage: 'local', paypalClientId: null } : { handover };
    return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
  });
}

describe('ReturnResult: when Accept is shown', () => {
  const render_ = (v: PublicHandoverView) => render(<ReturnResult view={v} token="tok" lang="en" land={false} onChange={vi.fn()} />);

  it('shows the checking line and no Accept while the shop is reviewing', () => {
    render_(view({ status: 'reviewed' }));
    expect(screen.getByText('The shop is checking the photos')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /disagree/i })).toBeNull();
    // findings so far, with their status in words
    expect(screen.getByText('CONFIRMED BY THE SHOP')).toBeTruthy();
  });

  it('marks the AI-written explanation as machine-readable AI text, with the model id', () => {
    render_(view({ status: 'chargeProposed', proposal }));
    const text = screen.getByText('A new scratch is visible on the left panel.');
    expect(text.getAttribute('data-ai-generated')).toBe('true');
    expect(text.getAttribute('data-ai-model')).toBe('claude-opus-5-5');
  });

  it.each(LANGS)('says the comparison was a recorded answer for the sample photos, in %s, only when it was', (code) => {
    const recordedNote = tf(code, 'recordedAiNote', { model: 'claude-opus-5-5' });
    const { unmount } = render(
      <ReturnResult view={view({ status: 'chargeProposed', proposal, comparisonAi: { model: 'claude-opus-5-5', recorded: true } })} token="tok" lang={code} land={false} onChange={vi.fn()} />,
    );
    expect(screen.getByText(recordedNote)).toBeTruthy();
    unmount();
    render(<ReturnResult view={view({ status: 'chargeProposed', proposal })} token="tok" lang={code} land={false} onChange={vi.fn()} />);
    expect(screen.queryByText(recordedNote)).toBeNull();
  });

  it('names the model the comparison event recorded, not a constant (M1)', () => {
    render_(view({ status: 'chargeProposed', proposal, comparisonAi: { model: 'claude-fallback-model', recorded: false } }));
    expect(screen.getByText('A new scratch is visible on the left panel.').getAttribute('data-ai-model')).toBe('claude-fallback-model');
  });

  it('says the AI could not run, without an AI label and without the English fallback text, when the AI failed', () => {
    render_(view({ status: 'chargeProposed', proposal, aiFailed: true, explanation: 'The AI check could not run. Please compare the photos yourself.' }));
    expect(screen.queryByText('The AI check could not run. Please compare the photos yourself.')).toBeNull();
    const line = screen.getByText(t('en', 'explanationNoAi'));
    expect(line.getAttribute('data-ai-generated')).toBeNull();
    expect(screen.queryByText(t('en', 'aiExplanation'))).toBeNull();
    expect(screen.queryByText(t('en', 'aiExplanationBeforeReview'))).toBeNull();
  });

  it.each(LANGS)('has the no-AI explanation and the before-review label in %s', (code) => {
    render(<ReturnResult view={view({ status: 'chargeProposed', proposal, aiFailed: true })} token="tok" lang={code} land={false} onChange={vi.fn()} />);
    expect(screen.getByText(t(code, 'explanationNoAi')).getAttribute('lang')).toBe(code);
    expect(t(code, 'aiExplanationBeforeReview').length).toBeGreaterThan(5);
  });

  it('M2: labels the explanation as written before the shop review when the shop dismissed or added a finding', () => {
    const dismissed: Finding = { ...finding, id: 'f2', status: 'dismissed' };
    render_(view({ status: 'chargeProposed', proposal, findings: [finding, dismissed] }));
    expect(screen.getByText("Written by the AI before the shop's review")).toBeTruthy();
    expect(screen.queryByText(t('en', 'aiExplanation'))).toBeNull();
    cleanup();
    const byHand: Finding = { ...finding, id: 'f3', source: 'shop' };
    render_(view({ status: 'chargeProposed', proposal, findings: [finding, byHand] }));
    expect(screen.getByText("Written by the AI before the shop's review")).toBeTruthy();
  });

  it('keeps the plain AI-written label when the shop changed nothing', () => {
    render_(view({ status: 'chargeProposed', proposal }));
    expect(screen.getByText(t('en', 'aiExplanation'))).toBeTruthy();
    expect(screen.queryByText("Written by the AI before the shop's review")).toBeNull();
  });

  it('shows Accept with the proposed amount only when the status is chargeProposed', () => {
    render_(view({ status: 'chargeProposed', proposal }));
    expect(screen.getByRole('button', { name: 'Accept €20.00' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I disagree' })).toBeTruthy();
  });

  it('Accept needs a second tap that says what happens; Cancel goes back (M5)', async () => {
    const accept = vi.spyOn(api, 'acceptCharge').mockResolvedValue(view({ status: 'charged' }));
    render_(view({ status: 'chargeProposed', proposal }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept €20.00' }));
    expect(accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Accept €20.00' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept €20.00' }));
    // On the confirm step the note line is gone: the sentence is not said twice.
    expect(screen.queryByText(/If you accept/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to confirm €20.00' }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
  });

  it('shows the note line before the confirm step', () => {
    render_(view({ status: 'chargeProposed', proposal }));
    expect(screen.getByText(/If you accept/)).toBeTruthy();
  });

  it('never claims in any language that the shop looked at the photos when the AI could not run', () => {
    expect(t('en', 'explanationNoAi')).toBe('The AI comparison could not run. Compare the photos yourself.');
    expect(t('en', 'conditionNoAi')).toBe('The AI check could not run. Any marks below were written down by the shop.');
    for (const lang of ['el', 'de', 'it', 'fr'] as const) {
      expect(t(lang, 'explanationNoAi')).not.toBe(t('en', 'explanationNoAi'));
      expect(t(lang, 'conditionNoAi')).not.toBe(t('en', 'conditionNoAi'));
    }
  });

  it('has the confirm step in every language', () => {
    for (const lang of ['en', 'el', 'de', 'it', 'fr'] as const) {
      expect(t(lang, 'acceptConfirm')).toContain('{charge}');
      expect(t(lang, 'acceptConfirm')).not.toContain('{release}');
      expect(t(lang, 'cancel')).not.toBe('');
    }
  });

  it.each(['EXPIRED', 'VOIDED', 'CAPTURED', 'DENIED'] as const)('a lost hold (%s) hides Accept and says to settle with the shop (I4)', (holdLost) => {
    render_(view({ status: 'chargeProposed', proposal, holdLost }));
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
    expect(screen.getByText(t('en', `holdLost${holdLost}`))).toBeTruthy();
  });

  it.each(['disputed', 'charged', 'released', 'closed'] as const)('does not show Accept when the status is %s', (status) => {
    render_(view({ status, proposal, settlement: status === 'released' ? { kind: 'released' } : null }));
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('does not show Accept on chargeProposed if the proposal is missing', () => {
    render_(view({ status: 'chargeProposed', proposal: null }));
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('says there is no new damage when a clean return is released', () => {
    render_(view({ status: 'released', findings: [], explanation: null, settlement: { kind: 'released' } }));
    expect(screen.getByText('No new damage. Your deposit is released.')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'RELEASED' })).toBeTruthy();
  });

  it('needs a reason of at most 500 characters before the answer can be sent', () => {
    render_(view({ status: 'chargeProposed', proposal }));
    fireEvent.click(screen.getByRole('button', { name: 'I disagree' }));
    const box = screen.getByLabelText(/Why do you disagree/i) as HTMLTextAreaElement;
    expect(box.required).toBe(true);
    expect(box.maxLength).toBe(500);
    expect((screen.getByRole('button', { name: 'Send my answer' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'The mark was there.' } });
    expect((screen.getByRole('button', { name: 'Send my answer' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('text the shop typed carries its own language mark on the renter page', () => {
  it('marks a finding\'s place and description as English in a German page', () => {
    render(<ReturnResult view={view({ status: 'chargeProposed', proposal })} token="tok" lang="de" land={false} onChange={vi.fn()} />);
    expect(screen.getByText('New mark on the left side panel').getAttribute('lang')).toBe('en');
    const place = screen.getAllByText('left side panel').find((el) => el.tagName === 'SPAN');
    expect(place?.getAttribute('lang')).toBe('en');
  });

  it('marks the existing marks the shop wrote down', () => {
    const mark = { id: 'm1', photoId: 'x', location: 'Left mirror', note: 'Chipped edge', box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } };
    render(<ConditionRecord view={view({ marks: [mark] })} lang="fr" />);
    expect(screen.getByText('Left mirror').getAttribute('lang')).toBe('en');
    expect(screen.getByText(/Chipped edge/).getAttribute('lang')).toBe('en');
  });
});

describe('ConditionRecord: marks the shop did not place', () => {
  it('draws a circle for a placed mark only, and lists an unplaced one under its photo with its number', () => {
    const photo = { id: 'pre-front', phase: 'pickup' as const, angle: 'front' as const, url: '/p/front.jpg', sha256: 'a'.repeat(64), takenAt: '2026-11-08T10:00:00Z', source: 'camera' as const };
    const placed = { id: 'm1', photoId: 'pre-front', location: 'Fender', note: 'Scuff', box: { x: 0.2, y: 0.2, w: 0.2, h: 0.12 } };
    const unplaced = { id: 'm2', photoId: 'pre-front', location: 'Handlebar', note: 'Worn grip' };
    render(<ConditionRecord view={view({ pickupPhotos: [photo], marks: [placed, unplaced] })} lang="en" />);
    expect(screen.getAllByTestId('photo-overlay')).toHaveLength(1);
    const list = screen.getByTestId('unplaced-marks');
    expect(list.textContent).toContain('2');
    expect(list.textContent).toContain('Handlebar');
  });
});

describe('ConditionRecord: the AI line only when the AI ran', () => {
  it('shows the AI line and the description when the AI ran', () => {
    render(<ConditionRecord view={view()} lang="en" />);
    expect(screen.getByText('White scooter')).toBeTruthy();
    expect(screen.getByText(t('en', 'aiAssisted'))).toBeTruthy();
  });

  it.each(LANGS)('says the answer was recorded for the sample photos, in %s, only when it was', (code) => {
    const recordedNote = tf(code, 'recordedAiNote', { model: 'claude-opus-5-5' });
    const { unmount } = render(<ConditionRecord view={view({ conditionAi: { model: 'claude-opus-5-5', recorded: true } })} lang={code} />);
    expect(screen.getByText(recordedNote)).toBeTruthy();
    unmount();
    render(<ConditionRecord view={view({ conditionAi: { model: 'claude-opus-5-5', recorded: false } })} lang={code} />);
    expect(screen.queryByText(recordedNote)).toBeNull();
  });

  it.each(LANGS)('says the AI could not run, with no AI line and no AI mark, in %s', (code) => {
    render(<ConditionRecord view={view({ conditionAiFailed: true, itemDescription: '' })} lang={code} />);
    expect(screen.getByText(t(code, 'conditionNoAi'))).toBeTruthy();
    expect(screen.queryByText(t(code, 'aiAssisted'))).toBeNull();
    expect(document.querySelector('[data-ai-generated]')).toBeNull();
  });
});

describe('the renter token', () => {
  it('is read from the hash, kept on this device and removed from the address bar', () => {
    window.history.replaceState(null, '', '/r/h1#t=secret-token');
    expect(readRenterToken('h1')).toBe('secret-token');
    expect(window.localStorage.getItem('eh_t_h1')).toBe('secret-token');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('secret-token');
    // a reload (no hash any more) still finds it
    expect(readRenterToken('h1')).toBe('secret-token');
  });

  it('survives closing the tab: a new tab on the same device still finds it (I3)', () => {
    window.history.replaceState(null, '', '/r/h1#t=secret-token');
    readRenterToken('h1');
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/record/h1');
    expect(readRenterToken('h1')).toBe('secret-token');
  });

  it('is null when there is neither a hash nor a stored token', () => {
    expect(readRenterToken('h1')).toBeNull();
  });

  describe('on the page', () => {
    beforeEach(() => {
      window.history.replaceState(null, '', '/r/h1#t=secret-token');
    });

    it('is sent as the x-renter-token header only, never in the address or the body', async () => {
      const fetchMock = renterFetch(view({ status: 'active' }));
      vi.stubGlobal('fetch', fetchMock);
      render(<RenterScreen id="h1" />);
      await screen.findByText(/Your deposit is reserved/);

      const handoverCalls = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/handovers/h1'));
      expect(handoverCalls.length).toBeGreaterThan(0);
      for (const [url, init] of handoverCalls as unknown as [string, RequestInit][]) {
        expect((init.headers as Record<string, string>)['x-renter-token']).toBe('secret-token');
        expect(url).not.toContain('secret-token');
        expect(url).not.toContain('?');
        expect(init.body ?? '').not.toContain('secret-token');
      }
      expect(window.location.href).not.toContain('secret-token');
      expect(window.localStorage.getItem('eh_t_h1')).toBe('secret-token');
    });

    it('confirming binds this device: the secret stays here, only its SHA-256 is sent, and later calls carry the secret', async () => {
      const fetchMock = renterFetch(view({ status: 'awaitingRenter', renter: null, findings: [], explanation: null }));
      vi.stubGlobal('fetch', fetchMock);
      render(<RenterScreen id="h1" />);
      fireEvent.click(await screen.findByRole('button', { name: 'I checked the photos' }));
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/confirm'))).toBe(true));

      const secret = window.localStorage.getItem('eh_d_h1');
      expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const confirm = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/confirm')) as unknown as [string, RequestInit];
      const sent = JSON.parse(String(confirm[1].body)) as { deviceHash: string };
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret as string));
      const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      expect(sent.deviceHash).toBe(expected);
      expect(String(confirm[1].body)).not.toContain(secret as string);

      await waitFor(() => {
        const later = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/handovers/h1').pop() as unknown as [string, RequestInit];
        expect((later[1].headers as Record<string, string>)['x-renter-device']).toBe(secret);
      });
    });

    it.each([
      ['draft', { status: 'draft', renter: null }],
      ['awaiting confirm', { status: 'awaitingRenter', renter: null }],
      ['awaiting hold', { status: 'awaitingRenter', renter: { language: 'en', name: null } }],
    ] as const)('puts the money line directly under the deposit amount while %s (fix 6)', async (_name, over) => {
      vi.stubGlobal('fetch', renterFetch(view({ ...over, findings: [], explanation: null })));
      render(<RenterScreen id="h1" />);
      const line = await screen.findByText(t('en', 'holdIntro'));
      const amount = screen.getByText('€150.00');
      expect(amount.parentElement?.nextElementSibling).toBe(line);
      expect(screen.getAllByText(t('en', 'holdIntro'))).toHaveLength(1);
    });

    it('does not repeat the money line once the hold is placed', async () => {
      vi.stubGlobal('fetch', renterFetch(view({ status: 'active', findings: [], explanation: null })));
      render(<RenterScreen id="h1" />);
      await screen.findByText(/Your deposit is reserved/);
      expect(screen.queryByText(t('en', 'holdIntro'))).toBeNull();
    });

    it.each(['en', 'el', 'de', 'it', 'fr'] as const)('a lost hold replaces the Held stamp with the message, in %s (I4)', async (language) => {
      vi.stubGlobal('fetch', renterFetch(view({ status: 'active', findings: [], explanation: null, holdLost: 'EXPIRED', renter: { language, name: null } })));
      render(<RenterScreen id="h1" />);
      expect(await screen.findByText(t(language, 'holdLostEXPIRED'))).toBeTruthy();
      expect(screen.queryByRole('img', { name: stampText(language, t(language, 'stampHeld')) })).toBeNull();
      expect(screen.getByRole('img', { name: stampText(language, t(language, 'stampHoldLost')) })).toBeTruthy();
      expect(screen.queryByText(t(language, 'statusActive'))).toBeNull();
    });

    it('a second device sees a read-only record: the notice, and no confirm or accept buttons (R36)', async () => {
      vi.stubGlobal('fetch', renterFetch(view({ status: 'chargeProposed', proposal, otherDevice: true })));
      render(<RenterScreen id="h1" />);
      expect(await screen.findByText('This record was confirmed on another device.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
      expect(screen.queryByRole('button', { name: 'I disagree' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'I checked the photos' })).toBeNull();
    });

    it('shows the link-not-valid message on a 403', async () => {
      const body = JSON.stringify({ ok: false, error: { code: 'FORBIDDEN', message: 'You are not allowed to do this' } });
      vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 403 })));
      render(<RenterScreen id="h1" />);
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toBe('This link is not valid on this device. Ask the shop to show the QR code again.');
    });

    it('asks for the QR code again when there is no token at all', async () => {
      window.history.replaceState(null, '', '/r/h2');
      vi.stubGlobal('fetch', vi.fn());
      render(<RenterScreen id="h2" />);
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('not valid on this device'));
    });
  });
});
