export type PaymentMethod =
  | "efectivo"
  | "tarjeta_de_credito"
  | "tarjeta_de_debito"
  | "transferencia"
  | "cheque";

export type BulkSupplierPaymentDistribution = {
  accountId: string;
  purchaseNumber: number | null;
  dueDate: string;
  totalAmount: number;
  pendingBalance: number;
  appliedAmount: number;
  newBalance: number;
  newStatus: "PENDING" | "PARTIAL" | "PAID";
};

export type BulkSupplierPaymentInput = {
  orgSlug: string;
  supplierId: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
};

export type BulkSupplierPaymentResult =
  | {
      success: true;
      appliedAmount: number;
      creditBalance: number;
      affectedAccounts: number;
      distributions: BulkSupplierPaymentDistribution[];
    }
  | {
      success: false;
      error: string;
      code?:
        | "invalid_amount"
        | "no_pending_accounts"
        | "supplier_not_found"
        | "organization_not_found";
    };

export type SupplierCredit = {
  id: string;
  organization_id: string;
  supplier_id: string;
  amount: number;
  remaining_amount: number;
  source_payment_id: string | null;
  notes: string | null;
  created_at: string;
};
