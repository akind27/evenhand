import { createHash, randomBytes } from 'node:crypto';

/** Turns a value into the one canonical JSON string for it: sorted keys, no whitespace. Throws on values that cannot be hashed unambiguously. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) {
    throw new TypeError('canonicalJson: undefined is not allowed');
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`canonicalJson: non-finite number ${value} is not allowed`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === 'object') {
    return canonicalizeObject(value as Record<string, unknown>);
  }
  throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
}

function canonicalizeObject(source: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = canonicalize(source[key]);
  }
  return sorted;
}

/** SHA-256 of the input, as 64 lowercase hex characters. */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** A random URL-safe token. The default of 24 bytes gives 32 base64url characters. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}
