'use client';
import { useState } from 'react';
import { ErrorLine, FieldLabel } from '@/components/doc/DocParts';
import { angleBilingual } from '@/components/shop/angle-labels';
import { BoxPicker } from '@/components/shop/BoxPicker';
import { addManualFinding, errorMessage, type HandoverView } from '@/lib/client/api';
import { euro } from '@/lib/client/format';
import type { Angle, Box } from '@/lib/domain/types';

export { boxAround } from '@/components/shop/BoxPicker';

const ANGLES: Angle[] = ['front', 'back', 'left', 'right', 'closeup'];

interface ManualFindingProps {
  view: HandoverView;
  /** The form is open. The page owns this, so it can swap the bottom bar while the form is open. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Tells the page while a save is under way, so the bar's button can wait. */
  onBusy: (busy: boolean) => void;
  onChange: () => void;
}

/** "Add damage by hand": a small form for something the AI did not list. Its two buttons live in the page's bottom bar. */
export function ManualFinding({ view, open, onOpen, onClose, onBusy, onChange }: ManualFindingProps) {
  const [angle, setAngle] = useState<Angle>('left');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [priceId, setPriceId] = useState(view.priceList[0]?.id ?? '');
  const [box, setBox] = useState<Box | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    onBusy(true);
    setError(null);
    try {
      await addManualFinding(view.id, { angle, location, description, priceItemId: priceId, ...(box ? { box } : {}) });
      setLocation('');
      setDescription('');
      setBox(null);
      onClose();
      onChange();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      onBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn mt-4" onClick={onOpen}>
        Add damage by hand
      </button>
    );
  }
  const returnPhoto = view.returnPhotos.find((photo) => photo.angle === angle);
  return (
    <form
      id="manual-finding"
      className="rule-top mt-4 flex flex-col gap-2 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="m-angle"><FieldLabel en="Side" el="Πλευρά" /></label>
      <select
        id="m-angle"
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
      {returnPhoto ? (
        <BoxPicker
          photoUrl={returnPhoto.url}
          box={box}
          onChange={setBox}
          prompt="Where is the damage? Tap the photo (optional)"
          photoLabel="Return photo. Press to mark the damage in the middle, or tap the place."
          hintWithBox="The box is drawn on the return photo."
          hintWithoutBox="Without a box, the whole photo is marked."
        />
      ) : null}
      <label htmlFor="m-loc"><FieldLabel en="Where on the item" el="Πού στο αντικείμενο" /></label>
      <input id="m-loc" className="input" required maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} />
      <label htmlFor="m-desc"><FieldLabel en="What you see" el="Τι βλέπετε" /></label>
      <input id="m-desc" className="input" required maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
      <label htmlFor="m-price"><FieldLabel en="Price item" el="Τιμή" /></label>
      <select id="m-price" className="input" value={priceId} onChange={(e) => setPriceId(e.target.value)}>
        {view.priceList.map((item) => (
          <option key={item.id} value={item.id}>{item.label} — {euro(item.amountCents)}</option>
        ))}
      </select>
      <ErrorLine message={error} />
    </form>
  );
}
