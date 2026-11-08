import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as demoPOST } from '@/app/api/demo/route';
import { GET as modeGET } from '@/app/api/mode/route';
import { GET as shopGET, PUT as shopPUT } from '@/app/api/shops/[shopId]/route';
import { GET as listGET, POST as createPOST } from '@/app/api/shops/[shopId]/handovers/route';
import { GET as handoverGET } from '@/app/api/handovers/[id]/route';
import { POST as photosPOST } from '@/app/api/handovers/[id]/photos/route';
import { POST as overridePOST } from '@/app/api/handovers/[id]/photos/[photoId]/override/route';
import { POST as conditionPOST, PUT as conditionPUT } from '@/app/api/handovers/[id]/condition/route';
import { POST as depositPOST } from '@/app/api/handovers/[id]/deposit/route';
import { POST as sharePOST } from '@/app/api/handovers/[id]/share/route';
import { POST as confirmPOST } from '@/app/api/handovers/[id]/confirm/route';
import { POST as orderPOST } from '@/app/api/handovers/[id]/hold/order/route';
import { POST as authorizePOST } from '@/app/api/handovers/[id]/hold/authorize/route';
import { POST as returnPOST } from '@/app/api/handovers/[id]/return/route';
import { POST as comparePOST } from '@/app/api/handovers/[id]/compare/route';
import { POST as findingsPOST } from '@/app/api/handovers/[id]/findings/route';
import { PUT as findingPUT } from '@/app/api/handovers/[id]/findings/[findingId]/route';
import { POST as proposePOST } from '@/app/api/handovers/[id]/propose/route';
import { POST as releasePOST } from '@/app/api/handovers/[id]/release/route';
import { POST as acceptPOST } from '@/app/api/handovers/[id]/accept/route';
import { POST as disputePOST } from '@/app/api/handovers/[id]/dispute/route';
import { GET as evidenceGET } from '@/app/api/handovers/[id]/evidence/route';
import { GET as localPhotoGET } from '@/app/api/local-photo/[handoverId]/[photoId]/route';
import type { VisionAssessor } from '@/lib/ai/assessor';
import { createRecordedAssessor } from '@/lib/ai/recorded-assessor';
import { RENTER_ACTIONS, roleMayPerform } from '@/lib/auth';
import { demoLimiter, getService, handoverLimiter, ipLimiter, setServiceForTests } from '@/lib/service/container';
import { createHandoverService } from '@/lib/service/handover-service';
import { createLocalStore } from '@/lib/evidence/local-store';
import { sha256Hex } from '@/lib/evidence/hash';
import { createFakeGateway } from '@/lib/payments/fake-gateway';
import { ConfigError } from '@/lib/config';
import { toResponse } from '@/lib/http';
import { ServiceError } from '@/lib/service/errors';

const BASE = 'http://localhost';
const PICKUP = [1, 2, 3, 4];
const ANGLES = ['front', 'back', 'left', 'right'] as const;

function jpeg(n: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, n]);
}

function ctx<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

interface Json {
  ok: boolean;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  error?: { code: string; message: string };
}

async function body(res: Response): Promise<Json> {
  return (await res.json()) as Json;
}

/** A close-enough size for the content-length header: field sizes plus a little for the multipart framing. */
function approxFormLength(form: FormData): number {
  let total = 0;
  for (const [key, value] of form.entries()) {
    total += key.length + (typeof value === 'string' ? value.length : value.size) + 100;
  }
  return total;
}

/** Each test calls from its own address, so the per-IP limits of one test never leak into the next. */
let testIp = '10.0.0.0';
let ipCounter = 0;

function req(
  method: string,
  url: string,
  opts: { headers?: Record<string, string>; json?: unknown; form?: FormData; declareLength?: boolean } = {},
): Request {
  const headers: Record<string, string> = { 'x-forwarded-for': testIp, ...(opts.headers ?? {}) };
  let payload: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(opts.json);
  } else if (opts.form) {
    payload = opts.form;
    if (opts.declareLength !== false) {
      headers['content-length'] = String(approxFormLength(opts.form));
    }
  }
  return new Request(`${BASE}${url}`, { method, headers, body: payload });
}

function photoForm(phase: string, angle: string, bytes: Uint8Array, source = 'camera'): FormData {
  const form = new FormData();
  form.set('phase', phase);
  form.set('angle', angle);
  form.set('source', source);
  form.set('file', new Blob([bytes as BlobPart], { type: 'image/jpeg' }), 'p.jpg');
  return form;
}

