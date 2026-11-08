import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
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
  type PhotoInput,
  type RecordParts,
  type VisionAssessor,
} from '@/lib/ai/assessor';
import { AI_MODEL_ID } from '@/lib/ai/model';
import { COMPARE_PROMPT, CONDITION_PROMPT, PHOTO_CHECK_PROMPT } from '@/lib/ai/prompts';
import { enforcePhotoCheck, filterComparison, filterCondition } from '@/lib/ai/post-process';
import { CompareSchema, ConditionSchema, PhotoCheckSchema, normaliseModelOutput } from '@/lib/ai/schemas';

const DEFAULT_MODEL = AI_MODEL_ID;
type Kind = RecordParts['kind'];
type Content = Array<
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }
>;

const CALLS: Record<Kind, { prompt: string; effort: 'low' | 'medium' | 'high'; timeout: number }> = {
  photoCheck: { prompt: PHOTO_CHECK_PROMPT, effort: 'low', timeout: 30_000 },
  condition: { prompt: CONDITION_PROMPT, effort: 'medium', timeout: 90_000 },
  comparison: { prompt: COMPARE_PROMPT, effort: 'high', timeout: 90_000 },
};

function labelled(photo: PhotoInput, phase: 'pickup' | 'return'): Content {
  return [
    { type: 'text', text: `Photo ${photo.photoId} (${phase}, ${photo.angle})` },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photo.base64 } },
  ];
}

class Failed extends Error {
  constructor(readonly failure: 'refusal' | 'invalid') {
    super(failure);
  }
}

/** Reads the validated value out of a response. Throws Failed for a refusal or unusable output. */
function readValue<S extends z.ZodType>(response: unknown, schema: S, kind: Kind): z.infer<S> {
  const r = response as { stop_reason?: string; content?: Array<{ type: string; text?: string }> };
  if (r.stop_reason === 'refusal') throw new Failed('refusal');
  const block = r.content?.find((b) => b.type === 'text');
  if (!block || typeof block.text !== 'string') throw new Failed('invalid');
  let json: unknown;
  try {
    json = JSON.parse(block.text);
  } catch {
    throw new Failed('invalid');
  }
  const parsed = schema.safeParse(normaliseModelOutput(kind, json));
  if (!parsed.success) throw new Failed('invalid');
  return parsed.data;
}

function failureFor(error: unknown): 'refusal' | 'invalid' | 'timeout' | 'api' {
  if (error instanceof Failed) return error.failure;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  return 'api'; // RateLimitError, other APIError, network errors
}

export function createClaudeAssessor(
  client: Anthropic,
  opts: { model?: string; now?: () => Date; newId?: () => string } = {},
): VisionAssessor {
  const model = opts.model ?? DEFAULT_MODEL;
  const now = opts.now ?? (() => new Date());
  const newId = opts.newId ?? (() => randomToken(12));

  async function run<S extends z.ZodType>(
    kind: Kind,
    schema: S,
    content: Content,
    hashes: string[],
    refine: (value: z.infer<S>) => z.infer<S> = (v) => v,
  ): Promise<AiOutcome<z.infer<S>>> {
    const parts: RecordParts = { id: newId(), kind, model, at: now().toISOString(), inputHashes: hashes };
    const call = CALLS[kind];
    try {
      const response = await client.beta.messages.create(
        {
          model,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [{ type: 'text', text: call.prompt, cache_control: { type: 'ephemeral' } }],
          output_config: { effort: call.effort, format: zodOutputFormat(schema) },
          messages: [{ role: 'user', content }],
        },
        { timeout: call.timeout, maxRetries: 1 },
      );
      // M1: record the model that really answered. A server-side fallback can answer with another model.
      const answeredBy = (response as { model?: unknown }).model;
      const answered = typeof answeredBy === 'string' && answeredBy !== '' ? { ...parts, model: answeredBy } : parts;
      return successOutcome(answered, refine(readValue(response, schema, kind)));
    } catch (error: unknown) {
      return failureOutcome(parts, failureFor(error));
    }
  }

  return {
    kind: 'claude',
    isFree: () => false,

    checkPhoto({ photo, expectedAngle, itemType }) {
      const task = JSON.stringify({ expectedAngle, itemType });
      const content: Content = [...labelled(photo, 'pickup'), { type: 'text', text: task }];
      return run('photoCheck', PhotoCheckSchema, content, [photo.sha256], enforcePhotoCheck) as Promise<
        AiOutcome<PhotoCheckResult>
      >;
    },

    recordCondition({ photos, itemType, depositRules }) {
      const task = JSON.stringify({ itemType, depositRules });
      const content: Content = [...photos.flatMap((p) => labelled(p, 'pickup')), { type: 'text', text: task }];
      const refine = (v: ConditionResult): ConditionResult => filterCondition(v, photos, depositRules);
      return run('condition', ConditionSchema, content, sortedHashes(photos), refine);
    },

    compare({ pairs, existingMarks, priceList, language }) {
      const photos = pairs.flatMap((p) => [p.before, p.after]);
      const task = JSON.stringify({ priceList, existingMarks, language });
      const content: Content = [
        ...pairs.flatMap((p) => [...labelled(p.before, 'pickup'), ...labelled(p.after, 'return')]),
        { type: 'text', text: task },
      ];
      const angles = pairs.map((p) => p.angle);
      const refine = (v: CompareResult): CompareResult => filterComparison(v, angles, priceList);
      return run('comparison', CompareSchema, content, sortedHashes(photos), refine);
    },
  };
}
