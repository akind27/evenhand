'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { DemoBadge } from '@/components/common/DemoBadge';
import { StatusBadge, statusLabel } from '@/components/common/StatusBadge';
import { ActionBar, DocHeader, ErrorLine, FieldLabel } from '@/components/doc/DocParts';
import { MachineStrip } from '@/components/doc/MachineStrip';
import { Stamp } from '@/components/doc/Stamp';
import { ConditionReview } from '@/components/shop/ConditionReview';
import { DepositPicker } from '@/components/shop/DepositPicker';
import { GuidedCapture, type SampleSet } from '@/components/shop/GuidedCapture';
import { ReturnReview } from '@/components/shop/ReturnReview';
import { ShareQr } from '@/components/shop/ShareQr';
import { SHOP_HOLD_LOST, lostHold } from '@/components/shop/hold-lost';
import { action, errorMessage, type HandoverView } from '@/lib/client/api';
import { pollingDone } from '@/lib/client/polling-done';
import { euro } from '@/lib/client/format';
import { usePolling } from '@/lib/client/use-polling';
import { REQUIRED_ANGLES, type HandoverStatus, type Phase, type PhotoRef } from '@/lib/domain/types';
import type { PhotoCheck } from '@/lib/domain/state';

function Section({ id, en, el, children }: { id?: string; en: string; el: string; children: ReactNode }) {
  return (
    <section id={id} className="section-label">
      <div className="rule-top pt-3">
        <FieldLabel en={en} el={el} />
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function allAccepted(photos: PhotoRef[], checks: Record<string, PhotoCheck>): boolean {
  return REQUIRED_ANGLES.every((angle) => {
    const photo = photos.find((p) => p.angle === angle);
    const check = photo ? checks[photo.id] : undefined;
    return check !== undefined && (check.usable || check.overridden);
  });
}

/**
 * The renter link stays one tap away in every unsettled state (Ruling R38), for a renter who closed the page.
 * While waiting for the renter the QR is the main step already; once settled there is nothing left to do.
 */
function showLinkAgain(status: HandoverStatus): boolean {
  return !['draft', 'awaitingRenter', 'released', 'charged', 'closed'].includes(status);
}

/** Statuses in which the settled stamp already exists, so a page opened in them does not replay the landing. */
const SETTLED_STATUSES: readonly HandoverStatus[] = ['released', 'charged', 'closed', 'disputed'];

/** These statuses have a header stamp that says the same thing as the status chip, so the chip is left out. */
const STAMPED_STATUSES: readonly HandoverStatus[] = ['active', 'released', 'charged', 'closed', 'disputed'];

function headerStamp(view: HandoverView, land: boolean): ReactNode {
  const lost = lostHold(view);
  if (lost !== null) {
    // The money is no longer held: never show "Held" (I4).
    return <Stamp kind="review" label={SHOP_HOLD_LOST[lost].stamp} />;
  }
  switch (view.status) {
    case 'active':
    case 'returning':
    case 'reviewed':
      return <Stamp kind="held" label="Held" />;
    case 'released':
      return <Stamp kind="released" label="Released" land={land} />;
    case 'closed':
    case 'charged':
      if (view.settlement?.kind !== 'charged') {
        return <Stamp kind="released" label="Released" land={land} />;
      }
      return <Stamp kind="charged" label={`Charged ${euro(view.settlement.chargeCents)}`} land={land} />;
    case 'disputed':
      return <Stamp kind="disputed" label="Disputed" />;
    default:
      return null;
  }
}

/** One handover, step by step, as a document page. */
export function HandoverScreen({ shopId, id }: { shopId: string; id: string }) {
  // Every 4 seconds; once released or charged nothing can change, so the polling stops (I7).
  const { data, error: loadError, refresh } = usePolling<{ handover: HandoverView }>(`/api/handovers/${encodeURIComponent(id)}`, {
    intervalMs: 4000,
    stopWhen: pollingDone,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returnSet, setReturnSet] = useState<SampleSet>('return-damaged');
  // The first status this page saw: a settled stamp lands only if the page watched the change (like the renter's page).
  const [firstStatus, setFirstStatus] = useState<HandoverStatus | null>(null);
  const view = data?.handover ?? null;
  useEffect(() => {
    if (view !== null && firstStatus === null) {
      setFirstStatus(view.status);
    }
  }, [view, firstStatus]);
  const settledLands = firstStatus !== null && !SETTLED_STATUSES.includes(firstStatus);

  async function run(name: string, label: string) {
    setBusy(label);
    setError(null);
    try {
      await action(id, name);
      await refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  }

  const back = (
    <Link href={`/shop/${shopId}`} className="inline-flex min-h-11 items-center underline">
      All handovers
    </Link>
  );
  if (view === null) {
    return (
      <main className="doc-page">
        {back}
        <p className="mt-4" role={loadError ? 'alert' : 'status'}>{loadError ?? 'Loading the handover…'}</p>
      </main>
    );
  }

  const photosOk = allAccepted(view.pickupPhotos, view.photoChecks);
  const returnOk = allAccepted(view.returnPhotos, view.photoChecks);
  const draft = view.status === 'draft';
  const lost = lostHold(view);
  const inReview = ['reviewed', 'chargeProposed', 'disputed'].includes(view.status);
  const readyToShare = draft && photosOk && view.itemDescription !== null && view.deposit !== null;
  const phase: Phase = draft ? 'pickup' : 'return';

  return (
    <main className="doc-page">
      <div className="mb-3">{back}</div>
      <DocHeader
        seed={view.id}
        title={view.itemType}
        itemRef={view.itemRef}
        stamp={
          <div className="flex flex-wrap items-start justify-end gap-2">
            {headerStamp(view, settledLands)}
            <DemoBadge />
          </div>
        }
      />

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <FieldLabel en="Deposit" el="Εγγύηση" />
          {view.deposit ? (
            <p className="mono text-4xl font-medium">{euro(view.deposit.amountCents)}</p>
          ) : (
            <p className="text-2xl text-ink-soft">Not set</p>
          )}
        </div>
        {STAMPED_STATUSES.includes(view.status) ? null : <StatusBadge status={view.status} />}
      </div>
      <ErrorLine message={error ?? loadError} />
      {lost !== null && !inReview ? (
        <p role="status" className="mt-4 border-2 border-stamp-review px-3 py-2 font-semibold text-stamp-review">
          {SHOP_HOLD_LOST[lost].message}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {busy ?? `Status: ${statusLabel(view.status)}`}
      </p>

      {draft ? (
        <>
          <Section en="Pickup photos" el="Φωτογραφίες">
            <GuidedCapture
              handoverId={id}
              phase="pickup"
              existing={view.pickupPhotos}
              checks={view.photoChecks}
              photoTries={view.photoTries}
              sampleSet="pickup"
              demoShop={view.isDemo}
              onChange={() => void refresh()}
            />
          </Section>
          {photosOk ? (
            <Section id="condition" en="Condition" el="Κατάσταση αντικειμένου">
              <ConditionReview view={view} onChange={() => void refresh()} />
            </Section>
          ) : null}
          {photosOk && view.itemDescription !== null ? (
            <Section en="Deposit" el="Εγγύηση">
              <DepositPicker view={view} onChange={() => void refresh()} />
            </Section>
          ) : null}
        </>
      ) : null}

      {view.status === 'awaitingRenter' ? (
        <Section en="Share" el="Κοινοποίηση">
          <p className="mb-3">The renter scans this code, reads the record and holds the deposit on PayPal.</p>
          <ShareQr handoverId={id} />
        </Section>
      ) : null}

      {view.status === 'active' ? (
        <Section en="On rent" el="Ενοικίαση">
          <p>{lost === null ? 'The deposit is held. Start the return when the item comes back.' : 'The return photos can still be taken for the record.'}</p>
        </Section>
      ) : null}

      {view.status === 'returning' ? (
        <Section en="Return photos" el="Επιστροφή">
          {view.isDemo ? (
            <div className="mb-4 flex gap-2" role="group" aria-label="Sample return photos">
              {(['return-damaged', 'return-clean'] as const).map((set) => (
                <button key={set} type="button" aria-pressed={returnSet === set} className={`btn ${returnSet === set ? 'bg-ink text-paper hover:bg-ink' : ''}`} onClick={() => setReturnSet(set)}>
                  {set === 'return-damaged' ? 'Sample: new marks' : 'Sample: no new marks'}
                </button>
              ))}
            </div>
          ) : null}
          <GuidedCapture
            handoverId={id}
            phase={phase}
            existing={view.returnPhotos}
            guidePhotos={view.pickupPhotos}
            checks={view.photoChecks}
            photoTries={view.photoTries}
            sampleSet={returnSet}
            demoShop={view.isDemo}
            onChange={() => void refresh()}
          />
        </Section>
      ) : null}

      {inReview ? <ReturnReview view={view} onChange={() => void refresh()} /> : null}

      {showLinkAgain(view.status) ? (
        <details className="section-label">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold underline">Show renter link again</summary>
          <p className="mb-3 mt-2 text-ink-soft">
            For a renter who closed the page. Only the phone that confirmed the record can act on it.
          </p>
          <ShareQr handoverId={id} />
        </details>
      ) : null}

      {['released', 'charged', 'closed'].includes(view.status) ? (
        <Section en="Settled" el="Ολοκληρώθηκε">
          <p>
            {view.settlement?.kind === 'charged'
              ? `${euro(view.settlement.chargeCents)} was charged and ${euro(view.settlement.releaseCents)} of the hold was released.`
              : 'The deposit was released. Nothing was charged.'}
          </p>
        </Section>
      ) : null}

      <MachineStrip id={view.id} itemRef={view.itemRef} depositCents={view.deposit?.amountCents ?? null} status={view.status} lastHash={view.lastHash} />

      {readyToShare ? (
        <ActionBar>
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void run('share', 'Sharing…')}>
            Share with renter
          </button>
        </ActionBar>
      ) : null}
      {view.status === 'active' ? (
        <ActionBar>
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void run('return', 'Starting…')}>
            Start return
          </button>
        </ActionBar>
      ) : null}
      {view.status === 'returning' && returnOk ? (
        <ActionBar>
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void run('compare', 'Comparing the photos…')}>
            {busy ?? 'Compare with pickup photos'}
          </button>
        </ActionBar>
      ) : null}
    </main>
  );
}
