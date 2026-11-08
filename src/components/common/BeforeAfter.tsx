'use client';
import { useId, useState, type ReactNode } from 'react';
import type { Box } from '@/lib/domain/types';

export interface BeforeAfterPhoto {
  src: string;
  alt: string;
  /** A bundled AI-generated demo photo: it always carries the "AI-generated demo photo" label. */
  sample?: boolean;
}

export interface BeforeAfterText {
  /** The visible label of the slider. */
  slider: string;
  /** One line of help under it. */
  hint: string;
  /** What a screen reader hears for a divider position (percent of the pickup photo shown). */
  value: (pickupPercent: number, returnPercent: number) => string;
}

const ENGLISH: BeforeAfterText = {
  slider: 'Compare pickup and return',
  hint: 'Drag the divider or use the arrow keys',
  value: (pickup, ret) => `${pickup} percent pickup photo on the left, ${ret} percent return photo on the right`,
};

/** A box that covers almost the whole photo marks nothing in particular: it is not drawn. */
export const WHOLE_PHOTO_AREA = 0.9;

export function coversWholePhoto(box: Box): boolean {
  return box.w * box.h >= WHOLE_PHOTO_AREA;
}

/** The side labels hide when the divider is this close to their edge, so it never cuts through them. */
const LABEL_HIDE_BELOW = 15;

const CORNERS = ['left-0 top-0 border-l-2 border-t-2', 'right-0 top-0 border-r-2 border-t-2', 'bottom-0 left-0 border-b-2 border-l-2', 'bottom-0 right-0 border-b-2 border-r-2'] as const;

interface BeforeAfterProps {
  before: BeforeAfterPhoto;
  after: BeforeAfterPhoto;
  /** Where the new mark is on the return photo, as fractions of the photo. Not drawn when it covers 90% or more. */
  box?: Box;
  /** The number shown on the box. */
  n?: number;
  /** Keeps the slider's id unique when several comparisons share a page. */
  idPrefix: string;
  /** Text on the two side labels. Default: Pickup and Return. */
  captions?: { before: string; after: string };
  text?: BeforeAfterText;
  /** Text under the photos when one of them is a bundled demo photo. */
  demoNote?: string;
  /** Where the divider starts, in percent. Default 50. */
  initial?: number;
  /** Told whenever the divider moves, e.g. to reveal something once the box has been uncovered. */
  onPosition?: (position: number) => void;
  /** Drawn inside the photo frame, above the photos. */
  overlay?: ReactNode;
  /** Shown under the slider help line. */
  children?: ReactNode;
}

/** The pickup photo and the return photo of the same item, one over the other, with a draggable divider. */
export function BeforeAfter({
  before,
  after,
  box,
  n,
  idPrefix,
  captions = { before: 'Pickup', after: 'Return' },
  text = ENGLISH,
  demoNote = 'AI-generated demo photo',
  initial = 50,
  onPosition,
  overlay,
  children,
}: BeforeAfterProps) {
  const reactId = useId();
  const sliderId = `${idPrefix}-slider-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [position, setPosition] = useState(initial);
  const drawnBox = box !== undefined && !coversWholePhoto(box) ? box : null;

  function move(next: number) {
    setPosition(next);
    onPosition?.(next);
  }

  return (
    <figure className="m-0">
      <div className="relative aspect-[4/3] select-none overflow-hidden bg-panel p-1.5">
        <div className="relative h-full w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- photos come from our own store with their own URLs */}
          <img src={before.src} alt={before.alt} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- photos come from our own store with their own URLs */}
            <img src={after.src} alt={after.alt} className="h-full w-full object-cover" draggable={false} />
            {drawnBox ? (
              <span
                aria-hidden="true"
                data-testid="proof-box"
                className="absolute border-2 border-stamp-charged"
                style={{ left: `${drawnBox.x * 100}%`, top: `${drawnBox.y * 100}%`, width: `${drawnBox.w * 100}%`, height: `${drawnBox.h * 100}%` }}
              >
                {n === undefined ? null : <span className="mono absolute -top-5 left-0 bg-paper px-1 text-[0.6875rem] font-medium text-stamp-charged">{n}</span>}
              </span>
            ) : null}
          </div>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={position}
            aria-valuetext={text.value(position, 100 - position)}
            onChange={(event) => move(Number(event.target.value))}
            className="peer absolute inset-0 z-10 h-full w-full cursor-ew-resize opacity-0 [touch-action:pan-y]"
          />
          {position >= LABEL_HIDE_BELOW ? (
            <span className="mono pointer-events-none absolute left-2 top-2 bg-paper px-1.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wider">{captions.before}</span>
          ) : null}
          {position <= 100 - LABEL_HIDE_BELOW ? (
            <span className="mono pointer-events-none absolute right-2 top-2 bg-paper px-1.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wider">{captions.after}</span>
          ) : null}
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-paper shadow-[0_0_0_1px_var(--ink)]" style={{ left: `${position}%` }} />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-ink bg-paper text-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-guilloche-violet"
            style={{ left: `${position}%` }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
            </svg>
          </span>
          {overlay}
        </div>
        {CORNERS.map((corner) => (
          <span key={corner} aria-hidden="true" className={`tick ${corner}`} />
        ))}
      </div>
      <label htmlFor={sliderId} className="field-label mt-3">
        {text.slider}
      </label>
      <p className="text-sm text-ink-soft" aria-hidden="true">
        {text.hint}
      </p>
      {before.sample || after.sample ? <p className="text-sm text-ink-soft">{demoNote}</p> : null}
      {children}
    </figure>
  );
}
