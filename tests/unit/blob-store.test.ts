import { BlobError, BlobNotFoundError, head, list, put } from '@vercel/blob';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredEvent } from '@/lib/domain/events';
import { createBlobStore } from '@/lib/evidence/blob-store';
import { AppendConflictError, type AssessmentRecord } from '@/lib/evidence/store';

vi.mock('@vercel/blob', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vercel/blob')>();
  return { ...actual, put: vi.fn(), list: vi.fn(), head: vi.fn() };
});

const FAKE_TOKEN = 'vercel_blob_rw_fake_test_token';
const putMock = vi.mocked(put);
const listMock = vi.mocked(list);
const headMock = vi.mocked(head);

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

function listEntry(pathname: string, url: string) {
  return {
    url,
    downloadUrl: `${url}?download=1`,
    pathname,
    size: 10,
    uploadedAt: new Date('2026-11-08T10:00:00.000Z'),
    etag: 'fake-etag',
  };
}

function assessment(): AssessmentRecord {
  return {
    id: 'a1',
    kind: 'photoCheck',
    model: 'fake-model',
    at: '2026-11-08T10:00:00.000Z',
    inputHashes: [],
    ok: true,
    failure: null,
    output: { usable: true },
  };
}

beforeEach(() => {
  putMock.mockReset();
  listMock.mockReset();
  headMock.mockReset();
  // Default: nothing exists yet at any pathname.
  headMock.mockRejectedValue(new BlobNotFoundError());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('blob evidence store', () => {
  it('appendEvent passes allowOverwrite false and addRandomSuffix false', async () => {
    putMock.mockResolvedValue(undefined as never);
    const store = createBlobStore(FAKE_TOKEN);

    await store.appendEvent('h1', storedEvent(0));

    expect(putMock).toHaveBeenCalledWith(
      'events/h1/000000.json',
      expect.any(String),
      expect.objectContaining({
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: false,
        token: FAKE_TOKEN,
      }),
    );
  });

  it('an event that already exists is refused before any upload', async () => {
    headMock.mockReset();
    headMock.mockResolvedValue({} as never);
    const store = createBlobStore(FAKE_TOKEN);

    await expect(store.appendEvent('h1', storedEvent(0))).rejects.toBeInstanceOf(AppendConflictError);
    expect(putMock).not.toHaveBeenCalled();
  });

  it('when the upload fails and the event now exists, it is an AppendConflictError', async () => {
    headMock.mockReset();
    headMock.mockRejectedValueOnce(new BlobNotFoundError()).mockResolvedValueOnce({} as never);
    putMock.mockRejectedValue(new BlobError('service unavailable'));
    const store = createBlobStore(FAKE_TOKEN);

    await expect(store.appendEvent('h1', storedEvent(0))).rejects.toBeInstanceOf(AppendConflictError);
  });

  it('when the upload fails and nothing exists, the original error is rethrown', async () => {
    putMock.mockRejectedValue(new BlobError('service unavailable'));
    const store = createBlobStore(FAKE_TOKEN);

    const failure = store.appendEvent('h1', storedEvent(0));
    await expect(failure).rejects.toBeInstanceOf(BlobError);
    await expect(failure).rejects.not.toBeInstanceOf(AppendConflictError);
  });

  it('listEvents reads via list() with the events prefix', async () => {
    const bodies: Record<string, StoredEvent> = {
      'https://blob.test/e1': storedEvent(1),
      'https://blob.test/e0': storedEvent(0),
    };
    listMock.mockResolvedValueOnce({
      blobs: [
        listEntry('events/h1/000001.json', 'https://blob.test/e1'),
        listEntry('events/h1/000000.json', 'https://blob.test/e0'),
      ],
      hasMore: false,
    } as never);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      return new Response(JSON.stringify(bodies[String(input)]));
    });
    const store = createBlobStore(FAKE_TOKEN);

    const events = await store.listEvents('h1');

    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'events/h1/', token: FAKE_TOKEN }));
    expect(events.map((e) => e.seq)).toEqual([0, 1]);
  });

  it('listEvents follows the cursor until hasMore is false', async () => {
    const bodies: Record<string, StoredEvent> = {
      'https://blob.test/e0': storedEvent(0),
      'https://blob.test/e1': storedEvent(1),
    };
    listMock
      .mockResolvedValueOnce({
        blobs: [listEntry('events/h1/000000.json', 'https://blob.test/e0')],
        cursor: 'page-2',
        hasMore: true,
      } as never)
      .mockResolvedValueOnce({
        blobs: [listEntry('events/h1/000001.json', 'https://blob.test/e1')],
        hasMore: false,
      } as never);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      return new Response(JSON.stringify(bodies[String(input)]));
    });
    const store = createBlobStore(FAKE_TOKEN);

    const events = await store.listEvents('h1');

    expect(listMock).toHaveBeenCalledTimes(2);
    expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'page-2' }));
    expect(events.map((e) => e.seq)).toEqual([0, 1]);
  });

  it('rejects a path-traversal id before any upload', async () => {
    const store = createBlobStore(FAKE_TOKEN);

    await expect(store.appendEvent('../x', storedEvent(0))).rejects.toThrow('Invalid id');
    expect(putMock).not.toHaveBeenCalled();
  });

  it('indexing the same handover twice is not an error and uploads once', async () => {
    headMock.mockReset();
    headMock.mockRejectedValueOnce(new BlobNotFoundError()).mockResolvedValueOnce({} as never);
    putMock.mockResolvedValue(undefined as never);
    const store = createBlobStore(FAKE_TOKEN);

    await expect(store.indexHandover('shop1', 'h-a')).resolves.toBeUndefined();
    await expect(store.indexHandover('shop1', 'h-a')).resolves.toBeUndefined();
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it('saveAssessment writes only when nothing exists yet', async () => {
    putMock.mockResolvedValue(undefined as never);
    const store = createBlobStore(FAKE_TOKEN);

    await store.saveAssessment(assessment());

    expect(putMock).toHaveBeenCalledWith(
      'assessments/a1.json',
      expect.any(String),
      expect.objectContaining({ allowOverwrite: false, addRandomSuffix: false, token: FAKE_TOKEN }),
    );
  });

  it('saveAssessment refuses to overwrite an existing record', async () => {
    headMock.mockReset();
    headMock.mockResolvedValue({} as never);
    const store = createBlobStore(FAKE_TOKEN);

    await expect(store.saveAssessment(assessment())).rejects.toBeInstanceOf(AppendConflictError);
    expect(putMock).not.toHaveBeenCalled();
  });

  it('getPhotoBytes reads a photo from the Vercel Blob host', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(new Uint8Array([7, 8])));
    const store = createBlobStore(FAKE_TOKEN);
    const url = 'https://abc123.public.blob.vercel-storage.com/photos/h1/p1-x.jpg';

    expect(Array.from(await store.getPhotoBytes(url))).toEqual([7, 8]);
    expect(fetchSpy).toHaveBeenCalledWith(url);
  });

  it('getPhotoBytes refuses any other host, scheme or look-alike host, without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const store = createBlobStore(FAKE_TOKEN);

    await expect(store.getPhotoBytes('https://evil.example.test/x.jpg')).rejects.toThrow('Invalid photo URL');
    await expect(store.getPhotoBytes('http://abc.public.blob.vercel-storage.com/x.jpg')).rejects.toThrow(
      'Invalid photo URL',
    );
    await expect(
      store.getPhotoBytes('https://abc.public.blob.vercel-storage.com.evil.test/x.jpg'),
    ).rejects.toThrow('Invalid photo URL');
    await expect(store.getPhotoBytes('not a url')).rejects.toThrow('Invalid photo URL');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
