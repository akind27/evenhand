import type { ReactNode } from 'react';
import { AiLabel } from '@/components/common/AiLabel';
import { FieldLabel } from '@/components/doc/DocParts';
import { MachineStrip } from '@/components/doc/MachineStrip';
import { Stamp } from '@/components/doc/Stamp';
import { Fingerprint } from '@/components/record/Fingerprint';
import { seedDepositRules } from '@/lib/demo/seed';

function Section({ id, label, children }: { id: string; label: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mx-auto w-full max-w-6xl px-4 pt-16">
      <div className="rule-top pt-3">
        <h2 id={id} className="text-2xl font-bold text-balance lg:text-3xl">
          {label}
        </h2>
      </div>
      {children}
    </section>
  );
}

function SourceLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

const FACTS = [
  {
    text: 'The UK government tells travellers to Greece not to hand over a passport as a deposit.',
    href: 'https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/778664/Holidaying_In_GREECE_pdfA.pdf',
    source: 'Source: UK Government, “Holidaying in Greece” (PDF)',
  },
  {
    text: 'Rental listings still accept a passport as the deposit.',
    href: 'https://motorbike.tcs.ch/en/rental/piaggio-beverly-300-gaios-greece-y0933p58we',
    source: 'Example: a scooter rental listing that accepts a passport as deposit',
  },
  {
    text: 'Travel guides warn about shops that keep the passport and then charge for old damage.',
    href: 'https://skootnow.pages.dev/guide/scooter-rental-scams-thailand',
    source: 'Source: a guide on scooter-rental passport and damage scams in Thailand',
  },
];

export function PassportFacts() {
  return (
    <Section id="facts-title" label="The passport on the counter">
      <ul className="m-0 mt-6 grid list-none gap-8 p-0 lg:grid-cols-3">
        {FACTS.map((fact) => (
          <li key={fact.href} className="rule-top pt-3">
            <p className="max-w-prose text-lg font-semibold">{fact.text}</p>
            <p className="mt-2 text-sm text-ink-soft">
              <SourceLink href={fact.href}>{fact.source}</SourceLink>
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

interface Step {
  en: string;
  el: string;
  title: string;
  body: string;
  mark: ReactNode;
}

const STEPS: Step[] = [
  {
    en: 'Photograph',
    el: 'Φωτογραφία',
    title: 'The shop photographs the item',
    body: 'Four sides, with a quick check on every photo. The renter sees the same record on their own phone.',
    mark: <AiLabel />,
  },
  {
    en: 'Hold',
    el: 'Δέσμευση',
    title: 'PayPal reserves the deposit',
    body: 'No money moves. The renter’s money stays in their account while the hold lasts.',
    mark: <Stamp kind="held" label="Held" />,
  },
  {
    en: 'Return',
    el: 'Επιστροφή',
    title: 'The AI lists only new marks',
    body: 'Return photos are compared with the pickup photos, and each new mark is matched to the shop’s own price list.',
    mark: <AiLabel />,
  },
  {
    en: 'Settle',
    el: 'Εκκαθάριση',
    title: 'Released, or a charge both sides see',
    body: 'Clean return: the hold is released at once. Damage: the shop proposes a charge, and the renter accepts or disagrees.',
    mark: <Stamp kind="released" label="Released" />,
  },
];

export function HowItWorksFields() {
  return (
    <Section id="how-title" label="How it works">
      <ol className="m-0 mt-6 grid list-none gap-8 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.en} className="rule-top flex flex-col gap-2 pt-3">
            <FieldLabel en={step.en} el={step.el} />
            <h3 className="text-xl font-bold leading-snug text-balance">{step.title}</h3>
            <p className="max-w-prose">{step.body}</p>
            <div className="mt-auto pt-2">{step.mark}</div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const RENTERS = [
  'You keep your passport.',
  'You see the same photos as the shop.',
  'Nothing is charged without your tap.',
  'Everything is shown in your language.',
];
const SHOPS = [
  'No more arguments at the counter.',
  'A hold that PayPal stands behind.',
  'Proof for real damage.',
  'A minute at the counter.',
];

function Column({ en, el, items }: { en: string; el: string; items: string[] }) {
  return (
    <div>
      <FieldLabel en={en} el={el} />
      <ul className="m-0 mt-2 list-none p-0">
        {items.map((item) => (
          <li key={item} className="rule-top py-3 text-lg">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BothSides() {
  return (
    <Section id="sides-title" label="Fair to both sides">
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <Column en="For renters" el="Για ενοικιαστές" items={RENTERS} />
        <Column en="For shops" el="Για καταστήματα" items={SHOPS} />
      </div>
    </Section>
  );
}

interface SealedRecordProps {
  /** Null when the demo photo cannot be read: the fingerprint and machine strip are then left out. */
  fingerprint: string | null;
}

const SAMPLE_DEPOSIT_CENTS = seedDepositRules().find((rule) => rule.id === 'scooter-125')?.amountCents ?? null;

export function SealedRecord({ fingerprint }: SealedRecordProps) {
  return (
    <Section id="record-title" label="The sealed record">
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="min-w-0">
          <p className="max-w-prose text-lg">Every photo is fingerprinted and every step is sealed to the one before.</p>
          <p className="mt-2 max-w-prose text-ink-soft">
            A sample of what both sides can open.{fingerprint === null ? '' : ' The fingerprint below is the real one of the demo pickup photo.'}
          </p>
        </div>
        <div className="min-w-0 border-2 border-ink bg-panel p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Stamp kind="released" label="Record intact" />
            <FieldLabel en="Sample record" el="Δείγμα εγγραφής" />
          </div>
          <ol className="m-0 mt-3 list-none p-0">
            {['Shop photographed four sides.', 'Renter checked the record and confirmed it.', 'PayPal hold placed. No money moved.'].map((line, index) => (
              <li key={line} className="rule-top py-2">
                <span className="mono text-sm text-ink-soft">Step {index + 1}</span>
                <p>{line}</p>
              </li>
            ))}
          </ol>
          {fingerprint === null ? null : (
            <>
              <Fingerprint value={fingerprint} label="Demo pickup left photo SHA-256" />
              <MachineStrip id="sample" itemRef="scooter-a" depositCents={SAMPLE_DEPOSIT_CENTS} status="held" lastHash={fingerprint} />
              {/* M12: on a real record the strip ends with the seal; this sample has no record, so say what the value is. */}
              <p className="text-sm text-ink-soft">The strip ends with the photo fingerprint, not a record seal.</p>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}

const NEXT_USES = [
  'Libraries of things',
  'Schools lending instruments and laptops',
  'Camera and lens rentals',
  'Hosts lending bikes',
  'Neighbours lending tools',
];

export function BeyondScooters() {
  return (
    <Section id="next-title" label="Beyond scooters">
      <p className="mt-3 max-w-prose text-ink-soft">
        Next steps for the same flow. None of these are live yet.
      </p>
      <ul className="m-0 mt-4 grid list-none gap-x-8 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {NEXT_USES.map((use) => (
          <li key={use} className="rule-top py-3 text-lg">
            {use}
          </li>
        ))}
      </ul>
    </Section>
  );
}
