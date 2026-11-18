import { z } from "zod";
import { truncateMoney, truncateToDecimals } from "@/lib/decimal";
import type { Database } from "@/types/supabase";

const money = z
  .number()
  .finite()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER / 100)
  .refine(
    (value) => truncateMoney(value) === value,
    "El importe admite hasta dos decimales."
  );
const quantity = z
  .number()
  .finite()
  .positive()
  .refine(
    (value) => truncateToDecimals(value, 6) === value,
    "La cantidad admite hasta seis decimales."
  );
const documentNumber = z
  .string()
  .trim()
  .max(32)
  .regex(/^[\d.\s-]+$/, "Documento inválido.")
  .transform((value) => value.replace(/[.\s-]/g, ""));
const address = z
  .string()
  .trim()
  .min(1, "La dirección es obligatoria.")
  .max(180);

export const meliReceiverSchema = z.discriminatedUnion("tax_condition", [
  z.object({
    version: z.literal(1),
    tax_condition: z.literal("CONSUMIDOR_FINAL"),
    document_type: z.literal("DNI"),
    document_number: documentNumber.pipe(
      z
        .string()
        .regex(/^\d{7,8}$/, "Ingresá un DNI de 7 u 8 dígitos.")
        .refine((value) => Number(value) > 0, "Ingresá un DNI válido.")
    ),
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    address,
  }),
  z.object({
    version: z.literal(1),
    tax_condition: z.literal("RESPONSABLE_INSCRIPTO"),
    document_type: z.literal("CUIT"),
    document_number: documentNumber.pipe(
      z.string().regex(/^\d{11}$/, "Ingresá un CUIT de 11 dígitos.")
    ),
    business_name: z.string().trim().min(1).max(140),
    address,
  }),
]);

export const createMeliSaleSchema = z
  .object({
    orgSlug: z.string().trim().min(1),
    idempotencyKey: z.uuid(),
    marketplaceOrderNumber: z.string().trim().min(1).max(120),
    warehouseId: z.uuid(),
    saleDate: z.iso.date(),
    customerId: z.uuid().nullable().default(null),
    receiver: meliReceiverSchema,
    invoiceType: z.enum(["FACTURA_A", "FACTURA_B", "FACTURA_C"]),
    currency: z.enum(["ARS", "USD"]).default("ARS"),
    commercialExchangeRate: z
      .number()
      .finite()
      .positive()
      .nullable()
      .default(null),
    observations: z.string().trim().max(2000).default(""),
    expectedTotal: money.optional(),
    globalDiscountPercentage: z.number().finite().min(0).max(100).default(0),
    taxIds: z.array(z.uuid()).max(30).default([]),
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          productVariantId: z.uuid().nullable().default(null),
          quantity,
          weightQuantity: quantity.nullable().default(null),
          unitPrice: money,
          discountAmount: money.default(0),
        })
      )
      .min(1)
      .max(500),
  })
  .superRefine((input, context) => {
    if (
      input.invoiceType === "FACTURA_A" &&
      input.receiver.tax_condition !== "RESPONSABLE_INSCRIPTO"
    ) {
      context.addIssue({
        code: "custom",
        path: ["invoiceType"],
        message: "Factura A requiere un responsable inscripto.",
      });
    }
    if (
      input.invoiceType === "FACTURA_B" &&
      input.receiver.tax_condition === "RESPONSABLE_INSCRIPTO"
    ) {
      context.addIssue({
        code: "custom",
        path: ["invoiceType"],
        message:
          "Un responsable inscripto requiere Factura A o C según el emisor.",
      });
    }
    if (input.currency === "USD" && !input.commercialExchangeRate) {
      context.addIssue({
        code: "custom",
        path: ["commercialExchangeRate"],
        message: "La venta USD requiere cotización comercial.",
      });
    }
    if (new Set(input.taxIds).size !== input.taxIds.length) {
      context.addIssue({
        code: "custom",
        path: ["taxIds"],
        message: "Hay impuestos repetidos.",
      });
    }
  });

export type CreateMeliSaleInput = z.input<typeof createMeliSaleSchema>;
export type ValidatedMeliSale = z.output<typeof createMeliSaleSchema>;
export type MeliReceiver = z.output<typeof meliReceiverSchema>;

export const createMeliCreditNoteSchema = z.object({
  saleId: z.uuid(),
  idempotencyKey: z.uuid(),
  amount: money.refine(
    (value) => value > 0,
    "El importe debe ser mayor a cero."
  ),
  issueDate: z.iso.date(),
  reason: z
    .string()
    .trim()
    .min(5, "Indicá el motivo de la nota de crédito.")
    .max(500),
});
export type MeliProduct = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  | "id"
  | "name"
  | "is_active"
  | "has_variants"
  | "unit_of_measure"
  | "tracks_stock_units"
>;
export type MeliLot = Pick<
  Database["public"]["Tables"]["product_lots"]["Row"],
  | "id"
  | "product_id"
  | "product_variant_id"
  | "quantity_available"
  | "unit_quantity_available"
  | "expiration_date"
  | "created_at"
  | "lot_number"
>;
export type MeliSaleResult = { saleId: string; idempotent: boolean };
