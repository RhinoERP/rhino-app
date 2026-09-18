import { z } from "zod";

export const OFFLINE_PRE_SALE_DRAFT_SCHEMA_VERSION = 1 as const;

export const offlinePreSaleDraftItemSchema = z.object({
  lineId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().finite().positive(),
  unitPrice: z.number().finite().nonnegative(),
  taxes: z.array(
    z.object({
      taxId: z.string().uuid(),
      name: z.string().min(1),
      rate: z.number().finite(),
      code: z.string().nullable(),
    })
  ),
});

export const offlinePreSaleDraftSchema = z.object({
  draftId: z.string().uuid(),
  schemaVersion: z.literal(OFFLINE_PRE_SALE_DRAFT_SCHEMA_VERSION),
  ownerUserId: z.string().uuid(),
  organizationId: z.string().uuid(),
  orgSlug: z.string().min(1),
  snapshotId: z.string().uuid(),
  status: z.literal("draft"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  purgeAfterHours: z.number().int().min(1),
  payload: z.object({
    customerId: z.string().uuid().nullable(),
    sellerId: z.string().uuid(),
    paymentMethod: z.enum([
      "efectivo",
      "tarjeta_de_credito",
      "tarjeta_de_debito",
      "transferencia",
      "qr",
      "cheque",
      "deposito",
      "e-cheq",
    ]),
    invoiceType: z.enum([
      "NOTA_DE_VENTA",
      "FACTURA_A",
      "FACTURA_A_RETENCION",
      "FACTURA_B",
      "FACTURA_C",
      "FACTURA_E",
    ]),
    notes: z.string().max(1000),
    items: z.array(offlinePreSaleDraftItemSchema),
  }),
});

export type OfflinePreSaleDraft = z.infer<typeof offlinePreSaleDraftSchema>;
export type OfflinePreSaleDraftItem = z.infer<
  typeof offlinePreSaleDraftItemSchema
>;
