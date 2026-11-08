export interface RateLimiter {
  /** Returns true and counts the try when the key is under its limit; false when blocked. */
  take(key: string): boolean;
}

/** Fixed-window counter per key, kept in memory. Blocked tries are not counted. */
export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const clock = opts.now ?? (() => Date.now());
  const windows = new Map<string, { startedAt: number; count: number }>();

  function prune(at: number): void {
    for (const [key, entry] of windows) {
      if (at - entry.startedAt >= opts.windowMs) {
        windows.delete(key);
      }
    }
  }

  return {
    take(key) {
      const at = clock();
      const current = windows.get(key);
      if (current === undefined || at - current.startedAt >= opts.windowMs) {
        if (windows.size > 1000) {
          prune(at);
        }
        windows.set(key, { startedAt: at, count: 1 });
        return opts.limit > 0;
      }
      if (current.count >= opts.limit) {
        return false;
      }
      windows.set(key, { startedAt: current.startedAt, count: current.count + 1 });
      return true;
    },
  };
}
