import { BlobNotFoundError, head, list, put, type ListBlobResultBlob } from '@vercel/blob';
import type { StoredEvent } from '@/lib/domain/events';
import type { Shop } from '@/lib/domain/types';
import { randomToken } from '@/lib/evidence/hash';
import {
  AppendConflictError,
  assertId,
  eventFileName,
  nextVersionTime,
  sortBySeq,
  type AssessmentRecord,
  type EvidenceStore,
} from '@/lib/evidence/store';

const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

/** True when a blob exists at the pathname. Uses the not-found error class, not message text. */
async function exists(pathname: string, token: string): Promise<boolean> {
  try {
    await head(pathname, { token });
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return false;
    }
    throw error;
  }
}

/**
 * Writes a blob only when nothing exists at that pathname. Throws AppendConflictError when
 * a blob is already there. If the write fails, checks again: a blob that now exists means
 * another writer won the race. Otherwise the original error is rethrown.
 */
async function putNew(pathname: string, body: string, contentType: string, token: string): Promise<void> {
  if (await exists(pathname, token)) {
    throw new AppendConflictError(`${pathname} already exists`);
  }
  try {
    await put(pathname, body, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType,
      token,
    });
  } catch (error) {
    const present = await exists(pathname, token).catch(() => false);
    if (present) {
      throw new AppendConflictError(`${pathname} already exists`);
    }
    throw error;
  }
}

function assertBlobPhotoUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid photo URL');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) {
    throw new Error('Invalid photo URL');
  }
}

/** Lists every blob under a prefix, following `cursor` until `hasMore` is false. Never cached. */
async function listAll(prefix: string, token: string): Promise<ListBlobResultBlob[]> {
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, token, ...(cursor ? { cursor } : {}) });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function readJson<T>(blob: ListBlobResultBlob): Promise<T> {
  const response = await fetch(blob.url);
  if (!response.ok) {
    throw new Error(`Failed to read ${blob.pathname}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Evidence store kept in Vercel Blob. Blobs are never deleted. */
export function createBlobStore(token: string): EvidenceStore {
  return {
    async putPhoto(handoverId, photoId, bytes) {
      const h = assertId(handoverId);
      const p = assertId(photoId);
      const result = await put(`photos/${h}/${p}.jpg`, Buffer.from(bytes), {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'image/jpeg',
        token,
      });
      return { url: result.url };
    },

    async getPhotoBytes(url) {
      assertBlobPhotoUrl(url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to read photo ${url}: HTTP ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    async appendEvent(handoverId, ev) {
      const h = assertId(handoverId);
      await putNew(`events/${h}/${eventFileName(ev.seq)}`, JSON.stringify(ev), 'application/json', token);
    },

    async listEvents(handoverId) {
      const blobs = await listAll(`events/${assertId(handoverId)}/`, token);
      const events = await Promise.all(blobs.map((blob) => readJson<StoredEvent>(blob)));
      return sortBySeq(events);
    },

    async saveShop(shop: Shop) {
      const id = assertId(shop.id);
      await put(`shops/${id}/${nextVersionTime()}-${randomToken(8)}.json`, JSON.stringify(shop), {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'application/json',
        token,
      });
    },

    async getShop(shopId) {
      const prefix = `shops/${assertId(shopId)}/`;
      const blobs = (await listAll(prefix, token)).sort((a, b) => (a.pathname < b.pathname ? -1 : 1));
      if (blobs.length === 0) {
        return null;
      }
      return readJson<Shop>(blobs[blobs.length - 1]);
    },

    async indexHandover(shopId, handoverId) {
      const s = assertId(shopId);
      const h = assertId(handoverId);
      try {
        await putNew(`index/${s}/${h}`, 'indexed', 'text/plain', token);
      } catch (error) {
        // The marker already exists, so the handover is already indexed. Repeating the call is safe.
        if (error instanceof AppendConflictError) {
          return;
        }
        throw error;
      }
    },

    async listHandoverIds(shopId) {
      const prefix = `index/${assertId(shopId)}/`;
      const blobs = await listAll(prefix, token);
      return blobs.map((blob) => blob.pathname.slice(prefix.length)).sort();
    },

    async saveAssessment(a: AssessmentRecord) {
      const id = assertId(a.id);
      await putNew(`assessments/${id}.json`, JSON.stringify(a), 'application/json', token);
    },
  };
}
