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
  } | null;
  type: "payable";
};

export type CollectionAccount = ReceivableAccount | PayableAccount;

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
