// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeforeAfter, coversWholePhoto } from '@/components/common/BeforeAfter';
import { PhotoPair } from '@/components/common/PhotoPair';
import type { PhotoRef } from '@/lib/domain/types';

afterEach(cleanup);

const before = { src: '/b.jpg', alt: 'Left, pickup' };
const after = { src: '/a.jpg', alt: 'Left, return' };

describe('BeforeAfter', () => {
  it('starts at the middle and tells a screen reader what the position shows', () => {
    render(<BeforeAfter before={before} after={after} idPrefix="t" />);
    const slider = screen.getByLabelText('Compare pickup and return') as HTMLInputElement;
    expect(slider.value).toBe('50');
    expect(slider.getAttribute('aria-valuetext')).toBe('50 percent pickup photo on the left, 50 percent return photo on the right');
  });

  it('keeps ids unique when two comparisons share a page', () => {
    render(
      <>
        <BeforeAfter before={before} after={after} idPrefix="finding-1" />
        <BeforeAfter before={before} after={after} idPrefix="finding-2" />
      </>,
    );
    const ids = screen.getAllByLabelText('Compare pickup and return').map((el) => el.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toContain('finding-1');
    expect(ids[1]).toContain('finding-2');
  });

  it('draws the box on the return photo with its number', () => {
    render(<BeforeAfter before={before} after={after} box={{ x: 0.6, y: 0.5, w: 0.2, h: 0.1 }} n={2} idPrefix="t" />);
    const box = screen.getByTestId('proof-box');
    expect(box.style.left).toBe('60%');
    expect(box.textContent).toBe('2');
  });

  it('skips the box when it covers 90 percent or more of the photo, keeps it below', () => {
    expect(coversWholePhoto({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(coversWholePhoto({ x: 0.02, y: 0.02, w: 0.96, h: 0.96 })).toBe(true);
    expect(coversWholePhoto({ x: 0, y: 0, w: 0.9, h: 0.9 })).toBe(false);
    render(<BeforeAfter before={before} after={after} box={{ x: 0, y: 0, w: 1, h: 1 }} idPrefix="t" />);
    expect(screen.queryByTestId('proof-box')).toBeNull();
  });

  it('labels a demo photo, and only then', () => {
    const { rerender } = render(<BeforeAfter before={before} after={after} idPrefix="t" />);
    expect(screen.queryByText('AI-generated demo photo')).toBeNull();
    rerender(<BeforeAfter before={{ ...before, sample: true }} after={{ ...after, sample: true }} idPrefix="t" />);
    expect(screen.getAllByText('AI-generated demo photo')).toHaveLength(1);
    rerender(<BeforeAfter before={{ ...before, sample: true }} after={after} demoNote="Foto de demostración" idPrefix="t" />);
    expect(screen.getByText('Foto de demostración')).toBeTruthy();
  });

  it('hides a side label when the divider is within 15 percent of its edge', () => {
    render(<BeforeAfter before={before} after={after} idPrefix="t" />);
    expect(screen.getByText('Pickup')).toBeTruthy();
    expect(screen.getByText('Return')).toBeTruthy();
    const slider = screen.getByLabelText('Compare pickup and return');
    fireEvent.change(slider, { target: { value: '10' } });
    expect(screen.queryByText('Pickup')).toBeNull();
    expect(screen.getByText('Return')).toBeTruthy();
    fireEvent.change(slider, { target: { value: '90' } });
    expect(screen.getByText('Pickup')).toBeTruthy();
    expect(screen.queryByText('Return')).toBeNull();
  });

  it('tells the page when the divider moves', () => {
    const onPosition = vi.fn();
    render(<BeforeAfter before={before} after={after} idPrefix="t" onPosition={onPosition} />);
    fireEvent.change(screen.getByLabelText('Compare pickup and return'), { target: { value: '30' } });
    expect(onPosition).toHaveBeenCalledWith(30);
  });

  it('takes its words from the caller, for a renter who reads another language', () => {
    render(
      <BeforeAfter
        before={before}
        after={after}
        idPrefix="t"
        captions={{ before: 'Abholung', after: 'Rückgabe' }}
        text={{ slider: 'Abholung und Rückgabe vergleichen', hint: 'Ziehen Sie die Trennlinie', value: (a, b) => `${a} Prozent Abholung, ${b} Prozent Rückgabe` }}
      />,
    );
    const slider = screen.getByLabelText('Abholung und Rückgabe vergleichen');
    expect(slider.getAttribute('aria-valuetext')).toBe('50 Prozent Abholung, 50 Prozent Rückgabe');
    expect(screen.getByText('Abholung')).toBeTruthy();
  });
});

describe('PhotoPair', () => {
  const photo = (id: string, source: PhotoRef['source']): PhotoRef => ({ id, phase: 'pickup', angle: 'left', url: `/${id}.jpg`, sha256: 'a'.repeat(64), takenAt: '2026-11-08T10:00:00Z', source });

  it('shows one full-width comparison for a pair and keeps the demo label on demo photos', () => {
    render(<PhotoPair idPrefix="f1" label="left side panel" before={photo('b', 'sample')} after={photo('a', 'sample')} demoNote="AI-generated demo photo" />);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
    expect(screen.getByText('AI-generated demo photo')).toBeTruthy();
  });

  it('says which photo is missing instead of drawing a comparison', () => {
    render(<PhotoPair idPrefix="f1" label="left" before={undefined} after={photo('a', 'camera')} />);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText('No pickup photo for this angle.')).toBeTruthy();
  });
});
