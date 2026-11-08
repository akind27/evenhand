'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorLine } from '@/components/doc/DocParts';
import { errorMessage, startDemo } from '@/lib/client/api';

/** Starts a fresh demo shop and opens it. Used on the landing and how-it-works pages. */
export function TryDemoButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const { shopId } = await startDemo();
      router.push(`/shop/${shopId}`);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void go()}>
        {busy ? 'Opening the demo shop…' : 'Try the demo'}
      </button>
      <ErrorLine message={error} />
    </div>
  );
}
