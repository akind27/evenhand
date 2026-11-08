import type { StoredEvent } from '@/lib/domain/events';
import type { HandoverState } from '@/lib/domain/state';
import type { Angle, Box, DepositRule, ExistingMark, Lang, PhotoRef, Phase, PriceItem, Shop } from '@/lib/domain/types';
import { aiCallNeeded, type AiStep } from '@/lib/service/ai-need';
import type { PhotoCheckReport } from '@/lib/service/ai-steps';
import { createFlowOps } from '@/lib/service/flow-ops';
import { createMutator } from '@/lib/service/mutate';
import { createPhotoOps } from '@/lib/service/photo-ops';
import { createReviewOps } from '@/lib/service/review-ops';
import { createShopOps } from '@/lib/service/shop-ops';
import type { ServiceDeps } from '@/lib/service/deps';

export type { ServiceDeps } from '@/lib/service/deps';
export { ServiceError } from '@/lib/service/errors';
export type { AiStep } from '@/lib/service/ai-need';

export interface HandoverService {
  createShop(input: { name: string; isDemo: boolean }): Promise<{ shop: Shop; secret: string }>;
  updateShopLists(shopId: string, input: { depositRules: DepositRule[]; priceList: PriceItem[] }): Promise<Shop>;
  createHandover(shopId: string, input: { itemType: string; itemRef: string }): Promise<{ handoverId: string; renterToken: string; viewKey: string }>;
  /** `source: 'sample'` is accepted only for a demo shop and the bytes of a bundled sample photo (Ruling R35). */
  addPhoto(handoverId: string, input: { phase: Phase; angle: Angle; bytes: Uint8Array; source: 'camera' | 'sample' }): Promise<{ photo: PhotoRef; check: PhotoCheckReport; state: HandoverState }>;
  /** True when this step would make a paid AI call. Routes spend the per-IP AI budget only then. */
  aiCallNeeded(state: HandoverState, step: AiStep): boolean;
  overridePhotoCheck(handoverId: string, photoId: string): Promise<HandoverState>;
  recordCondition(handoverId: string): Promise<HandoverState>;
  updateMarks(handoverId: string, marks: ExistingMark[]): Promise<HandoverState>;
  setDeposit(handoverId: string, ruleId: string): Promise<HandoverState>;
  shareWithRenter(handoverId: string): Promise<HandoverState>;
  /** `deviceHash` is the SHA-256 (hex) of a secret the renter's browser keeps; it binds the renter role to that device. */
  renterConfirm(handoverId: string, input: { language: Lang; renterName: string | null; deviceHash: string }): Promise<HandoverState>;
  createHoldOrder(handoverId: string): Promise<{ orderId: string }>;
  authorizeHold(handoverId: string, orderId: string): Promise<HandoverState>;
  startReturn(handoverId: string): Promise<HandoverState>;
  compare(handoverId: string): Promise<HandoverState>;
  addManualFinding(handoverId: string, input: { angle: Angle; location: string; description: string; priceItemId: string; box?: Box }): Promise<HandoverState>;
  updateFinding(handoverId: string, findingId: string, input: { status: 'confirmed' | 'dismissed'; priceItemId: string | null }): Promise<HandoverState>;
  /** Shop step: freezes the findings and fixes the amount the renter will be asked to accept. */
  proposeCharge(handoverId: string): Promise<HandoverState>;
  release(handoverId: string): Promise<HandoverState>;
  acceptCharge(handoverId: string): Promise<HandoverState>;
  dispute(handoverId: string, reason: string): Promise<HandoverState>;
  /** Reauthorizes after the honor period; records holdLost when PayPal says the hold is gone. */
  refreshHold(handoverId: string): Promise<HandoverState>;
  /** True when this already-loaded state has a hold past its honor period and no back-off is running (I7). */
  holdRefreshDue(state: HandoverState): boolean;
  getState(handoverId: string): Promise<HandoverState>;
  /** The full event chain, oldest first. Used for the evidence pack. */
  getEvents(handoverId: string): Promise<StoredEvent[]>;
  /** The shop record, with its secret hash. Routes use it to check the shop cookie; never send it to a client. */
  getShop(shopId: string): Promise<Shop>;
  /** The bytes of one stored photo of this handover. NOT_FOUND when the handover has no such photo. */
  getPhotoBytes(handoverId: string, photoId: string): Promise<Uint8Array>;
  listShopHandovers(shopId: string): Promise<HandoverState[]>;
}

export function createHandoverService(deps: ServiceDeps): HandoverService {
  const mutator = createMutator(deps);
  return {
    aiCallNeeded: (state, step) => aiCallNeeded(deps.ai, state, step),
    ...createShopOps(deps, mutator),
    ...createPhotoOps(deps, mutator),
    ...createFlowOps(deps, mutator),
    ...createReviewOps(deps, mutator),
  };
}
