'use client';
import { useState } from 'react';
import { AiLabel } from '@/components/common/AiLabel';
import { BeforeAfter } from '@/components/common/BeforeAfter';
import { Stamp } from '@/components/doc/Stamp';
import { euro } from '@/lib/client/format';
import { seedPriceList } from '@/lib/demo/seed';

const PICKUP = '/demo/scooter-a/pickup/left.jpg';
const RETURN = '/demo/scooter-a/return-damaged/left.jpg';
/** Where the new scratch is on the return photo, as fractions of its width and height. Placed by hand for this example. */
const BOX = { x: 0.6, y: 0.56, w: 0.24, h: 0.1 };

/** The shop's price line the AI matches the scratch to, from the demo price list. */
const SCRATCH = seedPriceList().find((item) => item.id === 'scratch-panel');
const price = SCRATCH ? euro(SCRATCH.amountCents) : '';

/**
 * The return photo shows to the right of the divider. The box counts as uncovered while the divider is
 * still left of the box's middle; once the divider passes it, the box is mostly hidden.
 */
export function boxUncovered(position: number, box: { x: number; w: number }): boolean {
  return position < (box.x + box.w / 2) * 100;
}

/**
 * The hero: the pickup photo and the return photo of the same scooter, with a draggable divider.
 * It opens in the middle, so the scratch, its box and the charge stamp are in view from the first moment.
 * The stamp goes away when the divider covers the box, so it never stamps a mark the visitor cannot see.
 * (Under reduced motion the stamp simply appears and disappears: its landing animation is switched off in the styles.)
 */
export function LandingBeforeAfter() {
  const [position, setPosition] = useState(50);
  return (
    <BeforeAfter
      idPrefix="hero"
      before={{ src: PICKUP, alt: 'The demo scooter, left side, at pickup: no marks on the rear side panel.', sample: true }}
      after={{ src: RETURN, alt: 'The same scooter at return: a new scratch on the rear side panel, marked with a red box.', sample: true }}
      box={BOX}
      n={1}
      onPosition={setPosition}
      overlay={
        boxUncovered(position, BOX) ? (
          <div className="pointer-events-none absolute bottom-3 right-3 bg-paper/90 p-1">
            <Stamp kind="charged" label={`Charged ${price}`} land />
          </div>
        ) : null
      }
    >
      <p role="status" className="sr-only">
        {`New mark revealed: scratch on the rear side panel. Example charge ${price}.`}
      </p>
      <div className="mt-3 max-w-prose">
        <p className="font-semibold">Example: new since pickup, a scratch on the rear side panel</p>
        <p className="text-sm">
          Price list: {SCRATCH?.label ?? 'Scratch'} <span className="mono">{price}</span>
        </p>
        <div className="mt-1">
          <AiLabel />
        </div>
      </div>
    </BeforeAfter>
  );
}
