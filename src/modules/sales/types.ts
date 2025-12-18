import type { Database } from "@/types/supabase";

export type SaleProduct = {
  id: string;
  name: string;
  sku: string;
  price: number;
  brand?: string | null;
};

export type PreSaleItemInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export type CreatePreSaleOrderInput = {
  orgSlug: string;
  customerId: string;
  sellerId: string;
  saleDate: string;
  expirationDate?: string | null;
  creditDays?: number | null;
  invoiceType?: Database["public"]["Enums"]["invoice_type"];
  invoiceNumber?: string | null;
  observations?: string | null;
  items: PreSaleItemInput[];
};

export type SalesOrderStatus = Database["public"]["Enums"]["order_status"];
export type InvoiceType = Database["public"]["Enums"]["invoice_type"];
export type ReceivableStatus = Database["public"]["Enums"]["receivable_status"];
