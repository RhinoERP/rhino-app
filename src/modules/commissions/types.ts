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

export type CommissionSale = {
  id: string;
  saleNumber: number | null;
  customerName: string;
  invoiceNumber: string | null;
  dispatchedAt: string | null;
  subTotal: number;
  commissionRate: number;
  commissionAmount: number;
  paidAmount: number;
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
