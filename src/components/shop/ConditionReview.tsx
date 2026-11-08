'use client';
import { useState } from 'react';
import { AiLabel } from '@/components/common/AiLabel';
import { RecordedAiNote } from '@/components/common/RecordedAiNote';
import { ActionBar, ErrorLine, FieldLabel } from '@/components/doc/DocParts';
import { UnplacedMarks, markOverlays, numberMarks } from '@/components/doc/marks';
import { PhotoWindow } from '@/components/doc/PhotoWindow';
import { angleBilingual, angleEn } from '@/components/shop/angle-labels';
import { BoxPicker } from '@/components/shop/BoxPicker';
import { aiTextMark } from '@/lib/ai/model';
import { action, errorMessage, updateMarks, type HandoverView } from '@/lib/client/api';
import type { Angle, Box } from '@/lib/domain/types';

const ANGLES: Angle[] = ['front', 'back', 'left', 'right'];

/** "Add a mark by hand": for existing damage the AI did not list, or when the AI could not run. The shop may tap the spot; with no tap the mark has no circle. */
function ManualMark({ view, busy, run }: { view: HandoverView; busy: boolean; run: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [angle, setAngle] = useState<Angle>('front');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [box, setBox] = useState<Box | null>(null);

  if (!open) {
    return (
      <button type="button" className="btn mt-3" onClick={() => setOpen(true)}>
        Add a mark by hand
      </button>
    );
  }
  const photo = view.pickupPhotos.find((p) => p.angle === angle);

  async function submit() {
    if (photo === undefined) {
      return;
    }
    const mark = { id: crypto.randomUUID(), photoId: photo.id, location: location.trim(), note: note.trim(), ...(box ? { box } : {}) };
    const saved = await run(() => updateMarks(view.id, [...view.marks, mark]));
    if (saved) {
      setOpen(false);
      setLocation('');
      setNote('');
      setBox(null);
    }
  }

  return (
    <form
      className="rule-top mt-4 flex flex-col gap-2 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="mark-angle"><FieldLabel en="Side" el="Πλευρά" /></label>
      <select
        id="mark-angle"
        className="input"
        value={angle}
        onChange={(e) => {
          setAngle(e.target.value as Angle);
          setBox(null);
        }}
      >
        {ANGLES.map((a) => (
          <option key={a} value={a}>{angleBilingual(a)}</option>
        ))}
      </select>
      {photo ? (
        <BoxPicker
          photoUrl={photo.url}
          box={box}
          onChange={setBox}
          prompt="Where is the mark? Tap the photo (optional)"
          photoLabel="Pickup photo. Press to mark the place in the middle, or tap the place."
          hintWithBox="A numbered circle is drawn on the pickup photo."
          hintWithoutBox="Without a box, the mark is listed under the photo and no circle is drawn."
        />
      ) : null}
      <label htmlFor="mark-loc"><FieldLabel en="Where on the item" el="Πού στο αντικείμενο" /></label>
      <input id="mark-loc" className="input" required maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} />
      <label htmlFor="mark-note"><FieldLabel en="What you see" el="Τι βλέπετε" /></label>
      <input id="mark-note" className="input" required maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <button type="submit" className="btn" disabled={busy || photo === undefined}>Add mark</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

/** Runs the AI condition record and shows the marks it found on the pickup photos. */
export function ConditionReview({ view, onChange }: { view: HandoverView; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = view.status === 'draft';

  async function run(work: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await work();
      onChange();
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (view.itemDescription === null) {
    return (
      <div>
        <p>The AI looks at the four photos and lists marks that are already there.</p>
        <ErrorLine message={error} />
        <ActionBar>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => action(view.id, 'condition'))}>
            {busy ? 'Reading the photos…' : 'Record condition'}
          </button>
        </ActionBar>
      </div>
    );
  }

  const aiRan = !view.conditionAiFailed;
  const numbered = numberMarks(view.marks);
  return (
    <div>
      {aiRan ? (
        <>
          <p {...aiTextMark(view.conditionAi?.model)}>{view.itemDescription}</p>
          <AiLabel />
          <RecordedAiNote answer={view.conditionAi} />
        </>
      ) : (
        <p className="font-semibold text-stamp-review">The AI check could not run. Look at the four photos and add any marks that are already there.</p>
      )}
      {view.pickupPhotos.map((photo) => {
        const here = numbered.filter((entry) => entry.mark.photoId === photo.id);
        return (
          <div key={photo.id} className="mt-4 max-w-sm">
            <PhotoWindow
              src={photo.url}
              alt={`${angleEn(photo.angle)} photo at pickup`}
              caption={`${angleBilingual(photo.angle)} — ${here.length} existing ${here.length === 1 ? 'mark' : 'marks'}`}
              overlays={markOverlays(numbered, photo.id)}
            />
            <UnplacedMarks numbered={numbered} photoId={photo.id} />
          </div>
        );
      })}
      {numbered.length === 0 && aiRan ? <p className="mt-3">The AI found no marks.</p> : null}
      <ul className="mt-3 list-none p-0">
        {numbered.map(({ mark, n }) => (
          <li key={mark.id} className="rule-top flex items-center justify-between gap-3 py-2">
            <span>
              <span className="mono mr-2 font-medium">{n}</span>
              {mark.location}: {mark.note}
            </span>
            {editable ? (
              <button
                type="button"
                className="btn shrink-0"
                disabled={busy}
                aria-label={`Remove mark ${n}`}
                onClick={() => void run(() => updateMarks(view.id, view.marks.filter((m) => m.id !== mark.id)))}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? <ManualMark view={view} busy={busy} run={run} /> : null}
      <ErrorLine message={error} />
    </div>
  );
}