interface Session {
  shopId: string;
  shopH: Record<string, string>;
  id: string;
  /** The renter token and the secret of the renter's own device (Ruling R36). */
  renterH: Record<string, string>;
  /** The renter token alone, as a second device that opened the same link would send it. */
  tokenOnlyH: Record<string, string>;
  viewH: Record<string, string>;
}

const DEVICE_SECRET = 'renter-phone-secret-0123456789abcdef';
/** The confirm body the renter's browser sends: it carries only the hash of its device secret. */
const confirmBody = (extra: Record<string, unknown> = {}) => ({ language: 'en', deviceHash: sha256Hex(DEVICE_SECRET), ...extra });

/** A live (paid) assessor stand-in: answers like the recorded one, but says every call costs money. */
function asLiveAi(inner: VisionAssessor): VisionAssessor {
  return { ...inner, kind: 'claude', isFree: () => false };
}

function buildService(wrapAi: (ai: VisionAssessor) => VisionAssessor = (ai) => ai): ReturnType<typeof createHandoverService> {
  let counter = 0;
  const newId = () => `id${++counter}`;
  const store = createLocalStore(fs.mkdtempSync(path.join(os.tmpdir(), 'evenhand-')));
  const key = `condition:${PICKUP.map((n) => sha256Hex(jpeg(n))).sort().join(',')}`;
  const ai = wrapAi(createRecordedAssessor(
    { [key]: { itemDescription: 'Red scooter', detectedItemType: '125cc scooter', suggestedRuleId: 'scooter-125', marks: [] } },
    { newId },
  ));
  return createHandoverService({
    store,
    payments: createFakeGateway({ autoApprove: true }),
    ai,
    now: () => new Date(),
    newId,
  });
}

async function startSession(): Promise<Session> {
  const demo = await demoPOST(req('POST', '/api/demo'));
  const shopId = (await body(demo)).data.shopId as string;
  const setCookie = demo.headers.get('set-cookie') ?? '';
  const pair = setCookie.split(';')[0];
  const shopH = { cookie: pair };
  const made = await body(await createPOST(req('POST', `/api/shops/${shopId}/handovers`, { headers: shopH, json: { itemType: '125cc scooter', itemRef: 'ABC-123' } }), ctx({ shopId })));
  const { handoverId, renterUrl, recordUrl } = made.data as { handoverId: string; renterUrl: string; recordUrl: string };
  const tokenOnlyH = { 'x-renter-token': renterUrl.split('#t=')[1] };
  return {
    shopId,
    shopH,
    id: handoverId,
    renterH: { ...tokenOnlyH, 'x-renter-device': DEVICE_SECRET },
    tokenOnlyH,
    viewH: { 'x-view-key': recordUrl.split('#v=')[1] },
  };
}

async function post(handler: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>, s: Session, sub: string, headers: Record<string, string>, json?: unknown): Promise<Response> {
  return handler(req('POST', `/api/handovers/${s.id}/${sub}`, { headers, json }), ctx({ id: s.id }));
}

async function uploadAll(s: Session, phase: 'pickup' | 'return', ns: number[]): Promise<void> {
  for (const [i, angle] of ANGLES.entries()) {
    const res = await photosPOST(req('POST', `/api/handovers/${s.id}/photos`, { headers: s.shopH, form: photoForm(phase, angle, jpeg(ns[i])) }), ctx({ id: s.id }));
    expect(res.status).toBe(200);
  }
}

async function toActive(s: Session): Promise<void> {
  await uploadAll(s, 'pickup', PICKUP);
  expect((await post(conditionPOST, s, 'condition', s.shopH)).status).toBe(200);
  expect((await post(depositPOST, s, 'deposit', s.shopH, { ruleId: 'scooter-125' })).status).toBe(200);
  expect((await post(sharePOST, s, 'share', s.shopH)).status).toBe(200);
  expect((await post(confirmPOST, s, 'confirm', s.renterH, confirmBody({ renterName: 'Sam' }))).status).toBe(200);
  const order = await body(await post(orderPOST, s, 'hold/order', s.renterH));
  const orderId = order.data.orderId as string;
  const auth = await post(authorizePOST, s, 'hold/authorize', s.renterH, { orderId });
  expect(auth.status).toBe(200);
}

