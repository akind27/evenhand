'use client';
import { useEffect, useState } from 'react';
import { getMode, type Mode } from '@/lib/client/api';

let cached: Mode | null = null;

/** The server mode (fake or real PayPal, recorded or live AI). Null until it loads. */
export function useMode(): Mode | null {
  const [mode, setMode] = useState<Mode | null>(cached);
  useEffect(() => {
    if (cached !== null) {
      return;
    }
    let live = true;
    getMode()
      .then((loaded) => {
        cached = loaded;
        if (live) {
          setMode(loaded);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return mode;
}

export function isDemo(mode: Mode | null): boolean {
  return mode !== null && (mode.payments === 'fake' || mode.ai === 'recorded');
}
