// Pure numbers and labels for the holds dashboard. Kept apart from the grid so the grid library loads lazily.
import type { HandoverView } from '@/lib/client/api';
import type { HandoverStatus } from '@/lib/domain/types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Statuses in which the money is still reserved and nobody has settled it yet. */
const NOT_SETTLED: readonly HandoverStatus[] = ['active', 'returning', 'reviewed', 'chargeProposed', 'disputed'];
/** Sort key for rows with no live hold: they come last when sorting from the shortest time left. */
export const NO_HOLD_SORT = Number.MAX_SAFE_INTEGER;

export interface DashboardRow extends HandoverView {
  createdAt: string;
}

export interface TimeLeft {
  label: string;
  /** True when the honor period has under 24 hours left, or has ended, or the hold has expired. */
  urgent: boolean;
  /** Milliseconds left to sort by: the honor period, else the hold itself. Expired holds are 0; no live hold is NO_HOLD_SORT. */
  sortMs: number;
}

export interface Totals {
  active: number;
  releasedCents: number;
  chargedCents: number;
  disputes: number;
}

/** "2 d 4 h" for a long time, "5 h 12 min" for under a day, "45 min" for under an hour. */
function span(ms: number): string {
  const safe = Math.max(ms, 0);
  if (safe >= DAY) {
    return `${Math.floor(safe / DAY)} d ${Math.floor((safe % DAY) / HOUR)} h`;
  }
  const hours = Math.floor(safe / HOUR);
  const minutes = Math.floor((safe % HOUR) / 60_000);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function isLiveHold(state: HandoverView): boolean {
  return state.hold !== null && state.holdLost === null && state.settlement === null && NOT_SETTLED.includes(state.status);
}

/** How long the shop can still rely on the hold. Red (urgent) under 24 hours of the honor period. */
export function holdTimeLeft(state: HandoverView, now: Date): TimeLeft {
  if (state.hold === null || !isLiveHold(state)) {
    return { label: '—', urgent: false, sortMs: NO_HOLD_SORT };
  }
  const honor = new Date(state.hold.honorUntil).getTime() - now.getTime();
  const expires = new Date(state.hold.expiresAt).getTime() - now.getTime();
  if (expires <= 0) {
    return { label: 'Hold expired', urgent: true, sortMs: 0 };
  }
  if (honor <= 0) {
    return { label: `Honor ended · hold ends in ${span(expires)}`, urgent: true, sortMs: 0 };
  }
  return { label: span(honor), urgent: honor < DAY, sortMs: honor };
}

/** Compares two time-left values by remaining milliseconds, not by their text. */
export function compareTimeLeft(a: TimeLeft | undefined, b: TimeLeft | undefined): number {
  return (a?.sortMs ?? NO_HOLD_SORT) - (b?.sortMs ?? NO_HOLD_SORT);
}

/** The numbers above the grid. */
export function dashboardTotals(states: readonly HandoverView[]): Totals {
  let active = 0;
  let releasedCents = 0;
  let chargedCents = 0;
  let disputes = 0;
  for (const state of states) {
    if (isLiveHold(state)) {
      active += 1;
    }
    if (state.status === 'disputed') {
      disputes += 1;
    }
    const settlement = state.settlement;
    if (settlement?.kind === 'released') {
      releasedCents += state.hold?.amountCents ?? state.deposit?.amountCents ?? 0;
    } else if (settlement?.kind === 'charged') {
      chargedCents += settlement.chargeCents;
      releasedCents += settlement.releaseCents;
    }
  }
  return { active, releasedCents, chargedCents, disputes };
}

/**
 * The least width of each dashboard column, in pixels. Money values are 14px mono, long status labels wrap,
 * and the sum (1149) stays below the 1164px the grid has at a 1280px window, so no value is cut off.
 */
export const COLUMN_MIN_WIDTH = {
  item: 150,
  ref: 130,
  status: 164,
  deposit: 110,
  timeLeft: 115,
  findings: 100,
  charged: 110,
  released: 110,
  opened: 160,
} as const;

/** Monospace cells (money, times, references) are 14px, not the 16px page size, so a value fits its column. */
export const MONO_CELL = { cellClass: 'mono', cellStyle: { fontSize: '0.875rem' } } as const;
