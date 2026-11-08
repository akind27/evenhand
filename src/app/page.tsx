import Link from 'next/link';
import { DemoBadge } from '@/components/common/DemoBadge';
import { FieldLabel } from '@/components/doc/DocParts';
import { Guilloche } from '@/components/doc/Guilloche';
import { LandingBeforeAfter } from '@/components/landing/BeforeAfter';
import { BeyondScooters, BothSides, HowItWorksFields, PassportFacts, SealedRecord } from '@/components/landing/LandingSections';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { TryDemoButton } from '@/components/shop/TryDemoButton';
import { demoPickupFingerprint } from '@/lib/landing/sample-fingerprint';

export default function Home() {
  return (
    <>
      <main>
        <section aria-labelledby="hero-title" className="relative overflow-hidden border-b-2 border-ink bg-panel">
          {/* A rosette of fine curves behind the text column (curves only). On laptop widths it is lighter, so its ring does not run through the text. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-full lg:w-[52%]">
            <Guilloche seed="evenhand-landing" curves={9} fit="meet" className="opacity-80 lg:opacity-50" />
          </div>
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-12 pt-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-16">
            <div className="relative">
              {/* The demo stamp floats at the corner, so it never makes the name row tall. */}
              <div data-testid="hero-stamp" className="absolute right-0 top-0 z-10 origin-top-right scale-90">
                <DemoBadge />
              </div>
              <p className="text-xl font-bold">Evenhand</p>
              <div className="mt-6">
                <FieldLabel en="Deposit" el="Εγγύηση" />
                <h1 id="hero-title" className="mt-2 max-w-[16ch] text-4xl font-bold leading-[1.05] text-balance sm:text-5xl lg:text-6xl">
                  Keep your passport. Keep the peace.
                </h1>
                <p className="mt-5 max-w-prose text-lg">
                  A PayPal hold instead of a passport on the counter, and a sealed photo record both sides trust. AI compares the photos; a person decides any charge.
                </p>
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-start">
                <TryDemoButton className="sm:w-64" />
                <Link href="/how-it-works" className="btn btn-on-art sm:min-h-14">
                  How it works
                </Link>
              </div>
            </div>
            <LandingBeforeAfter />
          </div>
        </section>
        <PassportFacts />
        <HowItWorksFields />
        <BothSides />
        <SealedRecord fingerprint={demoPickupFingerprint()} />
        <BeyondScooters />
      </main>
      <LandingFooter />
    </>
  );
}