beforeAll(() => {
  for (const name of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'ANTHROPIC_API_KEY', 'BLOB_READ_WRITE_TOKEN', 'PUBLIC_BASE_URL']) {
    vi.stubEnv(name, '');
  }
});
afterAll(() => {
  vi.unstubAllEnvs();
});
beforeEach(() => {
  ipCounter += 1;
  testIp = `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
  setServiceForTests(buildService());
});
afterEach(() => {
  setServiceForTests(null);
  vi.restoreAllMocks();
});

describe('demo and shop routes', () => {
  it('demo creates a shop and sets the cookie', async () => {
    const res = await demoPOST(req('POST', '/api/demo'));
    expect(res.status).toBe(200);
    const json = await body(res);
    expect(json.ok).toBe(true);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`eh_shop_${json.data.shopId}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).not.toContain('Secure');
  });

  it('adds Secure to the cookie in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await demoPOST(req('POST', '/api/demo'));
    vi.stubEnv('NODE_ENV', 'test');
    expect(res.headers.get('set-cookie')).toContain('Secure');
  });

  it('shop routes need the shop cookie and never show the secret hash', async () => {
    const s = await startSession();
    const denied = await shopGET(req('GET', `/api/shops/${s.shopId}`), ctx({ shopId: s.shopId }));
    expect(denied.status).toBe(403);
    const ok = await shopGET(req('GET', `/api/shops/${s.shopId}`, { headers: s.shopH }), ctx({ shopId: s.shopId }));
    const json = await body(ok);
    expect(json.data.shop.name).toContain('Demo');
    expect(JSON.stringify(json)).not.toContain('secretHash');
    const put = await shopPUT(
      req('PUT', `/api/shops/${s.shopId}`, { headers: s.shopH, json: { depositRules: [{ id: 'bike', itemType: 'bike', label: 'Bike', amountCents: 5000 }], priceList: [] } }),
      ctx({ shopId: s.shopId }),
    );
    expect(put.status).toBe(200);
    const list = await listGET(req('GET', `/api/shops/${s.shopId}/handovers`, { headers: s.shopH }), ctx({ shopId: s.shopId }));
    expect((await body(list)).data.handovers).toHaveLength(1);
  });

  it('without PUBLIC_BASE_URL, the renter and record links use the request origin (I6a)', async () => {
    const demo = await demoPOST(new Request('https://evenhand-demo.vercel.app/api/demo', { method: 'POST' }));
    const shopId = (await body(demo)).data.shopId as string;
    const cookie = (demo.headers.get('set-cookie') ?? '').split(';')[0];
    const made = await createPOST(
      new Request(`https://evenhand-demo.vercel.app/api/shops/${shopId}/handovers`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ itemType: '125cc scooter', itemRef: 'ABC-123' }),
      }),
      ctx({ shopId }),
    );
    const { renterUrl, recordUrl } = (await body(made)).data as { renterUrl: string; recordUrl: string };
    expect(renterUrl).toMatch(/^https:\/\/evenhand-demo\.vercel\.app\/r\/[^#]+#t=/);
    expect(recordUrl).toMatch(/^https:\/\/evenhand-demo\.vercel\.app\/record\/[^#]+#v=/);
  });

  it('a configuration error is reported plainly as 503, never as a vague 500 (I6)', async () => {
    const res = toResponse(new ConfigError('Hosted on Vercel without BLOB_READ_WRITE_TOKEN.'));
    expect(res.status).toBe(503);
    expect((await body(res)).error).toEqual({ code: 'CONFIG', message: 'Hosted on Vercel without BLOB_READ_WRITE_TOKEN.' });
  });

  it('mode reports the keyless demo setup', async () => {
    const json = await body(await modeGET());
    expect(json.data).toMatchObject({ payments: 'fake', ai: 'recorded', storage: 'local' });
    expect(json.data).toHaveProperty('paypalClientId');
  });
});

