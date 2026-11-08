import { BeforeAfter, type BeforeAfterText } from '@/components/common/BeforeAfter';
import type { Box, PhotoRef } from '@/lib/domain/types';

interface PhotoPairProps {
  before?: PhotoRef;
  after?: PhotoRef;
  /** Where the new mark is, drawn on the return photo. */
  box?: Box;
  n?: number;
  label: string;
  /** Keeps ids unique when several pairs share a page. */
  idPrefix: string;
  /** Side labels. Default English. */
  captions?: { before: string; after: string };
  /** The slider's label, help line and spoken value. Default English. */
  text?: BeforeAfterText;
  /** Shown under a pair that has a photo from the demo set. */
  demoNote?: string;
  /** Texts for a missing photo. Default English. */
  missing?: { before: string; after: string };
}

/** The pickup photo and the return photo of one angle, full width, with a divider to compare them. The new mark is boxed on the return photo. */
export function PhotoPair({
  before,
  after,
  box,
  n,
  label,
  idPrefix,
  captions = { before: 'Pickup', after: 'Return' },
  text,
  demoNote,
  missing = { before: 'No pickup photo for this angle.', after: 'No return photo for this angle.' },
}: PhotoPairProps) {
  if (!before) {
    return <p className="text-sm text-ink-soft">{missing.before}</p>;
  }
  if (!after) {
    return <p className="text-sm text-ink-soft">{missing.after}</p>;
  }
  return (
    <BeforeAfter
      idPrefix={idPrefix}
      before={{ src: before.url, alt: `${label}, ${captions.before}`, sample: before.source === 'sample' }}
      after={{ src: after.url, alt: `${label}, ${captions.after}`, sample: after.source === 'sample' }}
      box={box}
      n={n}
      captions={captions}
      text={text}
      demoNote={demoNote}
    />
  );
}
