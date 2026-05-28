import type { DebitNoteInvoiceType } from "@/modules/sales/invoice-type-utils";

export type DebitNote = {
  id: string;
  organizationId: string;
  salesOrderId: string | null;
  customerId: string;
  invoiceType: DebitNoteInvoiceType;
  issueDate: string;
  debitNoteNumber: string | null;
  amount: number;
  observations: string | null;
  status: "CONFIRMED" | "CANCELLED";
  // ARCA
  arcaStatus: "not_requested" | "pending" | "authorized" | "error";
  arcaCae: string | null;
  arcaCaeExpiresAt: string | null;
  arcaAuthorizedAt: string | null;
  arcaPointOfSale: number | null;
  arcaVoucherNumber: number | null;
  arcaVoucherTypeCode: number | null;
  arcaLastError: string | null;
  // Associated invoice
  assocInvoiceTypeCode: number | null;
  assocInvoicePointOfSale: number | null;
  assocInvoiceNumber: number | null;
  createdAt: string;
  // Joined
  customer: {
    id: string;
    businessName: string;
    fantasyName: string | null;
  } | null;
  sale: {
    saleNumber: number | null;
    invoiceNumber: string | null;
    invoiceType: string;
    totalAmount: number;
    arcaVoucherTypeCode: number | null;
    arcaPointOfSale: number | null;
    arcaVoucherNumber: number | null;
  } | null;
};

export type CreateDebitNoteInput = {
  orgSlug: string;
  salesOrderId: string | null;
  customerId?: string;
  invoiceType?: DebitNoteInvoiceType;
  amount: number;
  observations?: string | null;
  issueDate?: string;
};

export type CreateDebitNoteResult = {
  debitNoteId: string;
  debitNoteNumber: string;
};
