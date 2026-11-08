// Guilloche rosette: hypotrochoid curves drawn from a seed. Curves only, no borders or repeating angular motifs.

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return h >>> 0;
}

/** Small deterministic random number generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

const BIG_R = 100;
const POINTS = 720;

function curve(r: number, d: number): string {
  const turns = r / gcd(BIG_R, r);
  const span = Math.PI * 2 * turns;
  const diff = BIG_R - r;
  const parts: string[] = [];
  for (let i = 0; i <= POINTS; i += 1) {
    const t = (span * i) / POINTS;
    const x = diff * Math.cos(t) + d * Math.cos((diff / r) * t);
    const y = diff * Math.sin(t) - d * Math.sin((diff / r) * t);
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `${parts.join('')}Z`;
}

export interface GuillochePath {
  d: string;
  tone: 'green' | 'violet';
  opacity: number;
}

/** Overlapping curves (four unless asked for more), the same for the same seed. */
export function guillochePaths(seed: string, count = 4): GuillochePath[] {
  const random = rng(hashSeed(seed));
  return Array.from({ length: count }, (_, index) => {
    const r = 13 + Math.floor(random() * 30);
    const d = 25 + Math.floor(random() * 65);
    return {
      d: curve(r, d),
      tone: index % 2 === 0 ? 'green' : 'violet',
      opacity: 0.12 + random() * 0.08,
    };
  });
}

interface GuillocheProps {
  seed: string;
  className?: string;
  /** How many curves to draw. More and finer curves read as a rosette. Default 4. */
  curves?: number;
  /** `meet` keeps the whole rosette inside its box; `slice` (default) fills the box and crops. */
  fit?: 'slice' | 'meet';
}

/** Decoration behind a record header, the share card or the landing hero. Fill its parent. */
export function Guilloche({ seed, className = '', curves = 4, fit = 'slice' }: GuillocheProps) {
  const fine = curves > 4;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="-105 -105 210 210"
      preserveAspectRatio={`xMidYMid ${fit}`}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      {guillochePaths(seed, curves).map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill="none"
          strokeWidth={fine ? 0.2 : 0.35}
          stroke={path.tone === 'green' ? 'var(--guilloche-green)' : 'var(--guilloche-violet)'}
          opacity={fine ? Math.min(path.opacity + 0.12, 0.3) : path.opacity}
        />
      ))}
    </svg>
  );
}
