import type { ReactNode } from 'react';

export type StampKind = 'held' | 'released' | 'charged' | 'disputed' | 'review' | 'demo';

const TONE: Record<StampKind, string> = {
  held: 'var(--stamp-hold)',
  released: 'var(--stamp-released)',
  charged: 'var(--stamp-charged)',
  disputed: 'var(--stamp-review)',
  review: 'var(--stamp-review)',
  demo: 'var(--stamp-review)',
};

const STAMP_TIME = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

/**
 * Local time with a short zone name, e.g. "08 NOV 2026, 12:15 GMT+2". The record timeline uses the same clock.
 * Stamps appear only after data loads in the browser, so server and browser never have to print the same text.
 */
export function stampDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : STAMP_TIME.format(date).toUpperCase();
}

/** A turn between -4 and 4 degrees that depends only on the label. */
function tilt(label: string): number {
  let sum = 0;
  for (const ch of label) {
    sum = (sum * 31 + ch.charCodeAt(0)) % 9973;
  }
  return (sum % 81) / 10 - 4;
}

interface StampProps {
  kind: StampKind;
  label: string;
  /** ISO time of the event the stamp records. */
  at?: string;
  round?: boolean;
  /** Plays the landing motion when the stamp appears. */
  land?: boolean;
}

/** A word this long does not fit the small round stamp, so it gets the wider one. */
const LONG_WORD = 9;

/** The label with a break opportunity after each hyphen, so DEMO-MODUS wraps only there. */
function breakable(label: string): ReactNode[] {
  return label.split(/(?<=-)/).flatMap((part, index) => (index === 0 ? [part] : [<wbr key={index} />, part]));
}

/** A visa-style status stamp. Always carries words, never colour alone. */
export function Stamp({ kind, label, at, round = false, land = false }: StampProps) {
  const when = at ? stampDate(at) : '';
  const wide = round && Math.max(...label.split(/[\s-]+/).map((word) => word.length)) >= LONG_WORD;
  return (
    <div
      role="img"
      aria-label={when ? `${label}, ${when}` : label}
      className={`stamp ${round ? 'stamp-round' : ''} ${wide ? 'stamp-round-wide' : ''} ${land ? 'stamp-land' : ''}`}
      style={{ color: TONE[kind], transform: `rotate(${tilt(label)}deg)` }}
    >
      <span aria-hidden="true" className={round ? 'text-[0.8125rem]' : 'text-base'}>
        {breakable(label)}
      </span>
      {when ? (
        <span aria-hidden="true" className="mono text-[0.625rem] font-medium tracking-normal">
          {when}
        </span>
      ) : null}
    </div>
  );
}
