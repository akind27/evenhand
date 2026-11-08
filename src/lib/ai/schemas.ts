import { z } from 'zod';

const unit = z.number().min(0).max(1);

export const BoxSchema = z.object({ x: unit, y: unit, w: unit, h: unit });

const AngleSchema = z.enum(['front', 'back', 'left', 'right', 'closeup']);

export const PhotoCheckSchema = z.object({
  usable: z.boolean(),
  reason: z.string(),
  personVisible: z.boolean(),
  angleMatches: z.boolean(),
});

export const ConditionSchema = z.object({
  itemDescription: z.string(),
  detectedItemType: z.string(),
  suggestedRuleId: z.string().nullable(),
  marks: z.array(
    z.object({
      photoId: z.string(),
      location: z.string(),
      note: z.string(),
      box: BoxSchema,
    }),
  ),
});

export const CompareFindingSchema = z.object({
  angle: AngleSchema,
  location: z.string(),
  description: z.string(),
  severity: z.enum(['minor', 'moderate', 'major']),
  confidence: unit,
  box: BoxSchema,
  priceItemId: z.string().nullable(),
});

export const EXPLANATION_MAX = 1200;

export const CompareSchema = z.object({
  findings: z.array(CompareFindingSchema),
  explanation: z.string().max(EXPLANATION_MAX),
});

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const clamp01 = (v: unknown): unknown => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : v);

function normaliseBox(box: unknown): unknown {
  if (!isRecord(box)) return box;
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  const w = clamp01(box.w);
  const h = clamp01(box.h);
  return {
    ...box,
    x,
    y,
    w: typeof w === 'number' && typeof x === 'number' ? Math.min(w, 1 - x) : w,
    h: typeof h === 'number' && typeof y === 'number' ? Math.min(h, 1 - y) : h,
  };
}

function mapItems(items: unknown, fn: (item: Record<string, unknown>) => Record<string, unknown>): unknown {
  return Array.isArray(items) ? items.map((i) => (isRecord(i) ? fn(i) : i)) : items;
}

/**
 * Repairs small numeric slips in parsed model JSON before validation: boxes and confidences are
 * clamped into [0, 1], boxes are cut to stay inside the image, and the explanation is cut to the
 * maximum length. Values of an unexpected shape pass through untouched, so the schema still rejects them.
 */
export function normaliseModelOutput(kind: 'photoCheck' | 'condition' | 'comparison', value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (kind === 'condition') {
    return { ...value, marks: mapItems(value.marks, (m) => ({ ...m, box: normaliseBox(m.box) })) };
  }
  if (kind === 'comparison') {
    return {
      ...value,
      findings: mapItems(value.findings, (f) => ({ ...f, box: normaliseBox(f.box), confidence: clamp01(f.confidence) })),
      explanation:
        typeof value.explanation === 'string' ? value.explanation.slice(0, EXPLANATION_MAX) : value.explanation,
    };
  }
  return value;
}
