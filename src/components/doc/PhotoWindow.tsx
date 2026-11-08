import type { Box } from '@/lib/domain/types';

export interface PhotoOverlay {
  box: Box;
  /** The number shown on the overlay. */
  n?: number;
  /** `existing` marks are ink; `new` damage is vermilion. */
  tone: 'existing' | 'new';
  shape: 'circle' | 'box';
}

interface PhotoWindowProps {
  src: string;
  alt: string;
  overlays?: PhotoOverlay[];
  caption?: string;
}

const CORNERS = [
  'left-0 top-0 border-l-2 border-t-2',
  'right-0 top-0 border-r-2 border-t-2',
  'bottom-0 left-0 border-b-2 border-l-2',
  'bottom-0 right-0 border-b-2 border-r-2',
];

function pct(value: number): string {
  return `${(Math.min(Math.max(value, 0), 1) * 100).toFixed(2)}%`;
}

function Overlay({ overlay }: { overlay: PhotoOverlay }) {
  const color = overlay.tone === 'new' ? 'var(--stamp-charged)' : 'var(--ink)';
  const { box } = overlay;
  const circle = overlay.shape === 'circle';
  const size = 22;
  const style = circle
    ? { left: `calc(${pct(box.x + box.w / 2)} - ${size / 2}px)`, top: `calc(${pct(box.y + box.h / 2)} - ${size / 2}px)`, width: size, height: size }
    : { left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) };
  return (
    <span
      aria-hidden="true"
      data-testid="photo-overlay"
      className={`absolute flex items-start justify-start border-2 ${circle ? 'items-center justify-center rounded-full bg-paper/80' : ''}`}
      style={{ ...style, borderColor: color, color }}
    >
      {overlay.n === undefined ? null : (
        <span className={`mono text-[0.6875rem] font-medium ${circle ? '' : '-mt-5 bg-paper px-1'}`}>{overlay.n}</span>
      )}
    </span>
  );
}

/** A photo in a frame with corner ticks, like the photo window of a passport. */
export function PhotoWindow({ src, alt, overlays = [], caption }: PhotoWindowProps) {
  return (
    <figure className="m-0">
      <div className="relative aspect-[4/3] bg-panel p-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- photos come from our own store with their own URLs */}
        <img src={src} alt={alt} className="h-full w-full object-cover" />
        <div className="absolute inset-1.5">
          {overlays.map((overlay, index) => (
            <Overlay key={index} overlay={overlay} />
          ))}
        </div>
        {CORNERS.map((corner) => (
          <span key={corner} aria-hidden="true" className={`tick ${corner}`} />
        ))}
      </div>
      {caption ? <figcaption className="mt-1 text-sm text-ink-soft">{caption}</figcaption> : null}
    </figure>
  );
}
