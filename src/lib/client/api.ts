// Typed fetch helpers. Shop requests rely on the httpOnly cookie, which same-origin fetch sends by itself.
import type { PublicHandoverView } from '@/lib/auth';
import type { Angle, Box, DepositRule, ExistingMark, Lang, Phase, PriceItem, Shop } from '@/lib/domain/types';
import type { PhotoCheck } from '@/lib/domain/state';
import { deviceHashOf, ensureDeviceSecret, readDeviceSecret } from '@/lib/client/renter-device';

export type HandoverView = PublicHandoverView;
export type PublicShop = Omit<Shop, 'secretHash'>;
export interface Mode {
  payments: 'paypal-sandbox' | 'fake';
  ai: 'claude' | 'recorded';
  storage: 'blob' | 'local';
  /** The public PayPal client id. Null in demo mode. */
  paypalClientId: string | null;
}

/** An error with a plain message from the server envelope. Never a stack trace. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function unwrap<T>(response: Response): Promise<T> {
  let body: Envelope<T> | null = null;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (body === null || !body.ok || body.data === undefined) {
    const message = body?.error?.message ?? 'Something went wrong. Please try again.';
    throw new ApiError(message, response.status, body?.error?.code ?? 'UNKNOWN');
  }
  return body.data;
}

async function send<T>(url: string, method: string, body?: BodyInit, headers?: HeadersInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method, body, headers, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ApiError('No connection. Check the network and try again.', 0, 'NETWORK');
  }
  return unwrap<T>(response);
}

export function apiGet<T>(url: string, headers?: HeadersInit): Promise<T> {
  return send<T>(url, 'GET', undefined, headers);
}

function json<T>(url: string, method: string, payload?: unknown, headers?: Record<string, string>): Promise<T> {
  return send<T>(url, method, payload === undefined ? undefined : JSON.stringify(payload), { 'Content-Type': 'application/json', ...headers });
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

const h = (id: string) => `/api/handovers/${encodeURIComponent(id)}`;

export const getMode = () => apiGet<Mode>('/api/mode');
export const startDemo = () => json<{ shopId: string }>('/api/demo', 'POST');
export const createHandover = (shopId: string, input: { itemType: string; itemRef: string }) =>
  json<{ handoverId: string; renterUrl: string; recordUrl: string }>(`/api/shops/${encodeURIComponent(shopId)}/handovers`, 'POST', input);
export const saveShopLists = (shopId: string, lists: { depositRules: DepositRule[]; priceList: PriceItem[] }) =>
  json<{ shop: PublicShop }>(`/api/shops/${encodeURIComponent(shopId)}`, 'PUT', lists);

/** Runs a shop action that returns the new handover, e.g. `condition`, `share`, `return`, `compare`, `propose`, `release`. */
export async function action(id: string, name: string): Promise<HandoverView> {
  return (await json<{ handover: HandoverView }>(`${h(id)}/${name}`, 'POST')).handover;
}
export async function setDeposit(id: string, ruleId: string): Promise<HandoverView> {
  return (await json<{ handover: HandoverView }>(`${h(id)}/deposit`, 'POST', { ruleId })).handover;
}
export async function updateMarks(id: string, marks: ExistingMark[]): Promise<HandoverView> {
  return (await json<{ handover: HandoverView }>(`${h(id)}/condition`, 'PUT', { marks })).handover;
}
export async function updateFinding(id: string, findingId: string, input: { status: 'confirmed' | 'dismissed'; priceItemId: string | null }): Promise<HandoverView> {
  return (await json<{ handover: HandoverView }>(`${h(id)}/findings/${encodeURIComponent(findingId)}`, 'PUT', input)).handover;
}
export async function addManualFinding(id: string, input: { angle: Angle; location: string; description: string; priceItemId: string; box?: Box }): Promise<HandoverView> {
  return (await json<{ handover: HandoverView }>(`${h(id)}/findings`, 'POST', input)).handover;
}
export async function overridePhoto(id: string, photoId: string): Promise<HandoverView> {
  return (await json<{ handover: HandoverView }>(`${h(id)}/photos/${encodeURIComponent(photoId)}/override`, 'POST')).handover;
}
export async function uploadPhoto(
  id: string,
  input: { phase: Phase; angle: Angle; source: 'camera' | 'sample'; file: Blob },
): Promise<{ photo: { id: string }; check: PhotoCheck }> {
  const form = new FormData();
  form.set('phase', input.phase);
  form.set('angle', input.angle);
  form.set('source', input.source);
  form.set('file', input.file, 'photo.jpg');
  return send(`${h(id)}/photos`, 'POST', form);
}

// Renter calls. The secrets go only in headers: never in the address, a log or a body.
// x-renter-token is the link's token; x-renter-device is this device's secret, once it has confirmed (Ruling R36).
export const RENTER_HEADER = 'x-renter-token';
export const DEVICE_HEADER = 'x-renter-device';

/** The renter's headers for this handover: the token, plus this device's secret when it has one. */
export function renterHeaders(id: string, token: string): Record<string, string> {
  const device = readDeviceSecret(id);
  return device === null ? { [RENTER_HEADER]: token } : { [RENTER_HEADER]: token, [DEVICE_HEADER]: device };
}

export async function renterView(id: string, token: string): Promise<HandoverView> {
  return (await apiGet<{ handover: HandoverView }>(h(id), renterHeaders(id, token))).handover;
}
/** Confirms and binds the renter role to this device: the secret stays here, only its SHA-256 is sent. */
export async function renterConfirm(id: string, token: string, language: Lang): Promise<HandoverView> {
  const deviceHash = await deviceHashOf(ensureDeviceSecret(id));
  return (await json<{ handover: HandoverView }>(`${h(id)}/confirm`, 'POST', { language, deviceHash }, renterHeaders(id, token))).handover;
}
export function createHoldOrder(id: string, token: string): Promise<{ orderId: string }> {
  return json<{ orderId: string }>(`${h(id)}/hold/order`, 'POST', undefined, renterHeaders(id, token));
}
export async function authorizeHold(id: string, token: string, orderId: string): Promise<HandoverView> {
  return (await json<{ handover: HandoverView }>(`${h(id)}/hold/authorize`, 'POST', { orderId }, renterHeaders(id, token))).handover;
}
export async function acceptCharge(id: string, token: string): Promise<HandoverView> {
  return (await json<{ handover: HandoverView }>(`${h(id)}/accept`, 'POST', undefined, renterHeaders(id, token))).handover;
}
export async function disputeCharge(id: string, token: string, reason: string): Promise<HandoverView> {
  return (await json<{ handover: HandoverView }>(`${h(id)}/dispute`, 'POST', { reason }, renterHeaders(id, token))).handover;
}
