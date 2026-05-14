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
  description?: string | null;
  quantity: number;
  unitPrice: number;
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
