import { RecordedAiNote } from '@/components/common/RecordedAiNote';
import { UnplacedMarks, markOverlays, numberMarks } from '@/components/doc/marks';
import { PhotoWindow } from '@/components/doc/PhotoWindow';
import { AiLine, RenterLabel } from '@/components/renter/RenterBits';
import type { HandoverView } from '@/lib/client/api';
import { euroIn } from '@/lib/client/format';
import { REQUIRED_ANGLES } from '@/lib/domain/types';
import { aiTextMark } from '@/lib/ai/model';
import { t, tf, type Lang } from '@/lib/i18n';

const ANGLE_KEYS = {
  front: 'angleFront',
  back: 'angleBack',
  left: 'angleLeft',
  right: 'angleRight',
  closeup: 'angleCloseup',
} as const;

/** What the renter checks before confirming: the pickup photos with the existing marks, the deposit, the price list and the rules. */
export function ConditionRecord({ view, lang }: { view: HandoverView; lang: Lang }) {
  const photos = [
    ...REQUIRED_ANGLES.flatMap((angle) => view.pickupPhotos.filter((photo) => photo.angle === angle)),
    ...view.pickupPhotos.filter((photo) => photo.angle === 'closeup'),
  ];
  const numbered = numberMarks(view.marks);

  return (
    <div lang={lang}>
      <section aria-labelledby="cond-title" className="section-label">
        <div className="rule-top pt-3">
          <h2 id="cond-title">
            <RenterLabel k="lblCondition" lang={lang} />
          </h2>
        </div>
        <p className="mt-2">{t(lang, 'conditionIntro')}</p>
        {view.conditionAiFailed ? (
          <p className="mt-2 text-ink-soft">{t(lang, 'conditionNoAi')}</p>
        ) : (
          <>
            {view.itemDescription ? <p className="mt-2 font-semibold" {...aiTextMark(view.conditionAi?.model)}>{view.itemDescription}</p> : null}
            <AiLine lang={lang} />
            <RecordedAiNote answer={view.conditionAi} lang={lang} />
          </>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <div key={photo.id}>
              <PhotoWindow
                src={photo.url}
                alt={`${t(lang, ANGLE_KEYS[photo.angle])}, ${t(lang, 'captionPickup')}`}
                caption={
                  photo.source === 'sample'
                    ? `${t(lang, ANGLE_KEYS[photo.angle])} · ${t(lang, 'aiDemoPhoto')}`
                    : t(lang, ANGLE_KEYS[photo.angle])
                }
                overlays={markOverlays(numbered, photo.id)}
              />
              <UnplacedMarks numbered={numbered} photoId={photo.id} />
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="marks-title" className="section-label">
        <div className="rule-top pt-3">
          <h2 id="marks-title">
            <RenterLabel k="lblExistingMarks" lang={lang} />
          </h2>
        </div>
        {numbered.length === 0 ? (
          <p className="mt-2">{t(lang, 'noMarks')}</p>
        ) : (
          <ol className="mt-2 list-none p-0">
            {numbered.map(({ mark, n }) => (
              <li key={mark.id} className="flex gap-3 py-1">
                <span className="mono w-6 shrink-0 font-medium">{n}</span>
                <span>
                  <span lang="en">{mark.location}</span>
                  {mark.note ? <span className="text-ink-soft" lang="en"> — {mark.note}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="price-title" className="section-label">
        <div className="rule-top pt-3">
          <h2 id="price-title">
            <RenterLabel k="lblPriceList" lang={lang} />
          </h2>
        </div>
        <p className="mt-2 text-ink-soft">{t(lang, 'priceListIntro')}</p>
        <ul className="mt-2 list-none p-0">
          {view.priceList.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 border-b border-rule py-2">
              <span>{item.label}</span>
              <span className="mono font-medium">{euroIn(item.amountCents, lang)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rules-title" className="section-label">
        <div className="rule-top pt-3">
          <h2 id="rules-title">
            <RenterLabel k="lblRules" lang={lang} />
          </h2>
        </div>
        <p className="mt-2 max-w-prose">{t(lang, 'rulesText')}</p>
        {view.deposit ? (
          <p className="mt-2 font-semibold">{tf(lang, 'depositLine', { amount: euroIn(view.deposit.amountCents, lang) })}</p>
        ) : null}
      </section>
    </div>
  );
}
