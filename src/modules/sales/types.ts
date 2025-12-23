import type { Database } from "@/types/supabase";

export type SaleProduct = {
  id: string;
  name: string;
  sku: string;
  price: number;
  brand?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  unitOfMeasure: Database["public"]["Enums"]["unit_of_measure_type"];
  tracksStockUnits: boolean;
  /**
   * Total disponible en la unidad base (kg/lt) y total de unidades asociadas.
   * Sirve para calcular promedios de peso/volumen por unidad.
   */
  totalQuantity: number | null;
  totalUnitQuantity: number | null;
  averageQuantityPerUnit: number | null;
};

export type PreSaleItemInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  basePrice?: number;
  discountAmount?: number | null;
  discountPercentage?: number | null;
};

export type PreSaleTaxInput = {
  taxId: string;
  name: string;
  rate: number;
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
  globalDiscountPercentage?: number | null;
  globalDiscountAmount?: number | null;
  taxes?: PreSaleTaxInput[];
};

export type SalesOrderStatus = Database["public"]["Enums"]["order_status"];
export type InvoiceType = Database["public"]["Enums"]["invoice_type"];
export type ReceivableStatus = Database["public"]["Enums"]["receivable_status"];
