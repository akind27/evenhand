'use client';
import { useState, type ReactNode } from 'react';
import { PhotoPair } from '@/components/common/PhotoPair';
import { RecordedAiNote } from '@/components/common/RecordedAiNote';
import { ActionBar, ErrorLine } from '@/components/doc/DocParts';
import { Stamp } from '@/components/doc/Stamp';
import { AiLine, compareText, envelopeMessage, RenterLabel, stampText } from '@/components/renter/RenterBits';
import { acceptCharge, disputeCharge, type HandoverView } from '@/lib/client/api';
import { euroIn } from '@/lib/client/format';
import type { Finding, FindingStatus } from '@/lib/domain/types';
import { aiTextMark } from '@/lib/ai/model';
import { t, tf, type Lang, type RenterKey } from '@/lib/i18n';

const MAX_REASON = 500;

const FINDING_WORDS: Record<FindingStatus, RenterKey> = {
  proposed: 'findingProposed',
  needsHuman: 'findingNeedsHuman',
  confirmed: 'findingConfirmed',
  dismissed: 'findingDismissed',
};

const FINDING_TONE: Record<FindingStatus, string> = {
  proposed: 'var(--stamp-hold)',
  needsHuman: 'var(--stamp-review)',
  confirmed: 'var(--stamp-charged)',
  dismissed: 'var(--ink-soft)',
};

interface ReturnResultProps {
  view: HandoverView;
  token: string;
  lang: Lang;
  /** Play the stamp landing: true only when this page watched the status change. */
  land: boolean;
  /** True on a second device (Ruling R36): the result is shown, but Accept and Disagree are not. */
  readOnly?: boolean;
  onChange: () => void;
}

/** A translated sentence with a placeholder, where the placeholder is replaced by an element (here: text in another language). */
function withSlot(template: string, slot: string, node: ReactNode): ReactNode {
  const [before, after = ''] = template.split(slot);
  return (
    <>
      {before}
      {node}
      {after}
    </>
  );
}

/** True when the shop dismissed an AI finding or added one by hand: the explanation then describes the AI's first list (M2). */
function shopChangedFindings(view: HandoverView): boolean {
  return view.findings.some((finding) => finding.status === 'dismissed' || finding.source === 'shop');
}

function FindingBlock({ view, finding, n, lang }: { view: HandoverView; finding: Finding; n: number; lang: Lang }) {
  const before = view.pickupPhotos.find((photo) => photo.id === finding.beforePhotoId);
  const after = view.returnPhotos.find((photo) => photo.id === finding.afterPhotoId);
  return (
    <li className="rule-top py-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 font-bold">
          <span className="mono mr-2 text-stamp-charged">{n}</span>
          {withSlot(t(lang, 'newMarkAt'), '{where}', <span lang="en">{finding.location}</span>)}
        </h3>
        <span
          className="max-w-full border-2 px-2 py-0.5 text-xs font-bold tracking-widest"
          style={{ borderColor: FINDING_TONE[finding.status], color: FINDING_TONE[finding.status] }}
        >
          {stampText(lang, t(lang, FINDING_WORDS[finding.status]))}
        </span>
      </div>
      <PhotoPair
        before={before}
        after={after}
        box={finding.box}
        n={n}
        label={finding.location}
        idPrefix={`finding-${finding.id}`}
        text={compareText(lang)}
        captions={{ before: t(lang, 'captionPickup'), after: t(lang, 'captionReturn') }}
        demoNote={t(lang, 'aiDemoPhoto')}
      />
      <p className="mt-2" lang="en">{finding.description}</p>
      {finding.source === 'ai' ? <AiLine lang={lang} /> : <p className="text-sm text-ink-soft">{t(lang, 'addedByShop')}</p>}
    </li>
  );
}

