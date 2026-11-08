'use client';
import { useRef, type MouseEvent } from 'react';
import type { Box } from '@/lib/domain/types';

/** The box a tap places, as fractions of the photo. */
const BOX_W = 0.2;
const BOX_H = 0.12;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** A box of about 20% by 12% centred on a tap (fractions of the photo), kept inside the photo. */
export function boxAround(fx: number, fy: number): Box {
  return {
    x: round4(clamp(fx - BOX_W / 2, 0, 1 - BOX_W)),
    y: round4(clamp(fy - BOX_H / 2, 0, 1 - BOX_H)),
    w: BOX_W,
    h: BOX_H,
  };
}

interface BoxPickerProps {
  photoUrl: string;
  box: Box | null;
  onChange: (box: Box | null) => void;
  /** The line above the photo. */
  prompt: string;
  /** What a screen reader hears on the photo button. */
  photoLabel: string;
  /** The line under the buttons, once a box is set / while none is. */
  hintWithBox: string;
  hintWithoutBox: string;
}

/**
 * Tap a photo to place a small box there. "No box" is the default and the way to take it away again;
 * a keyboard press, which has no pointer position, puts the box in the middle.
 */
export function BoxPicker({ photoUrl, box, onChange, prompt, photoLabel, hintWithBox, hintWithoutBox }: BoxPickerProps) {
  const image = useRef<HTMLImageElement>(null);

  function place(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail === 0) {
      onChange(boxAround(0.5, 0.5));
      return;
    }
    // Measure against the picture itself, not the padded button around it, so the box lands on the tapped spot.
    const rect = image.current?.getBoundingClientRect();
    if (rect === undefined || rect.width <= 0 || rect.height <= 0) {
      return;
    }
    onChange(boxAround((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height));
  }

  return (
    <div>
      <p className="field-label">{prompt}</p>
      <button
        type="button"
        data-testid="box-picker"
        aria-label={photoLabel}
        onClick={place}
        className="relative mt-1 block aspect-[4/3] w-full cursor-crosshair overflow-hidden border-0 bg-panel p-1.5"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- photos come from our own store with their own URLs */}
        <img ref={image} src={photoUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        <span className="pointer-events-none absolute inset-1.5">
          {box ? (
            <span
              data-testid="picked-box"
              className="absolute border-2 border-stamp-charged"
              style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
            />
          ) : null}
        </span>
      </button>
      <button type="button" className="btn mt-2" disabled={box === null} onClick={() => onChange(null)}>
        No box
      </button>
      <p className="text-sm text-ink-soft">{box ? hintWithBox : hintWithoutBox}</p>
    </div>
  );
}
