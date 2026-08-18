import { z } from "zod";
import type { PaginatedResult, SortParam } from "@/types/pagination";

export const salesAdvanceStatuses = [
  "DRAFT",
  "ISSUE_SUBMITTED",
  "INVOICED",
  "PAID",
  "APPLIED",
  "VOIDED",
  "CLOSING",
  "FINAL_INVOICED",
  "CREDIT_NOTE_SUBMITTED",
  "CREDIT_AVAILABLE",
  "CREDIT_APPLIED",
  "SETTLED",
  "RECONCILIATION_REQUIRED",
  "FAILED_RECOVERABLE",
] as const;

export type SalesAdvanceStatus = (typeof salesAdvanceStatuses)[number];

export const salesAdvanceStatusLabels: Record<SalesAdvanceStatus, string> = {
  DRAFT: "Pendiente de emitir",
  ISSUE_SUBMITTED: "Emisión en curso",
  INVOICED: "Pendiente de cobro",
  PAID: "Cobrado · pendiente de liquidación",
  APPLIED: "Aplicado al saldo final",
  VOIDED: "Anulado",
  CLOSING: "Liquidación en curso",
  FINAL_INVOICED: "Factura final autorizada",
  CREDIT_NOTE_SUBMITTED: "Nota de crédito en curso",
  CREDIT_AVAILABLE: "Crédito disponible",
  CREDIT_APPLIED: "Saldo final pendiente",
  SETTLED: "Liquidado",
  RECONCILIATION_REQUIRED: "Conciliación ARCA requerida",
  FAILED_RECOVERABLE: "Error recuperable",
};

export function formatSalesAdvancePercentage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  return `${Number(value.toFixed(2))}%`;
}

export const createSalesAdvanceSchema = z.object({
  orgSlug: z.string().min(1),
  preventaId: z.string().uuid(),
  amount: z.number().positive(),
  percentage: z.number().min(0).max(100).optional(),
});

export type CreateSalesAdvanceInput = z.infer<typeof createSalesAdvanceSchema>;

export const issuePreventaBalanceSchema = z.object({
  orgSlug: z.string().min(1),
  preventaId: z.string().uuid(),
});
export type IssuePreventaBalanceInput = z.infer<
  typeof issuePreventaBalanceSchema
>;

export const issueSalesAdvanceSchema = z.object({
  orgSlug: z.string().min(1),
  advanceId: z.string().uuid(),
});

export type IssueSalesAdvanceInput = z.infer<typeof issueSalesAdvanceSchema>;

export const settleSalesAdvanceSchema = z.object({
  orgSlug: z.string().min(1),
  advanceId: z.string().uuid(),
});

export type SettleSalesAdvanceInput = z.infer<typeof settleSalesAdvanceSchema>;

export type AdvanceTaxSnapshot = {
  taxId: string | null;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
  taxCodeSnapshot: string | null;
};

export type AdvanceLine = {
  id: string;
  productId: string | null;
  description: string | null;
  quantity: number;
  unitQuantity: number | null;
  unitPrice: number;
  basePrice: number;
  discountAmount: number | null;
  discountPercentage: number | null;
  subtotal: number;
};

export type SalesAdvance = {
  id: string;
  organizationId: string;
  quoteId: string | null;
  finalSalesOrderId: string;
  originType?: "SALE" | "PREVENTA";
  preventaSalesOrderId?: string | null;
  appliedAmount?: number;
  pendingApplicationAmount?: number;
  advanceSalesOrderId: string | null;
  advanceReceivableId: string | null;
  creditNoteId: string | null;
  customerCreditId: string | null;
  finalReceivableId: string | null;
  settlementPaymentId: string | null;
  creditApplicationId: string | null;
  percentageSnapshot: number | null;
  amount: number;
  currency: string;
  status: SalesAdvanceStatus;
  lastError: string | null;
  fiscalSnapshot?: {
    grossAmount: number;
    netAmount: number;
    taxes: AdvanceTaxSnapshot[];
    description: string;
  } | null;
  advanceInvoiceNumber?: string | null;
  advanceArcaCae?: string | null;
  creditNoteNumber?: string | null;
  creditNoteArcaCae?: string | null;
};

export type SalesAdvanceSummary = {
  advances: SalesAdvance[];
  committedAmount: number;
  remainingAmount: number;
  hasUnresolvedAdvance: boolean;
};

export type SalesAdvanceListItem = SalesAdvance & {
  createdAt: string;
  updatedAt: string;
  finalBalance: number;
  finalBalanceEstimated: boolean;
  finalSale: {
    id: string;
    saleNumber: number | null;
    invoiceNumber: string | null;
    totalAmount: number;
  };
  customer: {
    id: string;
    businessName: string;
    fantasyName: string | null;
  } | null;
  seller: { id: string; name: string | null } | null;
};

export type SalesAdvanceListParams = {
  page: number;
  pageSize: number;
  sort?: SortParam[];
  search?: string;
  view?: "ACTIVE" | "ALL";
  status?: SalesAdvanceStatus;
  customerId?: string;
  sellerId?: string;
  createdAt?: { from?: string; to?: string };
};

export type SalesAdvancesPaginatedResult =
  PaginatedResult<SalesAdvanceListItem>;
