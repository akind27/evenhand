import type { Angle } from '@/lib/domain/types';

/** Photo sides, written like the rest of a shop screen: English first, Greek second. */
const EN: Record<Angle, string> = { front: 'Front', back: 'Back', left: 'Left', right: 'Right', closeup: 'Close-up' };
const EL: Record<Angle, string> = { front: 'Μπροστά', back: 'Πίσω', left: 'Αριστερά', right: 'Δεξιά', closeup: 'Κοντινή' };

export function angleEn(angle: Angle): string {
  return EN[angle];
}

/** "Left / Αριστερά": for option lists, where markup is not possible. */
export function angleBilingual(angle: Angle): string {
  return `${EN[angle]} / ${EL[angle]}`;
}
