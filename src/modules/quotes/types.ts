import { z } from "zod";
import type { Database } from "@/types/supabase";

// --- Database & API Types ---
export type QuoteStatus =
  | "DRAFT"
  | "SENT"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED"
  | "CANCELLED";

export type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"];

export type QuoteItemRow = Database["public"]["Tables"]["quote_items"]["Row"];

export type QuoteItemExtraRow =
  Database["public"]["Tables"]["quote_item_extras"]["Row"];

export type CreateQuoteItemExtraInput = {
  description: string;
  price: number;
};

export type CreateQuoteItemInput = {
  productId?: string | null;
  productName?: string;
  description?: string | null;
  unitPrice: number;
  variants: Array<{
    talle: string;
    color: string;
    quantity: number;
    productVariantId?: string;
  }>;
  discountPercentage?: number | null;
  discountAmount?: number | null;
  extras?: CreateQuoteItemExtraInput[];
};

export type CreateQuoteInput = {
  orgSlug: string;
  customerId: string;
  currency?: string;
  exchangeRate?: number | null;
  paymentCondition?: string | null;
  observations?: string | null;
  items: CreateQuoteItemInput[];
};

export type QuoteMetrics = {
  totalQuotes: number;
  convertedQuotes: number;
  cancelledQuotes: number;
};

export type UpdateQuoteInput = {
  orgSlug: string;
  customerId?: string;
  status?: QuoteStatus;
  currency?: string;
  exchangeRate?: number | null;
  paymentCondition?: string | null;
  observations?: string | null;
  purchaseOrderFile?: string | null;
  designFileUrl?: string | null;
  items?: CreateQuoteItemInput[];
};

export const quoteItemsExtrasSchema = z.object({
  description: z.string().min(1, "Debe agregar una descripcion"),
  price: z.number().min(0, "El precio debe ser mayor a 0"),
});

// --- Form Validation Schemas ---

export const quoteItemVariantSchema = z.object({
  talle: z.string().min(1, "El talle es requerido"),
  color: z.string().min(1, "El color es requerido"),
  quantity: z.number().min(1, "La cantidad debe ser mayor a 0"),
  productVariantId: z.string().optional(),
});

export const quoteItemSchema = z.object({
  productId: z.string().min(1, "El producto es requerido"),
  productName: z.string(),
  sku: z.string().optional(),
  unitPrice: z.number().min(0),
  // Variants (Talles) with their respective quantities
  variants: z
    .array(quoteItemVariantSchema)
    .min(1, "Debe agregar al menos una cantidad/talle"),
  // Total quantity across all variants for this item
  totalQuantity: z.number().min(1),
  extras: z.array(quoteItemsExtrasSchema),
  // Subtotal (totalQuantity * unitPrice)
  subtotal: z.number().min(0),
});

export const quoteFormSchema = z.object({
  customerId: z.string().min(1, "Debe seleccionar un cliente."),

  salesPriceListId: z.string(),

  currency: z.enum(["ARS", "USD"]),

  exchangeRate: z.number().positive().optional().nullable(),

  items: z
    .array(quoteItemSchema)
    .min(1, "Debe agregar al menos un producto al presupuesto."),

  notes: z.string().optional(),

  purchaseOrderFile: z.string().nullable().optional(),
  designFile: z.string().nullable().optional(),
});

// --- TypeScript Types ---

export type QuoteItemVariantFormValues = z.infer<typeof quoteItemVariantSchema>;
export type QuoteItemFormValues = z.infer<typeof quoteItemSchema>;
export type QuoteFormValues = z.infer<typeof quoteFormSchema>;
