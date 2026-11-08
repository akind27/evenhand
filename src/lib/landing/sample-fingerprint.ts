// SERVER ONLY. Reads one bundled demo photo from disk.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PHOTO = join('public', 'demo', 'scooter-a', 'pickup', 'left.jpg');

let cached: string | null | undefined;

/**
 * The real SHA-256 of the bundled demo pickup photo (left side). Sample photos upload unchanged, so a demo record
 * shows the same value. Null when the file cannot be read: the landing page then leaves that line out.
 */
export function demoPickupFingerprint(): string | null {
  if (cached === undefined) {
    try {
      cached = createHash('sha256').update(readFileSync(join(process.cwd(), PHOTO))).digest('hex');
    } catch {
      cached = null;
    }
  }
  return cached;
}
