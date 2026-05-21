import { z } from "zod";

// --- Database & API Types ---
export type QuoteStatus =
  | "DRAFT"
  | "SENT"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED";

export type QuoteRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  status: QuoteStatus;
  total_amount: number;
  currency: string;
  payment_condition: string | null;
  observations: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
};

export type QuoteInsert = {
  id?: string;
  organization_id: string;
  customer_id: string;
  status?: QuoteStatus;
  total_amount: number;
  currency?: string;
  payment_condition?: string | null;
  observations?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
};

export type QuoteUpdate = {
  id?: string;
  organization_id?: string;
  customer_id?: string;
  status?: QuoteStatus;
  total_amount?: number;
  currency?: string;
  payment_condition?: string | null;
  observations?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
};

export type QuoteItemRow = {
  id: string;
  quote_id: string;
  product_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_percentage: number | null;
  discount_amount: number | null;
  subtotal: number;
  created_at: string | null;
};

export type QuoteItemInsert = {
  id?: string;
  quote_id: string;
  product_id?: string | null;
  description?: string | null;
  quantity: number;
  unit_price: number;
  discount_percentage?: number | null;
  discount_amount?: number | null;
  subtotal: number;
  created_at?: string | null;
};

export type QuoteItemUpdate = {
  id?: string;
  quote_id?: string;
  product_id?: string | null;
  description?: string | null;
  quantity?: number;
  unit_price?: number;
  discount_percentage?: number | null;
  discount_amount?: number | null;
  subtotal?: number;
  created_at?: string | null;
};

export type QuoteItemExtraRow = {
  id: string;
  quote_item_id: string;
  description: string;
  price: number;
  created_at: string | null;
};

export type QuoteItemExtraInsert = {
  id?: string;
  quote_item_id: string;
  description: string;
  price: number;
  created_at?: string | null;
};

export type QuoteItemExtraUpdate = {
  id?: string;
  quote_item_id?: string;
  description?: string;
  price?: number;
  created_at?: string | null;
};

export type QuoteItemWithExtras = QuoteItemRow & {
  extras: QuoteItemExtraRow[];
};

export type QuoteWithItems = QuoteRow & {
  items: QuoteItemWithExtras[];
};

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
    size: string;
    quantity: number;
  }>;
  discountPercentage?: number | null;
  discountAmount?: number | null;
  extras?: CreateQuoteItemExtraInput[];
};

export type CreateQuoteInput = {
  orgSlug: string;
  customerId: string;
  currency?: string;
  paymentCondition?: string | null;
  observations?: string | null;
  items: CreateQuoteItemInput[];
};

export type UpdateQuoteInput = {
  id: string;
  orgSlug: string;
  customerId?: string;
  status?: QuoteStatus;
  currency?: string;
  paymentCondition?: string | null;
  observations?: string | null;
  items?: CreateQuoteItemInput[];
};

export const quoteItemsExtrasSchema = z.object({
  description: z.string().min(1, "Debe agregar una descripcion"),
  price: z.number().min(0, "El precio debe ser mayor a 0"),
});

// --- Form Validation Schemas ---

export const quoteItemVariantSchema = z.object({
  size: z.string().min(1, "El talle es requerido"),
  quantity: z.number().min(1, "La cantidad debe ser mayor a 0"),
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

  salesPriceListId: z.string().min(1, "Debe seleccionar una lista de precios."),

  currency: z.enum(["ARS", "USD"]),

  items: z
    .array(quoteItemSchema)
    .min(1, "Debe agregar al menos un producto al presupuesto."),

  notes: z.string().optional(),
});

// --- TypeScript Types ---

export type QuoteItemVariantFormValues = z.infer<typeof quoteItemVariantSchema>;
export type QuoteItemFormValues = z.infer<typeof quoteItemSchema>;
export type QuoteFormValues = z.infer<typeof quoteFormSchema>;

// Temporary mock type since there's no DB schema for product variants yet
export type ProductVariantMock = {
  id: string;
  size: string;
  stock?: number;
};
