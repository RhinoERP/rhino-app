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

/**
 * Represents a single lot entry within a received item.
 * Each lot has its own quantity, lot number and expiration date.
 */
export type LotInput = {
  lotNumber: string;
  expirationDate: string; // ISO date string "YYYY-MM-DD"
  quantity: number; // unidades
  unitQuantity: number; // kg / lt / mt
};

/**
 * Represents a single variant stock entry within a received item.
 * For variant products, stock is tracked per variant (talle x color)
 * using the existing DEFAULT lot.
 */
export type VariantStockInput = {
  variantId: string;
  talle: string;
  color: string;
  quantity: number;
};

/**
 * A received item that distributes its quantity across one or more lots,
 * or across variant stock entries (for products with has_variants = true).
 */
export type ReceivedItemWithLotsInput = {
  itemId: string;
  productId: string;
  received: boolean;
  unitCost?: number;
  lots: LotInput[];
  variantStocks?: VariantStockInput[];
};

/**
 * Input for the receivePurchaseAction.
 */
export type ReceivePurchaseActionInput = {
  orgSlug: string;
  purchaseOrderId: string;
  receivedItems: ReceivedItemWithLotsInput[];
};

export type SortParam = {
  id: string;
  desc: boolean;
};

export type PaginationParams = {
  page: number;
  pageSize: number;
  sort?: SortParam[];
  search?: string;
  estado?: string;
  statusIds?: string[];
  supplierId?: string;
  supplierIds?: string[];
  inTransitAt?: { from?: string; to?: string };
  receivedAt?: { from?: string; to?: string };
  cancelledAt?: { from?: string; to?: string };
};

export type PaginatedResult<T> = {
  data: T[];
  totalCount: number;
  page?: number;
  pageSize?: number;
};

export type PurchaseMetrics = {
  totalMonth: number;
  totalAmountMonth: number;
  orderedMonth: number;
  receivedMonth: number;
};
