'use client';
import { RenterLabel } from '@/components/renter/RenterBits';
import { LANGS, LANG_NAMES, type Lang } from '@/lib/i18n';

interface LanguagePickerProps {
  lang: Lang;
  onChange: (lang: Lang) => void;
}

/** Five buttons, each language written in itself. The chosen one is filled. */
export function LanguagePicker({ lang, onChange }: LanguagePickerProps) {
  return (
    <div role="group" aria-labelledby="lang-label" className="mt-4">
      <span id="lang-label">
        <RenterLabel k="lblLanguage" lang={lang} />
      </span>
      <div className="mt-1 flex flex-wrap gap-2">
        {LANGS.map((code) => {
          const chosen = code === lang;
          return (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={chosen}
              onClick={() => onChange(code)}
              className={chosen ? 'btn bg-ink px-3 text-paper' : 'btn px-3'}
            >
              {LANG_NAMES[code]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
