'use client';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { useState } from 'react';
import { ActionBar, ErrorLine } from '@/components/doc/DocParts';
import { Stamp } from '@/components/doc/Stamp';
import { failureMessage, RenterLabel, stampText } from '@/components/renter/RenterBits';
import { authorizeHold, createHoldOrder } from '@/lib/client/api';
import { euroIn } from '@/lib/client/format';
import { t, tf, type Lang } from '@/lib/i18n';

interface HoldStepProps {
  handoverId: string;
  amountCents: number;
  token: string;
  lang: Lang;
  /** The public PayPal client id. Null means demo mode: no PayPal script is loaded. */
  clientId: string | null;
  /** Called after the hold is authorized, so the page can refresh. */
  onDone: () => void;
}

/** The PayPal hold. Real mode shows PayPal's own buttons; demo mode shows a labelled simulation button. */
export function HoldStep({ handoverId, amountCents, token, lang, clientId, onDone }: HoldStepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function makeOrder(): Promise<string> {
    setError(null);
    try {
      return (await createHoldOrder(handoverId, token)).orderId;
    } catch (failure) {
      setError(failureMessage(failure, lang, 'holdError'));
      throw failure;
    }
  }

  /** True when the hold was authorized. The page then refreshes and replaces this step, so `busy` stays on until then. */
  async function authorize(orderId: string): Promise<boolean> {
    try {
      await authorizeHold(handoverId, token, orderId);
      onDone();
      return true;
    } catch (failure) {
      setError(failureMessage(failure, lang, 'holdError'));
      return false;
    }
  }

  async function simulate() {
    setBusy(true);
    setError(null);
    let done = false;
    try {
      done = await authorize(await makeOrder());
    } catch {
      // makeOrder has already put the message on screen.
    } finally {
      setBusy(done);
    }
  }

  return (
    <section aria-labelledby="hold-title" className="section-label">
      <div className="rule-top pt-3">
        <h2 id="hold-title">
          <RenterLabel k="lblHold" lang={lang} />
        </h2>
      </div>
      <p className="mt-2">{tf(lang, 'holdAmount', { amount: euroIn(amountCents, lang) })}</p>

      <div className="mt-4">
        {clientId === null ? (
          <>
            <div className="flex items-center gap-4">
              <Stamp kind="demo" label={stampText(lang, t(lang, 'stampDemo'))} round />
              <p className="text-sm text-ink-soft">{t(lang, 'holdDemoNote')}</p>
            </div>
            <ActionBar>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void simulate()}>
                {busy ? t(lang, 'holdWorking') : t(lang, 'holdButtonDemo')}
              </button>
            </ActionBar>
          </>
        ) : (
          <PayPalScriptProvider options={{ clientId, currency: 'EUR', intent: 'authorize' }}>
            <PayPalButtons
              style={{ layout: 'vertical', shape: 'rect', label: 'paypal' }}
              disabled={busy}
              createOrder={makeOrder}
              onApprove={async (data) => {
                setBusy(true);
                setBusy(await authorize(data.orderID));
              }}
              onError={() => setError((current) => current ?? t(lang, 'holdError'))}
              onCancel={() => setError(t(lang, 'holdError'))}
            />
          </PayPalScriptProvider>
        )}
      </div>
      <ErrorLine message={error} />
    </section>
  );
}
