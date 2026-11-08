import { z } from 'zod';
import { ID_PATTERN } from '@/lib/http';

export const idSchema = z.string().regex(ID_PATTERN, 'must be a safe id');
export const langSchema = z.enum(['en', 'el', 'de', 'it', 'fr']);
export const angleSchema = z.enum(['front', 'back', 'left', 'right', 'closeup']);
export const phaseSchema = z.enum(['pickup', 'return']);
export const sourceSchema = z.enum(['camera', 'sample']);

export const photoFieldsSchema = z.object({ phase: phaseSchema, angle: angleSchema, source: sourceSchema });

export const createHandoverSchema = z.object({
  itemType: z.string().trim().min(1).max(40),
  itemRef: z.string().trim().min(1).max(40),
});

export const shopListsSchema = z.object({
  depositRules: z
    .array(z.object({ id: z.string().max(40), itemType: z.string().max(40), label: z.string().max(60), amountCents: z.number() }))
    .max(50),
  priceList: z.array(z.object({ id: z.string().max(40), label: z.string().max(60), amountCents: z.number() })).max(100),
});

const unit = z.number().min(0).max(1);
export const marksSchema = z.object({
  marks: z
    .array(
      z.object({
        id: idSchema,
        photoId: idSchema,
        location: z.string().max(120),
        note: z.string().max(300),
        box: z.object({ x: unit, y: unit, w: unit, h: unit }).optional(),
      }),
    )
    .max(100),
});

export const depositSchema = z.object({ ruleId: z.string().min(1).max(40) });
export const confirmSchema = z.object({
  language: langSchema,
  renterName: z.string().trim().max(60).nullish(),
  /** SHA-256 (hex) of the device secret the renter's browser keeps (Ruling R36). The secret itself never goes in a body. */
  deviceHash: z.string().regex(/^[0-9a-f]{64}$/, 'must be a SHA-256 hex digest'),
});
export const authorizeSchema = z.object({ orderId: z.string().min(1).max(64) });
export const disputeSchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const manualFindingSchema = z.object({
  angle: angleSchema,
  location: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(300),
  priceItemId: z.string().min(1).max(40),
  /** Where the shop saw the damage on the return photo, as fractions of the photo. Left out: the whole photo. */
  box: z.object({ x: unit, y: unit, w: unit, h: unit }).optional(),
});

export const findingUpdateSchema = z.object({
  status: z.enum(['confirmed', 'dismissed']),
  priceItemId: z.string().min(1).max(40).nullable(),
});
