'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ActionBar, ErrorLine, FieldLabel } from '@/components/doc/DocParts';
import { errorMessage, saveShopLists, type PublicShop } from '@/lib/client/api';
import { centsToEuros, eurosToCents } from '@/lib/client/format';
import { usePolling } from '@/lib/client/use-polling';

interface Row {
  id: string;
  itemType: string;
  label: string;
  euros: string;
}

const newId = () => `x${Math.random().toString(36).slice(2, 10)}`;

function RowFields({ row, withType, onEdit, onDrop }: { row: Row; withType: boolean; onEdit: (next: Row) => void; onDrop: () => void }) {
  return (
    <li className="rule-top flex flex-col gap-2 py-3">
      {withType ? (
        <input className="input" aria-label="Item type" placeholder="Item type, e.g. 125cc scooter" maxLength={40} value={row.itemType} onChange={(e) => onEdit({ ...row, itemType: e.target.value })} />
      ) : null}
      <input className="input" aria-label="Label" placeholder="Label" maxLength={60} value={row.label} onChange={(e) => onEdit({ ...row, label: e.target.value })} />
      <div className="flex gap-2">
        <input className="input mono" aria-label="Amount in euros" inputMode="decimal" placeholder="0.00" value={row.euros} onChange={(e) => onEdit({ ...row, euros: e.target.value })} />
        <button type="button" className="btn shrink-0" onClick={onDrop}>Remove row</button>
      </div>
    </li>
  );
}

/** Edits the deposit rules and the damage price list. Nothing is saved until "Save". */
export function ShopSettings({ shopId }: { shopId: string }) {
  const { data, error: loadError } = usePolling<{ shop: PublicShop }>(`/api/shops/${encodeURIComponent(shopId)}`, { intervalMs: 600000 });
  const [rules, setRules] = useState<Row[] | null>(null);
  const [prices, setPrices] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && rules === null) {
      setRules(data.shop.depositRules.map((r) => ({ id: r.id, itemType: r.itemType, label: r.label, euros: centsToEuros(r.amountCents) })));
      setPrices(data.shop.priceList.map((p) => ({ id: p.id, itemType: '', label: p.label, euros: centsToEuros(p.amountCents) })));
    }
  }, [data, rules]);

  async function save() {
    if (rules === null || prices === null) return;
    const cents = [...rules, ...prices].map((r) => eurosToCents(r.euros));
    if (cents.some(Number.isNaN)) {
      setError('Every amount must be a number, such as 12.50.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveShopLists(shopId, {
        depositRules: rules.map((r, i) => ({ id: r.id, itemType: r.itemType.trim(), label: r.label.trim(), amountCents: cents[i] })),
        priceList: prices.map((p, i) => ({ id: p.id, label: p.label.trim(), amountCents: cents[rules.length + i] })),
      });
      setSaved(true);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  if (rules === null || prices === null) {
    return <main className="doc-page"><p role={loadError ? 'alert' : 'status'}>{loadError ?? 'Loading…'}</p></main>;
  }
  const edit = (list: Row[], set: (rows: Row[]) => void) => (next: Row) => set(list.map((r) => (r.id === next.id ? next : r)));
  return (
    <main className="doc-page">
      <Link href={`/shop/${shopId}`} className="inline-flex min-h-11 items-center underline">All handovers</Link>
      <h1 className="mt-2 text-2xl font-bold">Deposit rules and prices</h1>
      <p className="text-ink-soft">Renters see these before they agree to anything.</p>

      <section className="section-label">
        <FieldLabel en="Deposit rules" el="Κανόνες εγγύησης" />
        <ul className="m-0 list-none p-0">
          {rules.map((row) => (
            <RowFields key={row.id} row={row} withType onEdit={edit(rules, setRules)} onDrop={() => setRules(rules.filter((r) => r.id !== row.id))} />
          ))}
        </ul>
        <button type="button" className="btn mt-2" onClick={() => setRules([...rules, { id: newId(), itemType: '', label: '', euros: '' }])}>Add a deposit rule</button>
      </section>

      <section className="section-label">
        <FieldLabel en="Damage price list" el="Τιμοκατάλογος" />
        <ul className="m-0 list-none p-0">
          {prices.map((row) => (
            <RowFields key={row.id} row={row} withType={false} onEdit={edit(prices, setPrices)} onDrop={() => setPrices(prices.filter((r) => r.id !== row.id))} />
          ))}
        </ul>
        <button type="button" className="btn mt-2" onClick={() => setPrices([...prices, { id: newId(), itemType: '', label: '', euros: '' }])}>Add a price</button>
      </section>

      <ErrorLine message={error} />
      {saved ? <p role="status" className="mt-3 font-semibold text-stamp-released">Saved.</p> : null}
      <ActionBar>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>Save</button>
      </ActionBar>
    </main>
  );
}
