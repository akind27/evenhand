import { describe, expect, it } from 'vitest';
import { manualFindingSchema, marksSchema } from '@/lib/api-schemas';
import { CompareSchema, ConditionSchema, PhotoCheckSchema, normaliseModelOutput } from '@/lib/ai/schemas';

const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
const finding = {
  angle: 'front',
  location: 'left door',
  description: 'A new scratch',
  severity: 'minor',
  confidence: 0.9,
  box,
  priceItemId: null,
};

describe('schemas', () => {
  it('accepts a valid compare result', () => {
    expect(CompareSchema.safeParse({ findings: [finding], explanation: 'ok' }).success).toBe(true);
  });

  it('rejects confidence 1.2', () => {
    const r = CompareSchema.safeParse({ findings: [{ ...finding, confidence: 1.2 }], explanation: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects a box with w > 1', () => {
    const r = CompareSchema.safeParse({ findings: [{ ...finding, box: { ...box, w: 1.5 } }], explanation: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects an explanation longer than 1200 characters', () => {
    expect(CompareSchema.safeParse({ findings: [], explanation: 'a'.repeat(1201) }).success).toBe(false);
  });

  it('normaliseModelOutput clamps numbers, cuts the explanation and passes odd shapes through', () => {
    const out = normaliseModelOutput('comparison', {
      findings: [{ ...finding, confidence: 1.3, box: { x: 0.9, y: -0.1, w: 0.5, h: 0.2 } }],
      explanation: 'a'.repeat(1500),
    }) as { findings: { confidence: number; box: Record<string, number> }[]; explanation: string };
    expect(out.findings[0].confidence).toBe(1);
    expect(out.findings[0].box.y).toBe(0);
    expect(out.findings[0].box.w).toBeCloseTo(0.1);
    expect(out.explanation).toHaveLength(1200);
    expect(normaliseModelOutput('comparison', 'text')).toBe('text');
    expect(normaliseModelOutput('comparison', null)).toBeNull();
  });

  it('validates photo check and condition results', () => {
    expect(
      PhotoCheckSchema.safeParse({ usable: true, reason: 'ok', personVisible: false, angleMatches: true }).success,
    ).toBe(true);
    expect(
      ConditionSchema.safeParse({
        itemDescription: 'Red bike',
        detectedItemType: 'bike',
        suggestedRuleId: null,
        marks: [{ photoId: 'p1', location: 'frame', note: 'scratch', box }],
      }).success,
    ).toBe(true);
    expect(ConditionSchema.safeParse({ itemDescription: 'x' }).success).toBe(false);
  });
});

describe('marksSchema', () => {
  const mark = { id: 'm1', photoId: 'p1', location: 'Mirror', note: 'Chipped' };

  it('accepts a hand-added mark with no box, and a mark with a box', () => {
    expect(marksSchema.safeParse({ marks: [mark] }).success).toBe(true);
    expect(marksSchema.safeParse({ marks: [{ ...mark, box }] }).success).toBe(true);
  });

  it('refuses a box outside the photo', () => {
    expect(marksSchema.safeParse({ marks: [{ ...mark, box: { ...box, x: 2 } }] }).success).toBe(false);
  });
});

describe('manualFindingSchema', () => {
  const base = { angle: 'front', location: 'Fender', description: 'Scratch', priceItemId: 'scratch-panel' };

  it('accepts a finding with or without a box', () => {
    expect(manualFindingSchema.safeParse(base).success).toBe(true);
    expect(manualFindingSchema.safeParse({ ...base, box }).success).toBe(true);
  });

  it('refuses a box outside the photo', () => {
    expect(manualFindingSchema.safeParse({ ...base, box: { ...box, w: 1.5 } }).success).toBe(false);
  });
});
