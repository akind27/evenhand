import { RENTER_HEADER } from '@/lib/client/api';
import { readRenterToken } from '@/lib/client/renter-token';

export const VIEW_HEADER = 'x-view-key';
const key = (id: string) => `eh_v_${id}`;
const memory = new Map<string, string>();

function viewKeyFromHash(hash: string): string | null {
  const match = /(?:^#|&)v=([^&]+)/.exec(hash);
  if (match === null) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** The view key: from the fragment first (kept for this tab), otherwise from this tab's session. The caller removes the fragment. */
function readViewKey(id: string): string | null {
  const fromHash = viewKeyFromHash(window.location.hash);
  if (fromHash !== null) {
    memory.set(id, fromHash);
    try {
      window.sessionStorage.setItem(key(id), fromHash);
    } catch {
      // Storage may be blocked. The key still works for this page view.
    }
    return fromHash;
  }
  try {
    return window.sessionStorage.getItem(key(id));
  } catch {
    return memory.get(id) ?? null;
  }
}

/**
 * The headers for a read of the record. A shop needs none: its cookie is sent by the browser.
 * A viewer sends the view key; a renter sends their own token (Ruling R22). Any fragment is removed from the address bar.
 */
export function recordHeaders(id: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const view = readViewKey(id);
  if (view !== null) {
    headers[VIEW_HEADER] = view;
  }
  const renter = readRenterToken(id); // also removes the fragment when it held a token
  if (renter !== null) {
    headers[RENTER_HEADER] = renter;
  }
  if (window.location.hash !== '') {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  }
  return headers;
}
