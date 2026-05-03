import { z } from "zod";
import type { PaymentMethod } from "@/modules/collections/types";
import type { Database } from "@/types/supabase";

const idSchema = z.string().trim().min(1);
const optionalIdSchema = idSchema.optional().nullable();
const nonNegativeNumberSchema = z.coerce.number().finite().min(0);

export const posPaymentMethodValues = [
  "efectivo",
  "tarjeta_de_credito",
  "tarjeta_de_debito",
  "transferencia",
  "cheque",
  "deposito",
  "e-cheq",
] as const;

export const posPaymentMethodSchema = z.enum(posPaymentMethodValues);

export type PosPaymentMethod = z.infer<typeof posPaymentMethodSchema>;

export const posSaleTaxSchema = z.object({
  taxId: idSchema,
  name: z.string().trim().min(1),
  rate: z.coerce.number().finite().min(0).max(100),
});

export const posSaleItemSchema = z.object({
  productId: idSchema,
  quantity: z.coerce.number().finite().positive(),
  weightQuantity: z.coerce.number().finite().positive().optional().nullable(),
  unitPrice: nonNegativeNumberSchema,
  discountAmount: nonNegativeNumberSchema.optional().nullable(),
  discountPercentage: z.coerce
    .number()
    .finite()
    .min(0)
    .max(100)
    .optional()
    .nullable(),
  lotId: optionalIdSchema,
});

export const createPosSaleSchema = z.object({
  orgSlug: idSchema,
  terminalId: idSchema,
  customerId: optionalIdSchema,
  saleDate: z.string().trim().min(1),
  paymentMethod: posPaymentMethodSchema.default("efectivo"),
  paymentReference: z.string().trim().max(120).optional().nullable(),
  cardBrand: z.string().trim().max(80).optional().nullable(),
  items: z.array(posSaleItemSchema).min(1),
  globalDiscountPercentage: z.coerce
    .number()
    .finite()
    .min(0)
    .max(100)
    .optional()
    .nullable(),
  taxes: z.array(posSaleTaxSchema).optional(),
});

export const posTerminalFormSchema = z.object({
  terminalId: idSchema,
  customerId: optionalIdSchema,
  saleDate: z.string().trim().min(1, "La fecha de venta es obligatoria"),
  paymentMethod: posPaymentMethodSchema,
  paymentReference: z.string().trim().max(120).optional().nullable(),
  cardBrand: z.string().trim().max(80).optional().nullable(),
  globalDiscountPercentage: z.number().finite().min(0).max(100),
  selectedTaxIds: z.array(idSchema),
});

export const posProductSearchParamsSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  barcode: z.string().trim().max(120).optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const createPosTerminalSchema = z.object({
  orgSlug: idSchema,
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  code: z.string().trim().max(80).optional().nullable(),
  cashRegisterNumber: z.coerce
    .number()
    .int("El número de caja debe ser un entero")
    .min(1, "El número de caja debe ser mayor a 0"),
  isActive: z.boolean(),
  defaultPriceListId: optionalIdSchema,
});

export const openPosSessionSchema = z.object({
  orgSlug: idSchema,
  terminalId: idSchema,
  startingCash: nonNegativeNumberSchema,
});

export const closePosSessionSchema = z.object({
  orgSlug: idSchema,
  sessionId: idSchema,
  realCashEnd: nonNegativeNumberSchema,
  notes: z.string().trim().max(500).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
});

export const posTerminalConfigFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  code: z.string().trim().max(80).optional().nullable(),
  cashRegisterNumber: z
    .number()
    .int("El número de caja debe ser un entero")
    .min(1, "El número de caja debe ser mayor a 0"),
  isActive: z.boolean(),
  defaultPriceListId: optionalIdSchema,
});

export type PosSaleCustomer = {
  id: string;
  business_name: string;
  fantasy_name: string | null;
};

export type PosSaleProduct = {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: Database["public"]["Enums"]["unit_of_measure_type"] | null;
};

export type PosSaleTerminal = {
  id: string;
  name: string;
  code: string | null;
  cash_register_number: number | null;
};

export type PosSaleItem =
  Database["public"]["Tables"]["pos_sale_items"]["Row"] & {
    product: PosSaleProduct | null;
  };

export type PosSalePayment =
  Database["public"]["Tables"]["pos_payments"]["Row"];

export type PosSaleUser = {
  id: string;
  name: string;
  email: string | null;
};

export type PosSaleReturnSummary = {
  returnsCount: number;
  totalReturnedAmount: number;
  totalRefundedAmount: number;
  totalCreditedAmount: number;
  pendingReturnableAmount: number;
};

export type PosSaleReturnRecord = {
  id: string;
  posSaleId: string;
  returnDate: string | null;
  reason: string | null;
  resolution: string | null;
  restock: boolean;
  totalAmount: number;
  refundAmount: number;
  refundMethod: string | null;
  creditNoteAmount: number;
  createdAt: string | null;
};

export type PosSale = Database["public"]["Tables"]["pos_sales"]["Row"] & {
  customer: PosSaleCustomer | null;
  terminal: PosSaleTerminal | null;
  items: PosSaleItem[];
  payments: PosSalePayment[];
  user: PosSaleUser | null;
  returnSummary?: PosSaleReturnSummary;
};

export type PosSaleDetail = PosSale & {
  returns: PosSaleReturnRecord[];
};

export type PosTerminalProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  price: number;
  directSalePrice: number | null;
  unitOfMeasure: Database["public"]["Enums"]["unit_of_measure_type"];
  tracksStockUnits: boolean;
  weightPerUnit: number | null;
  totalQuantity: number;
  totalUnitQuantity: number | null;
};

export type PosTerminal = Database["public"]["Tables"]["pos_terminals"]["Row"];

export type PosSessionStatus =
  Database["public"]["Enums"]["pos_session_status"];

export type PosCashControlTerminal = {
  id: string;
  name: string;
  code: string | null;
  cashRegisterNumber: number | null;
  isActive: boolean;
};

export type PosSessionSummary = {
  id: string;
  terminalId: string;
  terminalName: string;
  terminalCode: string | null;
  terminalCashRegisterNumber: number | null;
  userId: string;
  userName: string;
  openedAt: string | null;
  closedAt: string | null;
  startingCash: number;
  cashSalesAmount: number;
  expectedCashEnd: number;
  realCashEnd: number | null;
  differenceAmount: number | null;
  closeNotes: string | null;
  status: PosSessionStatus;
  isCurrentUserSession: boolean;
  canBeClosedByCurrentUser: boolean;
};

export type PosCashControlData = {
  sessions: PosSessionSummary[];
  terminals: PosCashControlTerminal[];
};

export type CreatePosSaleInput = z.infer<typeof createPosSaleSchema>;

export type CreatePosSaleResult = {
  posSaleId: string;
};

export type PosTerminalFormValues = z.infer<typeof posTerminalFormSchema>;

export type PosSaleItemInput = z.infer<typeof posSaleItemSchema>;

export type PosSaleTaxInput = z.infer<typeof posSaleTaxSchema>;

export type PosProductSearchParams = z.infer<
  typeof posProductSearchParamsSchema
>;

export type CreatePosTerminalInput = z.infer<typeof createPosTerminalSchema>;

export type OpenPosSessionInput = z.infer<typeof openPosSessionSchema>;

export type ClosePosSessionInput = z.infer<typeof closePosSessionSchema>;

export type PosTerminalConfigFormValues = z.infer<
  typeof posTerminalConfigFormSchema
>;

export type PosFormPaymentMethod = PaymentMethod;
