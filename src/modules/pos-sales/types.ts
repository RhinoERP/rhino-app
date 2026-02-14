import type { PaymentMethod } from "@/modules/collections/types";
import type { PreSaleTaxInput } from "@/modules/sales/types";
import type { Database } from "@/types/supabase";

export type PosSaleCustomer = {
  id: string;
  business_name: string;
  fantasy_name: string | null;
};

export type PosSaleProduct = {
  id: string;
  name: string;
  sku: string;
};

export type PosSaleItem =
  Database["public"]["Tables"]["pos_sale_items"]["Row"] & {
    product: PosSaleProduct | null;
  };

export type PosSalePayment =
  Database["public"]["Tables"]["pos_payments"]["Row"];

export type PosSale = Database["public"]["Tables"]["pos_sales"]["Row"] & {
  customer: PosSaleCustomer | null;
  items: PosSaleItem[];
  payments: PosSalePayment[];
};

export type DirectSaleItemInput = {
  productId: string;
  quantity: number;
  weightQuantity?: number | null;
  unitPrice: number;
  discountAmount?: number | null;
  discountPercentage?: number | null;
  lotId?: string | null;
};

export type CreateDirectSaleInput = {
  orgSlug: string;
  customerId?: string | null;
  sellerId?: string | null;
  saleDate: string;
  paymentMethod?: PaymentMethod;
  paymentReference?: string | null;
  cardBrand?: string | null;
  items: DirectSaleItemInput[];
  globalDiscountPercentage?: number | null;
  taxes?: PreSaleTaxInput[];
};

export type CreateDirectSaleResult = {
  posSaleId: string;
};
