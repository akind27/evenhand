// The recorded AI answers for the bundled sample photos.
//
// A static JSON import, so the answers are bundled with the server code (on Vercel too: Ruling R39).
// scripts/record-demo-answers.ts writes this file once, with a real Anthropic key. Until then it is `{}`,
// and the AI steps on the sample photos say the check could not run (keyless) or go to Claude (key set).
// The recorded assessor checks every answer against the same schema as a live answer.
import scooterA from '@/lib/demo/recorded/scooter-a.json';

export const RECORDED_ANSWERS: Readonly<Record<string, unknown>> = scooterA as Record<string, unknown>;
