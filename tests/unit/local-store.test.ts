import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { StoredEvent } from '@/lib/domain/events';
import type { Shop } from '@/lib/domain/types';
import { createLocalStore } from '@/lib/evidence/local-store';
import { AppendConflictError, type AssessmentRecord } from '@/lib/evidence/store';

function newStore(): { root: string; store: ReturnType<typeof createLocalStore> } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evenhand-'));
  return { root, store: createLocalStore(root) };
}

function storedEvent(seq: number): StoredEvent {
  return {
    seq,
    at: '2026-11-08T10:00:00.000Z',
    actor: 'shop',
    event: { type: 'sharedWithRenter' },
    prevHash: '0'.repeat(64),
    hash: 'a'.repeat(64),
  };
}

function shopVersion(name: string, createdAt: string): Shop {
  return {
    id: 'shop1',
    name,
    currency: 'EUR',
    depositRules: [],
    priceList: [],
    isDemo: true,
    secretHash: 'fake-hash',
    createdAt,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('local evidence store', () => {
  it('the latest shop version wins even when versions are saved in the same millisecond', async () => {
    const { store } = newStore();
    const frozen = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-08T10:00:00.000Z'));
    vi.useFakeTimers({ now: Date.parse('2026-11-08T10:00:00.000Z'), toFake: ['Date'] });
    try {
      for (let n = 1; n <= 20; n += 1) {
        await store.saveShop(shopVersion(`v${n}`, '2026-11-08T10:00:00.000Z'));
      }
    } finally {
      vi.useRealTimers();
      frozen.mockRestore();
    }
    expect((await store.getShop('shop1'))?.name).toBe('v20');
  });

  it('photo round-trips byte for byte', async () => {
    const { store } = newStore();
    const bytes = new Uint8Array([0, 1, 2, 254, 255]);
    const { url } = await store.putPhoto('h1', 'p1', bytes);
    expect(url).toBe('/api/local-photo/h1/p1');
    expect(Array.from(await store.getPhotoBytes(url))).toEqual(Array.from(bytes));
  });

  it('events come back sorted by seq', async () => {
    const { store } = newStore();
    for (const seq of [2, 0, 10, 1]) {
      await store.appendEvent('h1', storedEvent(seq));
    }
    const events = await store.listEvents('h1');
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 10]);
  });

  it('appending the same seq twice throws AppendConflictError', async () => {
    const { store } = newStore();
    await store.appendEvent('h1', storedEvent(0));
    await expect(store.appendEvent('h1', storedEvent(0))).rejects.toBeInstanceOf(AppendConflictError);
  });

  it('latest shop version wins', async () => {
    const { store } = newStore();
    expect(await store.getShop('shop1')).toBeNull();
    await store.saveShop(shopVersion('first', '2026-11-08T10:00:00.000Z'));
    // Separate the two saves by a few milliseconds so their ISO time prefixes differ.
    await sleep(5);
    await store.saveShop(shopVersion('second', '2026-11-08T10:05:00.000Z'));
    const latest = await store.getShop('shop1');
    expect(latest?.name).toBe('second');
  });

  it('lists indexed handovers', async () => {
    const { store } = newStore();
    await store.indexHandover('shop1', 'h-b');
    await store.indexHandover('shop1', 'h-a');
    expect(await store.listHandoverIds('shop1')).toEqual(['h-a', 'h-b']);
    expect(await store.listHandoverIds('other-shop')).toEqual([]);
  });

  it('rejects a path-traversal id like ../x', async () => {
    const { root, store } = newStore();
    const bytes = new Uint8Array([1, 2, 3]);
    await expect(store.putPhoto('../x', 'p1', bytes)).rejects.toThrow('Invalid id');
    await expect(store.appendEvent('../x', storedEvent(0))).rejects.toThrow('Invalid id');
    await expect(store.indexHandover('shop1', '../x')).rejects.toThrow('Invalid id');
    expect(fs.existsSync(path.join(root, 'photos'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'events'))).toBe(false);
  });

  it('rejects a photo URL that is not a local photo path', async () => {
    const { store } = newStore();
    await expect(store.getPhotoBytes('/api/local-photo/../../etc/passwd')).rejects.toThrow();
    await expect(store.getPhotoBytes('https://example.test/photo.jpg')).rejects.toThrow();
  });

  it('a second photo with the same id is refused and the first one is kept', async () => {
    const { store } = newStore();
    await store.putPhoto('h1', 'p1', new Uint8Array([1, 1, 1]));
    await expect(store.putPhoto('h1', 'p1', new Uint8Array([2, 2, 2]))).rejects.toThrow('Photo already exists');
    expect(Array.from(await store.getPhotoBytes('/api/local-photo/h1/p1'))).toEqual([1, 1, 1]);
  });

  it('two concurrent appends of the same seq: exactly one succeeds, the other throws AppendConflictError', async () => {
    const { root, store } = newStore();
    const results = await Promise.allSettled([
      store.appendEvent('h1', storedEvent(0)),
      store.appendEvent('h1', storedEvent(0)),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(AppendConflictError);

    const events = await store.listEvents('h1');
    expect(events).toHaveLength(1);
    expect(events[0].seq).toBe(0);
    // No temp files are left behind in the events folder.
    const names = fs.readdirSync(path.join(root, 'events', 'h1'));
    expect(names).toEqual(['000000.json']);
  });

  it('listEvents ignores a stray hidden temp file', async () => {
    const { root, store } = newStore();
    const dir = path.join(root, 'events', 'h1');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.000000.abcdefgh.tmp'), '{not valid json');
    expect(await store.listEvents('h1')).toEqual([]);
  });

  it('saveAssessment refuses to overwrite an existing record', async () => {
    const { store } = newStore();
    const record: AssessmentRecord = {
      id: 'a1',
      kind: 'photoCheck',
      model: 'fake-model',
      at: '2026-11-08T10:00:00.000Z',
      inputHashes: [],
      ok: true,
      failure: null,
      output: { usable: true },
    };
    await store.saveAssessment(record);
    await expect(store.saveAssessment({ ...record, ok: false })).rejects.toBeInstanceOf(AppendConflictError);
  });

  it('indexing the same handover twice is not an error', async () => {
    const { store } = newStore();
    await store.indexHandover('shop1', 'h-a');
    await expect(store.indexHandover('shop1', 'h-a')).resolves.toBeUndefined();
    expect(await store.listHandoverIds('shop1')).toEqual(['h-a']);
  });
});
