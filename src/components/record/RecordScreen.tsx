'use client';
import { useEffect, useState } from 'react';
import { AiLabel } from '@/components/common/AiLabel';
import { RecordedAiNote } from '@/components/common/RecordedAiNote';
import { DemoBadge } from '@/components/common/DemoBadge';
import { statusLabel } from '@/components/common/StatusBadge';
import { DocHeader, FieldLabel } from '@/components/doc/DocParts';
import { MachineStrip } from '@/components/doc/MachineStrip';
import { coversWholePhoto } from '@/components/common/BeforeAfter';
import { UnplacedMarks, markOverlays, numberMarks } from '@/components/doc/marks';
import { PhotoWindow, type PhotoOverlay } from '@/components/doc/PhotoWindow';
import { Stamp, type StampKind } from '@/components/doc/Stamp';
import { Fingerprint } from '@/components/record/Fingerprint';
import { actorLabel, describeEvent, formatWhen } from '@/components/record/timeline';
import { aiTextMark } from '@/lib/ai/model';
import { apiGet, ApiError, errorMessage, type HandoverView } from '@/lib/client/api';
import { euro } from '@/lib/client/format';
import { recordHeaders } from '@/lib/client/record-credentials';
import type { StoredEvent } from '@/lib/domain/events';
import type { Angle, Phase } from '@/lib/domain/types';

interface EvidencePhoto {
  id: string;
  angle: Angle;
  phase: Phase;
  sha256: string;
  url: string;
}

export interface EvidencePack {
  handover: HandoverView;
  events: StoredEvent[];
  chain: { ok: true } | { ok: false; brokenAt: number };
  photos: EvidencePhoto[];
  note: string;
}

const REVOKE_DELAY_MS = 1000;
const NOT_VALID ='This link is not valid on this device.';

/**
 * A condition record or comparison the AI wrote (it has an assessment), with content. A shop's hand-edited marks
 * are written by the shop with no assessment, so they do not count.
 */
function isAiEvent(entry: StoredEvent): boolean {
  const event = entry.event;
  if (event.type === 'conditionRecorded') {
    return entry.actor === 'system' && event.assessmentId !== null && (event.itemDescription !== '' || event.marks.length > 0);
  }
  if (event.type === 'comparisonDone') {
    return entry.actor === 'system' && event.assessmentId !== null && !event.aiFailed;
  }
  return false;
}

/** The model the event itself names (M1), when it names one. */
function eventModel(entry: StoredEvent): string | undefined {
  const event = entry.event;
  return event.type === 'conditionRecorded' || event.type === 'comparisonDone' ? event.model : undefined;
}

/** The confirmed findings drawn on their return photo. A box over the whole photo marks nothing, so it is left out. */
function overlaysFor(photoId: string, confirmed: HandoverView['findings']): PhotoOverlay[] {
  return confirmed.flatMap((finding, index): PhotoOverlay[] =>
    finding.afterPhotoId === photoId && !coversWholePhoto(finding.box) ? [{ box: finding.box, n: index + 1, tone: 'new', shape: 'box' }] : [],
  );
}

function headerStamp(view: HandoverView): { kind: StampKind; label: string } | null {
  const settled = view.settlement;
  if (settled?.kind === 'released') {
    return { kind: 'released', label: 'Released' };
  }
  if (settled?.kind === 'charged') {
    return { kind: 'charged', label: `Charged ${euro(settled.chargeCents)}` };
  }
  if (view.status === 'disputed') {
    return { kind: 'disputed', label: 'Disputed' };
  }
  if (view.hold !== null && view.holdLost === null && view.status !== 'closed') {
    return { kind: 'held', label: 'Held' };
  }
  return null;
}

function outcomeText(view: HandoverView): string {
  const settled = view.settlement;
  if (settled?.kind === 'released') {
    return 'Hold released. Nothing was charged.';
  }
  if (settled?.kind === 'charged') {
    return `${euro(settled.chargeCents)} charged; ${euro(settled.releaseCents)} released.`;
  }
  if (view.status === 'disputed') {
    return 'The renter disputed the proposed charge. A person reviews it.';
  }
  if (view.holdLost !== null) {
    return 'The PayPal hold is no longer active.';
  }
  return `Not settled yet (${statusLabel(view.status).toLowerCase()}).`;
}

