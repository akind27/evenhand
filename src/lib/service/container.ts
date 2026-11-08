// SERVER ONLY. This file reads the environment and the file system and holds keys.
// Never import it from a client component.
import * as path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { VisionAssessor } from '@/lib/ai/assessor';
import { createClaudeAssessor } from '@/lib/ai/claude-assessor';
import { createLimitedAssessor } from '@/lib/ai/limited-assessor';
import { RECORDED_ANSWERS } from '@/lib/ai/recorded-answers';
import { createRecordedAssessor } from '@/lib/ai/recorded-assessor';
import { createSampleRouter } from '@/lib/ai/sample-router';
import { loadConfig, type AppConfig, type AppMode } from '@/lib/config';
import { isSampleHash, sampleAngleOf } from '@/lib/demo/sample-photos';
import { randomToken } from '@/lib/evidence/hash';
import { createBlobStore } from '@/lib/evidence/blob-store';
import { createLocalStore } from '@/lib/evidence/local-store';
import { withShopCache } from '@/lib/evidence/shop-cache';
import type { EvidenceStore } from '@/lib/evidence/store';
import { createFakeGateway } from '@/lib/payments/fake-gateway';
import type { PaymentsGateway } from '@/lib/payments/gateway';
import { createPayPalGateway } from '@/lib/payments/paypal-gateway';
import { createRateLimiter } from '@/lib/rate-limit';
import { createHandoverService, type HandoverService } from '@/lib/service/handover-service';

const HOUR_MS = 3_600_000;

/** Paid AI calls (photos, condition and compare routes) allowed per IP per hour. Free calls do not count. */
export const AI_IP_LIMIT_PER_HOUR = 200;

/** Requests that would make a paid AI call, per IP per hour. Kept in memory per server instance. */
export const ipLimiter = createRateLimiter({ limit: AI_IP_LIMIT_PER_HOUR, windowMs: HOUR_MS });
/** New demo shops (POST /api/demo) per IP per hour. */
export const demoLimiter = createRateLimiter({ limit: 20, windowMs: HOUR_MS });
/** New handovers per IP per hour. */
export const handoverLimiter = createRateLimiter({ limit: 60, windowMs: HOUR_MS });

function buildStore(config: AppConfig): EvidenceStore {
  const store = config.mode.storage === 'blob' && config.blobToken
    ? createBlobStore(config.blobToken)
    : createLocalStore(path.join(process.cwd(), '.data'));
  return withShopCache(store);
}

function buildPayments(config: AppConfig): PaymentsGateway {
  return config.mode.payments === 'paypal-sandbox' && config.paypal
    ? createPayPalGateway(config.paypal)
    : createFakeGateway({ autoApprove: true });
}

/**
 * Keyless: the recorded answers only (free). With a key: the bundled sample photos still get their recorded
 * answers (Ruling R35); everything else goes to Claude, behind the daily and per-shop cost guard.
 */
function buildAssessor(config: AppConfig): VisionAssessor {
  const recorded = createRecordedAssessor(RECORDED_ANSWERS, { angleOf: sampleAngleOf });
  if (config.mode.ai !== 'claude' || !config.anthropicApiKey) {
    return recorded;
  }
  const claude = createClaudeAssessor(new Anthropic({ apiKey: config.anthropicApiKey }));
  const live = createLimitedAssessor(claude, { daily: config.aiDailyCallLimit });
  return createSampleRouter({ live, recorded, isSample: isSampleHash });
}

let config: AppConfig | undefined;
let service: HandoverService | null | undefined;

export function getConfig(): AppConfig {
  config ??= loadConfig(process.env);
  return config;
}

export function getMode(): AppMode {
  return getConfig().mode;
}

/** Builds the service once per process. */
export function getService(): HandoverService {
  if (!service) {
    const cfg = getConfig();
    service = createHandoverService({
      store: buildStore(cfg),
      payments: buildPayments(cfg),
      ai: buildAssessor(cfg),
      now: () => new Date(),
      newId: () => randomToken(12),
    });
  }
  return service;
}

/** Lets route tests inject a service. Pass null to go back to the real one. */
export function setServiceForTests(next: HandoverService | null): void {
  service = next;
}
