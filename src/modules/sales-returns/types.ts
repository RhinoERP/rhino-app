import { z } from "zod";

const idSchema = z.string().trim().min(1);

export const posSaleReturnResolutionValues = ["refund", "credit_note"] as const;

export const posSaleReturnRefundMethodValues = [
  "original_payment",
  "cash",
  "card",
  "bank_transfer",
  "accounts_receivable",
] as const;

export const posSaleReturnResolutionSchema = z.enum(
  posSaleReturnResolutionValues
);

export const posSaleReturnRefundMethodSchema = z.enum(
  posSaleReturnRefundMethodValues
);

export const posSaleReturnItemSchema = z.object({
  posSaleItemId: idSchema,
  quantity: z.coerce.number().finite().positive(),
  unitQuantity: z.coerce.number().finite().min(0).optional().nullable(),
  reason: z.string().trim().max(250).optional().nullable(),
});

export const processPosSaleReturnSchema = z.object({
  orgSlug: idSchema,
  posSaleId: idSchema,
  returnDate: z.string().trim().min(1).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  restock: z.coerce.boolean().default(true),
  resolution: posSaleReturnResolutionSchema.default("credit_note"),
  refundMethod: posSaleReturnRefundMethodSchema.optional().nullable(),
  refundAmount: z.coerce.number().finite().min(0).optional().nullable(),
  items: z
    .array(posSaleReturnItemSchema)
    .min(1, "Agrega al menos un ítem para devolver."),
});

export type PosSaleReturnResolution = z.infer<
  typeof posSaleReturnResolutionSchema
>;

export type PosSaleReturnRefundMethod = z.infer<
  typeof posSaleReturnRefundMethodSchema
>;

export type ProcessPosSaleReturnItemInput = z.infer<
  typeof posSaleReturnItemSchema
>;

export type ProcessPosSaleReturnInput = z.infer<
  typeof processPosSaleReturnSchema
>;

export type ProcessPosSaleReturnResult = {
  posSaleReturnId: string;
  totalReturnedAmount: number;
  refundedAmount: number;
  creditNoteAmount: number;
  effectiveRefundMethod: PosSaleReturnRefundMethod | null;
  customerCreditId: string | null;
  stockMovementIds: string[];
};

export type PosSaleReturnableSale = {
  posSaleId: string;
  receiptNumber: string | null;
  saleDate: string | null;
  status: string | null;
  customerId: string | null;
  totalAmount: number;
  totalReturnedAmount: number;
  totalRefundedAmount: number;
  pendingReturnableAmount: number;
};

export type PosSaleReturnableItem = {
  posSaleItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  lotId: string | null;
  soldQuantity: number;
  returnedQuantity: number;
  availableToReturn: number;
  unitPrice: number;
  maxReturnAmount: number;
  tracksStockUnits: boolean;
  unitOfMeasure: string | null;
};

export type GetPosSaleReturnableItemsResult = {
  sale: PosSaleReturnableSale;
  items: PosSaleReturnableItem[];
};