describe('role checks', () => {
  it('renter cannot call release (403)', async () => {
    const s = await startSession();
    const res = await post(releasePOST, s, 'release', s.renterH);
    expect(res.status).toBe(403);
    expect((await body(res)).error?.code).toBe('FORBIDDEN');
  });

  it('shop cannot call accept (403)', async () => {
    const s = await startSession();
    expect((await post(acceptPOST, s, 'accept', s.shopH)).status).toBe(403);
    expect((await post(disputePOST, s, 'dispute', s.shopH, { reason: 'no' })).status).toBe(403);
  });

  it('view key cannot confirm (403)', async () => {
    const s = await startSession();
    const res = await post(confirmPOST, s, 'confirm', s.viewH, confirmBody());
    expect(res.status).toBe(403);
  });

  it('after confirmation, the renter token alone cannot act: hold, accept and dispute are refused (R36)', async () => {
    const s = await startSession();
    await uploadAll(s, 'pickup', PICKUP);
    await post(conditionPOST, s, 'condition', s.shopH);
    await post(depositPOST, s, 'deposit', s.shopH, { ruleId: 'scooter-125' });
    await post(sharePOST, s, 'share', s.shopH);
    expect((await post(confirmPOST, s, 'confirm', s.renterH, confirmBody())).status).toBe(200);
    const before = (await getService().getEvents(s.id)).length;
    for (const headers of [s.tokenOnlyH, { ...s.tokenOnlyH, 'x-renter-device': 'some-other-phone' }]) {
      const order = await post(orderPOST, s, 'hold/order', headers);
      expect(order.status).toBe(403);
      expect((await body(order)).error).toEqual({ code: 'OTHER_DEVICE', message: 'This record was confirmed on another device.' });
      expect((await post(acceptPOST, s, 'accept', headers)).status).toBe(403);
      expect((await post(disputePOST, s, 'dispute', headers, { reason: 'no' })).status).toBe(403);
    }
    expect((await getService().getEvents(s.id)).length).toBe(before);
    // The confirming device itself can go on.
    expect((await post(orderPOST, s, 'hold/order', s.renterH)).status).toBe(200);
  });

  it('a second device with the token sees a read-only record; the confirming device does not', async () => {
    const s = await startSession();
    await toActive(s);
    const read = async (headers: Record<string, string>) =>
      (await body(await handoverGET(req('GET', `/api/handovers/${s.id}`, { headers }), ctx({ id: s.id })))).data.handover;
    expect((await read(s.renterH)).otherDevice).toBe(false);
    expect((await read(s.tokenOnlyH)).otherDevice).toBe(true);
    expect((await read({ ...s.tokenOnlyH, 'x-renter-device': 'some-other-phone' })).otherDevice).toBe(true);
    expect((await read(s.shopH)).otherDevice).toBe(false);
  });

  it('a second confirm from another device does not move the binding', async () => {
    const s = await startSession();
    await toActive(s);
    const other = { ...s.tokenOnlyH, 'x-renter-device': 'some-other-phone' };
    const again = await post(confirmPOST, s, 'confirm', other, { language: 'en', deviceHash: sha256Hex('some-other-phone') });
    expect((await body(again)).data.handover.otherDevice).toBe(true);
    expect((await post(returnPOST, s, 'return', s.shopH)).status).toBe(200);
    expect((await post(disputePOST, s, 'dispute', other, { reason: 'no' })).status).toBe(403);
  });

  it('confirm needs the hash of a device secret', async () => {
    const s = await startSession();
    expect((await post(confirmPOST, s, 'confirm', s.renterH, { language: 'en' })).status).toBe(400);
    expect((await post(confirmPOST, s, 'confirm', s.renterH, { language: 'en', deviceHash: 'not-a-hash' })).status).toBe(400);
  });

  it('the renter token wins over a shop cookie in the same browser (R24)', async () => {
    const s = await startSession();
    await uploadAll(s, 'pickup', PICKUP);
    expect((await post(conditionPOST, s, 'condition', s.shopH)).status).toBe(200);
    expect((await post(depositPOST, s, 'deposit', s.shopH, { ruleId: 'scooter-125' })).status).toBe(200);
    expect((await post(sharePOST, s, 'share', s.shopH)).status).toBe(200);
    const both = { ...s.shopH, ...s.renterH };
    const confirmed = await post(confirmPOST, s, 'confirm', both, confirmBody({ renterName: 'Sam' }));
    expect(confirmed.status).toBe(200);
    expect((await body(confirmed)).data.handover.role).toBe('renter');
  });

  it('a shop cookie with a wrong renter token stays the shop and is refused renter actions', async () => {
    const s = await startSession();
    const res = await post(confirmPOST, s, 'confirm', { ...s.shopH, 'x-renter-token': 'wrong' }, confirmBody());
    expect(res.status).toBe(403);
    const read = await handoverGET(req('GET', `/api/handovers/${s.id}`, { headers: { ...s.shopH, 'x-renter-token': 'wrong' } }), ctx({ id: s.id }));
    expect((await body(read)).data.handover.role).toBe('shop');
  });

  it('a stranger cannot even read the handover, but any role can', async () => {
    const s = await startSession();
    const read = (headers: Record<string, string>) => handoverGET(req('GET', `/api/handovers/${s.id}`, { headers }), ctx({ id: s.id }));
    expect((await read({})).status).toBe(403);
    for (const h of [s.shopH, s.renterH, s.viewH]) {
      const res = await read(h);
      expect(res.status).toBe(200);
      expect(JSON.stringify(await body(res))).not.toMatch(/TokenHash|viewKeyHash/);
    }
  });

  it('a shop refresh does not ask about the hold unless the loaded state says it is due (I7)', async () => {
    const s = await startSession();
    await toActive(s);
    const svc = getService();
    const refresh = vi.spyOn(svc, 'refreshHold');
    const read = () => handoverGET(req('GET', `/api/handovers/${s.id}`, { headers: s.shopH }), ctx({ id: s.id }));
    expect((await read()).status).toBe(200);
    expect(refresh).not.toHaveBeenCalled();
    vi.spyOn(svc, 'holdRefreshDue').mockReturnValue(true);
    expect((await read()).status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('the shop list reads each handover once: the created time comes from the loaded state (I7)', async () => {
    const s = await startSession();
    const events = vi.spyOn(getService(), 'getEvents');
    const list = await body(await listGET(req('GET', `/api/shops/${s.shopId}/handovers`, { headers: s.shopH }), ctx({ shopId: s.shopId })));
    expect(list.data.handovers[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(events).not.toHaveBeenCalled();
  });

  it('an unknown handover is 404', async () => {
    const res = await handoverGET(req('GET', '/api/handovers/nope'), ctx({ id: 'nope' }));
    expect(res.status).toBe(404);
  });

  it('a malformed id is 404 and does not touch the store', async () => {
    const res = await handoverGET(req('GET', '/api/handovers/x'), ctx({ id: '../etc' }));
    expect(res.status).toBe(404);
  });

  it('roleMayPerform gives the expected role for every action a route uses', () => {
    for (const action of RENTER_ACTIONS) {
      expect(roleMayPerform('renter', action)).toBe(true);
      expect(roleMayPerform('shop', action)).toBe(false);
      expect(roleMayPerform('viewer', action)).toBe(false);
    }
    const shopActions = [
      'updateShopLists', 'createHandover', 'addPhoto', 'overridePhotoCheck', 'recordCondition', 'updateMarks',
      'setDeposit', 'shareWithRenter', 'startReturn', 'compare', 'addManualFinding', 'updateFinding',
      'proposeCharge', 'release',
    ];
    for (const action of shopActions) {
      expect(roleMayPerform('shop', action)).toBe(true);
      expect(roleMayPerform('renter', action)).toBe(false);
      expect(roleMayPerform('viewer', action)).toBe(false);
      expect(roleMayPerform(null, action)).toBe(false);
    }
  });
});

describe('input checks', () => {
  it('upload rejects a PNG with 400', async () => {
    const s = await startSession();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const res = await photosPOST(req('POST', `/api/handovers/${s.id}/photos`, { headers: s.shopH, form: photoForm('pickup', 'front', png) }), ctx({ id: s.id }));
    expect(res.status).toBe(400);
  });

  it('upload rejects 4 MB with 413 from the content-length alone', async () => {
    const s = await startSession();
    const big = new Uint8Array(4 * 1024 * 1024);
    big.set([0xff, 0xd8, 0xff]);
    const res = await photosPOST(req('POST', `/api/handovers/${s.id}/photos`, { headers: s.shopH, form: photoForm('pickup', 'front', big) }), ctx({ id: s.id }));
    expect(res.status).toBe(413);
  });

  it('upload rejects a 3.2 MB file with 400 after parsing (over the 3 MB file limit)', async () => {
    const s = await startSession();
    const big = new Uint8Array(3.2 * 1024 * 1024);
    big.set([0xff, 0xd8, 0xff]);
    const res = await photosPOST(req('POST', `/api/handovers/${s.id}/photos`, { headers: s.shopH, form: photoForm('pickup', 'front', big) }), ctx({ id: s.id }));
    expect(res.status).toBe(400);
  });

  it('upload without a content-length is 411 and is not read', async () => {
    const s = await startSession();
    const res = await photosPOST(
      req('POST', `/api/handovers/${s.id}/photos`, { headers: s.shopH, form: photoForm('pickup', 'front', jpeg(1)), declareLength: false }),
      ctx({ id: s.id }),
    );
    expect(res.status).toBe(411);
  });

  it('upload that declares more than 3.5 MB is 413', async () => {
    const s = await startSession();
    const res = await photosPOST(
      req('POST', `/api/handovers/${s.id}/photos`, {
        headers: { ...s.shopH, 'content-length': String(3.5 * 1024 * 1024 + 1) },
        form: photoForm('pickup', 'front', jpeg(1)),
        declareLength: false,
      }),
      ctx({ id: s.id }),
    );
    expect(res.status).toBe(413);
  });

  it('shop cannot create a hold order or authorize a hold (403, nothing changes)', async () => {
    const s = await startSession();
    const before = (await getService().getEvents(s.id)).length;
    expect((await post(orderPOST, s, 'hold/order', s.shopH)).status).toBe(403);
    expect((await post(authorizePOST, s, 'hold/authorize', s.shopH, { orderId: 'x' })).status).toBe(403);
    expect((await getService().getEvents(s.id)).length).toBe(before);
  });

  it('upload rejects a bad angle and a missing file with 400', async () => {
    const s = await startSession();
    const badAngle = await photosPOST(req('POST', `/api/handovers/${s.id}/photos`, { headers: s.shopH, form: photoForm('pickup', 'top', jpeg(1)) }), ctx({ id: s.id }));
    expect(badAngle.status).toBe(400);
    const form = new FormData();
    form.set('phase', 'pickup');
    form.set('angle', 'front');
    form.set('source', 'camera');
    form.set('file', 'not a file');
    const noFile = await photosPOST(req('POST', `/api/handovers/${s.id}/photos`, { headers: s.shopH, form }), ctx({ id: s.id }));
    expect(noFile.status).toBe(400);
  });

  it('rejects broken JSON and bad fields with 400', async () => {
    const s = await startSession();
    const broken = await depositPOST(
      new Request(`${BASE}/api/handovers/${s.id}/deposit`, { method: 'POST', headers: { ...s.shopH, 'content-type': 'application/json' }, body: '{nope' }),
      ctx({ id: s.id }),
    );
    expect(broken.status).toBe(400);
    expect((await post(depositPOST, s, 'deposit', s.shopH, { ruleId: 5 })).status).toBe(400);
    expect((await post(confirmPOST, s, 'confirm', s.renterH, confirmBody({ language: 'xx' }))).status).toBe(400);
    expect((await post(disputePOST, s, 'dispute', s.renterH, { reason: '   ' })).status).toBe(400);
  });

  it('with live AI, answers 429 on photos, condition and compare when the limiter says no', async () => {
    setServiceForTests(buildService(asLiveAi));
    const s = await startSession();
    vi.spyOn(ipLimiter, 'take').mockReturnValue(false);
    const photo = await photosPOST(req('POST', `/api/handovers/${s.id}/photos`, { headers: s.shopH, form: photoForm('pickup', 'front', jpeg(1)) }), ctx({ id: s.id }));
    expect(photo.status).toBe(429);
    expect((await body(photo)).error).toEqual({ code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' });
    expect((await post(conditionPOST, s, 'condition', s.shopH)).status).toBe(429);
    expect((await post(comparePOST, s, 'compare', s.shopH)).status).toBe(429);
  });

  it('in recorded mode the AI budget is never spent: no paid call is made (I5)', async () => {
    const s = await startSession();
    const take = vi.spyOn(ipLimiter, 'take').mockReturnValue(false);
    await toActive(s);
    expect((await post(returnPOST, s, 'return', s.shopH)).status).toBe(200);
    await uploadAll(s, 'return', [5, 6, 7, 8]);
    expect((await post(comparePOST, s, 'compare', s.shopH)).status).toBe(200);
    expect(take).not.toHaveBeenCalled();
  });

  it('a photo marked as a sample that is not a bundled sample photo is refused with 400 (C1)', async () => {
    const s = await startSession();
    const res = await photosPOST(req('POST', `/api/handovers/${s.id}/photos`, { headers: s.shopH, form: photoForm('pickup', 'front', jpeg(1), 'sample') }), ctx({ id: s.id }));
    expect(res.status).toBe(400);
    expect((await body(res)).error?.message).toBe('A sample photo must be one of the bundled sample photos, used by a demo shop');
  });

  it('the shop and renter views say whether the shop is a demo shop (C1)', async () => {
    const s = await startSession();
    for (const headers of [s.shopH, s.renterH]) {
      const view = (await body(await handoverGET(req('GET', `/api/handovers/${s.id}`, { headers }), ctx({ id: s.id })))).data.handover;
      expect(view.isDemo).toBe(true);
    }
  });

  it('limits demo shops to 20 and new handovers to 60 per IP per hour, with a friendly 429 (I5)', async () => {
    vi.spyOn(demoLimiter, 'take').mockReturnValue(false);
    const demo = await demoPOST(req('POST', '/api/demo'));
    expect(demo.status).toBe(429);
    expect((await body(demo)).error?.message).toBe('Too many demo shops from this network. Please try again in an hour.');
    vi.restoreAllMocks();
    const s = await startSession();
    vi.spyOn(handoverLimiter, 'take').mockReturnValue(false);
    const made = await createPOST(req('POST', `/api/shops/${s.shopId}/handovers`, { headers: s.shopH, json: { itemType: '125cc scooter', itemRef: 'X-1' } }), ctx({ shopId: s.shopId }));
    expect(made.status).toBe(429);
    expect((await body(made)).error?.message).toBe('Too many new handovers from this network. Please try again in an hour.');
  });

  it('maps errors: service codes to statuses, anything else to a plain 500', async () => {
    const codes = { NOT_FOUND: 404, INVALID_STATE: 409, INVALID_INPUT: 400, HOLD_LOST: 409, PAYMENT: 502 } as const;
    for (const [code, status] of Object.entries(codes)) {
      const res = toResponse(new ServiceError(code as keyof typeof codes, 'msg'));
      expect(res.status).toBe(status);
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = toResponse(new Error('db password is hunter2'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await body(res))).not.toContain('hunter2');
    expect((await body(toResponse(new Error('x')))).error?.message).toBe('Something went wrong');
    expect(spy).toHaveBeenCalled();
  });
});

describe('full flows over HTTP', () => {
  it('full clean flow over HTTP ends with status released', async () => {
    const s = await startSession();
    await toActive(s);
    expect((await post(returnPOST, s, 'return', s.shopH)).status).toBe(200);
    await uploadAll(s, 'return', [5, 6, 7, 8]);
    expect((await post(comparePOST, s, 'compare', s.shopH)).status).toBe(200);
    const released = await body(await post(releasePOST, s, 'release', s.shopH));
    expect(released.data.handover.status).toBe('released');
    expect(released.data.handover.role).toBe('shop');
  });

  it('damaged flow: manual finding, propose, renter accepts', async () => {
    const s = await startSession();
    await toActive(s);
    await post(returnPOST, s, 'return', s.shopH);
    await uploadAll(s, 'return', [5, 6, 7, 8]);
    await post(comparePOST, s, 'compare', s.shopH);
    const added = await body(
      await post(findingsPOST, s, 'findings', s.shopH, { angle: 'front', location: 'Front fender', description: 'Scratch', priceItemId: 'scratch-panel' }),
    );
    const finding = added.data.handover.findings[0];
    const confirmed = await findingPUT(
      req('PUT', `/api/handovers/${s.id}/findings/${finding.id}`, { headers: s.shopH, json: { status: 'confirmed', priceItemId: 'scratch-panel' } }),
      ctx({ id: s.id, findingId: finding.id }),
    );
    expect(confirmed.status).toBe(200);
    expect((await body(await post(proposePOST, s, 'propose', s.renterH))).error?.code).toBe('FORBIDDEN');
    expect((await post(proposePOST, s, 'propose', s.shopH)).status).toBe(200);
    const accepted = await body(await post(acceptPOST, s, 'accept', s.renterH));
    expect(accepted.data.handover.status).toBe('charged');
  });

  it('marks, override and shop lists are shop-only calls', async () => {
    const s = await startSession();
    await uploadAll(s, 'pickup', PICKUP);
    expect((await post(conditionPOST, s, 'condition', s.shopH)).status).toBe(200);
    const marks = await conditionPUT(req('PUT', `/api/handovers/${s.id}/condition`, { headers: s.shopH, json: { marks: [] } }), ctx({ id: s.id }));
    expect(marks.status).toBe(200);
    const asRenter = await conditionPUT(req('PUT', `/api/handovers/${s.id}/condition`, { headers: s.renterH, json: { marks: [] } }), ctx({ id: s.id }));
    expect(asRenter.status).toBe(403);
    const view = await body(await handoverGET(req('GET', `/api/handovers/${s.id}`, { headers: s.shopH }), ctx({ id: s.id })));
    const photoId = view.data.handover.pickupPhotos[0].id as string;
    const asRenterOverride = await overridePOST(req('POST', `/api/handovers/${s.id}/photos/${photoId}/override`, { headers: s.renterH }), ctx({ id: s.id, photoId }));
    expect(asRenterOverride.status).toBe(403);
    // M13: an accepted photo has nothing to override; the shop gets a clear 409.
    const override = await overridePOST(req('POST', `/api/handovers/${s.id}/photos/${photoId}/override`, { headers: s.shopH }), ctx({ id: s.id, photoId }));
    expect(override.status).toBe(409);
  });

  it('evidence pack chain is ok and lists photos', async () => {
    const s = await startSession();
    await toActive(s);
    const res = await evidenceGET(req('GET', `/api/handovers/${s.id}/evidence`, { headers: s.viewH }), ctx({ id: s.id }));
    expect(res.status).toBe(200);
    const pack = (await body(res)).data;
    expect(pack.chain).toEqual({ ok: true });
    expect(pack.events.length).toBeGreaterThan(5);
    expect(pack.photos).toHaveLength(4);
    expect(pack.photos[0]).toMatchObject({ angle: 'front', phase: 'pickup' });
    expect(pack.photos[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pack.handover.role).toBe('viewer');
    expect(pack.handover).not.toHaveProperty('renterTokenHash');
    const denied = await evidenceGET(req('GET', `/api/handovers/${s.id}/evidence`), ctx({ id: s.id }));
    expect(denied.status).toBe(403);
  });

  it('evidence pack hides credential hashes from every role and keeps the chain ok', async () => {
    const s = await startSession();
    await toActive(s);
    const stored = await getService().getEvents(s.id);
    const created = stored[0].event as { renterTokenHash: string; viewKeyHash: string };
    const realRenter = sha256Hex(s.renterH['x-renter-token']);
    const realView = sha256Hex(s.viewH['x-view-key']);
    expect(created.renterTokenHash).toBe(realRenter);
    for (const headers of [s.shopH, s.renterH, s.viewH]) {
      const res = await evidenceGET(req('GET', `/api/handovers/${s.id}/evidence`, { headers }), ctx({ id: s.id }));
      const pack = (await body(res)).data;
      const text = JSON.stringify(pack);
      expect(text).not.toContain(realRenter);
      expect(text).not.toContain(realView);
      expect(pack.chain.ok).toBe(true);
      expect(pack.events[0].event).toMatchObject({ type: 'created', renterTokenHash: 'redacted', viewKeyHash: 'redacted' });
      expect(pack.events[0]).toMatchObject({ seq: 0, hash: stored[0].hash, prevHash: stored[0].prevHash });
      expect(pack.note).toBe('Credential hashes are redacted; the chain was verified by the server.');
    }
    // The stored log was not changed by redaction.
    expect(((await getService().getEvents(s.id))[0].event as { renterTokenHash: string }).renterTokenHash).toBe(realRenter);
  });

  it('evidence pack hides the renter device hash, which is stored in the sealed confirm event', async () => {
    const s = await startSession();
    await toActive(s);
    const stored = await getService().getEvents(s.id);
    const confirmIndex = stored.findIndex((entry) => entry.event.type === 'renterConfirmed');
    const deviceHash = sha256Hex(DEVICE_SECRET);
    expect(stored[confirmIndex].event).toMatchObject({ renterDeviceHash: deviceHash });
    const pack = (await body(await evidenceGET(req('GET', `/api/handovers/${s.id}/evidence`, { headers: s.viewH }), ctx({ id: s.id })))).data;
    expect(JSON.stringify(pack)).not.toContain(deviceHash);
    expect(pack.events[confirmIndex].event).toMatchObject({ type: 'renterConfirmed', renterDeviceHash: 'redacted' });
    expect(pack.events[confirmIndex].hash).toBe(stored[confirmIndex].hash);
    expect(pack.chain).toEqual({ ok: true });
  });

  it('local-photo is 404 in production even with local storage', async () => {
    const s = await startSession();
    await uploadAll(s, 'pickup', PICKUP);
    const view = await body(await handoverGET(req('GET', `/api/handovers/${s.id}`, { headers: s.shopH }), ctx({ id: s.id })));
    const photoId = view.data.handover.pickupPhotos[0].id as string;
    vi.stubEnv('NODE_ENV', 'production');
    const res = await localPhotoGET(req('GET', '/x'), ctx({ handoverId: s.id, photoId }));
    vi.stubEnv('NODE_ENV', 'test');
    expect(res.status).toBe(404);
  });

  it('serves a stored photo in local mode and 404s for unknown ones', async () => {
    const s = await startSession();
    await uploadAll(s, 'pickup', PICKUP);
    const view = await body(await handoverGET(req('GET', `/api/handovers/${s.id}`, { headers: s.shopH }), ctx({ id: s.id })));
    const photoId = view.data.handover.pickupPhotos[0].id as string;
    const res = await localPhotoGET(req('GET', `/api/local-photo/${s.id}/${photoId}`), ctx({ handoverId: s.id, photoId }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg(1));
    const missing = await localPhotoGET(req('GET', '/x'), ctx({ handoverId: s.id, photoId: 'nope' }));
    expect(missing.status).toBe(404);
  });
});
