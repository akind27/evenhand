import { sortedHashes, type VisionAssessor } from '@/lib/ai/assessor';
import type { RecordedAssessor } from '@/lib/ai/recorded-assessor';
import type { Angle } from '@/lib/domain/types';
import type { AssessmentRecord } from '@/lib/evidence/store';

type Kind = AssessmentRecord['kind'];

interface SampleRouterParts {
  /** The live (paid) assessor: Claude, behind the cost guard. */
  live: VisionAssessor;
  /** The recorded answers for the bundled sample photos. */
  recorded: RecordedAssessor;
  /** True when a SHA-256 is one of the bundled sample photos. */
  isSample: (sha256: string) => boolean;
}

/**
 * Ruling R35: when every photo in an AI call is a bundled sample photo and that call has a recorded answer,
 * the recorded answer is used even with Claude on. The judge path is then free and repeatable, and the record
 * says it is a recorded answer. Real camera photos, and sample photos with no recording yet, go to the live model.
 */
export function createSampleRouter({ live, recorded, isSample }: SampleRouterParts): VisionAssessor {
  const fromRecording = (kind: Kind, hashes: string[], angle?: Angle): boolean =>
    hashes.length > 0 && hashes.every(isSample) && recorded.hasAnswer(kind, hashes, angle);

  return {
    kind: live.kind,
    isFree: (kind, hashes, angle) => fromRecording(kind, hashes, angle) || live.isFree(kind, hashes, angle),
    checkPhoto: (input) =>
      fromRecording('photoCheck', [input.photo.sha256], input.expectedAngle) ? recorded.checkPhoto(input) : live.checkPhoto(input),
    recordCondition: (input) =>
      fromRecording('condition', sortedHashes(input.photos)) ? recorded.recordCondition(input) : live.recordCondition(input),
    compare: (input) => {
      const hashes = sortedHashes(input.pairs.flatMap((pair) => [pair.before, pair.after]));
      return fromRecording('comparison', hashes) ? recorded.compare(input) : live.compare(input);
    },
  };
}
