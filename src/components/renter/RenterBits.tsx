import { FieldLabel } from '@/components/doc/DocParts';
import { ApiError, errorMessage } from '@/lib/client/api';
import { greekUpper } from '@/lib/client/greek';
import type { BeforeAfterText } from '@/components/common/BeforeAfter';
import { t, tf, type Lang, type RenterKey } from '@/lib/i18n';

/** A passport-style label for a renter screen: English, plus the renter's language when it is not English. */
export function RenterLabel({ k, lang }: { k: RenterKey; lang: Lang }) {
  return <FieldLabel en={t('en', k)} local={t(lang, k)} lang={lang} />;
}

/** The quiet AI line, in the renter's language (EU AI Act Article 50). */
export function AiLine({ lang, k = 'aiAssisted' }: { lang: Lang; k?: 'aiAssisted' | 'aiExplanation' | 'aiExplanationBeforeReview' }) {
  return (
    <p className="flex items-center gap-2 text-sm text-ink-soft" lang={lang}>
      <span aria-hidden="true" className="mono border border-ink-soft px-1 text-[0.6875rem] font-medium leading-4">
        AI
      </span>
      {t(lang, k)}
    </p>
  );
}

/** The comparison slider's words in the renter's language. */
export function compareText(lang: Lang): BeforeAfterText {
  return {
    slider: t(lang, 'compareSlider'),
    hint: t(lang, 'compareHint'),
    value: (pickup, ret) => tf(lang, 'compareValue', { pickup: String(pickup), ret: String(ret) }),
  };
}

/** Stamp text in capitals for the language. Greek capitals lose the accent but keep the diaeresis. */
export function stampText(lang: Lang, text: string): string {
  return lang === 'el' ? greekUpper(text) : text.toLocaleUpperCase(lang);
}

/** The server's plain message for a failed call. A 403 means the link does not work on this device. */
export function envelopeMessage(failure: unknown, lang: Lang): string {
  return failure instanceof ApiError && failure.status === 403 ? t(lang, 'linkInvalid') : errorMessage(failure);
}

/** The plain sentence for a failed renter call: a 403 means the link does not work on this device. */
export function failureMessage(failure: unknown, lang: Lang, fallback: RenterKey): string {
  return failure instanceof ApiError && failure.status === 403 ? t(lang, 'linkInvalid') : t(lang, fallback);
}
