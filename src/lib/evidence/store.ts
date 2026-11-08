import type { StoredEvent } from '@/lib/domain/events';
import type { Shop } from '@/lib/domain/types';

/** Thrown when an event with the same sequence number is already stored for a handover. */
export class AppendConflictError extends Error {}

export interface AssessmentRecord {
  id: string;
  kind: 'photoCheck' | 'condition' | 'comparison';
  /** The model that wrote the answer, as the API reported it. Not a model name for non-AI fallbacks ('recorded', 'ai-limit'). */
  model: string;
  /** True when the answer was replayed from the recorded sample answers instead of a live call. */
  recorded?: boolean;
  at: string;
  inputHashes: string[];
  ok: boolean;
  failure: null | 'refusal' | 'invalid' | 'timeout' | 'api' | 'unavailable';
  output: unknown;
}

export interface EvidenceStore {
  putPhoto(handoverId: string, photoId: string, bytes: Uint8Array): Promise<{ url: string }>;
  getPhotoBytes(url: string): Promise<Uint8Array>;
  appendEvent(handoverId: string, ev: StoredEvent): Promise<void>; // throws AppendConflictError if that seq already exists
  listEvents(handoverId: string): Promise<StoredEvent[]>; // sorted by seq
  saveShop(shop: Shop): Promise<void>; // append-only versions; latest wins
  /** `fresh: true` never answers from a cache: use it when an old copy would be sealed into a record. */
  getShop(shopId: string, opts?: { fresh?: boolean }): Promise<Shop | null>;
  indexHandover(shopId: string, handoverId: string): Promise<void>;
  listHandoverIds(shopId: string): Promise<string[]>;
  saveAssessment(a: AssessmentRecord): Promise<void>;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Throws "Invalid id" unless the value is safe to use inside a key or a file path. */
export function assertId(value: string): string {
  if (!SAFE_ID.test(value)) {
    throw new Error('Invalid id');
  }
  return value;
}

/** File or blob name for one event, e.g. `000007.json`. Padded so that lexical order matches seq order. */
export function eventFileName(seq: number): string {
  if (!Number.isSafeInteger(seq) || seq < 0) {
    throw new Error('Invalid seq');
  }
  return `${String(seq).padStart(6, '0')}.json`;
}

let lastVersionMs = 0;

/**
 * The ISO time that names a new shop version. It never repeats or goes back in this process, so two saves in
 * the same millisecond still sort in save order and "latest wins" never picks the older one.
 */
export function nextVersionTime(): string {
  const ms = Math.max(Date.now(), lastVersionMs + 1);
  lastVersionMs = ms;
  return new Date(ms).toISOString();
}

/** Sorts events by their seq number, lowest first. Returns a new array. */
export function sortBySeq(events: StoredEvent[]): StoredEvent[] {
  return [...events].sort((a, b) => a.seq - b.seq);
}
