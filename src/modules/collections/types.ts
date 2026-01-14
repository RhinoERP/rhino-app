export type PaymentMethod =
  | "efectivo"
  | "tarjeta_de_credito"
  | "tarjeta_de_debito"
  | "transferencia"
  | "cheque";

export type CollectionAccountStatus = "PENDING" | "PARTIAL" | "PAID";

export type ReceivableAccount = {
  id: string;
  organization_id: string;
  customer_id: string;
  sales_order_id: string;
  total_amount: number;
  pending_balance: number;
  due_date: string;
  status: CollectionAccountStatus;
  created_at?: string | null;
  updated_at?: string | null;
  customer: {
    id: string;
    business_name: string;
    fantasy_name: string | null;
  };
  sale?: {
    invoice_number?: string | null;
    sale_date?: string | null;
    sale_number?: number | null;
  } | null;
  type: "receivable";
};

export type PayableAccount = {
  id: string;
  organization_id: string;
  supplier_id: string;
  purchase_order_id: string;
  total_amount: number;
  pending_balance: number;
  due_date: string;
  status: CollectionAccountStatus;
  created_at?: string | null;
  supplier: {
    id: string;
    name: string;
  };
  purchase?: {
    purchase_number?: number | null;
    purchase_date?: string | null;
    total_amount?: number | null;
  } | null;
  type: "payable";
  // Discrepancy warning (if total differs from purchase order by >1%)
  hasDiscrepancy?: boolean;
  discrepancyAmount?: number;
};

export type CollectionAccount = ReceivableAccount | PayableAccount;

export type BulkPaymentDistribution = {
  accountId: string;
  invoiceNumber: string | null;
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

export type RegisterPaymentInput = {
  orgSlug: string;
  accountId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
  type: CollectionAccount["type"];
};

export type RegisterPaymentResult =
  | {
      success: true;
      newPendingBalance: number;
      newStatus: CollectionAccountStatus;
    }
  | {
      success: false;
      error: string;
      code?:
        | "invalid_amount"
        | "amount_exceeds_pending"
        | "account_not_found"
        | "organization_not_found";
    };

export type CustomerCredit = {
  id: string;
  organization_id: string;
  customer_id: string;
  amount: number;
  remaining_amount: number;
  source_payment_id: string | null;
  created_at: string | null;
  notes: string | null;
};

export type CustomerCreditSummary = {
  customerId: string;
  totalCredits: number;
  credits: CustomerCredit[];
};
