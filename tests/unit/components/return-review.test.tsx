// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boxAround } from '@/components/shop/ManualFinding';
import { ReturnReview } from '@/components/shop/ReturnReview';
import type { PublicHandoverView } from '@/lib/auth';
import * as api from '@/lib/client/api';
import type { Finding } from '@/lib/domain/types';

vi.mock('@/lib/client/api', async (original) => ({
  ...(await original<typeof import('@/lib/client/api')>()),
  action: vi.fn().mockResolvedValue({}),
  updateFinding: vi.fn().mockResolvedValue({}),
  addManualFinding: vi.fn().mockResolvedValue({}),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function finding(over: Partial<Finding> & Pick<Finding, 'id' | 'status' | 'priceItemId'>): Finding {
  return {
    angle: 'left',
    beforePhotoId: 'pre-left',
    afterPhotoId: 'ret-left',
    location: 'left side panel',
    description: 'New mark on the left side panel',
    severity: 'minor',
    confidence: 0.9,
    box: { x: 0.2, y: 0.3, w: 0.2, h: 0.1 },
    source: 'ai',
    ...over,
  };
}

function photo(id: string, phase: 'pickup' | 'return') {
  return { id, phase, angle: 'left' as const, url: `/p/${id}.jpg`, sha256: 'a'.repeat(64), takenAt: '2026-11-08T10:00:00Z', source: 'sample' as const };
}

function viewWith(findings: Finding[], holdCents = 5000): PublicHandoverView {
  return {
    id: 'h1',
    shopId: 's1',
    createdAt: '2026-11-08T10:00:00.000Z',
    status: 'reviewed',
    itemType: '125cc scooter',
    itemRef: 'ABC-123',
    priceList: [
      { id: 'dent', label: 'Dent on a body panel', amountCents: 6000 },
      { id: 'scratch', label: 'Scratch on a body panel', amountCents: 2000 },
    ],
    depositRules: [],
    pickupPhotos: [photo('pre-left', 'pickup')],
    returnPhotos: [photo('ret-left', 'return')],
    photoChecks: {},
    photoTries: {},
    marks: [],
    itemDescription: null,
    suggestedRuleId: null,
    deposit: { ruleId: 'r', amountCents: holdCents },
    renter: { language: 'en', name: null },
    holdOrderId: 'o1',
    hold: { orderId: 'o1', authorizationId: 'a1', parentAuthorizationId: 'a1', amountCents: holdCents, honorUntil: '2026-11-11T00:00:00Z', expiresAt: '2026-12-07T00:00:00Z' },
    holdLost: null,
    findings,
    explanation: null,
    explanationLanguage: null,
    aiFailed: false,
    proposal: null,
    settlement: null,
    dispute: null,
    lastSeq: 9,
    lastHash: 'b'.repeat(64),
    role: 'shop',
    otherDevice: false,
    isDemo: true,
    conditionAi: null,
    conditionAiFailed: false,
    comparisonAi: null,
  };
}

describe('ReturnReview: who wrote the AI answer (M1, C1)', () => {
  it('marks AI finding text with the model the comparison event names', () => {
    const view = { ...viewWith([finding({ id: 'f1', status: 'proposed', priceItemId: null })]), comparisonAi: { model: 'claude-fallback-model', recorded: false } };
    render(<ReturnReview view={view} onChange={() => {}} />);
    expect(screen.getByText('New mark on the left side panel').getAttribute('data-ai-model')).toBe('claude-fallback-model');
    expect(screen.queryByText(/Recorded AI answer/)).toBeNull();
  });

  it('falls back to the configured model for logs from before the model was recorded', () => {
    render(<ReturnReview view={viewWith([finding({ id: 'f1', status: 'proposed', priceItemId: null })])} onChange={() => {}} />);
    expect(screen.getByText('New mark on the left side panel').getAttribute('data-ai-model')).toBe('claude-opus-5-5');
  });

  it('says so when the comparison was a recorded answer for the sample photos', () => {
    const view = { ...viewWith([]), comparisonAi: { model: 'claude-opus-5-5', recorded: true } };
    render(<ReturnReview view={view} onChange={() => {}} />);
    expect(screen.getByText('Recorded AI answer for the sample photos (claude-opus-5-5)')).toBeTruthy();
  });
});

describe('ReturnReview: a lost hold (I4)', () => {
  it.each([
    ['EXPIRED', 'Hold expired — settle with the renter directly'],
    ['VOIDED', 'Hold cancelled outside Evenhand — settle with the renter directly'],
    ['CAPTURED', 'Hold charged outside Evenhand — check PayPal, then settle with the renter directly'],
    ['DENIED', 'Hold denied by PayPal — settle with the renter directly'],
  ] as const)('says %s plainly and offers neither Release nor Send', (holdLost, message) => {
    render(<ReturnReview view={{ ...viewWith([finding({ id: 'f1', status: 'dismissed', priceItemId: null })]), holdLost }} onChange={() => {}} />);
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Release deposit' })).toBeNull();
    const confirmed = { ...viewWith([finding({ id: 'f1', status: 'confirmed', priceItemId: 'scratch' })]), holdLost };
    cleanup();
    render(<ReturnReview view={confirmed} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Send to renter for approval' })).toBeNull();
  });
});

describe('ReturnReview: a lost hold hides "Add damage by hand"', () => {
  it('offers no hand-made finding when the hold has ended, because the bar that would save it is gone', () => {
    render(<ReturnReview view={{ ...viewWith([]), status: 'reviewed', holdLost: 'EXPIRED' }} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Add damage by hand' })).toBeNull();
  });

  it('still offers it while the hold is live', () => {
    render(<ReturnReview view={{ ...viewWith([]), status: 'reviewed' }} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add damage by hand' })).toBeTruthy();
  });
});

describe('ReturnReview: adding damage by hand (one primary action)', () => {
  const dismissed = () => viewWith([finding({ id: 'f1', status: 'dismissed', priceItemId: null })]);

  function fillForm() {
    fireEvent.click(screen.getByRole('button', { name: 'Add damage by hand' }));
    fireEvent.change(screen.getByLabelText(/^Where on the item/), { target: { value: 'Left panel' } });
    fireEvent.change(screen.getByLabelText(/^What you see/), { target: { value: 'Dent' } });
  }

  it('while the form is open the bar holds Add finding and Cancel, and Release is gone; afterwards it comes back', () => {
    const { container } = render(<ReturnReview view={dismissed()} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Release deposit' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add damage by hand' }));
    const add = screen.getByRole('button', { name: 'Add finding' });
    expect(add.closest('.action-bar')).not.toBeNull();
    expect(add.className).toContain('btn-primary');
    expect(add.getAttribute('form')).toBe('manual-finding');
    expect(screen.getByRole('button', { name: 'Cancel' }).closest('.action-bar')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Release deposit' })).toBeNull();
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Release deposit' })).toBeTruthy();
    expect(screen.queryByLabelText(/^Where on the item/)).toBeNull();
  });

  it('saves a finding with no box by default, which keeps today\'s whole-photo behaviour', async () => {
    render(<ReturnReview view={dismissed()} onChange={() => {}} />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add finding' }));
    await waitFor(() => expect(api.addManualFinding).toHaveBeenCalledTimes(1));
    const input = vi.mocked(api.addManualFinding).mock.calls[0][1];
    expect(input).toMatchObject({ angle: 'left', location: 'Left panel', description: 'Dent', priceItemId: 'dent' });
    expect(input.box).toBeUndefined();
  });

  it('a tap on the return photo places a box of about 20% by 12% around the tap and sends it', async () => {
    render(<ReturnReview view={dismissed()} onChange={() => {}} />);
    fillForm();
    const picker = screen.getByTestId('box-picker');
    // The tap is measured against the picture, not the padded button around it.
    picker.getBoundingClientRect = () => ({ left: 0, top: 0, width: 999, height: 999, right: 999, bottom: 999, x: 0, y: 0, toJSON: () => ({}) });
    picker.querySelector('img')!.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 300, right: 500, bottom: 350, x: 100, y: 50, toJSON: () => ({}) });
    fireEvent.click(picker, { clientX: 300, clientY: 200, detail: 1 });
    expect(screen.getByTestId('picked-box')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add finding' }));
    await waitFor(() => expect(api.addManualFinding).toHaveBeenCalled());
    const box = vi.mocked(api.addManualFinding).mock.calls[0][1].box;
    expect(box?.w).toBeCloseTo(0.2);
    expect(box?.h).toBeCloseTo(0.12);
    expect((box?.x ?? 0) + (box?.w ?? 0) / 2).toBeCloseTo(0.5);
    expect((box?.y ?? 0) + (box?.h ?? 0) / 2).toBeCloseTo(0.5);
  });

  it('"No box" takes the box away again', async () => {
    render(<ReturnReview view={dismissed()} onChange={() => {}} />);
    fillForm();
    const picker = screen.getByTestId('box-picker');
    picker.querySelector('img')!.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(picker, { clientX: 200, clientY: 150, detail: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'No box' }));
    expect(screen.queryByTestId('picked-box')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add finding' }));
    await waitFor(() => expect(api.addManualFinding).toHaveBeenCalled());
    expect(vi.mocked(api.addManualFinding).mock.calls[0][1].box).toBeUndefined();
  });

  it('a keyboard press on the photo, which has no pointer position, places a centred box', () => {
    render(<ReturnReview view={dismissed()} onChange={() => {}} />);
    fillForm();
    fireEvent.click(screen.getByTestId('box-picker'), { detail: 0 });
    const box = screen.getByTestId('picked-box');
    expect(box.style.left).toBe('40%');
  });
});

describe('boxAround', () => {
  it('centres the box on the tap and keeps it inside the photo', () => {
    expect(boxAround(0.5, 0.5)).toEqual({ x: 0.4, y: 0.44, w: 0.2, h: 0.12 });
    expect(boxAround(0, 0)).toEqual({ x: 0, y: 0, w: 0.2, h: 0.12 });
    const corner = boxAround(1, 1);
    expect(corner.x + corner.w).toBeCloseTo(1);
    expect(corner.y + corner.h).toBeCloseTo(1);
    expect(boxAround(-3, 9).x).toBe(0);
  });
});

describe('ReturnReview photo comparison', () => {
  it('when the AI failed, does not say nothing was found and shows the pairs to compare yourself', () => {
    render(<ReturnReview view={{ ...viewWith([]), aiFailed: true }} onChange={() => {}} />);
    expect(screen.queryByText('No new marks were found.')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Compare the photos yourself' })).toBeTruthy();
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(2);
  });

  it('when the AI ran, keeps the pairs under a collapsed disclosure', () => {
    const { container } = render(<ReturnReview view={viewWith([])} onChange={() => {}} />);
    expect(screen.getByText('No new marks were found.')).toBeTruthy();
    const details = container.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText('All before/after photos')).toBeTruthy();
  });
});

describe('ReturnReview', () => {
  it('shows the excess warning when the confirmed total exceeds the hold', () => {
    render(<ReturnReview view={viewWith([finding({ id: 'f1', status: 'confirmed', priceItemId: 'dent' })])} onChange={() => {}} />);
    expect(screen.getByRole('status', { name: /more than the hold/i })).toBeTruthy();
    expect(screen.getByTestId('total').textContent).toContain('€60.00');
  });

  it('does not warn when the confirmed total fits inside the hold', () => {
    render(<ReturnReview view={viewWith([finding({ id: 'f1', status: 'confirmed', priceItemId: 'scratch' })])} onChange={() => {}} />);
    expect(screen.queryByRole('status', { name: /more than the hold/i })).toBeNull();
  });

  it('hides needsHuman findings from the total and blocks sending', () => {
    const findings = [
      finding({ id: 'f1', status: 'confirmed', priceItemId: 'scratch' }),
      finding({ id: 'f2', status: 'needsHuman', priceItemId: 'dent', confidence: 0.4 }),
    ];
    render(<ReturnReview view={viewWith(findings)} onChange={() => {}} />);
    const total = screen.getByTestId('total').textContent ?? '';
    expect(total).toContain('€20.00');
    expect(total).not.toContain('€80.00');
    const send = screen.getByRole('button', { name: /send to renter for approval/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.getByText('Confirm or dismiss every finding first')).toBeTruthy();
  });

  it('offers to release the deposit when nothing is confirmed', () => {
    render(<ReturnReview view={viewWith([finding({ id: 'f1', status: 'dismissed', priceItemId: null })])} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /release deposit/i })).toBeTruthy();
  });

  it('blocks sending while a confirmed finding has no price, and names it', () => {
    render(<ReturnReview view={viewWith([finding({ id: 'f1', status: 'confirmed', priceItemId: null })])} onChange={() => {}} />);
    const send = screen.getByRole('button', { name: /send to renter for approval/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.getByText(/Finding 1 \(left side panel\) is confirmed but has no price/)).toBeTruthy();
  });

  it('keeps Confirm disabled until a price is chosen', () => {
    render(<ReturnReview view={viewWith([finding({ id: 'f1', status: 'proposed', priceItemId: null })])} onChange={() => {}} />);
    const confirm = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByText('Choose a price first')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: /price item/i }), { target: { value: 'scratch' } });
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([
    ['confirmed', 'Confirm', 'Dismiss'],
    ['dismissed', 'Dismiss', 'Confirm'],
  ] as const)('after a finding is %s, its button says so with aria-pressed and the other does not', (status, chosen, other) => {
    render(<ReturnReview view={viewWith([finding({ id: 'f1', status, priceItemId: status === 'confirmed' ? 'scratch' : null })])} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: chosen }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: other }).getAttribute('aria-pressed')).toBe('false');
  });

  it('neither decision button is pressed while the finding is undecided', () => {
    render(<ReturnReview view={viewWith([finding({ id: 'f1', status: 'proposed', priceItemId: null })])} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Confirm' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Dismiss' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('releases only after "Yes, release"', async () => {
    render(<ReturnReview view={viewWith([finding({ id: 'f1', status: 'dismissed', priceItemId: null })])} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /release deposit/i }));
    expect(api.action).not.toHaveBeenCalled();
    expect(screen.getByText(/Give back the full €50\.00 to the renter\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.action).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /release deposit/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, release' }));
    await waitFor(() => expect(api.action).toHaveBeenCalledWith('h1', 'release'));
  });

  it('shows the frozen amount while waiting for the renter', () => {
    const view = viewWith([finding({ id: 'f1', status: 'confirmed', priceItemId: 'scratch' })]);
    view.status = 'chargeProposed';
    view.proposal = { lines: [], chargeCents: 2000, releaseCents: 3000, exceedsHoldByCents: 0 };
    render(<ReturnReview view={view} onChange={() => {}} />);
    const waiting = screen.getByText('Waiting for the renter').closest('section') as HTMLElement;
    expect(within(waiting).getByText('€20.00')).toBeTruthy();
  });

  it('says what happens with the real amounts while waiting for the renter', () => {
    const view = viewWith([finding({ id: 'f1', status: 'confirmed', priceItemId: 'scratch' })], 5000);
    view.status = 'chargeProposed';
    view.proposal = { lines: [], chargeCents: 2000, releaseCents: 3000, exceedsHoldByCents: 0 };
    render(<ReturnReview view={view} onChange={() => {}} />);
    expect(screen.getByText('If the renter accepts, €20.00 is charged and €30.00 is released. Until then the full €50.00 stays held.')).toBeTruthy();
    expect(screen.queryByText(/amount is frozen/)).toBeNull();
  });
});
