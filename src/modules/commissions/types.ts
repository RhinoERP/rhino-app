export type SortParam = {
  id: string;
  desc: boolean;
};

export type PaginatedResult<T> = {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type CommissionPayment = {
  id: string;
  paidAmount: number;
  commissionAmount: number;
  paidAt: string | null;
};

export type CommissionSale = {
  id: string;
  saleNumber: number | null;
  customerName: string;
  invoiceNumber: string | null;
  dispatchedAt: string | null;
  subTotal: number;
  commissionRate: number;
  /** Comisión total de referencia = subTotal × tasa (lo que se gana si se cobra todo). */
  totalCommission: number;
  /** Comisión ya generada = Σ comisiones por pago recibido. */
  paidCommission: number;
  /** totalCommission − paidCommission. */
  remainingCommission: number;
  /** Estado derivado de la cuenta corriente de la venta. */
  status: "PENDING" | "PARTIAL" | "PAID" | "VOID";
  payments: CommissionPayment[];
};

export type CommissionSeller = {
  userId: string;
  sellerName: string;
  baseCommissionRate: number;
  saleCount: number;
  totalSubtotal: number;
  totalCommission: number;
  sales: CommissionSale[];
};

export type CommissionMetrics = {
  totalSellers: number;
  totalSales: number;
  totalCommission: number;
  averageCommission: number;
};

export type CommissionsPaginatedParams = {
  page: number;
  pageSize: number;
  sort?: SortParam[];
  search?: string;
  month?: string;
  sellerId?: string;
};
