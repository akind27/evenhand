// The renter link carries a secret in its fragment (#t=...). This reads it once, keeps it on this device
// (one entry per handover, Ruling R38), and removes it from the address bar so it cannot be copied, shared
// or sent to the server by accident. Closing the tab does not lose it, so "Your record" keeps working.
// The token alone cannot act after the renter confirms: the device secret is needed too (renter-device.ts).
const key = (id: string) => `eh_t_${id}`;
// Fallback for browsers that block storage: lives only as long as the page.
const memory = new Map<string, string>();

function tokenFromHash(hash: string): string | null {
  const match = /(?:^#|&)t=([^&]+)/.exec(hash);
  if (match === null) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** The token for this handover: from the fragment first (then the fragment is removed), otherwise from this device. */
export function readRenterToken(id: string): string | null {
  const fromHash = tokenFromHash(window.location.hash);
  if (fromHash !== null) {
    memory.set(id, fromHash);
    try {
      window.localStorage.setItem(key(id), fromHash);
    } catch {
      // Storage may be blocked. The token still works for this page view.
    }
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    return fromHash;
  }
  try {
    return window.localStorage.getItem(key(id));
  } catch {
    return memory.get(id) ?? null;
  }
}
