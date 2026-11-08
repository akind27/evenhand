import type { z } from 'zod';
import { randomToken } from '@/lib/evidence/hash';
import {
  failureOutcome,
  sortedHashes,
  successOutcome,
  type AiOutcome,
  type CompareResult,
  type ConditionResult,
  type PhotoCheckResult,
  type RecordParts,
  type VisionAssessor,
} from '@/lib/ai/assessor';
import { AI_MODEL_ID } from '@/lib/ai/model';
import type { Angle } from '@/lib/domain/types';
import { enforcePhotoCheck, filterComparison, filterCondition } from '@/lib/ai/post-process';
import { CompareSchema, ConditionSchema, PhotoCheckSchema } from '@/lib/ai/schemas';

/** The model id on records that are not an AI answer at all (no recording for these photos). */
const NO_ANSWER_MODEL = 'recorded';
const DEMO_REASON = 'Demo mode: photo accepted without an AI check';

type Kind = RecordParts['kind'];
const SCHEMAS: Record<Kind, z.ZodType> = { photoCheck: PhotoCheckSchema, condition: ConditionSchema, comparison: CompareSchema };

function keyFor(kind: Kind, hashes: string[]): string {
  return `${kind}:${hashes.join(',')}`;
}

function validateAnswers(answers: Readonly<Record<string, unknown>>): Map<string, unknown> {
  const checked = new Map<string, unknown>();
  for (const [key, raw] of Object.entries(answers)) {
    const schema = SCHEMAS[key.split(':')[0] as Kind] as z.ZodType | undefined;
    if (!schema) throw new Error(`Recorded answer "${key}" has an unknown kind`);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new Error(`Recorded answer "${key}" is invalid: ${parsed.error.message}`);
    checked.set(key, parsed.data);
  }
  return checked;
}

export interface RecordedAssessor extends VisionAssessor {
  /** True when there is a recorded answer for this call. Hashes are sorted, as the record stores them. */
  hasAnswer(kind: Kind, inputHashes: string[], angle?: Angle): boolean;
}

/** The recording stores a photo check by SHA-256, made for the angle that photo belongs to (see scripts/record-demo-answers.ts). */
export interface RecordedAssessorOptions {
  now?: () => Date;
  newId?: () => string;
  /** The angle a recorded photo was checked for. A recorded check is used only when the upload names this angle. */
  angleOf?: (sha256: string) => Angle | undefined;
}

/**
 * An assessor that replays stored answers. It never calls the network.
 * A replayed answer is labelled truthfully: model claude-opus-5-5 (it wrote the answer once), recorded: true.
 */
export function createRecordedAssessor(
  answers: Readonly<Record<string, unknown>>,
  opts: RecordedAssessorOptions = {},
): RecordedAssessor {
  const known = validateAnswers(answers);
  const now = opts.now ?? (() => new Date());
  const newId = opts.newId ?? (() => randomToken(12));
  const parts = (kind: Kind, inputHashes: string[], hit: boolean): RecordParts => ({
    id: newId(),
    kind,
    model: hit ? AI_MODEL_ID : NO_ANSWER_MODEL,
    at: now().toISOString(),
    inputHashes,
    recorded: hit,
  });

  /** True when no angle is asked for, or the recorded angle of this photo is not known, or it is the asked angle. */
  const angleFits = (sha256: string | undefined, angle: Angle | undefined): boolean => {
    const own = sha256 === undefined ? undefined : opts.angleOf?.(sha256);
    return angle === undefined || own === undefined || own === angle;
  };

  function lookup<T>(kind: Kind, hashes: string[], refine: (v: T) => T): AiOutcome<T> {
    const hit = known.get(keyFor(kind, hashes));
    return hit === undefined
      ? failureOutcome<T>(parts(kind, hashes, false), 'unavailable')
      : successOutcome(parts(kind, hashes, true), refine(hit as T));
  }

  return {
    kind: 'recorded',
    isFree: () => true,
    hasAnswer: (kind, inputHashes, angle) =>
      known.has(keyFor(kind, inputHashes)) && (kind !== 'photoCheck' || angleFits(inputHashes[0], angle)),
    async checkPhoto({ photo, expectedAngle }) {
      const hashes = [photo.sha256];
      if (known.has(keyFor('photoCheck', hashes)) && !angleFits(photo.sha256, expectedAngle)) {
        const own = opts.angleOf?.(photo.sha256);
        const value: PhotoCheckResult = {
          usable: false,
          reason: `This photo shows the ${own} side, not the ${expectedAngle} side.`,
          personVisible: false,
          angleMatches: false,
        };
        return successOutcome(parts('photoCheck', hashes, false), value);
      }
      if (known.has(keyFor('photoCheck', hashes))) {
        // Code, not the recording, still decides the person and angle rules.
        return lookup<PhotoCheckResult>('photoCheck', hashes, enforcePhotoCheck);
      }
      const value: PhotoCheckResult = { usable: true, reason: DEMO_REASON, personVisible: false, angleMatches: true };
      return successOutcome(parts('photoCheck', hashes, false), value);
    },
    async recordCondition({ photos, depositRules }) {
      // Live photo ids are random on every run, so recorded marks name their photo by its SHA-256 instead.
      const idByHash = new Map(photos.map((p) => [p.sha256, p.photoId]));
      return lookup<ConditionResult>('condition', sortedHashes(photos), (v) =>
        filterCondition(
          { ...v, marks: v.marks.map((mark) => ({ ...mark, photoId: idByHash.get(mark.photoId) ?? mark.photoId })) },
          photos,
          depositRules,
        ),
      );
    },
    async compare({ pairs, priceList }) {
      const angles = pairs.map((p) => p.angle);
      return lookup<CompareResult>('comparison', sortedHashes(pairs.flatMap((p) => [p.before, p.after])), (v) =>
        filterComparison(v, angles, priceList),
      );
    },
  };
}
