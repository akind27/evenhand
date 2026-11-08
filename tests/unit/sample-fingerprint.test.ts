import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('node:fs');
});

describe('demoPickupFingerprint', () => {
  it('is the SHA-256 of the file bytes, the same value a demo record shows for the uploaded sample photo', async () => {
    const { demoPickupFingerprint } = await import('@/lib/landing/sample-fingerprint');
    const bytes = readFileSync(join(process.cwd(), 'public', 'demo', 'scooter-a', 'pickup', 'left.jpg'));
    expect(demoPickupFingerprint()).toBe(createHash('sha256').update(bytes).digest('hex'));
  });

  it('returns null instead of crashing when the file is missing', async () => {
    vi.doMock('node:fs', () => ({
      readFileSync: () => {
        throw new Error('ENOENT');
      },
    }));
    const { demoPickupFingerprint } = await import('@/lib/landing/sample-fingerprint');
    expect(demoPickupFingerprint()).toBeNull();
  });
});
