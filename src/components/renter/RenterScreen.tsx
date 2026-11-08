'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionBar, DocHeader, ErrorLine } from '@/components/doc/DocParts';
import { MachineStrip } from '@/components/doc/MachineStrip';
import { Stamp } from '@/components/doc/Stamp';
import { ConditionRecord } from '@/components/renter/ConditionRecord';
import { HoldStep } from '@/components/renter/HoldStep';
import { LanguagePicker } from '@/components/renter/LanguagePicker';
import { envelopeMessage, RenterLabel, stampText } from '@/components/renter/RenterBits';
import { ReturnResult } from '@/components/renter/ReturnResult';
import { renterConfirm, type HandoverView } from '@/lib/client/api';
import { pollingDone } from '@/lib/client/polling-done';
import { euroIn } from '@/lib/client/format';
import { readRenterToken } from '@/lib/client/renter-token';
import { usePolling } from '@/lib/client/use-polling';
import { useMode } from '@/lib/client/use-mode';
import type { HandoverStatus } from '@/lib/domain/types';
import { detectLang, t, type Lang } from '@/lib/i18n';

/** Statuses in which the settled stamp already exists, so a page opened in them does not replay the landing. */
const SETTLED: readonly HandoverStatus[] = ['released', 'charged', 'closed', 'disputed'];
const HELD_STATUSES: readonly HandoverStatus[] = ['active', 'returning', 'reviewed', 'chargeProposed'];
const RESULT_STATUSES: readonly HandoverStatus[] = ['reviewed', 'chargeProposed', 'released', 'charged', 'disputed', 'closed'];

function Notice({ lang, children, alert = false }: { lang: Lang; children: ReactNode; alert?: boolean }) {
  return (
    <main className="doc-page" lang={lang}>
      <p className="mt-4" role={alert ? 'alert' : 'status'}>
        {children}
      </p>
    </main>
  );
}

interface LiveProps {
  id: string;
  token: string;
  browserLang: Lang;
}

