import { photoFieldsSchema } from '@/lib/api-schemas';
import { sha256Hex } from '@/lib/evidence/hash';
import { HttpError, checkShape, ok, respond } from '@/lib/http';
import { authorize, spendAiBudget, type IdContext } from '@/lib/route-auth';

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
/** The whole upload, with its form fields, may not be larger than this (3.5 MB). */
const MAX_BODY_BYTES = 3.5 * 1024 * 1024;
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function badRequest(message: string): HttpError {
  return new HttpError(400, 'INVALID_INPUT', message);
}

/** Returns the photo bytes, or throws 400 when the file is missing, too big or not a JPEG. */
async function readJpeg(file: FormDataEntryValue | null): Promise<Uint8Array> {
  if (!(file instanceof Blob)) {
    throw badRequest('file: a photo file is required');
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw badRequest('file: the photo is larger than 3 MB');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0 || !JPEG_MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw badRequest('file: the photo must be a JPEG');
  }
  return bytes;
}

/** AI routes may wait for the model: up to 300 seconds (M8). */
export const maxDuration = 300;

export async function POST(req: Request, ctx: IdContext): Promise<Response> {
  return respond(async () => {
    const { id } = await ctx.params;
    const access = await authorize(req, id, 'addPhoto');
    const { service, state, view } = access;
    const lengthHeader = req.headers.get('content-length');
    if (lengthHeader === null) {
      throw new HttpError(411, 'LENGTH_REQUIRED', 'The upload must say how large it is');
    }
    if (!(Number(lengthHeader) <= MAX_BODY_BYTES)) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The upload is larger than 3.5 MB');
    }
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw badRequest('The request body must be a multipart form');
    }
    const fields = checkShape(
      { phase: form.get('phase'), angle: form.get('angle'), source: form.get('source') },
      photoFieldsSchema,
    );
    const bytes = await readJpeg(form.get('file'));
    // Only a check that will really reach the model spends the budget: not a recorded sample, not a reused retake.
    spendAiBudget(req, access, {
      kind: 'photoCheck',
      sha256: sha256Hex(bytes),
      phase: fields.phase,
      angle: fields.angle,
    });
    const { photo, check, state: next } = await service.addPhoto(state.id, { ...fields, bytes });
    return ok({ photo, check, handover: view(next) });
  });
}