function chainText(chain: EvidencePack['chain']): string {
  if (chain.ok) {
    return 'Record intact — every step is sealed to the one before.';
  }
  return chain.brokenAt === 0 ? 'Record changed at the very first step.' : `Record changed after step ${chain.brokenAt}.`;
}

function Notice({ children, alert = false }: { children: string; alert?: boolean }) {
  return (
    <main className="doc-page">
      <p className="mt-4" role={alert ? 'alert' : 'status'}>
        {children}
      </p>
    </main>
  );
}

async function saveEvidence(id: string, headers: Record<string, string>): Promise<void> {
  const pack = await apiGet<EvidencePack>(`/api/handovers/${encodeURIComponent(id)}/evidence`, headers);
  const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `evenhand-${id}-evidence.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers start the download after the click returns, so the address stays valid for a moment.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** The sealed record of one handover. Read-only for everyone: it has no buttons that change anything. */
export function RecordScreen({ id }: { id: string }) {
  const [pack, setPack] = useState<EvidencePack | null>(null);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const creds = recordHeaders(id);
    setHeaders(creds);
    let live = true;
    apiGet<EvidencePack>(`/api/handovers/${encodeURIComponent(id)}/evidence`, creds)
      .then((loaded) => live && setPack(loaded))
      .catch((error: unknown) => live && setFailure(error instanceof ApiError && (error.status === 403 || error.status === 404) ? NOT_VALID : errorMessage(error)));
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    document.title = 'Sealed record · Evenhand';
  }, []);

  if (failure !== null) {
    return <Notice alert>{failure}</Notice>;
  }
  if (pack === null) {
    return <Notice>Loading the record…</Notice>;
  }

  const view = pack.handover;
  const stamp = headerStamp(view);
  const sealedAt = pack.events.length > 0 ? pack.events[pack.events.length - 1].at : undefined;
  const sampleIds = new Set([...view.pickupPhotos, ...view.returnPhotos].filter((photo) => photo.source === 'sample').map((photo) => photo.id));
  const confirmed = view.findings.filter((finding) => finding.status === 'confirmed');
  const numberedMarks = numberMarks(view.marks);
  // The AI contributed when the condition record has AI content, the comparison ran, or any finding came from the AI.
  // A finding the shop added by hand is not an AI result, but it does not undo the AI's part in the record.
  const usedAi =
    view.findings.some((finding) => finding.source === 'ai') ||
    pack.events.some(isAiEvent);
  // Confirmed AI findings carry their own label, so the record-level line would only repeat it.
  const showAiLine = usedAi && !confirmed.some((finding) => finding.source === 'ai');

  return (
    <main className="doc-page record-doc">
      <DocHeader
        seed={view.id}
        title={view.itemType}
        itemRef={view.itemRef}
        stamp={
          <div className="flex flex-col items-end gap-2">
            <DemoBadge />
            {stamp ? <Stamp kind={stamp.kind} label={stamp.label} at={sealedAt} /> : null}
          </div>
        }
      />

      <section aria-labelledby="chain-title" className="section-label">
        <div className="rule-top pt-3">
          <h2 id="chain-title"><FieldLabel en="Seal check" el="Έλεγχος σφραγίδας" /></h2>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Stamp kind={pack.chain.ok ? 'released' : 'charged'} label={pack.chain.ok ? 'Record intact' : 'Record changed'} />
          <p className="min-w-0 flex-1 basis-56 font-semibold" role="status">{chainText(pack.chain)}</p>
        </div>
      </section>

      <section aria-labelledby="deposit-title" className="section-label">
        <div className="rule-top pt-3">
          <h2 id="deposit-title"><FieldLabel en="Deposit and outcome" el="Εγγύηση και αποτέλεσμα" /></h2>
        </div>
        <p className="mono mt-1 text-2xl font-medium">{view.deposit ? euro(view.hold?.amountCents ?? view.deposit.amountCents) : '—'}</p>
        <p className="mt-1">{outcomeText(view)}</p>
        {confirmed.length > 0 ? (
          <ul className="mt-2 list-none p-0">
            {confirmed.map((finding) => (
              <li key={finding.id} className="mt-2">
                <p {...(finding.source === 'ai' ? aiTextMark(view.comparisonAi?.model) : {})}>{finding.location}: {finding.description}</p>
                {finding.source === 'ai' ? <AiLabel /> : <p className="text-sm text-ink-soft">Added by the shop.</p>}
              </li>
            ))}
          </ul>
        ) : null}
        {showAiLine ? <div className="mt-2"><AiLabel /></div> : null}
        <div className="mt-1">
          {/* One note is enough: the condition record and the comparison come from the same recording. */}
          <RecordedAiNote
            answer={
              [view.conditionAiFailed ? null : view.conditionAi, view.aiFailed ? null : view.comparisonAi].find(
                (answer) => answer?.recorded,
              ) ?? null
            }
          />
        </div>
      </section>

      <section aria-labelledby="timeline-title" className="section-label">
        <div className="rule-top pt-3">
          <h2 id="timeline-title"><FieldLabel en="Timeline" el="Χρονολόγιο" /></h2>
        </div>
        <ol className="m-0 list-none p-0">
          {pack.events.map((entry) => (
            <li key={entry.seq} className="rule-top break-inside-avoid py-3">
              <p className="text-sm text-ink-soft">
                <span>Step {entry.seq + 1}</span> · <time className="mono" dateTime={entry.at}>{formatWhen(entry.at)}</time> · <span>{actorLabel(entry.actor)}</span>
              </p>
              <p className="mt-1" {...(isAiEvent(entry) ? aiTextMark(eventModel(entry)) : {})}>{describeEvent(entry)}</p>
              <Fingerprint value={entry.hash} label={`Step ${entry.seq + 1} seal`} />
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="photos-title" className="section-label">
        <div className="rule-top pt-3">
          <h2 id="photos-title"><FieldLabel en="Photos and fingerprints" el="Φωτογραφίες και αποτυπώματα" /></h2>
        </div>
        {pack.photos.length === 0 ? <p className="mt-2">No photos in this record.</p> : null}
        <div className="mt-2 grid grid-cols-2 gap-3">
          {pack.photos.map((photo) => (
            <div key={photo.id} className="break-inside-avoid">
              <PhotoWindow
                src={photo.url}
                alt={`${photo.phase === 'pickup' ? 'Pickup' : 'Return'} photo, ${photo.angle === 'closeup' ? 'close-up' : photo.angle}`}
                caption={`${photo.phase === 'pickup' ? 'Pickup' : 'Return'} · ${photo.angle === 'closeup' ? 'close-up' : photo.angle}${sampleIds.has(photo.id) ? ' · AI-generated demo photo' : ''}`}
                overlays={photo.phase === 'pickup' ? markOverlays(numberedMarks, photo.id) : overlaysFor(photo.id, confirmed)}
              />
              {photo.phase === 'pickup' ? <UnplacedMarks numbered={numberedMarks} photoId={photo.id} /> : null}
              <Fingerprint value={photo.sha256} label={`${photo.phase} ${photo.angle} photo SHA-256`} />
            </div>
          ))}
        </div>
      </section>

      <div className="no-print mt-8 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn flex-1"
          disabled={headers === null}
          onClick={() => {
            setSaveError(null);
            saveEvidence(id, headers ?? {}).catch((error: unknown) => setSaveError(errorMessage(error)));
          }}
        >
          Download evidence (JSON)
        </button>
        <button type="button" className="btn flex-1" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </div>
      {saveError ? <p role="alert" className="mt-3 border-2 border-stamp-charged px-3 py-2 text-stamp-charged">{saveError}</p> : null}

      <MachineStrip id={view.id} itemRef={view.itemRef} depositCents={view.deposit?.amountCents ?? null} status={view.status} lastHash={view.lastHash} />
    </main>
  );
}
