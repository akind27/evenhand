'use client';
import { useState } from 'react';
import { AiLabel } from '@/components/common/AiLabel';
import { PhotoPair } from '@/components/common/PhotoPair';
import { ErrorLine, FieldLabel } from '@/components/doc/DocParts';
import { errorMessage, updateFinding, type HandoverView } from '@/lib/client/api';
import { euro } from '@/lib/client/format';
import { aiTextMark } from '@/lib/ai/model';
import type { Finding, FindingStatus } from '@/lib/domain/types';

const CHIP: Record<FindingStatus, { text: string; color: string }> = {
  proposed: { text: 'AI proposed', color: 'var(--stamp-hold)' },
  needsHuman: { text: 'Needs a human look', color: 'var(--stamp-review)' },
  confirmed: { text: 'Confirmed', color: 'var(--stamp-charged)' },
  dismissed: { text: 'Dismissed', color: 'var(--ink-soft)' },
};

interface FindingCardProps {
  view: HandoverView;
  finding: Finding;
  n: number;
  locked: boolean;
  onChange: () => void;
}

/** One finding: the two photos with the new mark boxed, a status chip, a price item and the two decisions. */
export function FindingCard({ view, finding, n, locked, onChange }: FindingCardProps) {
  const [priceId, setPriceId] = useState(finding.priceItemId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const before = view.pickupPhotos.find((p) => p.id === finding.beforePhotoId);
  const after = view.returnPhotos.find((p) => p.id === finding.afterPhotoId);
  const chip = CHIP[finding.status];

  async function decide(status: 'confirmed' | 'dismissed') {
    setBusy(true);
    setError(null);
    try {
      if (status === 'confirmed' && priceId === '') {
        setError('Choose a price first.');
        return;
      }
      await updateFinding(view.id, finding.id, { status, priceItemId: status === 'confirmed' ? priceId : null });
      onChange();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rule-top py-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-bold">
          <span className="mono mr-2 text-stamp-charged">{n}</span>
          {finding.location}
        </h3>
        <span className="border-2 px-2 py-0.5 text-xs font-bold uppercase tracking-widest" style={{ borderColor: chip.color, color: chip.color }}>
          {chip.text}
        </span>
      </div>
      <PhotoPair idPrefix={`finding-${finding.id}`} before={before} after={after} box={finding.box} n={n} label={finding.location} demoNote="AI-generated demo photo" />
      <p className="mt-2" {...(finding.source === 'ai' ? aiTextMark(view.comparisonAi?.model) : {})}>{finding.description}</p>
      {finding.source === 'ai' ? <AiLabel /> : <p className="text-sm text-ink-soft">Added by the shop.</p>}
      {locked ? (
        finding.priceItemId ? <p className="mono mt-1 text-sm">{view.priceList.find((i) => i.id === finding.priceItemId)?.label}</p> : null
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={`price-${finding.id}`}>
            <FieldLabel en="Price item" el="Τιμή" />
          </label>
          <select id={`price-${finding.id}`} className="input" value={priceId} onChange={(e) => setPriceId(e.target.value)}>
            <option value="">Choose a price</option>
            {view.priceList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} — {euro(item.amountCents)}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn" aria-pressed={finding.status === 'confirmed'} disabled={busy || priceId === ''} onClick={() => void decide('confirmed')}>
              Confirm
            </button>
            <button type="button" className="btn" aria-pressed={finding.status === 'dismissed'} disabled={busy} onClick={() => void decide('dismissed')}>
              Dismiss
            </button>
          </div>
          {priceId === '' ? <p className="text-sm text-ink-soft">Choose a price first</p> : null}
        </div>
      )}
      <ErrorLine message={error} />
    </li>
  );
}
