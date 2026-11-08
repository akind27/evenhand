// The renter link carries a secret in its fragment. The server never sees it again after the handover is created,
// so this browser keeps it to show the QR code. It stays on this device.
export interface SavedLinks {
  renterUrl: string;
  recordUrl: string;
}

const key = (id: string) => `eh_links_${id}`;

export function saveLinks(id: string, links: SavedLinks): void {
  try {
    window.localStorage.setItem(key(id), JSON.stringify(links));
  } catch {
    // Storage may be blocked. The shop then sees a plain message instead of a QR code.
  }
}

export function loadLinks(id: string): SavedLinks | null {
  try {
    const raw = window.localStorage.getItem(key(id));
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SavedLinks>;
    return typeof parsed.renterUrl === 'string' && typeof parsed.recordUrl === 'string'
      ? { renterUrl: parsed.renterUrl, recordUrl: parsed.recordUrl }
      : null;
  } catch {
    return null;
  }
}
