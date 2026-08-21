// biome-ignore lint/style/noExportedImports: re-export needed for module consumers
import type { PaginatedResult, SortParam } from "@/types/pagination";
export type { PaginatedResult, SortParam };

export type PaymentMethod =
  | "efectivo"
  | "tarjeta_de_credito"
  | "tarjeta_de_debito"
  | "transferencia"
  | "cheque"
  | "cheque_endosado"
  | "deposito"
  | "e-cheq";

export type CollectionAccountStatus = "PENDING" | "PARTIAL" | "PAID";

export type ReceivableAccount = {
  id: string;
  organization_id: string;
  customer_id: string;
  sales_order_id: string;
  total_amount: number;
  pending_balance: number;
  currency?: string;
  due_date: string;
  status: CollectionAccountStatus;
  created_at?: string | null;
  updated_at?: string | null;
  last_payment_date?: string | null;
  collection_label?: string | null;
  customer: {
    id: string;
    business_name: string;
    fantasy_name: string | null;
    city?: string | null;
  };
  supplier?: {
    id: string;
    name: string;
  } | null;
  sale?: {
    invoice_number?: string | null;
    sale_date?: string | null;
    dispatched_at?: string | null;
    sale_number?: number | null;
    sub_total?: number | null;
    global_discount_amount?: number | null;
    remittance_number?: string | null;
  } | null;
  seller?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  items?: CollectionExportItem[];
  type: "receivable";
};

export type PayableAccount = {
  id: string;
  organization_id: string;
  supplier_id: string;
  purchase_order_id: string;
  total_amount: number;
  pending_balance: number;
  currency?: string;
  due_date: string;
  status: CollectionAccountStatus;
  created_at?: string | null;
  last_payment_date?: string | null;
  supplier: {
    id: string;
    name: string;
  };
  purchase?: {
    purchase_number?: number | null;
    purchase_date?: string | null;
    total_amount?: number | null;
  } | null;
  items?: CollectionExportItem[];
  type: "payable";
  // Discrepancy warning (if total differs from purchase order by >1%)
  hasDiscrepancy?: boolean;
  discrepancyAmount?: number;
};

export type CollectionAccount = ReceivableAccount | PayableAccount;

export type CollectionTabValue =
  | "receivables"
  | "payables"
  | "current-customers"
  | "current-suppliers";

export type DirectSalesCollectionsMetrics = {
  currentMonthSalesCount: number;
  currentMonthTotalAmount: number;
  currentMonthAverageTicket: number;
  currentMonthCashAmount: number;
};

export type CollectionExportItem = {
  productId: string | null;
  productName: string | null;
  supplierName: string | null;
  supplierId: string | null;
  units: number | null;
  kilograms: number | null;
  subtotal: number | null;
  subtotalCrudo: number | null;
};

export type BulkPaymentDistribution = {
  accountId: string;
  invoiceNumber: string | null;
  remittanceNumber: string | null;
  saleNumber: number | null;
  dueDate: string;
  totalAmount: number;
  pendingBalance: number;
  appliedAmount: number;
  newBalance: number;
  newStatus: CollectionAccountStatus;
};

export type BulkPaymentInput = {
  orgSlug: string;
  customerId: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
};

export type BulkPaymentResult =
  | {
      success: true;
      appliedAmount: number;
      creditBalance: number;
      affectedAccounts: number;
      distributions: BulkPaymentDistribution[];
    }
  | {
      success: false;
      error: string;
      code?:
        | "invalid_amount"
        | "no_pending_accounts"
        | "customer_not_found"
        | "organization_not_found";
    };

export type ReceivablesPaginatedParams = {
  page: number;
  pageSize: number;
  accountId?: string;
  search?: string;
  sort?: SortParam[];
  createdAt?: { from?: string; to?: string };
  dueDate?: { from?: string; to?: string };
  dispatchedAt?: { from?: string; to?: string };
  paymentDate?: { from?: string; to?: string };
  customerId?: string;
  customerIds?: string[];
  sellerIds?: string[];
  statusFilter?: string[];
};

export type PayablesPaginatedParams = {
  page: number;
  pageSize: number;
  search?: string;
  sort?: SortParam[];
  createdAt?: { from?: string; to?: string };
  dueDate?: { from?: string; to?: string };
  paymentDate?: { from?: string; to?: string };
  supplierId?: string;
  supplierIds?: string[];
  statusFilter?: string[];
};

export type ReceivablesMetrics = {
  byCurrency: Array<{
    currency: string;
    pendingReceivables: number;
    collected: number;
    overdueReceivables: number;
  }>;
};

export type PayablesMetrics = {
  byCurrency: Array<{
    currency: string;
    pendingPayables: number;
    overduePayables: number;
  }>;
};

import type { AnyEvento } from "@/modules/accounting/types";

export type RegisterPaymentInput = {
  orgSlug: string;
  accountId: string;
  amount: number;
  creditAmount?: number;
  /** Apply this exact customer credit instead of consuming the FIFO balance. */
  customerCreditId?: string;
  paymentMethod: PaymentMethod;
  operationId?: string;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
  type: CollectionAccount["type"];
  receivedCheckIds?: string[];
  issuedCheckData?: {
    cuentaBancariaId: string;
    numeroCheque: string;
    fechaEmision: string;
    fechaDebito: string;
    beneficiario: string;
    notas?: string;
  };
};

export type RegisterPaymentResult =
  | {
      success: true;
      newPendingBalance: number;
      newStatus: CollectionAccountStatus;
      creditGenerated?: number;
      accountingEvent?: AnyEvento;
      paymentId?: string;
    }
  | {
      success: false;
      error: string;
      code?:
        | "invalid_amount"
        | "invalid_check_data"
        | "amount_exceeds_pending"
        | "account_not_found"
        | "organization_not_found"
        | "check_not_available"
        | "insufficient_credit"
        | "concurrency_conflict"
        | "total_exceeds_pending";
    };

export type CustomerCredit = {
  id: string;
  organization_id: string;
  customer_id: string;
  supplier_id: string | null;
  amount: number;
  remaining_amount: number;
  source_payment_id: string | null;
  created_at: string | null;
  notes: string | null;
};

export type CreditBreakdownEntry = {
  supplierId: string | null;
  supplierName: string;
  amount: number;
};

export type CustomerCreditApiResponse = {
  total: number;
  enabled: boolean;
  bySupplier: CreditBreakdownEntry[];
};

export type CustomerCreditSummary = {
  customerId: string;
  totalCredits: number;
  credits: CustomerCredit[];
};