function SettledStamp({ view, lang, land }: { view: HandoverView; lang: Lang; land: boolean }) {
  if (view.status === 'disputed') {
    return <Stamp kind="disputed" label={stampText(lang, t(lang, 'stampDisputed'))} />;
  }
  if (view.settlement?.kind === 'charged') {
    const label = stampText(lang, tf(lang, 'stampCharged', { amount: euroIn(view.settlement.chargeCents, lang) }));
    return <Stamp kind="charged" label={label} land={land} />;
  }
  if (view.settlement?.kind === 'released') {
    return <Stamp kind="released" label={stampText(lang, t(lang, 'stampReleased'))} land={land} />;
  }
  return null;
}

function statusLine(view: HandoverView, lang: Lang): string {
  switch (view.status) {
    case 'reviewed':
      return t(lang, 'statusReviewing');
    case 'chargeProposed':
      return t(lang, 'statusChargeProposed');
    case 'disputed':
      return t(lang, 'resultDisputed');
    default:
      break;
  }
  if (view.settlement?.kind === 'charged') {
    return tf(lang, 'resultCharged', { charge: euroIn(view.settlement.chargeCents, lang), release: euroIn(view.settlement.releaseCents, lang) });
  }
  if (view.settlement?.kind === 'released') {
    return view.findings.some((finding) => finding.status === 'confirmed') ? t(lang, 'resultReleasedFull') : t(lang, 'resultClean');
  }
  return t(lang, 'statusClosed');
}

