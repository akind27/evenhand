import type { HandoverStatus } from '@/lib/domain/types';

const LABEL: Record<HandoverStatus, string> = {
  draft: 'Taking photos',
  awaitingRenter: 'Waiting for the renter',
  active: 'Deposit held',
  returning: 'Return in progress',
  reviewed: 'Ready to review',
  chargeProposed: 'Waiting for the renter',
  released: 'Released',
  charged: 'Charged',
  disputed: 'Disputed',
  closed: 'Closed',
};

const TONE: Partial<Record<HandoverStatus, string>> = {
  active: 'var(--stamp-hold)',
  released: 'var(--stamp-released)',
  charged: 'var(--stamp-charged)',
  disputed: 'var(--stamp-review)',
  reviewed: 'var(--stamp-review)',
};

export function statusLabel(status: HandoverStatus): string {
  return LABEL[status];
}

/** A small status chip. The words carry the meaning; the colour only echoes the stamp. */
export function StatusBadge({ status }: { status: HandoverStatus }) {
  return (
    <span
      className="inline-block max-w-full border-2 px-2 py-0.5 text-xs font-bold uppercase tracking-widest [overflow-wrap:anywhere]"
      style={{ borderColor: TONE[status] ?? 'var(--ink-soft)', color: TONE[status] ?? 'var(--ink-soft)' }}
    >
      {LABEL[status]}
    </span>
  );
}
