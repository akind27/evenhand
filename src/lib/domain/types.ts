export const CONFIDENCE_BAR = 0.75;
export const REQUIRED_ANGLES = ['front', 'back', 'left', 'right'] as const;

export type Angle = 'front' | 'back' | 'left' | 'right' | 'closeup';
export type Lang = 'en' | 'el' | 'de' | 'it' | 'fr';
export type Phase = 'pickup' | 'return';

export interface DepositRule {
  id: string;
  itemType: string;
  label: string;
  amountCents: number;
}

export interface PriceItem {
  id: string;
  label: string;
  amountCents: number;
}

export interface Shop {
  id: string;
  name: string;
  currency: 'EUR';
  depositRules: DepositRule[];
  priceList: PriceItem[];
  isDemo: boolean;
  secretHash: string;
  createdAt: string;
}

/** Position and size of a box, as fractions (0..1) of the image width and height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PhotoRef {
  id: string;
  phase: Phase;
  angle: Angle;
  url: string;
  sha256: string;
  takenAt: string;
  source: 'camera' | 'sample';
}

export interface ExistingMark {
  id: string;
  photoId: string;
  location: string;
  note: string;
  /** Where the mark is on the pickup photo. A mark the shop wrote down without placing it has none. */
  box?: Box;
}

export type FindingStatus = 'proposed' | 'needsHuman' | 'confirmed' | 'dismissed';

export interface Finding {
  id: string;
  angle: Angle;
  beforePhotoId: string;
  afterPhotoId: string;
  location: string;
  description: string;
  severity: 'minor' | 'moderate' | 'major';
  confidence: number;
  box: Box;
  priceItemId: string | null;
  status: FindingStatus;
  source: 'ai' | 'shop';
}

export type HandoverStatus =
  | 'draft'
  | 'awaitingRenter'
  | 'active'
  | 'returning'
  | 'reviewed'
  | 'chargeProposed'
  | 'released'
  | 'charged'
  | 'disputed'
  | 'closed';
