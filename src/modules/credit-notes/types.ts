import type { Database } from "@/types/supabase";

export type CreditNoteRow = Record<string, unknown>;
export type InvoiceType = Database["public"]["Enums"]["invoice_type"];

export type CreditNote = {
  id: string;
  organizationId: string;
  salesOrderId: string | null;
  customerId: string;
  salesReturnId: string | null;
  creditNoteNumber: string | null;
  issueDate: string;
  amount: number;
  invoiceType: InvoiceType;
  observations: string | null;
  status: "CONFIRMED" | "CANCELLED";
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
    invoiceType: InvoiceType;
    totalAmount: number;
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
};

export type CreateCreditNoteResult = {
  creditNoteId: string;
  creditNoteNumber: string;
};
