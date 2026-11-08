'use client';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { statusLabel } from '@/components/common/StatusBadge';
import { COLUMN_MIN_WIDTH, MONO_CELL, compareTimeLeft, holdTimeLeft, type DashboardRow, type TimeLeft } from '@/components/shop/holds-math';
import { euro } from '@/lib/client/format';
import type { HandoverStatus } from '@/lib/domain/types';

// The helpers live in holds-math.ts so the dashboard can use them without loading the grid. Re-exported here for callers.
export { dashboardTotals, holdTimeLeft, compareTimeLeft } from '@/components/shop/holds-math';
export type { DashboardRow, TimeLeft, Totals } from '@/components/shop/holds-math';

ModuleRegistry.registerModules([AllCommunityModule]);

const TONE: Partial<Record<HandoverStatus, string>> = {
  active: 'var(--stamp-hold)',
  released: 'var(--stamp-released)',
  charged: 'var(--stamp-charged)',
  disputed: 'var(--stamp-review)',
  reviewed: 'var(--stamp-review)',
};

interface GridRow {
  id: string;
  itemType: string;
  itemRef: string;
  status: HandoverStatus;
  depositCents: number | null;
  timeLeft: TimeLeft;
  findings: number;
  chargedCents: number | null;
  releasedCents: number | null;
  createdAt: string;
}

function toGridRow(row: DashboardRow, now: Date): GridRow {
  const settlement = row.settlement;
  const depositCents = row.hold?.amountCents ?? row.deposit?.amountCents ?? null;
  return {
    id: row.id,
    itemType: row.itemType,
    itemRef: row.itemRef,
    status: row.status,
    depositCents,
    timeLeft: holdTimeLeft(row, now),
    findings: row.findings.filter((finding) => finding.status === 'confirmed').length,
    chargedCents: settlement?.kind === 'charged' ? settlement.chargeCents : null,
    releasedCents: settlement?.kind === 'released' ? depositCents : settlement?.kind === 'charged' ? settlement.releaseCents : null,
    createdAt: row.createdAt,
  };
}

const money = (value: number | null | undefined): string => (value === null || value === undefined ? '—' : euro(value));

const OPENED = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The grid wears the passport palette. The values are the CSS tokens, so the two cannot drift apart. */
const theme = themeQuartz.withParams({
  backgroundColor: 'var(--paper)',
  foregroundColor: 'var(--ink)',
  borderColor: 'var(--rule)',
  headerBackgroundColor: 'var(--paper-panel)',
  headerTextColor: 'var(--ink)',
  headerFontWeight: 700,
  rowHoverColor: 'var(--paper-panel)',
  accentColor: 'var(--guilloche-violet)',
  oddRowBackgroundColor: 'var(--paper)',
  wrapperBorder: { color: 'var(--ink)', width: 2 },
  wrapperBorderRadius: 0,
  borderRadius: 2,
  fontSize: 16,
  rowHeight: 48,
  headerHeight: 48,
});

function ItemCell({ data, value, shopId }: ICellRendererParams<GridRow, string> & { shopId: string }) {
  if (!data) {
    return null;
  }
  return (
    <Link href={`/shop/${shopId}/h/${data.id}`} className="font-semibold text-ink underline">
      {value}
    </Link>
  );
}

function StatusCell({ value }: ICellRendererParams<GridRow, HandoverStatus>) {
  if (!value) {
    return null;
  }
  const tone = TONE[value] ?? 'var(--ink-soft)';
  return (
    <span className="inline-flex items-center gap-2 py-2 leading-snug">
      <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 border-2" style={{ borderColor: tone }} />
      <span className="font-semibold">{statusLabel(value)}</span>
    </span>
  );
}

function TimeCell({ data }: ICellRendererParams<GridRow>) {
  if (!data) {
    return null;
  }
  return (
    <span className="mono text-sm" style={data.timeLeft.urgent ? { color: 'var(--stamp-charged)', fontWeight: 500 } : undefined}>
      {data.timeLeft.label}
    </span>
  );
}

