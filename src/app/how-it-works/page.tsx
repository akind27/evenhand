import Link from 'next/link';
import { AiLabel } from '@/components/common/AiLabel';
import { FieldLabel } from '@/components/doc/DocParts';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { TryDemoButton } from '@/components/shop/TryDemoButton';

export const metadata = {
  title: 'How it works · Evenhand',
  description: 'Four steps from photos to a settled deposit, what the AI does and does not do, and how the PayPal hold works.',
};

const STEPS = [
  {
    en: 'Photograph',
    el: 'Φωτογραφία',
    title: 'The shop photographs the item',
    body: [
      'The shop takes four photos: front, back, left and right. It can add close-ups of marks that are already there.',
      'The AI checks each photo and asks for a retake if it is blurry, dark or shows a person. The AI then writes down the marks that are already on the item.',
      'The shop picks the deposit from its own rules. The renter opens the same record on their own phone, in their own language.',
    ],
  },
  {
    en: 'Hold',
    el: 'Δέσμευση',
    title: 'PayPal reserves the deposit',
    body: [
      'The renter approves a PayPal hold. The money stays in the renter’s account. PayPal only reserves it.',
      'The renter keeps their passport. The shop sees that the hold is in place before it hands over the item.',
    ],
  },
  {
    en: 'Return',
    el: 'Επιστροφή',
    title: 'The AI lists only new marks',
    body: [
      'At return the shop takes the same four photos. The AI compares each one with its pickup photo and lists only marks that are new.',
      'Each new mark is matched to a line of the shop’s own price list. A mark the AI is not sure about is shown as “needs a human look”.',
    ],
  },
  {
    en: 'Settle',
    el: 'Εκκαθάριση',
    title: 'The hold is released, or a charge is agreed',
    body: [
      'Clean return: the hold is released at once and nothing is charged.',
      'Damage: the shop confirms the findings and proposes a charge. The renter sees the photos and accepts or disagrees. Only after the renter accepts does PayPal take the amount, and the rest is released.',
    ],
  },
];

const AI_DOES = [
  'Checks that each photo is usable and shows the right side.',
  'Writes down the marks already on the item at pickup.',
  'Compares return photos with pickup photos and lists new marks, with how sure it is.',
  'Matches each new mark to a line of the shop’s price list.',
  'Writes a short explanation in the renter’s language, labelled “AI-written explanation”.',
];
const AI_DOES_NOT = [
  'It never moves money. A person confirms every charge.',
  'It never invents a price. Amounts come from the shop’s price list.',
  'It never decides alone. Findings it is unsure about wait for a person.',
  'It is never asked to read identity documents. The app asks only for photos of the item, and the photo check asks for a retake when a person is the main subject.',
];

const PAYPAL_FLOW = [
  { term: 'Authorize', text: 'The renter approves the hold. PayPal reserves the deposit. No money moves.' },
  { term: 'Void', text: 'Clean return: the hold is voided and the money is free again at once.' },
  { term: 'Partial capture', text: 'Accepted damage: PayPal takes only the agreed amount. The rest is released.' },
  { term: 'Reauthorize', text: 'PayPal guarantees a hold for 3 days. If the rental runs longer, the hold is renewed after 3 days.' },
  { term: 'Valid for 29 days', text: 'A PayPal authorization stays valid for 29 days.' },
  { term: 'Sandbox only', text: 'This demo uses the PayPal sandbox. No real money moves.' },
];

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <h3 className="text-lg font-bold">{title}</h3>
      <ul className="m-0 mt-1 list-none p-0">
        {items.map((item) => (
          <li key={item} className="rule-top py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <>
      <main className="doc-page">
        <p className="pt-2">
          <Link href="/" className="inline-flex min-h-11 items-center underline decoration-rule underline-offset-4">
            ← Evenhand
          </Link>
        </p>
        <h1 className="text-3xl font-bold text-balance">How it works</h1>
        <p className="mt-2">Four steps. The renter and the shop see the same evidence at the same time.</p>

        {STEPS.map((step) => (
          <section key={step.en} aria-labelledby={`step-${step.en}`} className="section-label">
            <div className="rule-top pt-3">
              <FieldLabel en={step.en} el={step.el} />
              <h2 id={`step-${step.en}`} className="mt-1 text-xl font-bold text-balance">
                {step.title}
              </h2>
            </div>
            {step.body.map((paragraph) => (
              <p key={paragraph} className="mt-2">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <section aria-labelledby="ai-title" className="section-label">
          <div className="rule-top pt-3">
            <h2 id="ai-title" className="text-xl font-bold">
              What the AI does / does not do
            </h2>
          </div>
          <ListBlock title="What the AI does" items={AI_DOES} />
          <ListBlock title="What the AI does not do" items={AI_DOES_NOT} />
          <div className="mt-3">
            <AiLabel />
          </div>
        </section>

        <section aria-labelledby="paypal-title" className="section-label">
          <div className="rule-top pt-3">
            <h2 id="paypal-title" className="text-xl font-bold">
              The PayPal hold
            </h2>
          </div>
          <dl className="m-0 mt-1">
            {PAYPAL_FLOW.map((entry) => (
              <div key={entry.term} className="rule-top py-2">
                <dt className="font-bold">{entry.term}</dt>
                <dd className="m-0">{entry.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-10">
          <TryDemoButton />
        </div>
      </main>
      <LandingFooter />
    </>
  );
}
