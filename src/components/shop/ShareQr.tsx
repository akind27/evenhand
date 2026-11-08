'use client';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { FieldLabel } from '@/components/doc/DocParts';
import { Guilloche } from '@/components/doc/Guilloche';
import { loadLinks, type SavedLinks } from '@/lib/client/saved-links';

/** The QR code the renter scans, on a guilloche card. The link lives only on the device that created the handover. */
export function ShareQr({ handoverId }: { handoverId: string }) {
  const [links, setLinks] = useState<SavedLinks | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const found = loadLinks(handoverId);
    setLinks(found);
    setLoaded(true);
    if (found === null) return;
    let live = true;
    const css = getComputedStyle(document.documentElement);
    const dark = css.getPropertyValue('--ink').trim() || '#14233B';
    const light = css.getPropertyValue('--paper').trim() || '#F2F6F4';
    QRCode.toDataURL(found.renterUrl, { margin: 1, width: 280, color: { dark, light } })
      .then((url) => live && setQr(url))
      .catch(() => live && setQr(null));
    return () => {
      live = false;
    };
  }, [handoverId]);

  if (!loaded) return null;
  if (links === null) {
    return <p>The renter link is only kept on the device that created this handover. Open it there to show the QR code.</p>;
  }
  return (
    <div className="relative overflow-hidden border-2 border-ink bg-panel p-5 text-center">
      <Guilloche seed={`share-${handoverId}`} />
      <div className="relative">
        <p><FieldLabel en="Scan to check the record" el="Σάρωση" /></p>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR code that opens the renter page" width={280} height={280} className="mx-auto mt-3 bg-paper" />
        ) : (
          <p className="my-10">Making the QR code…</p>
        )}
        <a className="btn mt-3" href={links.renterUrl} target="_blank" rel="noopener noreferrer">
          Open renter view
        </a>
      </div>
    </div>
  );
}
