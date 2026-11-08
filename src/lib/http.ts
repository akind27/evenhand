// SERVER ONLY. Shared helpers for the API route handlers.
import { z } from 'zod';
import { ConfigError } from '@/lib/config';
import { ServiceError, type ServiceErrorCode } from '@/lib/service/errors';

/** An error a route throws on purpose, with the status and code the client should see. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
}

const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  INVALID_INPUT: 400,
  HOLD_LOST: 409,
  PAYMENT: 502,
};

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** `{ ok: true, data }` with status 200 unless `init` says otherwise. */
export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data }, init);
}

export function fail(code: string, message: string, status: number, init?: ResponseInit): Response {
  const body: ErrorBody = { ok: false, error: { code, message } };
  return Response.json(body, { ...init, status });
}

/** Turns any thrown value into a response. Unknown errors are logged here and never shown to the client. */
export function toResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return fail(error.code, error.message, error.status);
  }
  if (error instanceof ServiceError) {
    return fail(error.code, error.message, STATUS_BY_CODE[error.code]);
  }
  if (error instanceof ConfigError) {
    // A setup problem, not a crash: its message names only variable names and says what to set.
    console.error('Configuration error', error.message);
    return fail('CONFIG', error.message, 503);
  }
  console.error('Unhandled API error', error);
  return fail('INTERNAL', 'Something went wrong', 500);
}

/** Runs a handler body and turns anything it throws into a response. */
export async function respond(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return toResponse(error);
  }
}

/** Reads the JSON body and checks it against the schema. 400 on broken JSON or a wrong shape. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'The request body must be valid JSON');
  }
  return checkShape(raw, schema);
}

/** Checks any value against a schema. 400 with the first problem when it does not fit. */
export function checkShape<S extends z.ZodType>(raw: unknown, schema: S): z.infer<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(400, 'INVALID_INPUT', `${where}${issue.message}`);
  }
  return parsed.data;
}

/** Reads the `cookie` header ourselves, so handlers can be called directly in tests. */
export function parseCookies(req: Request): Record<string, string> {
  const result: Record<string, string> = {};
  const header = req.headers.get('cookie');
  if (!header) {
    return result;
  }
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at <= 0) {
      continue;
    }
    const name = part.slice(0, at).trim();
    const raw = part.slice(at + 1).trim();
    try {
      result[name] = decodeURIComponent(raw);
    } catch {
      result[name] = raw;
    }
  }
  return result;
}

/** The first `x-forwarded-for` entry, else `local`. */
export function clientIp(req: Request): string {
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first ? first : 'local';
}

/** An id from the URL. A value that is not a safe id is treated as "not found". */
export function requireId(value: string, what: string): string {
  if (!ID_PATTERN.test(value)) {
    throw new HttpError(404, 'NOT_FOUND', `${what} not found`);
  }
  return value;
}
