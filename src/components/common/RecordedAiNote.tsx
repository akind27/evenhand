import { AI_MODEL_ID } from '@/lib/ai/model';
import { tf, type Lang } from '@/lib/i18n';

/**
 * Says plainly that an AI answer was replayed from the recording made for the bundled sample photos,
 * not a live call (Ruling R35). Shows nothing for a live answer.
 * Renter screens pass their `lang`; shop and record screens are English.
 */
export function RecordedAiNote({
  answer,
  lang = 'en',
}: {
  answer: { recorded: boolean; model?: string | null } | null | undefined;
  lang?: Lang;
}) {
  if (!answer?.recorded) {
    return null;
  }
  return (
    <p className="text-sm text-ink-soft" lang={lang}>
      {tf(lang, 'recordedAiNote', { model: answer.model ?? AI_MODEL_ID })}
    </p>
  );
}
