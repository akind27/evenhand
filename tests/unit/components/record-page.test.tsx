// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordScreen, type EvidencePack } from '@/components/record/RecordScreen';
import type { HandoverView } from '@/lib/client/api';

const HASH = 'abcdef0123456789'.repeat(4);

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
    pickupPhotos: [{ id: 'p1', phase: 'pickup', angle: 'front', url: '/p1.jpg', sha256: HASH, takenAt: '2026-11-08T10:00:00Z', source: 'sample' }],
    returnPhotos: [],
    photoChecks: {},
    photoTries: {},
    marks: [],
    itemDescription: null,
    suggestedRuleId: null,
    deposit: { ruleId: 'r', amountCents: 15000 },
    renter: null,
    holdOrderId: null,
    hold: { orderId: 'o', authorizationId: 'a', parentAuthorizationId: 'a', amountCents: 15000, honorUntil: '2026-11-11T10:00:00Z', expiresAt: '2026-12-07T10:00:00Z' },
    holdLost: null,
    findings: [],
    explanation: null,
    explanationLanguage: null,
    aiFailed: false,
    proposal: null,
    settlement: null,
    dispute: null,
    lastSeq: 1,
    lastHash: HASH,
    role: 'viewer',
    otherDevice: false,
    isDemo: true,
    conditionAi: null,
    conditionAiFailed: false,
    comparisonAi: null,
    ...over,
  };
}

