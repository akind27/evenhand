import type { PhotoOverlay } from '@/components/doc/PhotoWindow';
import type { ExistingMark } from '@/lib/domain/types';

export interface NumberedMark {
  mark: ExistingMark;
  n: number;
}

/** Every mark keeps its number across the whole record, whichever photo it sits on. */
export function numberMarks(marks: ExistingMark[]): NumberedMark[] {
  return marks.map((mark, index) => ({ mark, n: index + 1 }));
}

/** The numbered circles for one photo. A mark saved with no box gets no circle. */
export function markOverlays(numbered: NumberedMark[], photoId: string): PhotoOverlay[] {
  return numbered.flatMap(({ mark, n }): PhotoOverlay[] =>
    mark.photoId === photoId && mark.box !== undefined ? [{ box: mark.box, n, tone: 'existing', shape: 'circle' }] : [],
  );
}

/** The marks of one photo that have no circle, listed under it with their numbers. */
export function UnplacedMarks({ numbered, photoId }: { numbered: NumberedMark[]; photoId: string }) {
  const here = numbered.filter(({ mark }) => mark.photoId === photoId && mark.box === undefined);
  if (here.length === 0) {
    return null;
  }
  return (
    <ul className="m-0 mt-1 list-none p-0 text-sm" data-testid="unplaced-marks">
      {here.map(({ mark, n }) => (
        <li key={mark.id} lang="en">
          <span className="mono mr-2 font-medium">{n}</span>
          {mark.location}
        </li>
      ))}
    </ul>
  );
}
