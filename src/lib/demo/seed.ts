import type { DepositRule, PriceItem } from '@/lib/domain/types';

/** Deposit rules a demo shop starts with. Fresh copies on every call. */
export function seedDepositRules(): DepositRule[] {
  return [
    { id: 'scooter-125', itemType: '125cc scooter', label: '125cc scooter', amountCents: 15000 },
    { id: 'scooter-50', itemType: '50cc scooter', label: '50cc scooter', amountCents: 10000 },
    { id: 'ebike', itemType: 'E-bike', label: 'E-bike', amountCents: 10000 },
    { id: 'quad', itemType: 'Quad', label: 'Quad', amountCents: 25000 },
    { id: 'kayak', itemType: 'Kayak / SUP', label: 'Kayak / SUP', amountCents: 8000 },
  ];
}

/** Damage prices a demo shop starts with. Fresh copies on every call. */
export function seedPriceList(): PriceItem[] {
  return [
    { id: 'mirror', label: 'Mirror', amountCents: 3000 },
    { id: 'scratch-panel', label: 'Scratch on a body panel', amountCents: 2000 },
    { id: 'dent-panel', label: 'Dent on a body panel', amountCents: 6000 },
    { id: 'light', label: 'Broken light or indicator', amountCents: 4000 },
    { id: 'seat', label: 'Torn seat', amountCents: 3500 },
    { id: 'helmet', label: 'Missing or damaged helmet', amountCents: 4500 },
    { id: 'wheel', label: 'Damaged wheel rim', amountCents: 7000 },
  ];
}
