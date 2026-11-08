import type { ReactNode } from 'react';
import { Guilloche } from '@/components/doc/Guilloche';
import { greekUpper } from '@/lib/client/greek';

interface FieldLabelProps {
  en: string;
  /** Shop screens: the Greek line. Hidden from screen readers, it is decoration there. */
  el?: string;
  /** Renter screens: the label in the renter's own language, in `lang`. Read aloud, since the renter reads it. */
  local?: string;
  lang?: string;
}

/** A passport-style label: English, then a second language (Greek on shop screens, the renter's on renter screens). */
export function FieldLabel({ en, el, local, lang }: FieldLabelProps) {
  if (local !== undefined && lang !== undefined && lang !== 'en') {
    const shown = lang === 'el' ? greekUpper(local) : local.toLocaleUpperCase(lang);
    return (
      <span className="field-label">
        {en} <span lang={lang}>/ {shown}</span>
      </span>
    );
  }
  return (
    <span className="field-label">
      {en}
      {el !== undefined ? (
        <>
          {' '}
          <span lang="el" aria-hidden="true">/ {greekUpper(el)}</span>
        </>
      ) : null}
    </span>
  );
}

interface DocHeaderProps {
  seed: string;
  title: string;
  itemRef: string;
  stamp?: ReactNode;
  /** Replace the default English + Greek labels, e.g. with the renter's language. */
  itemLabel?: ReactNode;
  refLabel?: ReactNode;
}

/** Header of a document page: guilloche ground, item, reference and a status stamp. */
export function DocHeader({ seed, title, itemRef, stamp, itemLabel, refLabel }: DocHeaderProps) {
  return (
    <header className="relative overflow-hidden border-b-2 border-ink bg-panel px-4 pb-4 pt-5">
      <Guilloche seed={seed} />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-full flex-1 basis-40">
          {itemLabel ?? <FieldLabel en="Item" el="Αντικείμενο" />}
          <h1 className="text-2xl font-bold leading-tight text-balance">{title}</h1>
          <div className="mt-2">
            {refLabel ?? <FieldLabel en="Reference" el="Κωδικός" />}
            <p className="mono break-all text-lg font-medium">{itemRef}</p>
          </div>
        </div>
        {stamp ? <div className="max-w-full pt-1">{stamp}</div> : null}
      </div>
    </header>
  );
}

/** The pinned bottom bar that holds the one primary action. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="action-bar">
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mt-3 border-2 border-stamp-charged px-3 py-2 text-stamp-charged">
      {message}
    </p>
  ) : null;
}
