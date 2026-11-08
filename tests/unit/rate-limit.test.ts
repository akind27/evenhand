import { describe, expect, it } from 'vitest';
import type { PhotoInput } from '@/lib/ai/assessor';
import { createRecordedAssessor } from '@/lib/ai/recorded-assessor';
import { createLimitedAssessor, SHOP_DAILY_AI_LIMIT } from '@/lib/ai/limited-assessor';
import { createRateLimiter } from '@/lib/rate-limit';
import { AI_IP_LIMIT_PER_HOUR, demoLimiter, handoverLimiter, ipLimiter } from '@/lib/service/container';

describe('rate limiter', () => {
  it('rate limiter allows limit then blocks until the window passes', () => {
    const clock = { ms: 1_000 };
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, now: () => clock.ms });
    expect(limiter.take('ip-1')).toBe(true);
    expect(limiter.take('ip-1')).toBe(true);
    expect(limiter.take('ip-1')).toBe(false);
    clock.ms += 9_999;
    expect(limiter.take('ip-1')).toBe(false);
    clock.ms += 1;
    expect(limiter.take('ip-1')).toBe(true);
  });

  it('keeps a separate count for each key', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, now: () => 0 });
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('b')).toBe(true);
    expect(limiter.take('a')).toBe(false);
  });

  it('does not count blocked tries against the next window', () => {
    const clock = { ms: 0 };
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => clock.ms });
    expect(limiter.take('a')).toBe(true);
    for (let i = 0; i < 20; i += 1) limiter.take('a');
    clock.ms = 1_000;
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
  });
});

const photo: PhotoInput = { photoId: 'p1', angle: 'front', sha256: 'aaa', base64: 'AAAA' };

describe('limited assessor', () => {
  it('limited assessor accepts photos without a check after the daily limit and makes compare unavailable', async () => {
    const inner = createRecordedAssessor({});
    const limited = createLimitedAssessor(inner, { daily: 1, now: () => new Date('2026-11-08T10:00:00.000Z') });

    const first = await limited.checkPhoto({ photo, expectedAngle: 'front', itemType: 'scooter' });
    expect(first.ok && first.value.reason).toContain('Demo mode');

    const over = await limited.checkPhoto({ photo, expectedAngle: 'front', itemType: 'scooter' });
    expect(over.ok).toBe(true);
    if (over.ok) {
      expect(over.value.usable).toBe(true);
      expect(over.value.reason).toBe('AI limit reached — photo accepted without a check');
    }

    const compare = await limited.compare({ pairs: [], existingMarks: [], priceList: [], language: 'en' });
    expect(compare.ok).toBe(false);
    expect(compare.record.failure).toBe('unavailable');
    expect(compare.record.kind).toBe('comparison');

    const condition = await limited.recordCondition({ photos: [photo], itemType: 'scooter', depositRules: [] });
    expect(condition.ok).toBe(false);
    expect(condition.record.failure).toBe('unavailable');
  });

  it('starts counting again on the next UTC day', async () => {
    const clock = { iso: '2026-11-08T23:59:00.000Z' };
    const limited = createLimitedAssessor(createRecordedAssessor({}), { daily: 1, now: () => new Date(clock.iso) });
    await limited.checkPhoto({ photo, expectedAngle: 'front', itemType: 'scooter' });
    const over = await limited.checkPhoto({ photo, expectedAngle: 'front', itemType: 'scooter' });
    expect(over.ok && over.value.reason).toContain('AI limit reached');
    clock.iso = '2026-11-09T00:00:01.000Z';
    const next = await limited.checkPhoto({ photo, expectedAngle: 'front', itemType: 'scooter' });
    expect(next.ok && next.value.reason).toContain('Demo mode');
  });

  it('keeps the inner assessor kind', () => {
    expect(createLimitedAssessor(createRecordedAssessor({}), { daily: 5 }).kind).toBe('recorded');
  });

  it(`caps each shop at ${SHOP_DAILY_AI_LIMIT} AI calls a day, without blocking other shops (I5)`, async () => {
    expect(SHOP_DAILY_AI_LIMIT).toBe(40);
    const limited = createLimitedAssessor(createRecordedAssessor({}), { daily: 1000, now: () => new Date('2026-11-08T10:00:00.000Z') });
    for (let i = 0; i < SHOP_DAILY_AI_LIMIT; i += 1) {
      const ok = await limited.checkPhoto({ photo, expectedAngle: 'front', itemType: 'scooter', shopId: 'shop-a' });
      expect(ok.ok && ok.value.reason).toContain('Demo mode');
    }
    const over = await limited.checkPhoto({ photo, expectedAngle: 'front', itemType: 'scooter', shopId: 'shop-a' });
    expect(over.ok && over.value.reason).toBe('AI limit reached — photo accepted without a check');
    const compare = await limited.compare({ pairs: [], existingMarks: [], priceList: [], language: 'en', shopId: 'shop-a' });
    expect(compare.ok).toBe(false);
    const other = await limited.checkPhoto({ photo, expectedAngle: 'front', itemType: 'scooter', shopId: 'shop-b' });
    expect(other.ok && other.value.reason).toContain('Demo mode');
  });
});

describe('request limits (I5)', () => {
  it('allows 200 AI-triggering requests per IP per hour', () => {
    expect(AI_IP_LIMIT_PER_HOUR).toBe(200);
    for (let i = 0; i < 200; i += 1) {
      expect(ipLimiter.take('limit-test-ip')).toBe(true);
    }
    expect(ipLimiter.take('limit-test-ip')).toBe(false);
  });

  it('allows 20 demo shops and 60 new handovers per IP per hour', () => {
    for (let i = 0; i < 20; i += 1) expect(demoLimiter.take('demo-ip')).toBe(true);
    expect(demoLimiter.take('demo-ip')).toBe(false);
    for (let i = 0; i < 60; i += 1) expect(handoverLimiter.take('handover-ip')).toBe(true);
    expect(handoverLimiter.take('handover-ip')).toBe(false);
  });
});
