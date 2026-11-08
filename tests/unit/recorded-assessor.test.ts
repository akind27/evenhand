import { describe, expect, it } from 'vitest';
import type { PhotoInput } from '@/lib/ai/assessor';
import { createRecordedAssessor } from '@/lib/ai/recorded-assessor';

const photo = (photoId: string, sha256: string): PhotoInput => ({ photoId, angle: 'front', sha256, base64: 'AAAA' });
const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
const compareAnswer = {
  findings: [
    { angle: 'front', location: 'door', description: 'dent', severity: 'moderate', confidence: 0.8, box, priceItemId: null },
  ],
  explanation: 'One new dent.',
};

describe('recorded assessor', () => {
  it('returns the recorded compare answer for the known hashes', async () => {
    const a = createRecordedAssessor({ 'comparison:aaa,bbb': compareAnswer });
    const out = await a.compare({
      pairs: [{ angle: 'front', before: photo('b', 'bbb'), after: photo('a', 'aaa') }],
      existingMarks: [],
      priceList: [],
      language: 'en',
    });
    expect(out.ok).toBe(true);
    // A replayed answer is labelled truthfully: written by claude-opus-5-5 once, recorded, not a live call (C1).
    expect(out.record.model).toBe('claude-opus-5-5');
    expect(out.record.recorded).toBe(true);
    expect(out.record.kind).toBe('comparison');
    expect(out.record.inputHashes).toEqual(['aaa', 'bbb']);
    if (out.ok) expect(out.value.findings).toHaveLength(1);
  });

  it('nulls an unknown priceItemId and drops findings for unsent angles', async () => {
    const answer = {
      ...compareAnswer,
      findings: [
        { ...compareAnswer.findings[0], priceItemId: 'invented' },
        { ...compareAnswer.findings[0], angle: 'back', priceItemId: null },
      ],
    };
    const a = createRecordedAssessor({ 'comparison:aaa,bbb': answer });
    const out = await a.compare({
      pairs: [{ angle: 'front', before: photo('b', 'bbb'), after: photo('a', 'aaa') }],
      existingMarks: [],
      priceList: [{ id: 'real', label: 'Dent', amountCents: 1000 }],
      language: 'en',
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.findings).toHaveLength(1);
      expect(out.value.findings[0].priceItemId).toBeNull();
    }
  });

  it('points recorded marks at the live photo id when the recording used the photo fingerprint', async () => {
    const answer = {
      itemDescription: 'White scooter',
      detectedItemType: 'scooter',
      suggestedRuleId: null,
      marks: [{ photoId: 'aaa', location: 'left side', note: 'old scuff', box }],
    };
    const a = createRecordedAssessor({ 'condition:aaa': answer });
    const out = await a.recordCondition({ photos: [photo('live-id-1', 'aaa')], itemType: 'Scooter', depositRules: [] });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.marks.map((mark) => mark.photoId)).toEqual(['live-id-1']);
  });

  it('unknown compare is unavailable', async () => {
    const a = createRecordedAssessor({});
    const out = await a.compare({
      pairs: [{ angle: 'front', before: photo('b', 'x'), after: photo('a', 'y') }],
      existingMarks: [],
      priceList: [],
      language: 'en',
    });
    expect(out.ok).toBe(false);
    expect(out.record.failure).toBe('unavailable');
  });

  it('unknown checkPhoto is accepted with the demo reason, and is not labelled as an AI answer', async () => {
    const a = createRecordedAssessor({});
    const out = await a.checkPhoto({ photo: photo('p', 'zzz'), expectedAngle: 'front', itemType: 'bike' });
    expect(out.ok).toBe(true);
    expect(out.record.recorded).toBe(false);
    expect(out.record.model).toBe('recorded');
    if (out.ok) {
      expect(out.value.usable).toBe(true);
      expect(out.value.reason).toBe('Demo mode: photo accepted without an AI check');
    }
  });

  it('replays a recorded photo check, with the person rule still decided in code', async () => {
    const a = createRecordedAssessor({
      'photoCheck:zzz': { usable: true, reason: 'Clear side view', personVisible: false, angleMatches: true },
      'photoCheck:ppp': { usable: true, reason: 'Fine', personVisible: true, angleMatches: true },
    });
    const clear = await a.checkPhoto({ photo: photo('p', 'zzz'), expectedAngle: 'front', itemType: 'bike' });
    expect(clear.ok && clear.value.reason).toBe('Clear side view');
    expect(clear.record).toMatchObject({ model: 'claude-opus-5-5', recorded: true, inputHashes: ['zzz'] });
    const person = await a.checkPhoto({ photo: photo('q', 'ppp'), expectedAngle: 'front', itemType: 'bike' });
    expect(person.ok && person.value).toMatchObject({ usable: false, reason: 'Please photograph only the vehicle.' });
  });

  it('says which calls it has a recorded answer for', () => {
    const a = createRecordedAssessor({ 'comparison:aaa,bbb': compareAnswer, 'photoCheck:zzz': { usable: true, reason: 'ok', personVisible: false, angleMatches: true } });
    expect(a.hasAnswer('comparison', ['aaa', 'bbb'])).toBe(true);
    expect(a.hasAnswer('comparison', ['aaa'])).toBe(false);
    expect(a.hasAnswer('photoCheck', ['zzz'])).toBe(true);
    expect(a.hasAnswer('condition', ['zzz'])).toBe(false);
  });

  it('uses a recorded photo check only for the angle the photo was recorded for', async () => {
    const a = createRecordedAssessor(
      { 'photoCheck:zzz': { usable: true, reason: 'Clear front', personVisible: false, angleMatches: true } },
      { angleOf: (sha256) => (sha256 === 'zzz' ? 'front' : undefined) },
    );
    expect(a.hasAnswer('photoCheck', ['zzz'], 'front')).toBe(true);
    expect(a.hasAnswer('photoCheck', ['zzz'], 'back')).toBe(false);
    const wrong = await a.checkPhoto({ photo: photo('p', 'zzz'), expectedAngle: 'back', itemType: 'bike' });
    expect(wrong.ok && wrong.value).toMatchObject({ usable: false });
    expect(wrong.record.recorded).toBe(false);
    const right = await a.checkPhoto({ photo: photo('p', 'zzz'), expectedAngle: 'front', itemType: 'bike' });
    expect(right.ok && right.value.reason).toBe('Clear front');
  });

  it('never makes a paid call', () => {
    expect(createRecordedAssessor({}).isFree('comparison', ['x'])).toBe(true);
  });

  it('unknown recordCondition is unavailable', async () => {
    const a = createRecordedAssessor({});
    const out = await a.recordCondition({ photos: [photo('p', 'zzz')], itemType: 'bike', depositRules: [] });
    expect(out.ok).toBe(false);
    expect(out.record.failure).toBe('unavailable');
  });

  it('throws at construction when a recorded answer is invalid', () => {
    expect(() => createRecordedAssessor({ 'comparison:a': { findings: 'nope' } })).toThrow();
  });
});
