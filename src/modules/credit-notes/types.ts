import type { AnyEvento } from "@/modules/accounting/types";
import type { Database } from "@/types/supabase";

export type InvoiceType = Database["public"]["Enums"]["invoice_type"];
export type CreditNoteArcaStatus =
  | "not_requested"
  | "pending"
  | "authorized"
  | "error";
export type CreditNoteOriginType =
  | "RETURN"
  | "PURCHASE_TARGET"
  | "MANUAL_ADJUSTMENT"
  | "OTHER";

export type CreditNoteItem = {
  id: string;
  creditNoteId: string;
  salesOrderId: string | null;
  salesOrderItemId: string | null;
  salesReturnItemId: string | null;
  productId: string | null;
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
  } | null;
  sale: {
    saleNumber: number | null;
    invoiceNumber: string | null;
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
