import type { AnyEvento } from "@/modules/accounting/types";
// biome-ignore lint/style/noExportedImports: re-export needed for module consumers
import type { PaginatedResult, SortParam } from "@/types/pagination";
import type { Database } from "@/types/supabase";
export type { PaginatedResult, SortParam };

export type InvoiceType = Database["public"]["Enums"]["invoice_type"];
export type CreditNoteArcaStatus =
  | "not_requested"
  | "pending"
  | "authorized"
  | "error";
export type CreditNoteOriginType =
  | "RETURN"
  | "PURCHASE_TARGET"
  | "ADVANCE_SETTLEMENT"
  | "MANUAL_ADJUSTMENT"
  | "OTHER";

export type CreditNoteItem = {
  id: string;
  creditNoteId: string;
  salesOrderId: string | null;
  salesOrderItemId: string | null;
  salesReturnItemId: string | null;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
  productUnitOfMeasure: string | null;
  weightQuantity: number | null;
  discountPercent: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export type CreditNoteTax = {
  id: string;
  creditNoteId: string;
  taxId: string | null;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
  taxCodeSnapshot: string | null;
};

export type CreditNoteSourceDocument = {
  id: string;
  creditNoteId: string;
  salesOrderId: string | null;
  appliedAmount: number;
  invoiceType: InvoiceType | null;
  invoiceNumber: string | null;
  arcaStatus: string | null;
  arcaPointOfSale: number | null;
  arcaVoucherNumber: number | null;
  arcaVoucherTypeCode: number | null;
  arcaVoucherDate: string | null;
};

export type CreateCreditNoteItemInput = {
  id?: string;
  salesOrderId?: string | null;
  salesOrderItemId?: string | null;
  salesReturnItemId?: string | null;
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  netAmount: number;
  taxAmount?: number;
  totalAmount: number;
};

export type CreateCreditNoteItemTaxInput = {
  creditNoteItemId?: string | null;
  salesOrderItemId?: string | null;
  productId?: string | null;
  taxId?: string | null;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
  taxCodeSnapshot?: string | null;
  source?: string | null;
};

export type CreateCreditNoteTaxInput = {
  taxId?: string | null;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
  taxCodeSnapshot?: string | null;
};

export type CreateCreditNoteSourceDocumentInput = {
  salesOrderId?: string | null;
  appliedAmount: number;
  invoiceType?: InvoiceType | null;
  invoiceNumber?: string | null;
  arcaStatus?: string | null;
  arcaPointOfSale?: number | null;
  arcaVoucherNumber?: number | null;
  arcaVoucherTypeCode?: number | null;
  arcaVoucherDate?: string | null;
};

export type CreditNote = {
  id: string;
  organizationId: string;
  salesOrderId: string | null;
  customerId: string;
  salesReturnId: string | null;
  purchaseTargetCreditId: string | null;
  originType: CreditNoteOriginType;
  reason: string | null;
  creditNoteNumber: string | null;
  issueDate: string;
  amount: number;
  remainingAmount?: number;
  applyToReceivable: boolean;
  appliedToReceivableAmount: number;
  invoiceType: InvoiceType;
  observations: string | null;
  status: "CONFIRMED" | "CANCELLED";
  isHistorical: boolean;
  createdAt: string;
  arcaStatus: CreditNoteArcaStatus;
  arcaCae: string | null;
  arcaCaeExpiresAt: string | null;
  arcaAuthorizedAt: string | null;
  arcaPointOfSale: number | null;
  arcaVoucherNumber: number | null;
  arcaVoucherTypeCode: number | null;
  arcaLastError: string | null;
  arcaAssociatedVoucherTypeCode: number | null;
  arcaAssociatedPointOfSale: number | null;
  arcaAssociatedVoucherNumber: number | null;
  arcaAssociatedVoucherDate: string | null;
  invoiceEmailStatus: string;
  invoiceEmailRecipient: string | null;
  invoiceEmailSentAt: string | null;
  invoiceEmailDeliveredAt: string | null;
  invoiceEmailLastAttemptAt: string | null;
  invoiceEmailLastEvent: string | null;
  invoiceEmailLastEventAt: string | null;
  invoiceEmailLastError: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  items: CreditNoteItem[];
  taxes: CreditNoteTax[];
  sourceDocuments: CreditNoteSourceDocument[];
  // Joined
  customer: {
    id: string;
    businessName: string;
    fantasyName: string | null;
    email: string | null;
    cuit: string | null;
    taxCondition: string | null;
    address: string | null;
    city: string | null;
    clientNumber: string | null;
    dueDays: number | null;
  } | null;
  sale: {
    saleNumber: number | null;
    invoiceNumber: string | null;
    remittanceNumber: string | null;
    invoiceType: InvoiceType;
    totalAmount: number;
    arcaStatus: string | null;
    arcaPointOfSale: number | null;
    arcaVoucherNumber: number | null;
    arcaVoucherTypeCode: number | null;
    arcaAuthorizedAt: string | null;
  } | null;
};

export type CreateCreditNoteInput = {
  orgSlug: string;
  salesOrderId: string | null;
  amount: number;
  observations?: string | null;
  salesReturnId?: string | null;
  isHistorical?: boolean;
  supplierId?: string | null;
  customerId?: string;
  issueDate?: string;
  invoiceType?: string;
  originType?: CreditNoteOriginType;
  reason?: string | null;
  purchaseTargetCreditId?: string | null;
  skipAccountingEntryRegistration?: boolean;
  applyToReceivable?: boolean;
  items?: CreateCreditNoteItemInput[];
  itemTaxes?: CreateCreditNoteItemTaxInput[];
  taxes?: CreateCreditNoteTaxInput[];
  sourceDocuments?: CreateCreditNoteSourceDocumentInput[];
};

export type CreateCreditNoteResult = {
  creditNoteId: string;
  creditNoteNumber: string;
  accountingPayload?: AnyEvento | null;
};

export type PaginationParams = {
  page: number;
  pageSize: number;
  sort?: SortParam[];
  search?: string;
  status?: string;
  customerId?: string;
};

export type CreditNoteMetrics = {
  totalCount: number;
  confirmedCount: number;
  cancelledCount: number;
  currentMonthCount: number;
  currentMonthAmount: number;
  lastMonthCount: number;
  lastMonthAmount: number;
};