interface HoldsGridProps {
  shopId: string;
  rows: readonly DashboardRow[];
  now: Date;
  onOpen: (handoverId: string) => void;
}

/** The shop's holds as a sortable table. A click or Enter on a row opens that handover. */
export default function HoldsGrid({ shopId, rows, now, onOpen }: HoldsGridProps) {
  const rowData = useMemo(() => rows.map((row) => toGridRow(row, now)), [rows, now]);
  // Columns share the width by `flex`; each has a floor, so the grid scrolls sideways only below their sum.
  const columns = useMemo<ColDef<GridRow>[]>(
    () => [
      { headerName: 'Item', field: 'itemType', flex: 1.5, minWidth: COLUMN_MIN_WIDTH.item, cellRenderer: (p: ICellRendererParams<GridRow, string>) => <ItemCell {...p} shopId={shopId} /> },
      { headerName: 'Ref', field: 'itemRef', flex: 1.2, minWidth: COLUMN_MIN_WIDTH.ref, ...MONO_CELL },
      {
        headerName: 'Status',
        field: 'status',
        flex: 2.1,
        minWidth: COLUMN_MIN_WIDTH.status,
        // "Waiting for the renter" wraps onto two lines instead of being cut off.
        wrapText: true,
        autoHeight: true,
        cellRenderer: StatusCell,
        comparator: (a: HandoverStatus, b: HandoverStatus) => statusLabel(a).localeCompare(statusLabel(b)),
      },
      { headerName: 'Deposit', field: 'depositCents', type: 'rightAligned', flex: 1, minWidth: COLUMN_MIN_WIDTH.deposit, ...MONO_CELL, valueFormatter: (p) => money(p.value) },
      {
        headerName: 'Time left',
        flex: 1,
        minWidth: COLUMN_MIN_WIDTH.timeLeft,
        valueGetter: (p) => p.data?.timeLeft.label ?? '',
        cellRenderer: TimeCell,
        comparator: (_a, _b, nodeA, nodeB) => compareTimeLeft(nodeA.data?.timeLeft, nodeB.data?.timeLeft),
      },
      { headerName: 'Findings', field: 'findings', type: 'rightAligned', flex: 1, minWidth: COLUMN_MIN_WIDTH.findings, ...MONO_CELL },
      { headerName: 'Charged', field: 'chargedCents', type: 'rightAligned', flex: 1, minWidth: COLUMN_MIN_WIDTH.charged, ...MONO_CELL, valueFormatter: (p) => money(p.value) },
      { headerName: 'Released', field: 'releasedCents', type: 'rightAligned', flex: 1.1, minWidth: COLUMN_MIN_WIDTH.released, ...MONO_CELL, valueFormatter: (p) => money(p.value) },
      {
        headerName: 'Opened',
        field: 'createdAt',
        sort: 'desc',
        flex: 1.5,
        minWidth: COLUMN_MIN_WIDTH.opened,
        ...MONO_CELL,
        valueFormatter: (p) => (p.value ? OPENED.format(new Date(p.value)) : '—'),
      },
    ],
    [shopId],
  );

  return (
    <div style={{ height: Math.min(560, 48 * (rowData.length + 1) + 6), minHeight: 160 }} className="w-full">
      <AgGridReact<GridRow>
        theme={theme}
        rowData={rowData}
        columnDefs={columns}
        defaultColDef={{ resizable: true, sortable: true }}
        getRowId={(p) => p.data.id}
        onRowClicked={(event) => event.data && onOpen(event.data.id)}
        onCellKeyDown={(event) => {
          const key = (event.event as KeyboardEvent | null)?.key;
          if (key === 'Enter' && event.data) {
            onOpen(event.data.id);
          }
        }}
      />
    </div>
  );
}
