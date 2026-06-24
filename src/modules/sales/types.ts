import type {
  CreatePosSaleInput,
  CreatePosSaleResult,
  PosSale as PosDirectSale,
  DefaultOpenPosTerminal as PosDirectSaleDefaultOpenTerminal,
  PosSaleDetail as PosDirectSaleDetail,
  PosTerminalFormValues as PosDirectSaleFormValues,
  PosSaleItem as PosDirectSaleItem,
  PosSalePayment as PosDirectSalePayment,
  PosTerminalProduct as PosDirectSaleProduct,
  PosSaleReturnRecord as PosDirectSaleReturnRecord,
  PosSaleReturnSummary as PosDirectSaleReturnSummary,
  PosTerminal as PosDirectSaleTerminal,
  PosPaymentMethod,
} from "@/modules/pos/types";
import {
  createPosSaleSchema,
  posPaymentMethodValues,
  posTerminalFormSchema,
} from "@/modules/pos/types";
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
  weightPerUnit?: number | null;
  unitsPerBox?: number | null;
  boxesPerPallet?: number | null;
};

export type SaleItemType = "product" | "adjustment";

export type PreSaleItemInput = {
  type?: SaleItemType;
  productId?: string | null;
  description?: string | null;
  quantity: number;
  /**
   * Cantidad en la unidad base (kg/lt) cuando el producto se vende por peso/volumen.
   */
  weightQuantity?: number | null;
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

export type ConfirmSaleItemInput = {
  id: string;
  type?: SaleItemType;
  productId?: string | null;
  description?: string | null;
  quantity: number;
  /**
   * Cantidad en la unidad base (kg/lt) cuando el producto se vende por peso/volumen.
   */
  weightQuantity?: number | null;
  unitPrice: number;
  basePrice?: number;
  discountPercentage?: number | null;
  tracksStockUnits?: boolean;
  unitOfMeasure?: Database["public"]["Enums"]["unit_of_measure_type"] | null;
};

export type ConfirmSaleOrderInput = {
  orgSlug: string;
  saleId: string;
  customerId: string;
  sellerId: string;
  saleDate: string;
  expirationDate?: string | null;
  creditDays?: number | null;
  invoiceType?: Database["public"]["Enums"]["invoice_type"];
  invoiceNumber?: string | null;
  observations?: string | null;
  globalDiscountPercentage?: number | null;
  items: ConfirmSaleItemInput[];
  taxes?: PreSaleTaxInput[];
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

export type DispatchSaleOrderInput = {
  orgSlug: string;
  saleId: string;
  remittanceNumber: string;
  carrierId?: string | null;
};

export type DeliverSaleOrderInput = {
  orgSlug: string;
  saleId: string;
};

export type UpdateSaleOrderInput = {
  orgSlug: string;
  saleId: string;
  customerId?: string;
  sellerId?: string;
  saleDate?: string;
  expirationDate?: string | null;
  creditDays?: number | null;
  invoiceType?: Database["public"]["Enums"]["invoice_type"];
  invoiceNumber?: string | null;
  remittanceNumber?: string | null;
  observations?: string | null;
  globalDiscountPercentage?: number | null;
  items?: {
    id?: string;
    type?: SaleItemType;
    productId?: string | null;
    description?: string | null;
    quantity: number;
    weightQuantity?: number | null;
    unitPrice: number;
    basePrice?: number;
    discountPercentage?: number | null;
    tracksStockUnits?: boolean;
    unitOfMeasure?: Database["public"]["Enums"]["unit_of_measure_type"] | null;
  }[];
  taxes?: PreSaleTaxInput[];
};

export type SalesOrderStatus = Database["public"]["Enums"]["order_status"];
export type InvoiceType = Database["public"]["Enums"]["invoice_type"];
export type ReceivableStatus = Database["public"]["Enums"]["receivable_status"];

export type SalesExportItem = {
  productId: string | null;
  productName: string | null;
  supplierName: string | null;
  units: number | null;
  kilograms: number | null;
  subtotal: number | null;
};

export type DirectSale = PosDirectSale;
export type DirectSaleDetail = PosDirectSaleDetail;
export type DirectSaleItem = PosDirectSaleItem;
export type DirectSalePayment = PosDirectSalePayment;
export type DirectSaleReturnRecord = PosDirectSaleReturnRecord;
export type DirectSaleReturnSummary = PosDirectSaleReturnSummary;
export type DirectSaleProduct = PosDirectSaleProduct;
export type DirectSaleTerminal = PosDirectSaleTerminal;
export type DirectSaleDefaultOpenTerminal = PosDirectSaleDefaultOpenTerminal;
export type DirectSaleFormValues = PosDirectSaleFormValues;
export type DirectSalePaymentMethod = PosPaymentMethod;
export type CreateDirectSaleInput = CreatePosSaleInput;
export type CreateDirectSaleResult = CreatePosSaleResult;

export const createDirectSaleSchema = createPosSaleSchema;
export const directSaleFormSchema = posTerminalFormSchema;
export const directSalePaymentMethodValues = posPaymentMethodValues;

export type TicketCompanyData = {
  name: string;
  cuit: string;
  address: string;
  vatCondition?: string | null;
  grossIncomeNumber?: string | null;
  activityStartDate?: string | null;
};

export type TicketQuantityKind = "units" | "weight";

export type TicketSaleItem = {
  quantity: number;
  product: string;
  unitPrice?: number | null;
  subtotal: number;
  quantityKind?: TicketQuantityKind;
};

export type TicketSaleTax = {
  name: string;
  rate?: number | null;
  amount: number;
  baseAmount?: number | null;
};

export type TicketFiscalData = {
  invoiceType: "FACTURA_B" | "FACTURA_C";
  letter: "B" | "C";
  voucherTypeCode: number;
  pointOfSale: number;
  voucherNumber: number;
  invoiceNumber?: string | null;
  cae: string;
  caeExpirationDate: string;
  qrUrl: string;
};

export type TicketReceiverData = {
  name: string;
  documentLabel?: string | null;
  vatCondition?: string | null;
};

export type TicketSaleData = {
  saleNumber?: string | null;
  saleDate?: string | null;
  receiver?: TicketReceiverData | null;
  fiscal?: TicketFiscalData | null;
  items: TicketSaleItem[];
  subtotal: number;
  taxAmount?: number;
  taxes?: TicketSaleTax[];
  total: number;
};

export type HistoricalDebtRow = {
  customerId: string;
  supplierId: string;
  totalAmount: number;
  saleDate: string; // YYYY-MM-DD
  creditDays: number;
  observations?: string;
  sellerId?: string;
  invoiceType?: string;
  balanceType: "DEBT" | "CREDIT";
};

export type CreateHistoricalDebtInput = {
  orgSlug: string;
  debts: HistoricalDebtRow[];
};

export type HistoricalCreditEntry = {
  customerId: string;
  supplierId: string;
  totalAmount: number;
  issueDate: string;
  observations?: string;
  sellerId?: string;
  invoiceType?: string;
};
