// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConditionReview } from '@/components/shop/ConditionReview';
import type { PublicHandoverView } from '@/lib/auth';
import * as api from '@/lib/client/api';

vi.mock('@/lib/client/api', async (original) => ({
  ...(await original<typeof import('@/lib/client/api')>()),
  action: vi.fn().mockResolvedValue({}),
  updateMarks: vi.fn().mockResolvedValue({}),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function photo(angle: 'front' | 'back' | 'left' | 'right') {
  return { id: `pre-${angle}`, phase: 'pickup' as const, angle, url: `/p/${angle}.jpg`, sha256: 'a'.repeat(64), takenAt: '2026-11-08T10:00:00Z', source: 'sample' as const };
}

function view(over: Partial<PublicHandoverView> = {}): PublicHandoverView {
  return {
    id: 'h1',
    shopId: 's1',
    createdAt: '2026-11-08T10:00:00.000Z',
    status: 'draft',
    itemType: 'Scooter',
    itemRef: 'ABC-123',
    priceList: [],
    depositRules: [],
    pickupPhotos: [photo('front'), photo('back'), photo('left'), photo('right')],
    returnPhotos: [],
    photoChecks: {},
    photoTries: {},
    marks: [],
    itemDescription: 'White scooter',
    suggestedRuleId: null,
    deposit: null,
    renter: null,
    holdOrderId: null,
    hold: null,
    holdLost: null,
    findings: [],
    explanation: null,
    explanationLanguage: null,
    aiFailed: false,
    proposal: null,
    settlement: null,
    dispute: null,
    lastSeq: 3,
    lastHash: 'b'.repeat(64),
    role: 'shop',
    otherDevice: false,
    isDemo: true,
    conditionAi: { model: 'claude-opus-5-5', recorded: false },
    conditionAiFailed: false,
    comparisonAi: null,
    ...over,
  };
}

const FAILED = 'The AI check could not run. Look at the four photos and add any marks that are already there.';

describe('ConditionReview when the AI ran', () => {
  it('shows the AI-marked description, the AI label and the clean line', () => {
    render(<ConditionReview view={view()} onChange={vi.fn()} />);
    expect(screen.getByText('White scooter').getAttribute('data-ai-generated')).toBe('true');
    expect(screen.getByText(/AI-assisted/)).toBeTruthy();
    expect(screen.getByText('The AI found no marks.')).toBeTruthy();
    expect(screen.queryByText(/looks clean/)).toBeNull();
    expect(screen.queryByText(FAILED)).toBeNull();
  });

  it('still offers "Add a mark by hand" while the record can be edited, and not once the handover has moved on', () => {
    render(<ConditionReview view={view()} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add a mark by hand' })).toBeTruthy();
    cleanup();
    render(<ConditionReview view={view({ status: 'awaitingRenter' })} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Add a mark by hand' })).toBeNull();
  });
});

describe('ConditionReview: where a hand-added mark is drawn', () => {
  const noBoxMark = { id: 'm1', photoId: 'pre-front', location: 'Left mirror', note: 'Chipped' };
  const boxMark = { id: 'm2', photoId: 'pre-back', location: 'Seat', note: 'Tear', box: { x: 0.5, y: 0.3, w: 0.2, h: 0.12 } };

  it('draws a circle only for a mark that has a box, and lists the other under its photo with its number', () => {
    const { container } = render(<ConditionReview view={view({ marks: [noBoxMark, boxMark] })} onChange={vi.fn()} />);
    expect(screen.getAllByTestId('photo-overlay')).toHaveLength(1);
    const unplaced = screen.getByTestId('unplaced-marks');
    expect(unplaced.textContent).toContain('1');
    expect(unplaced.textContent).toContain('Left mirror');
    expect(container.querySelectorAll('[data-testid="unplaced-marks"]')).toHaveLength(1);
  });

  it('saves no box by default (no circle in the middle of the photo)', async () => {
    render(<ConditionReview view={view()} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a mark by hand' }));
    fireEvent.change(screen.getByLabelText(/^Where on the item/), { target: { value: 'Seat' } });
    fireEvent.change(screen.getByLabelText(/^What you see/), { target: { value: 'Tear' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add mark' }));
    await waitFor(() => expect(api.updateMarks).toHaveBeenCalled());
    expect('box' in vi.mocked(api.updateMarks).mock.calls[0][1][0]).toBe(false);
  });

  it('saves the tapped place, measured against the picture', async () => {
    render(<ConditionReview view={view()} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a mark by hand' }));
    const picker = screen.getByTestId('box-picker');
    picker.querySelector('img')!.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 300, right: 500, bottom: 350, x: 100, y: 50, toJSON: () => ({}) });
    fireEvent.click(picker, { clientX: 300, clientY: 200, detail: 1 });
    expect(screen.getByTestId('picked-box')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Where on the item/), { target: { value: 'Seat' } });
    fireEvent.change(screen.getByLabelText(/^What you see/), { target: { value: 'Tear' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add mark' }));
    await waitFor(() => expect(api.updateMarks).toHaveBeenCalled());
    const box = vi.mocked(api.updateMarks).mock.calls[0][1][0].box;
    expect((box?.x ?? 0) + (box?.w ?? 0) / 2).toBeCloseTo(0.5);
    expect((box?.y ?? 0) + (box?.h ?? 0) / 2).toBeCloseTo(0.5);
  });

  it('"No box" takes the tapped place away again', async () => {
    render(<ConditionReview view={view()} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a mark by hand' }));
    fireEvent.click(screen.getByTestId('box-picker'), { detail: 0 });
    expect(screen.getByTestId('picked-box')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'No box' }));
    expect(screen.queryByTestId('picked-box')).toBeNull();
  });
});

describe('ConditionReview when the AI could not run', () => {
  const failed = () => view({ conditionAiFailed: true, itemDescription: '', conditionAi: { model: 'claude-opus-5-5', recorded: false } });

  it('says so, has no AI paragraph or AI label, and never claims the item looks clean', () => {
    const { container } = render(<ConditionReview view={failed()} onChange={vi.fn()} />);
    expect(screen.getByText(FAILED)).toBeTruthy();
    expect(screen.queryByText('The AI found no marks.')).toBeNull();
    expect(screen.queryByText(/AI-assisted/)).toBeNull();
    expect(container.querySelector('[data-ai-generated]')).toBeNull();
  });

  it('lets the shop add an existing mark by hand, saved through updateMarks on that side\'s pickup photo', async () => {
    const onChange = vi.fn();
    render(<ConditionReview view={failed()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a mark by hand' }));
    fireEvent.change(screen.getByLabelText(/^Side/), { target: { value: 'left' } });
    fireEvent.change(screen.getByLabelText(/^Where on the item/), { target: { value: 'Left mirror' } });
    fireEvent.change(screen.getByLabelText(/^What you see/), { target: { value: 'Chipped edge' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add mark' }));
    await waitFor(() => expect(api.updateMarks).toHaveBeenCalledTimes(1));
    const [id, marks] = vi.mocked(api.updateMarks).mock.calls[0];
    expect(id).toBe('h1');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ photoId: 'pre-left', location: 'Left mirror', note: 'Chipped edge' });
    expect(typeof marks[0].id).toBe('string');
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('keeps the marks that are already there when one is added', async () => {
    const existing = { id: 'm0', photoId: 'pre-front', location: 'Bumper', note: 'Scuff', box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } };
    render(<ConditionReview view={{ ...failed(), marks: [existing] }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a mark by hand' }));
    fireEvent.change(screen.getByLabelText(/^Where on the item/), { target: { value: 'Seat' } });
    fireEvent.change(screen.getByLabelText(/^What you see/), { target: { value: 'Tear' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add mark' }));
    await waitFor(() => expect(api.updateMarks).toHaveBeenCalled());
    expect(vi.mocked(api.updateMarks).mock.calls[0][1]).toHaveLength(2);
    expect(vi.mocked(api.updateMarks).mock.calls[0][1][0]).toEqual(existing);
  });
});

describe('ConditionReview before the condition is recorded', () => {
  it('puts the one primary action in the bottom action bar', () => {
    const { container } = render(<ConditionReview view={view({ itemDescription: null, conditionAi: null })} onChange={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Record condition' });
    expect(button.closest('.action-bar')).not.toBeNull();
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1);
  });
});
