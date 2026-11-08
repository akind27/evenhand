'use client';
import { useId, useState } from 'react';

/** The first 12 characters of a SHA-256 fingerprint. A tap shows the whole value; printing always shows it. */
export function Fingerprint({ value, label }: { value: string; label: string }) {
  const [open, setOpen] = useState(false);
  const fullId = useId();
  return (
    <span className="block">
      <button
        type="button"
        className="mono inline-flex min-h-11 items-center gap-2 bg-transparent p-0 text-left text-sm text-ink underline decoration-rule underline-offset-4"
        aria-expanded={open}
        aria-controls={fullId}
        aria-label={`${label}: fingerprint ${value.slice(0, 12)}…, ${open ? 'hide' : 'show'} the full value`}
        title={value}
        onClick={() => setOpen((was) => !was)}
      >
        <span aria-hidden="true">{value.slice(0, 12)}…</span>
      </button>
      <span id={fullId} hidden={!open} className="fp-full mono block break-all text-xs text-ink-soft">
        {value}
      </span>
    </span>
  );
}
