import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAMPLE_PHOTO_HASHES, isSampleHash } from '@/lib/demo/sample-photos';

const DEMO_DIR = join(process.cwd(), 'public', 'demo', 'scooter-a');

/** Every bundled sample photo on disk, as "set/angle" → SHA-256 of the bytes. */
function hashesOnDisk(): Record<string, string> {
  const found: Record<string, string> = {};
  for (const set of readdirSync(DEMO_DIR).sort()) {
    for (const file of readdirSync(join(DEMO_DIR, set)).filter((name) => name.endsWith('.jpg')).sort()) {
      found[`${set}/${file.replace(/\.jpg$/, '')}`] = createHash('sha256').update(readFileSync(join(DEMO_DIR, set, file))).digest('hex');
    }
  }
  return found;
}

describe('bundled sample photo hashes', () => {
  it('match the 12 files in public/demo/scooter-a exactly (regenerate the constant when a photo changes)', () => {
    const onDisk = hashesOnDisk();
    expect(Object.keys(onDisk)).toHaveLength(12);
    expect(SAMPLE_PHOTO_HASHES).toEqual(onDisk);
  });

  it('recognise every bundled photo and nothing else', () => {
    for (const hash of Object.values(SAMPLE_PHOTO_HASHES)) {
      expect(isSampleHash(hash)).toBe(true);
    }
    expect(isSampleHash('0'.repeat(64))).toBe(false);
    expect(isSampleHash('')).toBe(false);
  });
});
