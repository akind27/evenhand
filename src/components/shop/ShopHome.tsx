'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DemoBadge } from '@/components/common/DemoBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ActionBar, ErrorLine, FieldLabel } from '@/components/doc/DocParts';
import { Guilloche } from '@/components/doc/Guilloche';
import { createHandover, errorMessage, type HandoverView, type PublicShop } from '@/lib/client/api';
import { euro } from '@/lib/client/format';
import { saveLinks } from '@/lib/client/saved-links';
import { usePolling } from '@/lib/client/use-polling';

/** The shop's handovers, newest first, and the form for a new one. */
export function ShopHome({ shopId }: { shopId: string }) {
  const router = useRouter();
  const shop = usePolling<{ shop: PublicShop }>(`/api/shops/${encodeURIComponent(shopId)}`, { intervalMs: 30000 });
  // The shop home polls every 6 seconds (I7).
  const list = usePolling<{ handovers: HandoverView[] }>(`/api/shops/${encodeURIComponent(shopId)}/handovers`, { intervalMs: 6000 });
  const [creating, setCreating] = useState(false);
  const [itemType, setItemType] = useState('');
  const [itemRef, setItemRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types = Array.from(new Set(shop.data?.shop.depositRules.map((rule) => rule.itemType) ?? []));
  const chosenType = itemType || types[0] || '';
  const handovers = [...(list.data?.handovers ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const made = await createHandover(shopId, { itemType: chosenType, itemRef });
      saveLinks(made.handoverId, { renterUrl: made.renterUrl, recordUrl: made.recordUrl });
      router.push(`/shop/${shopId}/h/${made.handoverId}`);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  if (shop.error !== null && shop.data === null) {
    return (
      <main className="doc-page">
        <p role="alert">{shop.error}</p>
        <p className="mt-2">This device is not signed in to this shop. Start from the home page.</p>
        <Link href="/" className="btn mt-4">Home</Link>
      </main>
    );
  }

  return (
    <main className="doc-page">
      <header className="relative overflow-hidden border-b-2 border-ink bg-panel px-4 pb-4 pt-5">
        <Guilloche seed={shopId} />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <FieldLabel en="Shop" el="Κατάστημα" />
            <h1 className="text-2xl font-bold text-balance">{shop.data?.shop.name ?? 'Loading…'}</h1>
          </div>
          <DemoBadge />
        </div>
      </header>

      <nav className="mt-3 flex gap-4" aria-label="Shop">
        <Link href={`/shop/${shopId}/dashboard`} className="inline-flex min-h-11 items-center underline">Dashboard</Link>
        <Link href={`/shop/${shopId}/settings`} className="inline-flex min-h-11 items-center underline">Deposit rules and prices</Link>
      </nav>

      {creating ? (
        <form
          id="new-handover"
          className="mt-6 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <h2 className="text-xl font-bold">New handover</h2>
          <label htmlFor="type"><FieldLabel en="Item" el="Αντικείμενο" /></label>
          <select id="type" className="input" value={chosenType} onChange={(e) => setItemType(e.target.value)}>
            {types.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <label htmlFor="ref"><FieldLabel en="Reference, such as the plate" el="Κωδικός" /></label>
          <input id="ref" className="input mono" required maxLength={40} value={itemRef} onChange={(e) => setItemRef(e.target.value)} />
          <ErrorLine message={error} />
        </form>
      ) : null}

      <section className="section-label" aria-label="Handovers">
        <div className="rule-top pt-3"><FieldLabel en="Handovers" el="Παραδόσεις" /></div>
        {list.error ? <p role="alert" className="mt-2">{list.error}</p> : null}
        {list.data && handovers.length === 0 && !creating ?<p className="mt-2">No handovers yet. Tap New handover to start.</p> : null}
        <ul className="m-0 list-none p-0">
          {handovers.map((h) => (
            <li key={h.id} className="rule-top">
              <Link href={`/shop/${shopId}/h/${h.id}`} className="flex min-h-14 items-center justify-between gap-3 py-3 no-underline">
                <span className="min-w-0">
                  <span className="block font-bold">{h.itemType}</span>
                  <span className="mono block break-all text-sm text-ink-soft">{h.itemRef}{h.deposit ? ` · ${euro(h.deposit.amountCents)}` : ''}</span>
                </span>
                <StatusBadge status={h.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {creating ? (
        <ActionBar>
          <button type="submit" form="new-handover" className="btn btn-primary" disabled={busy || chosenType === '' || itemRef.trim() === ''}>
            Start handover
          </button>
          <button type="button" className="btn" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </ActionBar>
      ) : (
        <ActionBar>
          <button type="button" className="btn btn-primary" disabled={types.length === 0} onClick={() => setCreating(true)}>
            New handover
          </button>
        </ActionBar>
      )}
    </main>
  );
}