function RenterLive({ id, token, browserLang }: LiveProps) {
  const credentials = useMemo(() => ({ id, token }), [id, token]);
  // Every 4 seconds; once released or charged nothing can change, so the polling stops (I7).
  const { data, error, errorStatus, refresh } = usePolling<{ handover: HandoverView }>(`/api/handovers/${encodeURIComponent(id)}`, {
    intervalMs: 4000,
    renter: credentials,
    stopWhen: pollingDone,
  });
  const mode = useMode();
  const [chosen, setChosen] = useState<Lang | null>(null);
  const [firstStatus, setFirstStatus] = useState<HandoverStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const view = data?.handover ?? null;
  const lang: Lang = chosen ?? view?.renter?.language ?? browserLang;

  useEffect(() => {
    if (view !== null && firstStatus === null) {
      setFirstStatus(view.status);
    }
  }, [view, firstStatus]);

  useEffect(() => {
    document.title = `${t(lang, 'pageTitle')} · Evenhand`;
  }, [lang]);

  if (view === null) {
    if (errorStatus === 403) {
      return <Notice lang={lang} alert>{t(lang, 'linkInvalid')}</Notice>;
    }
    return error ? <Notice lang={lang} alert>{error}</Notice> : <Notice lang={lang}>{t(lang, 'loading')}</Notice>;
  }

  // The stamp lands only when this page watched the status change, not when it opens on a finished handover.
  const heldLands = firstStatus !== null && (firstStatus === 'draft' || firstStatus === 'awaitingRenter');
  const settledLands = firstStatus !== null && !SETTLED.includes(firstStatus);
  // A hold that ended outside the app is no longer "held": say so instead (I4).
  const lost = view.settlement === null ? view.holdLost : null;
  const headerStamp = lost !== null ? (
    <Stamp kind="review" label={stampText(lang, t(lang, 'stampHoldLost'))} />
  ) : HELD_STATUSES.includes(view.status) ? (
    <Stamp kind="held" label={stampText(lang, t(lang, 'stampHeld'))} land={heldLands} />
  ) : null;
  // A second device with the link may read but never act (Ruling R36).
  const readOnly = view.otherDevice;
  const awaitingConfirm = view.status === 'awaitingRenter' && view.renter === null;
  const awaitingHold = view.status === 'awaitingRenter' && view.renter !== null && !readOnly;
  const showResult = RESULT_STATUSES.includes(view.status);

  async function confirm() {
    setBusy(true);
    setActionError(null);
    try {
      await renterConfirm(id, token, lang);
      await refresh();
    } catch (failure) {
      setActionError(envelopeMessage(failure, lang));
    } finally {
      setBusy(false);
    }
  }

  function line(key: 'statusDraft' | 'statusConfirm' | 'statusActive' | 'statusReturning') {
    return (
      <p role="status" className="mt-4 text-lg font-semibold">
        {t(lang, key)}
      </p>
    );
  }

  return (
    <main className="doc-page" lang={lang}>
      <DocHeader
        seed={view.id}
        title={view.itemType}
        itemRef={view.itemRef}
        stamp={headerStamp}
        itemLabel={<RenterLabel k="lblItem" lang={lang} />}
        refLabel={<RenterLabel k="lblReference" lang={lang} />}
      />
      <LanguagePicker lang={lang} onChange={setChosen} />

      <div className="mt-6">
        <RenterLabel k="lblDeposit" lang={lang} />
        <p className="mono text-4xl font-medium">{view.deposit ? euroIn(view.deposit.amountCents, lang) : '—'}</p>
      </div>
      {view.status === 'draft' || view.status === 'awaitingRenter' ? (
        // The renter's first worry is the money: say plainly that it stays in their account, right under the amount.
        <p className="mt-2 max-w-prose text-xl font-bold text-balance">{t(lang, 'holdIntro')}</p>
      ) : null}
      <ErrorLine message={error && errorStatus === 403 ? t(lang, 'linkInvalid') : actionError} />

      {readOnly ? (
        <div role="status" className="mt-4 border-2 border-stamp-review px-3 py-2">
          <p className="font-semibold text-stamp-review">{t(lang, 'otherDevice')}</p>
          <p className="mt-1 text-sm">{t(lang, 'otherDeviceHint')}</p>
        </div>
      ) : null}

      {lost !== null && !showResult ? (
        <p role="status" className="mt-4 border-2 border-stamp-review px-3 py-2 text-lg font-semibold text-stamp-review">
          {t(lang, `holdLost${lost}`)}
        </p>
      ) : null}

      {view.status === 'draft' ? line('statusDraft') : null}
      {awaitingConfirm ? line('statusConfirm') : null}
      {view.status === 'active' && lost === null ? line('statusActive') : null}
      {view.status === 'returning' && lost === null ? line('statusReturning') : null}

      {awaitingHold && view.deposit ? (
        mode === null ? (
          <p role="status" className="mt-4">{t(lang, 'loading')}</p>
        ) : (
          <HoldStep
            handoverId={id}
            amountCents={view.deposit.amountCents}
            token={token}
            lang={lang}
            clientId={mode.paypalClientId}
            onDone={() => void refresh()}
          />
        )
      ) : null}

      {showResult ? <ReturnResult view={view} token={token} lang={lang} land={settledLands} readOnly={readOnly} onChange={() => void refresh()} /> : null}

      {view.status !== 'draft' ? <ConditionRecord view={view} lang={lang} /> : null}

      <section aria-labelledby="record-title" className="section-label">
        <div className="rule-top pt-3">
          <h2 id="record-title">
            <RenterLabel k="lblYourRecord" lang={lang} />
          </h2>
        </div>
        <p className="mt-2 text-ink-soft">{t(lang, 'recordHint')}</p>
        <Link href={`/record/${encodeURIComponent(id)}`} className="btn mt-2">
          {t(lang, 'recordLink')}
        </Link>
      </section>

      <MachineStrip
        id={view.id}
        itemRef={view.itemRef}
        depositCents={view.deposit?.amountCents ?? null}
        status={view.status}
        lastHash={view.lastHash}
      />

      {awaitingConfirm && !readOnly ? (
        <ActionBar>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void confirm()}>
            {t(lang, 'confirmButton')}
          </button>
        </ActionBar>
      ) : null}
    </main>
  );
}

/** The renter's page. Reads the secret from the link once, then talks to the server with it in a header only. */
export function RenterScreen({ id }: { id: string }) {
  const [start, setStart] = useState<{ token: string | null; lang: Lang } | null>(null);

  useEffect(() => {
    setStart({ token: readRenterToken(id), lang: detectLang(navigator.language) });
  }, [id]);

  if (start === null) {
    return <Notice lang="en">{t('en', 'loading')}</Notice>;
  }
  if (start.token === null) {
    return <Notice lang={start.lang} alert>{t(start.lang, 'linkInvalid')}</Notice>;
  }
  return <RenterLive id={id} token={start.token} browserLang={start.lang} />;
}
