'use client';
import { Stamp } from '@/components/doc/Stamp';
import { isDemo, useMode } from '@/lib/client/use-mode';

/** A round ochre stamp, shown only when the server runs in demo mode. */
export function DemoBadge() {
  const mode = useMode();
  if (!isDemo(mode)) {
    return null;
  }
  return <Stamp kind="demo" label="Demo mode" round />;
}
