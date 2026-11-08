'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { FieldLabel } from '@/components/doc/DocParts';
import { Guilloche } from '@/components/doc/Guilloche';
import { dashboardTotals, type DashboardRow } from '@/components/shop/holds-math';
import { euro } from '@/lib/client/format';
import { usePolling } from '@/lib/client/use-polling';
import type { PublicShop } from '@/lib/client/api';

// The grid needs the browser, so it never renders on the server.
const HoldsGrid = dynamic(() => import('@/components/shop/HoldsGrid'), {
  ssr: false,
  loading: () => <p className="py-6">Loading the table…</p>,
});

function Total({ en, el, value }: { en: string; el: string; value: string }) {
  return (
    <div className="min-w-0">
      <FieldLabel en={en} el={el} />
      <p className="mono text-xl font-medium">{value}</p>
    </div>
  );
}

/** All holds of one shop in a table, with the totals above it. */
export function HoldsDashboard({ shopId }: { shopId: string }) {
  const router = useRouter();
  const shop = usePolling<{ shop: PublicShop }>(`/api/shops/${encodeURIComponent(shopId)}`, { intervalMs: 30000 });
  const list = usePolling<{ handovers: DashboardRow[] }>(`/api/shops/${encodeURIComponent(shopId)}/handovers`, { intervalMs: 6000 });
  const rows = useMemo(() => list.data?.handovers ?? [], [list.data]);
  // The clock moves when new data arrives, which is often enough for a label in hours.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the clock is meant to move with each poll
  const now = useMemo(() => new Date(), [list.data]);
  const totals = useMemo(() => dashboardTotals(rows), [rows]);

  if (list.error !== null && list.data === null) {
    return (
      <main className="doc-page">
        <p role="alert">{list.error}</p>
        <p className="mt-2">This device is not signed in to this shop. Start from the home page.</p>
        <Link href="/" className="btn mt-4">Home</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-4">
      <header className="relative overflow-hidden border-b-2 border-ink bg-panel px-4 pb-4 pt-5">
        <Guilloche seed={`${shopId}-holds`} />
        <div className="relative">
          <FieldLabel en="Holds" el="Εγγυήσεις" />
          <h1 className="text-2xl font-bold text-balance">{shop.data?.shop.name ?? 'Loading…'}</h1>
        </div>
      </header>

      <nav className="mt-3" aria-label="Shop">
        <Link href={`/shop/${shopId}`} className="inline-flex min-h-11 items-center underline">Back to handovers</Link>
      </nav>

      <section aria-label="Totals" className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-b border-rule pb-4 sm:grid-cols-4">
        <Total en="Active holds" el="Ενεργές" value={String(totals.active)} />
        <Total en="Released" el="Αποδεσμεύτηκαν" value={euro(totals.releasedCents)} />
        <Total en="Charged" el="Χρεώθηκαν" value={euro(totals.chargedCents)} />
        <Total en="Disputes" el="Διαφωνίες" value={String(totals.disputes)} />
      </section>

      <section aria-label="All holds" className="mt-6">
        {list.data !== null && rows.length === 0 ? (
          <p>No handovers yet. Start one from the handovers page.</p>
        ) : (
          <HoldsGrid shopId={shopId} rows={rows} now={now} onOpen={(id) => router.push(`/shop/${shopId}/h/${id}`)} />
        )}
      </section>
    </main>
  );
}
