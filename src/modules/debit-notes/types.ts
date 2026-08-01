import type { Database, Json } from "@/types/supabase";

export type DebitNoteStatus =
  | "draft"
  | "pending"
  | "verifying"
  | "authorized"
  | "error";
export type DebitNoteReason =
  | "INTEREST"
  | "FREIGHT_OR_POST_CHARGE"
  | "PRICE_DIFFERENCE"
  | "OTHER";

export type DebitNotePaymentCondition = "CASH" | "CURRENT_ACCOUNT";

export type DebitNoteTaxInput = {
  taxId?: string | null;
  name: string;
  rate: number;
  taxCodeSnapshot?: string | null;
};

export type CreateDebitNoteItemInput = {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxes?: DebitNoteTaxInput[];
};

export type DebitNoteItem = {
  id: string;
  debitNoteId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxes: Array<DebitNoteTaxInput & { baseAmount: number; taxAmount: number }>;
};

export type DebitNoteTax = DebitNoteTaxInput & {
  id: string;
  debitNoteId: string;
  baseAmount: number;
  taxAmount: number;
};

export type DebitNote = {
  id: string;
  organizationId: string;
  salesOrderId: string;
  customerId: string;
  debitNoteNumber: string;
  invoiceType: Database["public"]["Enums"]["invoice_type"];
  reason: DebitNoteReason;
  reasonDetail: string | null;
  observations: string | null;
  concept: string | null;
  dueDate: string | null;
  paymentCondition: DebitNotePaymentCondition | null;
  externalReference: string | null;
  issueDate: string;
  amount: number;
  status: DebitNoteStatus;
  arcaCae: string | null;
  arcaCaeExpiresAt: string | null;
  arcaAuthorizedAt: string | null;
  arcaPointOfSale: number | null;
  arcaVoucherNumber: number | null;
  arcaVoucherTypeCode: number | null;
  arcaLastError: string | null;
  arcaRequestJson: Json | null;
  arcaResponseJson: Json | null;
  accountReceivableId: string | null;
  accountReceivable: {
    pendingBalance: number;
    totalAmount: number;
    dueDate: string;
  } | null;
  financialAppliedAt: string | null;
  createdAt: string;
  items: DebitNoteItem[];
  taxes: DebitNoteTax[];
  customer: {
    businessName: string;
    fantasyName: string | null;
    email: string | null;
  } | null;
  sale: {
    saleNumber: number | null;
    invoiceNumber: string | null;
    arcaStatus: string | null;
  } | null;
};

export type CreateDebitNoteInput = {
  orgSlug: string;
  salesOrderId: string;
  concept: string;
  dueDate: string;
  paymentCondition: DebitNotePaymentCondition;
  externalReference?: string | null;
  items: CreateDebitNoteItemInput[];
  reason: DebitNoteReason;
  reasonDetail?: string | null;
  observations?: string | null;
};

export type UpdateDebitNoteInput = Omit<CreateDebitNoteInput, "orgSlug"> & {
  orgSlug: string;
  debitNoteId: string;
};
