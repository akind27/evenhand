// Binds the renter role to the device that confirms first (Ruling R36).
// The browser makes a random secret, keeps it here, and sends only its SHA-256 when confirming.
// Every later renter action sends the secret itself in the x-renter-device header; the server compares hashes.
// A second device that has the link but not this secret can only read the record.
const key = (id: string) => `eh_d_${id}`;
const SECRET_BYTES = 32;
// Fallback for browsers that block storage: lives only as long as the page.
const memory = new Map<string, string>();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The device secret for this handover, or null when this device has never confirmed it. */
export function readDeviceSecret(id: string): string | null {
  try {
    return window.localStorage.getItem(key(id)) ?? memory.get(id) ?? null;
  } catch {
    return memory.get(id) ?? null;
  }
}

/** The device secret for this handover. Makes and keeps a new one (32 random bytes, base64url) when there is none. */
export function ensureDeviceSecret(id: string): string {
  const existing = readDeviceSecret(id);
  if (existing !== null) {
    return existing;
  }
  const bytes = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(bytes);
  const secret = base64url(bytes);
  memory.set(id, secret);
  try {
    window.localStorage.setItem(key(id), secret);
  } catch {
    // Storage may be blocked. The binding then lasts only as long as this page.
  }
  return secret;
}

/** SHA-256 of the secret as lowercase hex: what the server stores. */
export async function deviceHashOf(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
