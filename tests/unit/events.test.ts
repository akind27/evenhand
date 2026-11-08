import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, appendEvent, verifyChain, type HandoverEvent, type StoredEvent } from '@/lib/domain/events';

const NOW = new Date('2026-11-08T10:00:00.000Z');

const CREATED: HandoverEvent = {
  type: 'created',
  shopId: 'shop-1',
  itemType: 'scooter',
  itemRef: 'SC-01',
  priceList: [],
  depositRules: [],
  renterTokenHash: 'a'.repeat(64),
  viewKeyHash: 'b'.repeat(64),
};

describe('appendEvent', () => {
  it('starts an empty chain at seq 0 after the genesis hash', () => {
    const stored = appendEvent([], 'shop', CREATED, NOW);

    expect(stored.seq).toBe(0);
    expect(stored.prevHash).toBe(GENESIS_HASH);
    expect(stored.at).toBe(NOW.toISOString());
    expect(stored.actor).toBe('shop');
    expect(stored.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('links each event to the hash of the one before', () => {
    const first = appendEvent([], 'shop', CREATED, NOW);
    const second = appendEvent([first], 'system', { type: 'closed' }, NOW);

    expect(second.seq).toBe(1);
    expect(second.prevHash).toBe(first.hash);
  });
});

function buildChain(): StoredEvent[] {
  const first = appendEvent([], 'shop', CREATED, NOW);
  const second = appendEvent([first], 'shop', { type: 'sharedWithRenter' }, NOW);
  const third = appendEvent([first, second], 'system', { type: 'returnStarted' }, NOW);
  return [first, second, third];
}

describe('verifyChain', () => {
  it('accepts an untouched three-event chain', () => {
    expect(verifyChain(buildChain())).toEqual({ ok: true });
  });

  it('reports the first broken position when an event is changed', () => {
    const chain = buildChain();
    chain[1] = { ...chain[1], event: { type: 'closed' } };

    expect(verifyChain(chain)).toEqual({ ok: false, brokenAt: 1 });
  });

  it('accepts an empty chain', () => {
    expect(verifyChain([])).toEqual({ ok: true });
  });
});

describe('verifyChain tamper detection', () => {
  function tampered(index: number, patch: Partial<StoredEvent>): ReturnType<typeof verifyChain> {
    const chain = buildChain();
    chain[index] = { ...chain[index], ...patch };
    return verifyChain(chain);
  }

  it('detects a changed timestamp', () => {
    expect(tampered(1, { at: '2030-01-01T00:00:00.000Z' })).toEqual({ ok: false, brokenAt: 1 });
  });

  it('detects a changed actor', () => {
    expect(tampered(1, { actor: 'renter' })).toEqual({ ok: false, brokenAt: 1 });
  });

  it('detects a changed sequence number', () => {
    expect(tampered(1, { seq: 7 })).toEqual({ ok: false, brokenAt: 1 });
  });

  it('detects a changed link to the previous hash', () => {
    expect(tampered(1, { prevHash: 'f'.repeat(64) })).toEqual({ ok: false, brokenAt: 1 });
  });

  it('detects a changed hash', () => {
    expect(tampered(1, { hash: 'e'.repeat(64) })).toEqual({ ok: false, brokenAt: 1 });
  });

  it('detects a changed last event', () => {
    expect(tampered(2, { event: { type: 'closed' } })).toEqual({ ok: false, brokenAt: 2 });
  });

  it('detects a removed middle event', () => {
    const [first, , third] = buildChain();
    expect(verifyChain([first, third])).toEqual({ ok: false, brokenAt: 1 });
  });
});
