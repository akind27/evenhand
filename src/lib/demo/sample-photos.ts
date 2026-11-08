// Safe for client and server: only a type import, no environment access.
import type { Angle } from '@/lib/domain/types';
//
// SHA-256 of every bundled sample photo in public/demo/scooter-a, as "set/angle".
// This is a generated constant, so it works on Vercel, where public/ is not on the function's disk.
// tests/unit/sample-photos.test.ts hashes the files and fails when they change: update the values then.
// return-clean and return-damaged share their front and back photos, so there are 10 different values.
export const SAMPLE_PHOTO_HASHES: Readonly<Record<string, string>> = {
  'pickup/back': '1e68c1a5c5d351340fe8b52f701c24413a0f96bbdd343db5ed558b2219d00e1b',
  'pickup/front': '0b837e18439caea1f23bcbc409c093f7e175202aa0e9c9dea81cbd4a93b8ce27',
  'pickup/left': 'c90fdffbe8f0f70ce4d3eca6d57517b096093de09a87df4615633d6f3ec4b157',
  'pickup/right': '2d074f3b4b5c56e7db162d223814d27ce143c746c8fd7d8e6210f37da75045c5',
  'return-clean/back': '163640558a820272782c8b26c4a08ed49f04a3521770b7e55fc150762341ecd9',
  'return-clean/front': 'c6ac8acfa89d86c373ec09c84a294b0b357ec1be18302e1ec09da8f6a81c20b1',
  'return-clean/left': '949d31313db5535271504acd794ee0d6e1b96c6f9242b4211bd21a08a301fcfa',
  'return-clean/right': 'd7faed408856b225b2d4048475cdd5d70bf6e6ddbbb9046d855df835918cc7fc',
  'return-damaged/back': '163640558a820272782c8b26c4a08ed49f04a3521770b7e55fc150762341ecd9',
  'return-damaged/front': 'c6ac8acfa89d86c373ec09c84a294b0b357ec1be18302e1ec09da8f6a81c20b1',
  'return-damaged/left': '244deafa73bf3c40208bace0e491d5d49ab4e5ff5db53bdff51c8df2d60f4714',
  'return-damaged/right': '6fd0a11ef00ca8c3e75bbcc9c9293e7216e724a9beffef8a686b4874b77330f3',
};

const SAMPLE_HASHES: ReadonlySet<string> = new Set(Object.values(SAMPLE_PHOTO_HASHES));

const SAMPLE_ANGLES: ReadonlyMap<string, Angle> = new Map(
  Object.entries(SAMPLE_PHOTO_HASHES).map(([name, hash]) => [hash, name.split('/')[1] as Angle]),
);

/** The angle a bundled sample photo shows, or undefined for any other bytes. */
export function sampleAngleOf(sha256: string): Angle | undefined {
  return SAMPLE_ANGLES.get(sha256);
}

/** True when the bytes with this SHA-256 are one of the bundled sample photos. */
export function isSampleHash(sha256: string): boolean {
  return SAMPLE_HASHES.has(sha256);
}
