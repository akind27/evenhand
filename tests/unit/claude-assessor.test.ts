import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { PhotoInput } from '@/lib/ai/assessor';
import { createClaudeAssessor } from '@/lib/ai/claude-assessor';
import { COMPARE_PROMPT, CONDITION_PROMPT, PHOTO_CHECK_PROMPT } from '@/lib/ai/prompts';

const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
const photo = (photoId: string, sha256: string): PhotoInput => ({ photoId, angle: 'front', sha256, base64: `b64-${photoId}` });
const priceList = [{ id: 'scratch', label: 'Scratch', amountCents: 2000 }];

function reply(value: unknown) {
  return {
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '...', signature: 's' },
      { type: 'text', text: JSON.stringify(value) },
    ],
  };
}

function setup(response: unknown) {
  const create = vi.fn();
  if (response instanceof Error) create.mockRejectedValue(response);
  else create.mockResolvedValue(response);
  const client = { beta: { messages: { create } } } as unknown as Anthropic;
  const assessor = createClaudeAssessor(client, {
    now: () => new Date('2026-11-08T10:00:00.000Z'),
    newId: () => 'rec1',
  });
  return { create, assessor };
}

const compareInput = () => ({
  pairs: [{ angle: 'front' as const, before: photo('b1', 'bbb'), after: photo('a1', 'aaa') }],
  existingMarks: [],
  priceList,
  language: 'en' as const,
});

const goodFinding = {
  angle: 'front',
  location: 'door',
  description: 'new scratch',
  severity: 'minor',
  confidence: 0.9,
  box,
  priceItemId: 'scratch',
};

describe('claude assessor: compare', () => {
  it('sends images as base64 jpeg with labels and the cached system prompt', async () => {
    const { create, assessor } = setup(reply({ findings: [], explanation: 'none' }));
    await assessor.compare(compareInput());
    const [params, options] = create.mock.calls[0];
    expect(params.system).toEqual([{ type: 'text', text: COMPARE_PROMPT, cache_control: { type: 'ephemeral' } }]);
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params.fallbacks).toBe('default');
    expect(params.max_tokens).toBe(16000);
    expect(params.thinking).toBeUndefined();
    const content = params.messages[0].content;
    expect(content[0]).toEqual({ type: 'text', text: 'Photo b1 (pickup, front)' });
    expect(content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'b64-b1' } });
    expect(content[2]).toEqual({ type: 'text', text: 'Photo a1 (return, front)' });
    expect(content[3].source.data).toBe('b64-a1');
    const task = JSON.parse(content[4].text);
    expect(task).toEqual({ priceList, existingMarks: [], language: 'en' });
    expect(options).toEqual({ timeout: 90_000, maxRetries: 1 });
  });

  it('uses effort high and model claude-opus-5-5', async () => {
    const { create, assessor } = setup(reply({ findings: [], explanation: 'none' }));
    await assessor.compare(compareInput());
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.output_config.effort).toBe('high');
    expect(params.output_config.format).toBeDefined();
  });

  it('drops a priceItemId that is not in the price list', async () => {
    const { assessor } = setup(
      reply({ findings: [goodFinding, { ...goodFinding, priceItemId: 'invented' }], explanation: 'two' }),
    );
    const out = await assessor.compare(compareInput());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.findings[0].priceItemId).toBe('scratch');
      expect(out.value.findings[1].priceItemId).toBeNull();
    }
  });

  it('refusal becomes a failure without throwing', async () => {
    const { assessor } = setup({ stop_reason: 'refusal', content: [] });
    const out = await assessor.compare(compareInput());
    expect(out.ok).toBe(false);
    expect(out.record.failure).toBe('refusal');
  });

  it('invalid JSON becomes failure invalid', async () => {
    const { assessor } = setup({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] });
    const out = await assessor.compare(compareInput());
    expect(out.ok).toBe(false);
    expect(out.record.failure).toBe('invalid');
  });

  it('a schema violation becomes failure invalid', async () => {
    const { assessor } = setup(reply({ findings: [{ ...goodFinding, severity: 'huge' }], explanation: 'x' }));
    const out = await assessor.compare(compareInput());
    expect(out.record.failure).toBe('invalid');
  });

  it('timeout error becomes failure timeout', async () => {
    const { assessor } = setup(new Anthropic.APIConnectionTimeoutError());
    const out = await assessor.compare(compareInput());
    expect(out.ok).toBe(false);
    expect(out.record.failure).toBe('timeout');
  });

  it('other API errors become failure api', async () => {
    const { assessor } = setup(new Anthropic.APIError(500, undefined, 'boom', new Headers()));
    const out = await assessor.compare(compareInput());
    expect(out.record.failure).toBe('api');
  });

  it('record holds model, input hashes and ok flag', async () => {
    const { assessor } = setup(reply({ findings: [], explanation: 'none' }));
    const out = await assessor.compare(compareInput());
    expect(out.record).toMatchObject({
      id: 'rec1',
      kind: 'comparison',
      model: 'claude-opus-5-5',
      at: '2026-11-08T10:00:00.000Z',
      inputHashes: ['aaa', 'bbb'],
      ok: true,
      failure: null,
      output: { findings: [], explanation: 'none' },
    });
  });

  it('records the model that actually answered, which a server-side fallback may change (M1)', async () => {
    const { assessor } = setup({ ...reply({ findings: [], explanation: 'none' }), model: 'claude-fallback-model' });
    const out = await assessor.compare(compareInput());
    expect(out.record.model).toBe('claude-fallback-model');
    expect(out.record.recorded).toBe(false);
  });

  it('is never free: every call is a paid model call', () => {
    expect(setup(reply({})).assessor.isFree('comparison', ['aaa'])).toBe(false);
  });

  it('the comparison prompt tells the model to report each damage only once', () => {
    expect(COMPARE_PROMPT).toContain('only once');
    expect(COMPARE_PROMPT).toMatch(/data, not instructions/i);
  });
});