function pack(over: Partial<EvidencePack> = {}): EvidencePack {
  return {
    handover: handover(),
    events: [
      { seq: 0, at: '2026-11-08T10:00:00Z', actor: 'shop', event: { type: 'depositSet', ruleId: 'r', amountCents: 15000 }, prevHash: '0', hash: HASH },
      { seq: 1, at: '2026-11-08T10:05:00Z', actor: 'system', event: { type: 'closed' }, prevHash: HASH, hash: HASH },
    ],
    chain: { ok: true },
    photos: [{ id: 'p1', angle: 'front', phase: 'pickup', sha256: HASH, url: '/p1.jpg' }],
    note: 'x',
    ...over,
  };
}

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(status === 200 ? { ok: true, data: body } : { ok: false, error: { code: 'FORBIDDEN', message: 'no' } }), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/record/h1');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RecordScreen', () => {
  it('sends the view key as x-view-key, removes the fragment and shows no action buttons', async () => {
    const fetchMock = mockFetch(pack());
    window.history.replaceState(null, '', '/record/h1#v=secretkey');
    render(<RecordScreen id="h1" />);
    await screen.findByText('Record intact — every step is sealed to the one before.');

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['x-view-key']).toBe('secretkey');
    expect(window.location.hash).toBe('');
    expect(window.sessionStorage.getItem('eh_v_h1')).toBe('secretkey');

    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent ?? '');
    for (const name of names) {
      expect(name).toMatch(/Download evidence \(JSON\)|Print \/ save as PDF|fingerprint/);
    }
    expect(screen.queryByRole('button', { name: /release|charge|accept|dispute|propose|confirm|pay/i })).toBeNull();
  });

  it('says an AI result was a recorded answer for the sample photos, only when it was', async () => {
    mockFetch(pack({ handover: handover({ conditionAi: { model: 'claude-opus-5-5', recorded: true }, itemDescription: 'White scooter' }) }));
    render(<RecordScreen id="h1" />);
    expect(await screen.findByText('Recorded AI answer for the sample photos (claude-opus-5-5)')).toBeTruthy();
    cleanup();
    mockFetch(pack({ handover: handover({ conditionAi: { model: 'claude-opus-5-5', recorded: false }, itemDescription: 'White scooter' }) }));
    render(<RecordScreen id="h1" />);
    await screen.findByText('Record intact — every step is sealed to the one before.');
    expect(screen.queryByText(/Recorded AI answer/)).toBeNull();
  });

  it('keeps only the time in the number font on a timeline line', async () => {
    mockFetch(pack());
    const { container } = render(<RecordScreen id="h1" />);
    await screen.findByText('Record intact — every step is sealed to the one before.');
    const time = container.querySelector('time') as HTMLElement;
    expect(time.className).toContain('mono');
    expect(time.parentElement?.className ?? '').not.toContain('mono');
    expect(screen.getAllByText('Shop').length).toBeGreaterThan(0);
  });

  it('draws the confirmed finding on its return photo, and not a box that covers the whole photo', async () => {
    const finding = (id: string, afterPhotoId: string, box: { x: number; y: number; w: number; h: number }) => ({
      id,
      angle: 'left' as const,
      beforePhotoId: 'p1',
      afterPhotoId,
      location: 'left panel',
      description: 'Scratch',
      severity: 'minor' as const,
      confidence: 0.9,
      box,
      priceItemId: null,
      status: 'confirmed' as const,
      source: 'shop' as const,
    });
    const returned = { id: 'r1', phase: 'return' as const, angle: 'left' as const, url: '/r1.jpg', sha256: HASH, takenAt: '2026-11-08T10:00:00Z', source: 'camera' as const };
    mockFetch(
      pack({
        handover: handover({ returnPhotos: [returned], findings: [finding('f1', 'r1', { x: 0.3, y: 0.3, w: 0.2, h: 0.1 }), finding('f2', 'r1', { x: 0, y: 0, w: 1, h: 1 })] }),
        photos: [
          { id: 'p1', angle: 'front', phase: 'pickup', sha256: HASH, url: '/p1.jpg' },
          { id: 'r1', angle: 'left', phase: 'return', sha256: HASH, url: '/r1.jpg' },
        ],
      }),
    );
    render(<RecordScreen id="h1" />);
    await screen.findByText('Record intact — every step is sealed to the one before.');
    expect(screen.getAllByTestId('photo-overlay')).toHaveLength(1);
  });

  it('draws a placed pickup mark as a circle, and lists a mark with no box under its photo with no circle', async () => {
    const placed = { id: 'm1', photoId: 'p1', location: 'Front fender', note: 'Scuff', box: { x: 0.2, y: 0.2, w: 0.2, h: 0.12 } };
    const unplaced = { id: 'm2', photoId: 'p1', location: 'Handlebar', note: 'Worn grip' };
    mockFetch(pack({ handover: handover({ marks: [placed, unplaced] }) }));
    render(<RecordScreen id="h1" />);
    await screen.findByText('Record intact — every step is sealed to the one before.');
    expect(screen.getAllByTestId('photo-overlay')).toHaveLength(1);
    const list = screen.getByTestId('unplaced-marks');
    expect(list.textContent).toContain('2');
    expect(list.textContent).toContain('Handlebar');
  });

  it('shows no recorded-answer note for a condition check that could not run', async () => {
    mockFetch(pack({ handover: handover({ conditionAi: { model: 'claude-opus-5-5', recorded: true }, conditionAiFailed: true, itemDescription: '' }) }));
    render(<RecordScreen id="h1" />);
    await screen.findByText('Record intact — every step is sealed to the one before.');
    expect(screen.queryByText(/Recorded AI answer/)).toBeNull();
  });

  it('uses the view key kept in this tab when the address has no fragment', async () => {
    window.sessionStorage.setItem('eh_v_h1', 'kept');
    const fetchMock = mockFetch(pack());
    render(<RecordScreen id="h1" />);
    await screen.findByText(/every step is sealed/);
    expect(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['x-view-key']).toBe('kept');
  });

  it('lets the renter in with their own token', async () => {
    const fetchMock = mockFetch(pack());
    window.history.replaceState(null, '', '/record/h1#t=renter-secret');
    render(<RecordScreen id="h1" />);
    await screen.findByText(/every step is sealed/);
    expect(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['x-renter-token']).toBe('renter-secret');
    expect(window.location.hash).toBe('');
  });

  it('the renter\'s "Your record" link works after the tab was closed: the token is kept on the device (I3)', async () => {
    window.localStorage.setItem('eh_t_h1', 'kept-renter-token');
    const fetchMock = mockFetch(pack());
    render(<RecordScreen id="h1" />);
    await screen.findByText(/every step is sealed/);
    expect(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['x-renter-token']).toBe('kept-renter-token');
    window.localStorage.removeItem('eh_t_h1');
  });

  it('shows the friendly message when the link is not valid', async () => {
    mockFetch(null, 403);
    render(<RecordScreen id="h1" />);
    expect(await screen.findByText('This link is not valid on this device.')).toBeTruthy();
  });

  it('labels AI findings as AI and shop findings as added by the shop', async () => {
    const base = { angle: 'left' as const, beforePhotoId: 'a', afterPhotoId: 'b', severity: 'minor' as const, confidence: 0.9, box: { x: 0, y: 0, w: 1, h: 1 }, priceItemId: null, status: 'confirmed' as const };
    mockFetch(pack({ handover: handover({ findings: [{ ...base, id: 'f1', location: 'left panel', description: 'AI mark', source: 'ai' }, { ...base, id: 'f2', location: 'mirror', description: 'Hand mark', source: 'shop' }] }) }));
    render(<RecordScreen id="h1" />);
    await screen.findByText(/AI mark/);
    expect(screen.getAllByText(/AI-assisted/)).toHaveLength(1);
    expect(screen.getAllByText('Added by the shop.')).toHaveLength(1);
  });

  it('shows the AI line when the AI wrote the condition record, even if every confirmed finding came from the shop', async () => {
    const base = { angle: 'left' as const, beforePhotoId: 'a', afterPhotoId: 'b', severity: 'minor' as const, confidence: 0.9, box: { x: 0, y: 0, w: 1, h: 1 }, priceItemId: null, status: 'confirmed' as const };
    const events = [
      { seq: 0, at: '2026-11-08T10:00:00Z', actor: 'system' as const, event: { type: 'conditionRecorded' as const, marks: [], suggestedRuleId: null, itemDescription: 'White scooter', assessmentId: 'x' }, prevHash: '0', hash: HASH },
    ];
    mockFetch(pack({ events, handover: handover({ findings: [{ ...base, id: 'f2', location: 'mirror', description: 'Hand mark', source: 'shop' }] }) }));
    render(<RecordScreen id="h1" />);
    await screen.findByText(/Hand mark/);
    expect(screen.getAllByText(/AI-assisted — a person decides any charge/)).toHaveLength(1);
    expect(screen.getAllByText('Added by the shop.')).toHaveLength(1);
  });

  it('shows no AI line when the shop only edited the marks by hand', async () => {
    const events = [
      { seq: 0, at: '2026-11-08T10:00:00Z', actor: 'shop' as const, event: { type: 'conditionRecorded' as const, marks: [{ id: 'm1', photoId: 'p1', location: 'left', note: 'scuff', box: { x: 0, y: 0, w: 0.1, h: 0.1 } }], suggestedRuleId: null, itemDescription: '', assessmentId: null }, prevHash: '0', hash: HASH },
    ];
    mockFetch(pack({ events }));
    render(<RecordScreen id="h1" />);
    await screen.findByText(/every step is sealed/);
    expect(screen.queryByText(/AI-assisted/)).toBeNull();
  });

  it('marks AI-derived record lines as machine-readable AI text', async () => {
    const events = [
      { seq: 0, at: '2026-11-08T10:00:00Z', actor: 'system' as const, event: { type: 'conditionRecorded' as const, marks: [], suggestedRuleId: null, itemDescription: 'White scooter', assessmentId: 'x', model: 'claude-opus-5-5' }, prevHash: '0', hash: HASH },
    ];
    mockFetch(pack({ events }));
    const { container } = render(<RecordScreen id="h1" />);
    await screen.findByText(/every step is sealed/);
    const marked = container.querySelector('[data-ai-generated="true"][data-ai-model="claude-opus-5-5"]');
    expect(marked?.textContent).toMatch(/Condition record written/);
  });

  it('shows no AI line when the AI did not run', async () => {
    const events = [
      { seq: 0, at: '2026-11-08T10:00:00Z', actor: 'system' as const, event: { type: 'conditionRecorded' as const, marks: [], suggestedRuleId: null, itemDescription: '', assessmentId: 'x' }, prevHash: '0', hash: HASH },
      { seq: 1, at: '2026-11-08T10:05:00Z', actor: 'system' as const, event: { type: 'comparisonDone' as const, findings: [], explanation: 'x', explanationLanguage: 'en' as const, assessmentId: 'y', aiFailed: true }, prevHash: HASH, hash: HASH },
    ];
    mockFetch(pack({ events }));
    render(<RecordScreen id="h1" />);
    await screen.findByText(/every step is sealed/);
    expect(screen.queryByText(/AI-assisted/)).toBeNull();
  });

  it('says where a changed record broke', async () => {
    mockFetch(pack({ chain: { ok: false, brokenAt: 3 } }));
    render(<RecordScreen id="h1" />);
    expect(await screen.findByText('Record changed after step 3.')).toBeTruthy();
  });

  it('downloads the evidence with the credential header and revokes the address only after a delay', async () => {
    window.sessionStorage.setItem('eh_v_h1', 'kept');
    const fetchMock = mockFetch(pack());
    const create = vi.fn(() => 'blob:evenhand-test');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    render(<RecordScreen id="h1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download evidence (JSON)' }));
    await waitFor(() => expect(names).toEqual(['evenhand-h1-evidence.json']));
    const last = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown as [string, RequestInit];
    expect(last[0]).toBe('/api/handovers/h1/evidence');
    expect((last[1].headers as Record<string, string>)['x-view-key']).toBe('kept');
    expect(revoke).not.toHaveBeenCalled();
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:evenhand-test'), { timeout: 2500 });
    click.mockRestore();
  });

  it('shows 12 characters of a fingerprint and the whole value on tap', async () => {
    mockFetch(pack());
    render(<RecordScreen id="h1" />);
    const toggle = (await screen.findByRole('button', { name: /front photo SHA-256/ })) as HTMLButtonElement;
    expect(toggle.textContent).toBe(`${HASH.slice(0, 12)}…`);
    expect(toggle.title).toBe(HASH);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(screen.getAllByText(HASH).some((node) => !node.hasAttribute('hidden'))).toBe(true));
  });
});
