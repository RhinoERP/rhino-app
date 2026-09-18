import { z } from "zod";
import {
  type OfflinePreSaleDraft,
  offlinePreSaleDraftSchema,
} from "./offline-pre-sale-draft";
import {
  type SellerOfflineSnapshotV1,
  sellerOfflineSnapshotV1Schema,
} from "./seller-offline-snapshot";

export const OFFLINE_COMMAND_SCHEMA_VERSION = 1 as const;

const paymentMethodSchema = z.enum([
  "efectivo",
  "tarjeta_de_credito",
  "tarjeta_de_debito",
  "transferencia",
  "qr",
  "cheque",
  "deposito",
  "e-cheq",
]);

const invoiceTypeSchema = z.enum([
  "NOTA_DE_VENTA",
  "FACTURA_A",
  "FACTURA_A_RETENCION",
  "FACTURA_B",
  "FACTURA_C",
  "FACTURA_E",
]);

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe usar el formato YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "La fecha no es valida");

export const createPreSaleCommandV1Schema = z
  .object({
    customerId: z.string().uuid(),
    sellerId: z.string().uuid(),
    saleDate: dateOnlySchema,
    paymentMethod: paymentMethodSchema,
    invoiceType: invoiceTypeSchema,
    observations: z.string().max(1000),
    items: z
      .array(
        z
          .object({
            lineId: z.string().uuid(),
            productId: z.string().uuid(),
            quantity: z.number().finite().positive(),
            unitPrice: z.number().finite().nonnegative(),
            taxes: z
              .array(
                z
                  .object({
                    taxId: z.string().uuid(),
                    name: z.string().trim().min(1).max(120),
                    rate: z.number().finite(),
                    code: z.string().trim().max(50).nullable(),
                  })
                  .strict()
              )
              .max(20),
          })
          .strict()
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((payload, context) => {
    const lineIds = new Set<string>();
    for (const [index, item] of payload.items.entries()) {
      if (lineIds.has(item.lineId)) {
        context.addIssue({
          code: "custom",
          message: "El identificador de linea esta duplicado",
          path: ["items", index, "lineId"],
        });
      }
      lineIds.add(item.lineId);
    }
  });

export const offlineCommandV1Schema = z
  .object({
    commandId: z.string().uuid(),
    schemaVersion: z.literal(OFFLINE_COMMAND_SCHEMA_VERSION),
    type: z.literal("preSale.create"),
    ownerUserId: z.string().uuid(),
    organizationId: z.string().uuid(),
    orgSlugAtCreation: z.string().trim().min(1).max(100),
    snapshotId: z.string().uuid(),
    createdAt: z.string().datetime(),
    payload: createPreSaleCommandV1Schema,
  })
  .strict();

export const commercialChangeSchema = z
  .object({
    path: z.string().min(1).max(200),
    message: z.string().min(1).max(500),
    capturedValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    currentValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  })
  .strict();

export const offlineCommandResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      commandId: z.string().uuid(),
      resourceId: z.string().uuid(),
      duplicate: z.boolean(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum([
        "AUTH_REQUIRED",
        "FORBIDDEN",
        "VALIDATION_ERROR",
        "STALE_REFERENCE",
        "REVIEW_REQUIRED",
        "RETRYABLE",
      ]),
      message: z.string().min(1).max(500),
      retryable: z.boolean(),
      fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
      changes: z.array(commercialChangeSchema).optional(),
    })
    .strict(),
]);

export type CreatePreSaleCommandV1 = z.infer<
  typeof createPreSaleCommandV1Schema
>;
export type OfflineCommandV1 = z.infer<typeof offlineCommandV1Schema>;
export type OfflineCommandResult = z.infer<typeof offlineCommandResultSchema>;
export type CommercialChange = z.infer<typeof commercialChangeSchema>;

export function createOfflinePreSaleCommand({
  commandId,
  createdAt,
  draft: draftValue,
  saleDate,
  snapshot: snapshotValue,
}: {
  commandId: string;
  createdAt: string;
  draft: OfflinePreSaleDraft;
  saleDate: string;
  snapshot: SellerOfflineSnapshotV1;
}): OfflineCommandV1 {
  const draft = offlinePreSaleDraftSchema.parse(draftValue);
  const snapshot = sellerOfflineSnapshotV1Schema.parse(snapshotValue);
  if (
    snapshot.snapshotId !== draft.snapshotId ||
    snapshot.ownerUserId !== draft.ownerUserId ||
    snapshot.organizationId !== draft.organizationId
  ) {
    throw new Error(
      "El borrador y el snapshot no pertenecen a la misma particion"
    );
  }
  const fallbackTaxes = snapshot.settings.defaultTaxIds.flatMap((taxId) => {
    const tax = snapshot.taxes.find((entry) => entry.id === taxId);
    return tax
      ? [{ taxId: tax.id, name: tax.name, rate: tax.rate, code: tax.code }]
      : [];
  });

  return offlineCommandV1Schema.parse({
    commandId,
    schemaVersion: OFFLINE_COMMAND_SCHEMA_VERSION,
    type: "preSale.create",
    ownerUserId: draft.ownerUserId,
    organizationId: draft.organizationId,
    orgSlugAtCreation: draft.orgSlug,
    snapshotId: draft.snapshotId,
    createdAt,
    payload: {
      customerId: draft.payload.customerId,
      sellerId: draft.payload.sellerId,
      saleDate,
      paymentMethod: draft.payload.paymentMethod,
      invoiceType: draft.payload.invoiceType,
      observations: draft.payload.notes,
      items: draft.payload.items.map((item) => ({
        ...item,
        taxes: item.taxes.length > 0 ? item.taxes : fallbackTaxes,
      })),
    },
  });
}
