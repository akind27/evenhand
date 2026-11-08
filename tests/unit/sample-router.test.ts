import { describe, expect, it, vi } from 'vitest';
import { failureOutcome, type PhotoInput, type VisionAssessor } from '@/lib/ai/assessor';
import { createRecordedAssessor } from '@/lib/ai/recorded-assessor';
import { createSampleRouter } from '@/lib/ai/sample-router';

const SAMPLE = new Set(['s1', 's2', 's3']);
const photo = (photoId: string, sha256: string): PhotoInput => ({ photoId, angle: 'front', sha256, base64: 'AAAA' });
const compareAnswer = { findings: [], explanation: 'No new damage.' };

/** A live assessor that must not be called: every call is counted and fails. */
function liveSpy() {
  const parts = { id: 'live', kind: 'comparison' as const, model: 'claude-opus-5-5', at: '2026-11-08T10:00:00.000Z', inputHashes: [] };
  const live = {
    kind: 'claude' as const,
    isFree: () => false,
    checkPhoto: vi.fn(async () => failureOutcome(parts, 'api')),
    recordCondition: vi.fn(async () => failureOutcome(parts, 'api')),
    compare: vi.fn(async () => failureOutcome(parts, 'api')),
  };
  return live as typeof live & VisionAssessor;
}

const pairs = (before: string, after: string) => [{ angle: 'front' as const, before: photo('b', before), after: photo('a', after) }];

describe('sample router (C1: recorded answers for the bundled sample photos)', () => {
  const recorded = createRecordedAssessor({
    'comparison:s1,s2': compareAnswer,
    'photoCheck:s1': { usable: true, reason: 'Clear', personVisible: false, angleMatches: true },
  });

  it('answers from the recording when every photo is a sample photo with a recorded answer; the live model is never called', async () => {
    const live = liveSpy();
    const router = createSampleRouter({ live, recorded, isSample: (hash) => SAMPLE.has(hash) });
    const out = await router.compare({ pairs: pairs('s1', 's2'), existingMarks: [], priceList: [], language: 'en' });
    expect(out.ok).toBe(true);
    expect(out.record).toMatchObject({ model: 'claude-opus-5-5', recorded: true });
    const check = await router.checkPhoto({ photo: photo('p', 's1'), expectedAngle: 'front', itemType: 'scooter' });
    expect(check.ok && check.value.reason).toBe('Clear');
    expect(live.compare).not.toHaveBeenCalled();
    expect(live.checkPhoto).not.toHaveBeenCalled();
    expect(router.isFree('comparison', ['s1', 's2'])).toBe(true);
    expect(router.kind).toBe('claude');
  });

  it('sends a real camera photo to the live model, even next to a sample photo', async () => {
    const live = liveSpy();
    const router = createSampleRouter({ live, recorded, isSample: (hash) => SAMPLE.has(hash) });
    await router.compare({ pairs: pairs('s1', 'camera-photo'), existingMarks: [], priceList: [], language: 'en' });
    expect(live.compare).toHaveBeenCalledTimes(1);
    expect(router.isFree('comparison', ['camera-photo', 's1'])).toBe(false);
  });

  it('sends a sample photo to the live model when it is uploaded for another angle than its own', async () => {
    const live = liveSpy();
    const angled = createRecordedAssessor(
      { 'photoCheck:s1': { usable: true, reason: 'Clear', personVisible: false, angleMatches: true } },
      { angleOf: (hash) => (hash === 's1' ? 'front' : undefined) },
    );
    const router = createSampleRouter({ live, recorded: angled, isSample: (hash) => SAMPLE.has(hash) });
    expect(router.isFree('photoCheck', ['s1'], 'front')).toBe(true);
    expect(router.isFree('photoCheck', ['s1'], 'back')).toBe(false);
    await router.checkPhoto({ photo: photo('p', 's1'), expectedAngle: 'back', itemType: 'scooter' });
    expect(live.checkPhoto).toHaveBeenCalledTimes(1);
  });

  it('sends sample photos to the live model when nothing was recorded for them yet', async () => {
    const live = liveSpy();
    const router = createSampleRouter({ live, recorded, isSample: (hash) => SAMPLE.has(hash) });
    await router.checkPhoto({ photo: photo('p', 's3'), expectedAngle: 'front', itemType: 'scooter' });
    expect(live.checkPhoto).toHaveBeenCalledTimes(1);
    expect(router.isFree('photoCheck', ['s3'])).toBe(false);
  });

  it('does not answer a hash outside the sample set from the recording', async () => {
    const live = liveSpy();
    const unbundled = createRecordedAssessor({ 'comparison:x,y': compareAnswer });
    const router = createSampleRouter({ live, recorded: unbundled, isSample: (hash) => SAMPLE.has(hash) });
    await router.compare({ pairs: pairs('x', 'y'), existingMarks: [], priceList: [], language: 'en' });
    expect(live.compare).toHaveBeenCalledTimes(1);
  });
});