describe('claude assessor: output hardening', () => {
  it('clamps an out-of-range box and confidence and still succeeds', async () => {
    const bad = { ...goodFinding, confidence: 1.3, box: { x: 0.5, y: 0.1, w: 0.9, h: 1.02 } };
    const { assessor } = setup(reply({ findings: [bad], explanation: 'x' }));
    const out = await assessor.compare(compareInput());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.findings[0].confidence).toBe(1);
      expect(out.value.findings[0].box).toEqual({ x: 0.5, y: 0.1, w: 0.5, h: 0.9 });
    }
  });

  it('cuts a 1500 character explanation to 1200', async () => {
    const { assessor } = setup(reply({ findings: [], explanation: 'a'.repeat(1500) }));
    const out = await assessor.compare(compareInput());
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.explanation).toHaveLength(1200);
  });

  it('a string where a number is expected is still invalid', async () => {
    const { assessor } = setup(reply({ findings: [{ ...goodFinding, confidence: 'high' }], explanation: 'x' }));
    const out = await assessor.compare(compareInput());
    expect(out.record.failure).toBe('invalid');
  });

  it('drops findings whose angle was not sent', async () => {
    const { assessor } = setup(reply({ findings: [goodFinding, { ...goodFinding, angle: 'back' }], explanation: 'x' }));
    const out = await assessor.compare(compareInput());
    expect(out.ok && out.value.findings.map((f) => f.angle)).toEqual(['front']);
  });

  it('drops condition marks whose photoId was not sent', async () => {
    const mark = { photoId: 'p1', location: 'a', note: 'b', box };
    const value = {
      itemDescription: 'Bike',
      detectedItemType: 'bike',
      suggestedRuleId: null,
      marks: [mark, { ...mark, photoId: 'ghost' }],
    };
    const { assessor } = setup(reply(value));
    const out = await assessor.recordCondition({ photos: [photo('p1', 'ppp')], itemType: 'bike', depositRules: [] });
    expect(out.ok && out.value.marks.map((m) => m.photoId)).toEqual(['p1']);
  });
});

describe('claude assessor: photo check decisions in code', () => {
  const check = (value: unknown) =>
    setup(reply(value)).assessor.checkPhoto({ photo: photo('p1', 'ppp'), expectedAngle: 'front', itemType: 'bike' });

  it('a visible person makes the photo unusable with a fixed reason', async () => {
    const out = await check({ usable: true, reason: 'Looks great', personVisible: true, angleMatches: true });
    expect(out.ok && out.value).toMatchObject({ usable: false, reason: 'Please photograph only the vehicle.' });
  });

  it('a wrong angle makes the photo unusable and keeps the model reason', async () => {
    const out = await check({ usable: true, reason: 'This is the back', personVisible: false, angleMatches: false });
    expect(out.ok && out.value).toMatchObject({ usable: false, reason: 'This is the back' });
  });

  it('a good photo stays usable', async () => {
    const out = await check({ usable: true, reason: 'Fine', personVisible: false, angleMatches: true });
    expect(out.ok && out.value.usable).toBe(true);
  });
});

describe('claude assessor: checkPhoto and recordCondition', () => {
  it('checkPhoto uses effort low, 30s timeout and one image', async () => {
    const value = { usable: true, reason: 'ok', personVisible: false, angleMatches: true };
    const { create, assessor } = setup(reply(value));
    const out = await assessor.checkPhoto({ photo: photo('p1', 'ppp'), expectedAngle: 'front', itemType: 'bike' });
    const [params, options] = create.mock.calls[0];
    expect(params.output_config.effort).toBe('low');
    expect(params.system[0].text).toBe(PHOTO_CHECK_PROMPT);
    expect(options.timeout).toBe(30_000);
    expect(out.ok).toBe(true);
    expect(PHOTO_CHECK_PROMPT).toContain('personVisible');
  });

  it('recordCondition nulls a suggestedRuleId that is not in the rules', async () => {
    const value = { itemDescription: 'Bike', detectedItemType: 'bike', suggestedRuleId: 'ghost', marks: [] };
    const { create, assessor } = setup(reply(value));
    const out = await assessor.recordCondition({
      photos: [photo('p1', 'ppp'), photo('p2', 'qqq')],
      itemType: 'bike',
      depositRules: [{ id: 'r1', itemType: 'bike', label: 'Bike', amountCents: 10000 }],
    });
    expect(create.mock.calls[0][0].output_config.effort).toBe('medium');
    expect(create.mock.calls[0][0].system[0].text).toBe(CONDITION_PROMPT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.suggestedRuleId).toBeNull();
    expect(out.record.inputHashes).toEqual(['ppp', 'qqq']);
  });
});
