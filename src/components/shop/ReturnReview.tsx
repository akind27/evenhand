'use client';
import { useState } from 'react';
import { PhotoPair } from '@/components/common/PhotoPair';
import { RecordedAiNote } from '@/components/common/RecordedAiNote';
import { ActionBar, ErrorLine, FieldLabel } from '@/components/doc/DocParts';
import { Stamp } from '@/components/doc/Stamp';
import { FindingCard } from '@/components/shop/FindingCard';
import { ManualFinding } from '@/components/shop/ManualFinding';
import { SHOP_HOLD_LOST, lostHold } from '@/components/shop/hold-lost';
import { action, errorMessage, type HandoverView } from '@/lib/client/api';
import { euro } from '@/lib/client/format';
import { computeCharge } from '@/lib/domain/settlement';
import { REQUIRED_ANGLES } from '@/lib/domain/types';

const ANGLE_NAME: Record<(typeof REQUIRED_ANGLES)[number], string> = { front: 'Front', back: 'Back', left: 'Left', right: 'Right' };

/** Pickup and return photo of each of the four angles, side by side. */
function BeforeAfterPairs({ view }: { view: HandoverView }) {
  return (
    <div className="mt-2 flex flex-col gap-4">
      {REQUIRED_ANGLES.map((angle) => (
        <PhotoPair
          key={angle}
          idPrefix={`pair-${angle}`}
          label={ANGLE_NAME[angle]}
          before={view.pickupPhotos.find((photo) => photo.angle === angle)}
          after={view.returnPhotos.find((photo) => photo.angle === angle)}
          captions={{ before: `${ANGLE_NAME[angle]} · Pickup`, after: `${ANGLE_NAME[angle]} · Return` }}
          demoNote="AI-generated demo photo"
        />
      ))}
    </div>
  );
}

interface ReturnReviewProps {
  view: HandoverView;
  onChange: () => void;
}

