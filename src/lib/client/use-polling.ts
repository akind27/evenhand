'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiGet, errorMessage, renterHeaders } from '@/lib/client/api';

/** A renter page polls with its token; the device secret is read fresh on every call, so it is sent once it exists. */
export interface RenterCredentials {
  id: string;
  token: string;
}

export interface PollingOptions<T> {
  /** Time between fetches. Default 4 seconds. */
  intervalMs?: number;
  /** Sends the renter headers (token, and the device secret once this device has one). */
  renter?: RenterCredentials;
  /** When this says true for fetched data, the timer stops: nothing more can change (I7). Manual refresh still works. */
  stopWhen?: (data: T) => boolean;
}

export interface Polled<T> {
  data: T | null;
  error: string | null;
  /** The HTTP status of the last failure, or null when the last fetch worked or had no response. */
  errorStatus: number | null;
  /** Fetches now, outside the timer. */
  refresh: () => Promise<void>;
}

const DEFAULT_INTERVAL_MS = 4000;

/** Fetches `url` now and every interval. Pauses while the tab is hidden, stops on unmount and once `stopWhen` holds. */
export function usePolling<T>(url: string, options: PollingOptions<T> = {}): Polled<T> {
  const { intervalMs = DEFAULT_INTERVAL_MS, renter, stopWhen } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef(false);
  const stopRef = useRef(stopWhen);
  stopRef.current = stopWhen;
  const renterId = renter?.id;
  const renterToken = renter?.token;

  const stopTimer = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const headers = renterId === undefined || renterToken === undefined ? undefined : renterHeaders(renterId, renterToken);
      const next = await apiGet<T>(url, headers);
      if (alive.current) {
        setData(next);
        setError(null);
        setErrorStatus(null);
        if (stopRef.current?.(next)) {
          done.current = true;
          stopTimer();
        }
      }
    } catch (failure) {
      if (alive.current) {
        setError(errorMessage(failure));
        setErrorStatus(failure instanceof ApiError && failure.status > 0 ? failure.status : null);
      }
    }
  }, [url, renterId, renterToken, stopTimer]);

  useEffect(() => {
    alive.current = true;
    done.current = false;
    const start = () => {
      stopTimer();
      if (done.current) {
        return;
      }
      void refresh();
      timer.current = setInterval(() => void refresh(), intervalMs);
    };
    const onVisibility = () => (document.hidden ? stopTimer() : start());
    if (!document.hidden) {
      start();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive.current = false;
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, intervalMs, stopTimer]);

  return { data, error, errorStatus, refresh };
}
