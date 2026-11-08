// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from '@/lib/client/use-polling';

interface Data {
  settled: boolean;
}

function serve(sequence: Data[]) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const data = sequence[Math.min(call, sequence.length - 1)];
    call += 1;
    return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Lets the pending fetch promises and state updates run. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('usePolling (I7)', () => {
  it('fetches at once, then once per interval', async () => {
    const fetchMock = serve([{ settled: false }]);
    renderHook(() => usePolling<Data>('/api/x', { intervalMs: 4000 }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(3999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops polling once the data says it is settled', async () => {
    const fetchMock = serve([{ settled: false }, { settled: true }]);
    const { result } = renderHook(() => usePolling<Data>('/api/x', { intervalMs: 4000, stopWhen: (data) => data.settled }));
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    await flush();
    expect(result.current.data).toEqual({ settled: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      vi.advanceTimersByTime(40_000);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // A manual refresh (after the user acts) still works.
    await act(async () => {
      await result.current.refresh();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