/** Return review: findings with photo pairs, the totals, and the one primary action. */
export function ReturnReview({ view, onChange }: ReturnReviewProps) {
  const [busy, setBusy] = useState(false);
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  // The hand-made finding form is open: the bottom bar then holds only its two buttons.
  const [adding, setAdding] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holdCents = view.hold?.amountCents ?? view.deposit?.amountCents ?? 0;
  const result = computeCharge(view.findings, view.priceList, holdCents);
  const undecided = view.findings.some((f) => f.status === 'proposed' || f.status === 'needsHuman');
  const confirmed = view.findings.some((f) => f.status === 'confirmed');
  const sentToRenter = view.status === 'chargeProposed';
  const disputed = view.status === 'disputed';
  const reviewing = view.status === 'reviewed';
  // A hold that ended outside the app can be neither released nor charged here (I4).
  const lost = lostHold(view);
  const lostLine = lost === null ? null : (
    <p role="status" className="mt-4 border-2 border-stamp-review px-3 py-2 font-semibold text-stamp-review">
      {SHOP_HOLD_LOST[lost].message}
    </p>
  );

  async function run(name: 'propose' | 'release') {
    setBusy(true);
    setError(null);
    try {
      await action(view.id, name);
      onChange();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      setConfirmingRelease(false);
    }
  }

  if (sentToRenter) {
    return (
      <section aria-labelledby="waiting" className="mt-6">
        <h2 id="waiting" className="text-xl font-bold">Waiting for the renter</h2>
        <FieldLabel en="Amount sent" el="Ποσό" />
        <p className="mono text-3xl font-medium">{euro(view.proposal?.chargeCents ?? 0)}</p>
        {lostLine ?? (
          <p className="mt-2 text-ink-soft">
            If the renter accepts, {euro(view.proposal?.chargeCents ?? 0)} is charged and {euro(view.proposal?.releaseCents ?? 0)} is released. Until then the full {euro(holdCents)} stays held.
          </p>
        )}
      </section>
    );
  }

  const unpricedIndex = view.findings.findIndex(
    (f) => f.status === 'confirmed' && !view.priceList.some((item) => item.id === f.priceItemId),
  );
  const unpriced = unpricedIndex >= 0 ? view.findings[unpricedIndex] : null;
  const blocker = undecided
    ? 'Confirm or dismiss every finding first'
    : unpriced
      ? `Finding ${unpricedIndex + 1} (${unpriced.location}) is confirmed but has no price`
      : null;

  return (
    <section aria-labelledby="review" className="mt-6">
      <h2 id="review" className="text-xl font-bold">Return review</h2>
      <RecordedAiNote answer={view.aiFailed ? null : view.comparisonAi} />
      {view.aiFailed ? (
        <p className="mt-2 text-stamp-review">The AI comparison was not available. Compare the photos yourself and add any damage by hand.</p>
      ) : null}
      {view.findings.length === 0 && !view.aiFailed ? <p className="mt-3">No new marks were found.</p> : null}
      {view.aiFailed ? (
        <section aria-labelledby="compare-yourself" className="mt-4">
          <h3 id="compare-yourself" className="font-bold">Compare the photos yourself</h3>
          <BeforeAfterPairs view={view} />
        </section>
      ) : (
        <details className="mt-4">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold underline">All before/after photos</summary>
          <BeforeAfterPairs view={view} />
        </details>
      )}
      <ul className="mt-3 list-none p-0">
        {view.findings.map((finding, index) => (
          <FindingCard key={finding.id} view={view} finding={finding} n={index + 1} locked={!reviewing} onChange={onChange} />
        ))}
      </ul>
      {reviewing && lost === null ? (
        <ManualFinding
          view={view}
          open={adding}
          onOpen={() => setAdding(true)}
          onClose={() => setAdding(false)}
          onBusy={setManualBusy}
          onChange={onChange}
        />
      ) : null}

      <div className="rule-top mt-6 pt-4" data-testid="total">
        <FieldLabel en="Confirmed total" el="Σύνολο" />
        <p className="mono text-3xl font-medium">{euro(result.totalCents)}</p>
        <p className="mono text-sm text-ink-soft">
          Hold {euro(holdCents)} · Charge {euro(result.chargeCents)} · Released {euro(result.releaseCents)}
        </p>
      </div>
      {result.exceedsHoldByCents > 0 ? (
        <p role="status" aria-label="Confirmed total is more than the hold" className="mt-3 border-2 border-stamp-review px-3 py-2 text-stamp-review">
          The confirmed total is {euro(result.exceedsHoldByCents)} more than the hold. At most {euro(holdCents)} can be charged.
        </p>
      ) : null}
      {disputed ? (
        <div className="mt-4">
          <Stamp kind="disputed" label="Disputed" />
          <p className="mt-2">The renter says: {view.dispute?.reason}</p>
        </div>
      ) : null}
      {lostLine}
      <ErrorLine message={error} />

      {adding && reviewing && lost === null ? (
        <ActionBar>
          <button type="submit" form="manual-finding" className="btn btn-primary" disabled={manualBusy}>
            Add finding
          </button>
          <button type="button" className="btn" disabled={manualBusy} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </ActionBar>
      ) : (reviewing || disputed) && lost === null ? (
        <ActionBar>
          {blocker ? <p className="text-center text-sm text-ink-soft">{blocker}</p> : null}
          {confirmed && reviewing ? (
            <button type="button" className="btn btn-primary" disabled={busy || blocker !== null} onClick={() => void run('propose')}>
              Send to renter for approval
            </button>
          ) : confirmingRelease ? (
            <>
              <p role="alert" className="text-center font-semibold">Give back the full {euro(holdCents)} to the renter?</p>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run('release')}>
                Yes, release
              </button>
              <button type="button" className="btn" onClick={() => setConfirmingRelease(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy || blocker !== null} onClick={() => setConfirmingRelease(true)}>
              Release deposit
            </button>
          )}
        </ActionBar>
      ) : null}
    </section>
  );
}
