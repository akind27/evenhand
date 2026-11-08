import * as fs from 'node:fs/promises';
import * as path from 'node:path';
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

const LOCAL_PHOTO_URL = /^\/api\/local-photo\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64})$/;

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Evidence store kept on disk under `rootDir`. Every key is checked with `assertId` first, so nothing is read or written outside `rootDir`. */
export function createLocalStore(rootDir = '.data'): EvidenceStore {
  const root = path.resolve(rootDir);

  function under(...parts: string[]): string {
    const target = path.join(root, ...parts);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error('Invalid id');
    }
    return target;
  }

  /** Reads the `.json` files in a folder, skipping hidden temp files (names starting with a dot). */
  async function readJsonFiles<T>(dir: string): Promise<T[]> {
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    }
    const files = names.filter((name) => name.endsWith('.json') && !name.startsWith('.')).sort();
    return Promise.all(files.map(async (name) => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')) as T));
  }

  return {
    async putPhoto(handoverId, photoId, bytes) {
      const h = assertId(handoverId);
      const p = assertId(photoId);
      const dir = under('photos', h);
      await fs.mkdir(dir, { recursive: true });
      try {
        await fs.writeFile(path.join(dir, `${p}.jpg`), bytes, { flag: 'wx' });
      } catch (error) {
        if (isAlreadyExists(error)) {
          throw new Error('Photo already exists');
        }
        throw error;
      }
      return { url: `/api/local-photo/${h}/${p}` };
    },

    async getPhotoBytes(url) {
      const match = LOCAL_PHOTO_URL.exec(url);
      if (!match) {
        throw new Error('Invalid photo URL');
      }
      const file = under('photos', assertId(match[1]), `${assertId(match[2])}.jpg`);
      return new Uint8Array(await fs.readFile(file));
    },

    async appendEvent(handoverId, ev) {
      const h = assertId(handoverId);
      const dir = under('events', h);
      await fs.mkdir(dir, { recursive: true });
      const name = eventFileName(ev.seq);
      const finalPath = path.join(dir, name);
      // Write the whole event to a hidden temp file first, then give it its final name with link().
      // link() fails when that name is already taken, and readers never see a half-written event.
      const tempPath = path.join(dir, `.${name}.${randomToken(8)}.tmp`);
      try {
        await fs.writeFile(tempPath, JSON.stringify(ev), { flag: 'wx' });
        await fs.link(tempPath, finalPath);
      } catch (error) {
        if (isAlreadyExists(error)) {
          throw new AppendConflictError(`Event ${ev.seq} already exists for handover ${h}`);
        }
        throw error;
      } finally {
        await fs.rm(tempPath, { force: true });
      }
    },

    async listEvents(handoverId) {
      const events = await readJsonFiles<StoredEvent>(under('events', assertId(handoverId)));
      return sortBySeq(events);
    },

    async saveShop(shop: Shop) {
      const id = assertId(shop.id);
      const dir = under('shops', id);
      await fs.mkdir(dir, { recursive: true });
      const name = `${nextVersionTime()}-${randomToken(8)}.json`;
      await fs.writeFile(path.join(dir, name), JSON.stringify(shop));
    },

    async getShop(shopId) {
      const shops = await readJsonFiles<Shop>(under('shops', assertId(shopId)));
      return shops.length === 0 ? null : shops[shops.length - 1];
    },

    async indexHandover(shopId, handoverId) {
      const s = assertId(shopId);
      const h = assertId(handoverId);
      const dir = under('index', s);
      await fs.mkdir(dir, { recursive: true });
      try {
        await fs.writeFile(path.join(dir, h), '', { flag: 'wx' });
      } catch (error) {
        // Already indexed. Repeating the call is safe.
        if (!isAlreadyExists(error)) {
          throw error;
        }
      }
    },

    async listHandoverIds(shopId) {
      let names: string[];
      try {
        names = await fs.readdir(under('index', assertId(shopId)));
      } catch (error) {
        if (isMissing(error)) {
          return [];
        }
        throw error;
      }
      return names.filter((name) => !name.startsWith('.')).sort();
    },

    async saveAssessment(a: AssessmentRecord) {
      const id = assertId(a.id);
      const dir = under('assessments');
      await fs.mkdir(dir, { recursive: true });
      try {
        await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(a), { flag: 'wx' });
      } catch (error) {
        if (isAlreadyExists(error)) {
          throw new AppendConflictError(`Assessment ${id} already exists`);
        }
        throw error;
      }
    },
  };
}
