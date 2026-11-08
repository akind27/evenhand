import { describe, expect, it } from 'vitest';
import { pollingDone } from '@/lib/client/polling-done';

describe('pollingDone (I7)', () => {
  it('keeps polling while the handover is open and the hold is fine', () => {
    expect(pollingDone({ handover: { settlement: null, holdLost: null } })).toBe(false);
  });

  it('stops once the handover is settled', () => {
    expect(pollingDone({ handover: { settlement: { kind: 'released' }, holdLost: null } })).toBe(true);
  });

  it('stops once the hold is lost: nothing more will change by itself', () => {
    expect(pollingDone({ handover: { settlement: null, holdLost: 'EXPIRED' } })).toBe(true);
  });
});
