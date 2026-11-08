import type { AssessmentRecord } from '@/lib/evidence/store';
import type { Angle, Box, DepositRule, ExistingMark, Lang, PriceItem } from '@/lib/domain/types';

export interface PhotoInput {
  photoId: string;
  angle: Angle;
  sha256: string;
  base64: string; // JPEG
}

export interface PhotoCheckResult {
  usable: boolean;
  reason: string;
  personVisible: boolean;
  angleMatches: boolean;
}

export interface ConditionResult {
  itemDescription: string;
  detectedItemType: string;
  suggestedRuleId: string | null;
  marks: { photoId: string; location: string; note: string; box: Box }[];
}

export interface CompareFinding {
  angle: Angle;
  location: string;
  description: string;
  severity: 'minor' | 'moderate' | 'major';
  confidence: number;
  box: Box;
  priceItemId: string | null;
}

export interface CompareResult {
  findings: CompareFinding[];
  explanation: string;
}

export type AiOutcome<T> = { ok: true; value: T; record: AssessmentRecord } | { ok: false; record: AssessmentRecord };

/** `shopId` lets the cost guard count calls per shop. Assessors that do not limit ignore it. */
interface Budgeted {
  shopId?: string;
}

export interface VisionAssessor {
  readonly kind: 'claude' | 'recorded';
  /**
   * True when a call of this kind on these photo hashes would make no paid model call.
   * For a photo check, `angle` is the angle the photo is uploaded for: a recorded check is only free for its own angle.
   */
  isFree(kind: Kind, inputHashes: string[], angle?: Angle): boolean;
  checkPhoto(input: { photo: PhotoInput; expectedAngle: Angle; itemType: string } & Budgeted): Promise<AiOutcome<PhotoCheckResult>>;
  recordCondition(input: {
    photos: PhotoInput[];
    itemType: string;
    depositRules: DepositRule[];
  } & Budgeted): Promise<AiOutcome<ConditionResult>>;
  compare(input: {
    pairs: { angle: Angle; before: PhotoInput; after: PhotoInput }[];
    existingMarks: ExistingMark[];
    priceList: PriceItem[];
    language: Lang;
  } & Budgeted): Promise<AiOutcome<CompareResult>>;
}

type Kind = AssessmentRecord['kind'];
type Failure = Exclude<AssessmentRecord['failure'], null>;

/** Sorted copy of the photo hashes, as stored in the record. */
export function sortedHashes(photos: PhotoInput[]): string[] {
  return photos.map((p) => p.sha256).sort();
}

export interface RecordParts {
  id: string;
  kind: Kind;
  model: string;
  at: string;
  inputHashes: string[];
  /** True for an answer replayed from the recorded sample answers. Defaults to false. */
  recorded?: boolean;
}

export function successOutcome<T>(parts: RecordParts, value: T): AiOutcome<T> {
  return { ok: true, value, record: { ...parts, recorded: parts.recorded ?? false, ok: true, failure: null, output: value } };
}

export function failureOutcome<T>(parts: RecordParts, failure: Failure): AiOutcome<T> {
  return { ok: false, record: { ...parts, recorded: parts.recorded ?? false, ok: false, failure, output: null } };
}
