import { SOURCE_URL } from '@/lib/site';

/** The footer of the landing and how-it-works pages: AI disclosure (EU AI Act Article 50), sandbox note, labels, licence. */
export function LandingFooter({ sourceUrl = SOURCE_URL }: { sourceUrl?: string }) {
  return (
    <footer className="mt-20 border-t-2 border-ink bg-panel">
      <div className="mx-auto grid max-w-6xl gap-3 px-4 py-8 text-sm lg:grid-cols-2">
        <div className="max-w-prose">
          <p className="font-semibold">AI-assisted — a person decides any charge.</p>
          <p className="mt-1 text-ink-soft">
            Artificial intelligence compares the photos and writes the explanations, and every AI result is labelled. It never moves money. A person confirms every charge.
          </p>
        </div>
        <div className="max-w-prose">
          <p className="font-semibold">PayPal sandbox only — no real money moves in this demo.</p>
          <p className="mt-1 text-ink-soft">The scooter photos are AI-generated demo photos.</p>
          <p className="mt-1 text-ink-soft">
            MIT licence
            {sourceUrl === '' ? null : (
              <>
                {' · '}
                <a href={sourceUrl} rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-ink underline decoration-rule underline-offset-4">
                  Source code
                </a>
              </>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