/** What happened at return. While the shop reviews it is read-only. Accept and disagree show only once the shop has proposed a charge. */
export function ReturnResult({ view, token, lang, land, readOnly = false, onChange }: ReturnResultProps) {
  const [disputing, setDisputing] = useState(false);
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const euro = (cents: number) => euroIn(cents, lang);

  const reviewing = view.status === 'reviewed';
  // Accept is offered only when the shop has proposed a charge (Ruling R15), and the amount is the proposal's.
  const proposal = view.status === 'chargeProposed' ? view.proposal : null;
  // A hold that ended outside the app cannot be charged here (I4).
  const lost = view.settlement === null ? view.holdLost : null;
  const canAct = proposal !== null && !readOnly && lost === null;
  const shown = reviewing ? view.findings : view.findings.filter((finding) => finding.status === 'confirmed');
  const charges = view.proposal;

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      onChange();
    } catch (failure) {
      setError(envelopeMessage(failure, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div lang={lang}>
      <section aria-labelledby="result-title" className="section-label">
        <div className="rule-top pt-3">
          <h2 id="result-title">
            <RenterLabel k="lblStatus" lang={lang} />
          </h2>
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <p role="status" className="min-w-0 flex-1 basis-48 text-xl font-bold text-balance">
            {statusLine(view, lang)}
          </p>
          <div className="max-w-full">
            <SettledStamp view={view} lang={lang} land={land} />
          </div>
        </div>
        {lost !== null ? (
          <p role="status" className="mt-2 border-2 border-stamp-review px-3 py-2 font-semibold text-stamp-review">
            {t(lang, `holdLost${lost}`)}
          </p>
        ) : null}
        {proposal ? <p className="mt-2">{t(lang, 'resultDamageIntro')}</p> : null}
        {view.status === 'disputed' && view.dispute ? (
          <p className="mt-2">{tf(lang, 'yourReason', { reason: view.dispute.reason })}</p>
        ) : null}
      </section>

      {shown.length > 0 ? (
        <section aria-labelledby="findings-title" className="section-label">
          <div className="pt-3">
            <h2 id="findings-title">
              <RenterLabel k={reviewing ? 'lblFindings' : 'lblNewMarks'} lang={lang} />
            </h2>
          </div>
          <ul className="mt-1 list-none p-0">
            {shown.map((finding, index) => (
              <FindingBlock key={finding.id} view={view} finding={finding} n={index + 1} lang={lang} />
            ))}
          </ul>
        </section>
      ) : null}

      {charges && !reviewing && charges.lines.length > 0 ? (
        <section aria-labelledby="charges-title" className="section-label">
          <div className="rule-top pt-3">
            <h2 id="charges-title">
              <RenterLabel k="lblCharges" lang={lang} />
            </h2>
          </div>
          <ul className="mt-2 list-none p-0">
            {charges.lines.map((line) => (
              <li key={line.findingId} className="flex justify-between gap-4 border-b border-rule py-2">
                <span>{line.label}</span>
                <span className="mono font-medium">{euro(line.amountCents)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-end justify-between gap-4">
            <RenterLabel k="lblTotal" lang={lang} />
            <p className="mono text-3xl font-medium" data-testid="charge-total">
              {euro(charges.chargeCents)}
            </p>
          </div>
          <div className="mt-1 flex items-end justify-between gap-4 text-ink-soft">
            <RenterLabel k="lblReleased" lang={lang} />
            <p className="mono">{euro(charges.releaseCents)}</p>
          </div>
          {charges.exceedsHoldByCents > 0 ? (
            <p className="mt-3 border-2 border-stamp-review px-3 py-2 text-stamp-review">
              {tf(lang, 'resultExceeds', { extra: euro(charges.exceedsHoldByCents) })}
            </p>
          ) : null}
        </section>
      ) : null}

      {view.explanation && shown.length > 0 && !reviewing ? (
        <section aria-labelledby="explain-title" className="section-label">
          <div className="rule-top pt-3">
            <h2 id="explain-title">
              <RenterLabel k="lblExplanation" lang={lang} />
            </h2>
          </div>
          {view.aiFailed ? (
            // No AI text exists, so there is no AI label and no English fallback: a plain sentence in the renter's language.
            <p className="mt-2 max-w-prose" lang={lang}>{t(lang, 'explanationNoAi')}</p>
          ) : (
            <>
              <p className="mt-2 max-w-prose" lang={view.explanationLanguage ?? lang} {...aiTextMark(view.comparisonAi?.model)}>
                {view.explanation}
              </p>
              <AiLine lang={lang} k={shopChangedFindings(view) ? 'aiExplanationBeforeReview' : 'aiExplanation'} />
              <RecordedAiNote answer={view.comparisonAi} lang={lang} />
            </>
          )}
        </section>
      ) : null}

      {canAct && disputing ? (
        <form
          id="dispute-form"
          className="section-label"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => disputeCharge(view.id, token, reason.trim()));
          }}
        >
          <label htmlFor="dispute-reason">
            <RenterLabel k="lblReason" lang={lang} />
          </label>
          <textarea
            id="dispute-reason"
            className="input mt-1 min-h-28"
            required
            maxLength={MAX_REASON}
            rows={4}
            value={reason}
            aria-describedby="dispute-hint"
            onChange={(event) => setReason(event.target.value)}
          />
          <p id="dispute-hint" className="mt-1 flex justify-between gap-3 text-sm text-ink-soft">
            <span>{reason.trim() === '' ? t(lang, 'disputeRequired') : t(lang, 'disputeHint')}</span>
            <span className="mono">
              {reason.length}/{MAX_REASON}
            </span>
          </p>
        </form>
      ) : null}

      <ErrorLine message={error} />

      {canAct && proposal ? (
        <ActionBar>
          {disputing ? (
            <>
              <button type="submit" form="dispute-form" className="btn btn-primary" disabled={busy || reason.trim() === ''}>
                {t(lang, 'disputeSend')}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => setDisputing(false)}>
                {t(lang, 'back')}
              </button>
            </>
          ) : (
            <>
              {confirmingAccept ? null : (
                <p className="text-center text-sm text-ink-soft">
                  {tf(lang, 'acceptNote', { charge: euro(proposal.chargeCents), release: euro(proposal.releaseCents) })}
                </p>
              )}
              {confirmingAccept ? (
                // M5: money moves only on a second tap that says exactly what happens.
                <>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => acceptCharge(view.id, token))}>
                    {tf(lang, 'acceptConfirm', { charge: euro(proposal.chargeCents) })}
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => setConfirmingAccept(false)}>
                    {t(lang, 'cancel')}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setConfirmingAccept(true)}>
                    {tf(lang, 'acceptButton', { amount: euro(proposal.chargeCents) })}
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => setDisputing(true)}>
                    {t(lang, 'disagreeButton')}
                  </button>
                </>
              )}
            </>
          )}
        </ActionBar>
      ) : null}
    </div>
  );
}
