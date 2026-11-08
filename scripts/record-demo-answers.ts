/**
 * Records the AI's answers for the bundled demo photos, so keyless demo mode can replay them.
 * COSTS MONEY: it makes real calls to the Anthropic API. Run it once, by hand, after the key is in .env.local.
 *
 * Run with: npx tsx scripts/record-demo-answers.ts
 * Needs ANTHROPIC_API_KEY in .env.local. Refuses to run without it. Never prints the key.
 *
 * What it does, for the three sample sets in public/demo/scooter-a:
 * 1. Checks every photo with the real assessor, prints the result and stores it (key `photoCheck:<SHA-256>`).
 * 2. Records the condition of the pickup set.
 * 3. Compares pickup with return-clean, and pickup with return-damaged (demo price list, language "en").
 * 4. Writes src/lib/demo/recorded/scooter-a.json. Keys are `${kind}:${sorted photo fingerprints joined by ","}`.
 *    Marks point at their photo by its SHA-256, which the recorded assessor maps back to the live photo id.
 * The app bundles that file (a static import) and replays it for the sample photos, also when Claude is on
 * (Ruling R35), labelled "Recorded AI answer for the sample photos (claude-opus-5-5)".
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { AiOutcome, PhotoInput, VisionAssessor } from '@/lib/ai/assessor';
import { createClaudeAssessor } from '@/lib/ai/claude-assessor';
import { loadConfig } from '@/lib/config';
import { seedDepositRules, seedPriceList } from '@/lib/demo/seed';
import { REQUIRED_ANGLES, type Angle, type ExistingMark } from '@/lib/domain/types';

const ENV_FILE = '.env.local';
const DEMO_DIR = join(process.cwd(), 'public', 'demo', 'scooter-a');
const OUT_FILE = join(process.cwd(), 'src', 'lib', 'demo', 'recorded', 'scooter-a.json');
const ITEM_TYPE = '125cc scooter';

type SetName = 'pickup' | 'return-clean' | 'return-damaged';

function loadEnvFile(): void {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    // No .env.local: the environment may already hold the key. The check below refuses if it does not.
  }
}

/** The exact input the service sends: SHA-256 of the file bytes, and the bytes as base64. */
function loadSet(set: SetName): PhotoInput[] {
  return REQUIRED_ANGLES.map((angle: Angle): PhotoInput => {
    const bytes = readFileSync(join(DEMO_DIR, set, `${angle}.jpg`));
    return {
      photoId: `${set}-${angle}`,
      angle,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      base64: bytes.toString('base64'),
    };
  });
}

function mustSucceed<T>(label: string, outcome: AiOutcome<T>): { value: T; key: string } {
  if (!outcome.ok) {
    throw new Error(`The AI step "${label}" failed (${outcome.record.failure ?? 'unknown'}). Nothing was written.`);
  }
  return { value: outcome.value, key: `${outcome.record.kind}:${outcome.record.inputHashes.join(',')}` };
}

async function checkAll(ai: VisionAssessor, set: SetName, photos: PhotoInput[], answers: Record<string, unknown>): Promise<void> {
  for (const photo of photos) {
    const { value, key } = mustSucceed(`photo check ${set}/${photo.angle}`, await ai.checkPhoto({ photo, expectedAngle: photo.angle, itemType: ITEM_TYPE }));
    answers[key] = value;
    console.log(`  ${set}/${photo.angle}: ${value.usable ? 'usable' : 'NOT usable'} — ${value.reason}`);
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig(process.env);
  if (config.mode.ai !== 'claude' || !config.anthropicApiKey) {
    throw new Error(`The AI mode is not "claude". Put ANTHROPIC_API_KEY in ${ENV_FILE} first. Refusing to run.`);
  }
  const ai = createClaudeAssessor(new Anthropic({ apiKey: config.anthropicApiKey }));

  const sets: Record<SetName, PhotoInput[]> = {
    pickup: loadSet('pickup'),
    'return-clean': loadSet('return-clean'),
    'return-damaged': loadSet('return-damaged'),
  };

  const answers: Record<string, unknown> = {};

  console.log('Photo checks:');
  for (const set of Object.keys(sets) as SetName[]) {
    await checkAll(ai, set, sets[set], answers);
  }

  console.log('Condition record for the pickup set...');
  const condition = mustSucceed('condition record', await ai.recordCondition({ photos: sets.pickup, itemType: ITEM_TYPE, depositRules: seedDepositRules() }));
  const shaById = new Map(sets.pickup.map((photo) => [photo.photoId, photo.sha256]));
  // Marks are stored against the photo's SHA-256, because live photo ids are random on every demo run.
  answers[condition.key] = {
    ...condition.value,
    marks: condition.value.marks.map((mark) => ({ ...mark, photoId: shaById.get(mark.photoId) ?? mark.photoId })),
  };

  const existingMarks: ExistingMark[] = condition.value.marks.map((mark, index) => ({ ...mark, id: `mark-${index + 1}` }));

  for (const returned of ['return-clean', 'return-damaged'] as const) {
    console.log(`Comparison: pickup vs ${returned}...`);
    const pairs = REQUIRED_ANGLES.map((angle) => ({
      angle,
      before: sets.pickup.find((photo) => photo.angle === angle) as PhotoInput,
      after: sets[returned].find((photo) => photo.angle === angle) as PhotoInput,
    }));
    const compared = mustSucceed(`comparison ${returned}`, await ai.compare({ pairs, existingMarks, priceList: seedPriceList(), language: 'en' }));
    answers[compared.key] = compared.value;
    console.log(`  ${compared.value.findings.length} finding(s)`);
  }

  writeFileSync(OUT_FILE, `${JSON.stringify(answers, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${Object.keys(answers).length} answers to ${OUT_FILE}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'The script failed.');
  process.exitCode = 1;
});
